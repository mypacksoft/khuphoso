"""Dependency dùng chung: giải khu phố từ tên miền, xác thực, kiểm quyền.

Luồng một request:
    Host  ->  slug khu phố  ->  phiên tới ĐÚNG database của khu phố đó
    Bearer token  ->  người dùng + quyền  ->  require() chặn ở tầng route

Không còn `tenant_id` hay RLS: mỗi khu phố một database riêng, nên một phiên
chỉ nhìn thấy dữ liệu của khu phố mà nó kết nối tới.
"""

from collections.abc import AsyncGenerator
from dataclasses import dataclass, field

import jwt
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.config import get_settings
from khuphoso.core.database import PlatformSession, session_khu_pho
from khuphoso.core.security import decode_access_token

log = structlog.get_logger()
settings = get_settings()
bearer = HTTPBearer(auto_error=False)

# Subdomain dùng chung, không thuộc khu phố nào
DUNG_CHUNG = {"api", "app", "admin", "www", "cdn", "docs", "status", "minhbach", "roadmap", "blog"}


@dataclass
class KhuPho:
    id: str
    slug: str
    name: str
    status: str
    settings: dict = field(default_factory=dict)


@dataclass
class CurrentUser:
    id: str
    slug: str | None
    role: str | None
    permissions: set[str]
    ho_tro: bool = False
    full_name: str = ""

    def can(self, perm: str) -> bool:
        return perm in self.permissions


def slug_tu_host(host: str) -> str | None:
    """`kp3-anphu.khuphoso.vn` -> `kp3-anphu`."""
    host = (host or "").split(":")[0].lower()
    root = settings.public_domain
    if not host.endswith(root) or host == root:
        return None
    sub = host[: -(len(root) + 1)]
    if not sub or "." in sub or sub in DUNG_CHUNG:
        return None
    return sub


async def get_platform_db() -> AsyncGenerator[AsyncSession, None]:
    """Phiên tới CSDL nền tảng — xác thực, danh sách khu phố, quỹ nền tảng."""
    async with PlatformSession() as s:
        yield s


async def resolve_khu_pho(
    request: Request, db: AsyncSession = Depends(get_platform_db)
) -> KhuPho | None:
    slug = slug_tu_host(request.headers.get("host", "")) or request.headers.get("x-tenant-slug")
    if not slug:
        return None
    row = (
        await db.execute(
            text("""
            SELECT id::text, slug, name, status, settings
            FROM tenant WHERE slug = :s AND deleted_at IS NULL
        """),
            {"s": slug},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Không tìm thấy khu phố '{slug}'")
    if row["status"] in ("suspended", "cancelled"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khu phố này đang tạm ngưng hoạt động")
    return KhuPho(
        id=row["id"], slug=row["slug"], name=row["name"],
        status=row["status"], settings=row["settings"] or {},
    )


async def get_db(kp: KhuPho | None = Depends(resolve_khu_pho)) -> AsyncGenerator[AsyncSession, None]:
    """Phiên tới database CỦA KHU PHỐ đang truy cập.

    Đây là điểm mấu chốt của cách ly: request của `kp3-anphu` mở kết nối tới
    database `kp_kp3_anphu`. Truy vấn viết sai đến mấy cũng không thể chạm dữ
    liệu khu phố khác — nó nằm ở một database khác.
    """
    if kp is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Chưa xác định được khu phố. Truy cập qua tên miền của khu phố "
            "hoặc gửi kèm header X-Tenant-Slug.",
        )
    async with session_khu_pho(kp.slug)() as s:
        yield s


async def current_user(
    request: Request, cred: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> CurrentUser:
    if cred is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        p = decode_access_token(cred.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập đã hết hạn") from None
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ") from None
    if p.get("typ") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai loại token")

    u = CurrentUser(
        id=p["sub"], slug=p.get("kp"), role=p.get("role"),
        permissions=set(p.get("perms") or []),
        ho_tro=bool(p.get("ht")), full_name=p.get("name", ""),
    )
    request.state.user = u
    return u


async def current_user_in_kp(
    user: CurrentUser = Depends(current_user), kp: KhuPho | None = Depends(resolve_khu_pho)
) -> CurrentUser:
    """Token cấp cho khu phố A không dùng được trên tên miền khu phố B."""
    if kp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thiếu thông tin khu phố")
    if user.slug != kp.slug:
        log.warning("auth.kp_mismatch", token_kp=user.slug, host_kp=kp.slug, user=user.id)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token không thuộc khu phố này")
    return user


def require(*perms: str):
    """Chặn route theo quyền: `Depends(require("resident:write"))`."""

    async def _check(user: CurrentUser = Depends(current_user_in_kp)) -> CurrentUser:
        thieu = [p for p in perms if not user.can(p)]
        if thieu:
            log.warning("authz.denied", user=user.id, kp=user.slug, missing=thieu)
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Không đủ quyền: {', '.join(thieu)}")
        return user

    return _check


async def platform_admin(
    user: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_platform_db)
) -> CurrentUser:
    """Chỉ quản trị nền tảng. Dùng cho route cấp hệ thống."""
    ok = await db.scalar(
        text("SELECT is_platform_admin FROM app_user WHERE id = CAST(:i AS uuid)"), {"i": user.id}
    )
    if not ok:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ quản trị nền tảng mới được thao tác")
    return user


# Loại đối tượng -> phân hệ, để nơi gọi không phải khai cả hai và không lệch nhau
PHAN_HE = {
    "resident": "resident",
    "neighborhood_group": "resident",
    "household": "household",
    "fund": "fund",
    "fund_campaign": "fund",
    "fund_receipt": "fund",
    "fund_expense": "fund",
}


async def ghi_audit(
    db: AsyncSession, user: CurrentUser, request: Request | None = None, **kw
) -> None:
    """Ghi nhật ký vào database CỦA KHU PHỐ — khu phố sở hữu nhật ký của mình."""
    await db.execute(
        text("""
        INSERT INTO audit_log (actor_user_id, actor_name, ho_tro, action, module,
                               entity_type, entity_id, changes, ip, user_agent)
        VALUES (CAST(:uid AS uuid), :name, :ht, :action, :module,
                :etype, :eid, CAST(:ch AS jsonb), CAST(:ip AS inet), :ua)
    """),
        {
            "uid": user.id, "name": user.full_name, "ht": user.ho_tro,
            "action": kw["action"],
            "module": kw.get("module") or PHAN_HE.get(kw.get("etype") or ""),
            "etype": kw.get("etype"), "eid": kw.get("eid"), "ch": kw.get("changes"),
            "ip": request.client.host if request and request.client else None,
            "ua": (request.headers.get("user-agent", "")[:300] if request else None),
        },
    )
