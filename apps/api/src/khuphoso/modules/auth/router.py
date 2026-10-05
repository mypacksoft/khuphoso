"""Đăng nhập, làm mới phiên, đổi mật khẩu.

Khác biệt cốt lõi so với app cũ: mật khẩu **chỉ** được kiểm ở server, băm Argon2id,
khoá tài khoản sau nhiều lần sai, và không có bất kỳ đường tắt nào.
"""

from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.database import session_khu_pho
from khuphoso.core.deps import (
    CurrentUser,
    KhuPho,
    current_user,
    get_platform_db,
    resolve_khu_pho,
)
from khuphoso.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

log = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["xác thực"])

MAX_FAILED = 5
LOCK_MINUTES = 15
COOKIE = "kp_refresh"


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=150, description="Tên đăng nhập, email hoặc SĐT")
    password: str = Field(min_length=1, max_length=256)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900
    must_change_password: bool = False
    full_name: str
    role: str | None = None
    khu_pho: str | None = None
    permissions: list[str] = []
    # Đang vào bằng quyền hỗ trợ nền tảng, không phải thành viên của khu phố
    ho_tro: bool = False


class ChangePasswordIn(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=256)


async def _audit_kp(slug: str | None, **kw) -> None:
    """Ghi nhật ký đăng nhập vào CSDL CỦA KHU PHỐ.

    Nhật ký thuộc về khu phố, không phải về nền tảng — để Ban điều hành tự tra
    được ai đã đăng nhập vào dữ liệu của mình, kể cả người từ nền tảng vào hỗ trợ.
    """
    if not slug:
        return
    try:
        async with session_khu_pho(slug)() as db:
            await db.execute(
                text("""
                INSERT INTO audit_log (actor_user_id, actor_name, ho_tro, action, module,
                                       changes, ip, user_agent)
                VALUES (CAST(:uid AS uuid), :name, :ht, :action, 'auth',
                        CAST(:ch AS jsonb), CAST(:ip AS inet), :ua)
            """),
                {
                    "uid": kw.get("actor_user_id"), "name": kw.get("actor_name"),
                    "ht": kw.get("ho_tro", False), "action": kw["action"],
                    "ch": kw.get("changes"), "ip": kw.get("ip"), "ua": kw.get("user_agent"),
                },
            )
            await db.commit()
    except Exception as exc:  # noqa: BLE001 — không để lỗi nhật ký chặn đăng nhập
        log.error("auth.audit_failed", slug=slug, error=str(exc))


async def _load_perms(
    db: AsyncSession, user_id: str, kp_id: str, la_admin_nen_tang: bool = False
) -> tuple[str | None, list[str], bool]:
    """Trả về (vai trò, quyền, có phải đường hỗ trợ không).

    Tài khoản mỗi khu phố là **riêng biệt** — muốn vào khu phố nào phải có
    `membership` ở khu phố đó. Ngoại lệ duy nhất: **quản trị nền tảng** vào được
    mọi khu phố để hỗ trợ, nhận quyền tương đương vai trò `quan_tri` của khu phố ấy.

    Đường hỗ trợ bị đánh dấu để ghi nhật ký riêng và hiện cảnh báo trên giao diện —
    người của khu phố phải biết có người ngoài đang xem dữ liệu cư dân của họ.
    """
    row = (
        await db.execute(
            text("""
            SELECT r.code AS role_code,
                   COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS perms
            FROM membership m
            JOIN role r ON r.id = m.role_id
            LEFT JOIN role_permission rp ON rp.role_id = r.id
            WHERE m.user_id = CAST(:uid AS uuid) AND m.tenant_id = CAST(:tid AS uuid)
              AND m.deleted_at IS NULL AND m.status = 'active'
            GROUP BY r.code
        """),
            {"uid": user_id, "tid": kp_id},
        )
    ).mappings().first()
    if row:
        return row["role_code"], list(row["perms"]), False

    if not la_admin_nen_tang:
        return None, [], False

    ht = (
        await db.execute(
            text("""
            SELECT COALESCE(array_agg(rp.permission_code), '{}') AS perms
            FROM role r JOIN role_permission rp ON rp.role_id = r.id
            WHERE r.tenant_id = CAST(:tid AS uuid) AND r.code = 'quan_tri'
        """),
            {"tid": kp_id},
        )
    ).mappings().first()
    return "quan_tri", list(ht["perms"]) if ht else [], True


@router.post("/login", response_model=TokenOut)
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_platform_db),
    kp: KhuPho | None = Depends(resolve_khu_pho),
) -> TokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")[:400]
    ident = body.username.strip().lower()

    # TÊN ĐĂNG NHẬP CHỈ DUY NHẤT TRONG MỘT KHU PHỐ, không phải toàn nền tảng —
    # khu phố nào cũng được dùng `admin` cho tài khoản quản trị của mình. Nên phải
    # tra theo CẶP (tên, khu phố đang truy cập), không tra tên suông.
    #
    # `ORDER BY (u.tenant_id = :tid) DESC`: nếu vừa có tài khoản của chính khu phố
    # vừa có quản trị nền tảng cùng tên thì tài khoản của khu phố thắng. Người của
    # khu phố gõ tên mình phải vào được nhà mình, không rơi vào tài khoản người khác.
    #
    # Không có khu phố (admin.khuphoso.vn) thì chỉ tài khoản cấp nền tảng.
    user = (
        await db.execute(
            text("""
            SELECT u.id::text, u.password_hash, u.full_name, u.is_active,
                   u.must_change_password, u.failed_login_count, u.locked_until,
                   u.is_platform_admin
            FROM app_user u
            WHERE u.deleted_at IS NULL
              AND (lower(u.username) = :i OR lower(u.email) = :i OR u.phone = :raw)
              AND (CASE
                     WHEN CAST(:tid AS uuid) IS NULL THEN u.is_platform_admin
                     ELSE (
                       u.tenant_id = CAST(:tid AS uuid)
                       OR u.is_platform_admin
                       -- Tài khoản cũ chưa gắn khu phố (tạo trước khi đổi cách
                       -- làm) thì xét theo thành viên. CHỈ khi tenant_id rỗng —
                       -- tài khoản đã thuộc khu phố A thì không có đường nào vào
                       -- khu phố B, kể cả khi ai đó lỡ thêm thành viên nhầm.
                       OR (u.tenant_id IS NULL AND EXISTS (
                             SELECT 1 FROM membership m
                             WHERE m.user_id = u.id
                               AND m.tenant_id = CAST(:tid AS uuid)
                               AND m.deleted_at IS NULL))
                     )
                   END)
            ORDER BY (u.tenant_id IS NOT DISTINCT FROM CAST(:tid AS uuid)) DESC, u.id
            LIMIT 1
        """),
            {"i": ident, "raw": body.username.strip(), "tid": kp.id if kp else None},
        )
    ).mappings().first()

    # Thông báo giống nhau cho mọi trường hợp sai — không tiết lộ tài khoản có tồn tại hay không
    generic = HTTPException(status.HTTP_401_UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không đúng")

    if not user:
        log.info("auth.login_failed", reason="no_user", ident=ident, ip=ip)
        raise generic
    if not user["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đang bị khoá")
    if user["locked_until"] and user["locked_until"] > datetime.now(UTC):
        mins = int((user["locked_until"] - datetime.now(UTC)).total_seconds() // 60) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Sai quá nhiều lần. Thử lại sau {mins} phút.",
        )

    ok, rehash = verify_password(body.password, user["password_hash"])
    if not ok:
        n = user["failed_login_count"] + 1
        lock = datetime.now(UTC) + timedelta(minutes=LOCK_MINUTES) if n >= MAX_FAILED else None
        await db.execute(
            text("UPDATE app_user SET failed_login_count = :n, locked_until = :lock WHERE id = CAST(:id AS uuid)"),
            {"n": n, "lock": lock, "id": user["id"]},
        )
        await db.commit()
        await _audit_kp(kp.slug if kp else None, actor_user_id=user["id"],
                        actor_name=user["full_name"], action="login_failed",
                        ip=ip, user_agent=ua)
        log.info("auth.login_failed", reason="bad_password", user=user["id"], attempts=n)
        raise generic

    if rehash:
        await db.execute(
            text("UPDATE app_user SET password_hash = :h WHERE id = CAST(:id AS uuid)"),
            {"h": rehash, "id": user["id"]},
        )

    role, perms, ho_tro = (None, [], False)
    if kp:
        role, perms, ho_tro = await _load_perms(
            db, user["id"], kp.id, user["is_platform_admin"]
        )
        if role is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không thuộc khu phố này")

    await db.execute(
        text("""UPDATE app_user
                SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
                WHERE id = CAST(:id AS uuid)"""),
        {"id": user["id"]},
    )

    raw, digest, exp = new_refresh_token()
    await db.execute(
        text("""INSERT INTO refresh_token (user_id, token_hash, expires_at, ip, user_agent)
                VALUES (CAST(:uid AS uuid), :h, :exp, CAST(:ip AS inet), :ua)"""),
        {"uid": user["id"], "h": digest, "exp": exp, "ip": ip, "ua": ua},
    )
    await db.commit()
    # Nhật ký RIÊNG cho đường hỗ trợ — khu phố truy được ai từ nền tảng đã vào
    await _audit_kp(
        kp.slug if kp else None,
        actor_user_id=user["id"], actor_name=user["full_name"], ho_tro=ho_tro,
        action="login_ho_tro" if ho_tro else "login",
        changes='{"ho_tro": true}' if ho_tro else None,
        ip=ip, user_agent=ua,
    )

    response.set_cookie(
        COOKIE, raw, httponly=True, secure=True, samesite="lax",
        max_age=30 * 24 * 3600, path="/auth",
    )
    log.info("auth.login", user=user["id"], khu_pho=kp.slug if kp else None, role=role)

    return TokenOut(
        access_token=create_access_token(
            user_id=user["id"], slug=kp.slug if kp else None, full_name=user["full_name"],
            role=role, permissions=perms, ho_tro=ho_tro,
        ),
        must_change_password=user["must_change_password"],
        full_name=user["full_name"],
        role=role,
        khu_pho=kp.slug if kp else None,
        permissions=perms,
        ho_tro=ho_tro,
    )


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_platform_db),
    kp: KhuPho | None = Depends(resolve_khu_pho),
) -> TokenOut:
    """Xoay refresh token. Nếu phát hiện token đã dùng lại -> thu hồi toàn bộ phiên."""
    raw = request.cookies.get(COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Không có phiên đăng nhập")
    digest = hash_refresh_token(raw)

    tok = (
        await db.execute(
            text("""SELECT id::text, user_id::text, expires_at, revoked_at
                    FROM refresh_token WHERE token_hash = :h"""),
            {"h": digest},
        )
    ).mappings().first()

    if not tok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên không hợp lệ")

    if tok["revoked_at"] is not None:
        # Token đã thu hồi mà vẫn được dùng -> nhiều khả năng bị đánh cắp
        await db.execute(
            text("""UPDATE refresh_token SET revoked_at = now()
                    WHERE user_id = CAST(:uid AS uuid) AND revoked_at IS NULL"""),
            {"uid": tok["user_id"]},
        )
        await _audit(db, actor_user_id=tok["user_id"], action="refresh_reuse_detected")
        await db.commit()
        log.warning("auth.refresh_reuse", user=tok["user_id"])
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đã bị thu hồi, vui lòng đăng nhập lại")

    if tok["expires_at"] <= datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đã hết hạn")

    u = (
        await db.execute(
            text("""SELECT id::text, full_name, must_change_password, is_active, is_platform_admin
                    FROM app_user WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL"""),
            {"id": tok["user_id"]},
        )
    ).mappings().first()
    if not u or not u["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản không còn hoạt động")

    role, perms, ho_tro = (None, [], False)
    if kp:
        role, perms, ho_tro = await _load_perms(
            db, u["id"], kp.id, u["is_platform_admin"]
        )

    new_raw, new_digest, exp = new_refresh_token()
    new_id = (
        await db.execute(
            text("""INSERT INTO refresh_token (user_id, token_hash, expires_at)
                    VALUES (CAST(:uid AS uuid), :h, :exp) RETURNING id"""),
            {"uid": u["id"], "h": new_digest, "exp": exp},
        )
    ).scalar_one()
    await db.execute(
        text("UPDATE refresh_token SET revoked_at = now(), replaced_by = :new WHERE id = CAST(:old AS uuid)"),
        {"new": new_id, "old": tok["id"]},
    )
    await db.commit()

    response.set_cookie(
        COOKIE, new_raw, httponly=True, secure=True, samesite="lax",
        max_age=30 * 24 * 3600, path="/auth",
    )
    return TokenOut(
        access_token=create_access_token(
            user_id=u["id"], slug=kp.slug if kp else None, full_name=u["full_name"],
            role=role, permissions=perms, ho_tro=ho_tro,
        ),
        must_change_password=u["must_change_password"],
        full_name=u["full_name"], role=role,
        khu_pho=kp.slug if kp else None, permissions=perms, ho_tro=ho_tro,
    )


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_platform_db)
) -> dict:
    raw = request.cookies.get(COOKIE)
    if raw:
        await db.execute(
            text("UPDATE refresh_token SET revoked_at = now() WHERE token_hash = :h AND revoked_at IS NULL"),
            {"h": hash_refresh_token(raw)},
        )
        await db.commit()
    response.delete_cookie(COOKIE, path="/auth")
    return {"success": True}


@router.get("/me")
async def me(user: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_platform_db)) -> dict:
    u = (
        await db.execute(
            text("""SELECT id::text, username, email, phone, full_name,
                           is_platform_admin, must_change_password, last_login_at
                    FROM app_user WHERE id = CAST(:id AS uuid)"""),
            {"id": user.id},
        )
    ).mappings().first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    return {**dict(u), "role": user.role, "permissions": sorted(user.permissions),
            "khu_pho": user.slug, "ho_tro": user.ho_tro}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordIn,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_platform_db),
) -> dict:
    row = (
        await db.execute(
            text("SELECT password_hash, full_name FROM app_user WHERE id = CAST(:id AS uuid)"),
            {"id": user.id},
        )
    ).mappings().first()
    ok, _ = verify_password(body.old_password, row["password_hash"])
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu hiện tại không đúng")
    if body.old_password == body.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu mới phải khác mật khẩu cũ")

    await db.execute(
        text("""UPDATE app_user SET password_hash = :h, must_change_password = false
                WHERE id = CAST(:id AS uuid)"""),
        {"h": hash_password(body.new_password), "id": user.id},
    )
    # Đổi mật khẩu -> thu hồi mọi phiên khác
    await db.execute(
        text("UPDATE refresh_token SET revoked_at = now() WHERE user_id = CAST(:id AS uuid) AND revoked_at IS NULL"),
        {"id": user.id},
    )
    await db.commit()
    await _audit_kp(user.slug, actor_user_id=user.id, actor_name=row["full_name"],
                    action="change_password",
                    ip=request.client.host if request.client else None)
    log.info("auth.password_changed", user=user.id)
    return {"success": True, "message": "Đã đổi mật khẩu. Vui lòng đăng nhập lại trên các thiết bị khác."}
