"""Quản trị khu phố tự tạo tài khoản và phân quyền cho cán bộ của mình.

Ba ranh giới cứng, kiểm ở máy chủ chứ không chỉ giấu nút trên giao diện:

  1. Tài khoản tạo ra chỉ có `membership` ở ĐÚNG khu phố đang truy cập.
     Không có đường nào đặt được `is_platform_admin`.

  2. Không cấp được vai trò CAO HƠN vai trò của chính mình. Không thì một người
     ở mức "ban điều hành" tự tạo một tài khoản "quản trị" rồi đăng nhập bằng nó.

  3. Không tự hạ quyền, tự khoá, hay tự thu hồi chính mình — và khu phố phải luôn
     còn ít nhất một quản trị đang hoạt động, nếu không sẽ không ai vào được nữa.

Mật khẩu tạm chỉ hiện MỘT LẦN lúc tạo hoặc lúc đặt lại, và bắt buộc đổi ở lần
đăng nhập đầu.
"""

import secrets

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.database import session_khu_pho
from khuphoso.core.deps import CurrentUser, KhuPho, get_platform_db, require, resolve_khu_pho
from khuphoso.core.security import hash_password

log = structlog.get_logger()
router = APIRouter(prefix="/he-thong/tai-khoan", tags=["hệ thống"])


class TaoTaiKhoan(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=4, max_length=60, pattern=r"^[a-zA-Z0-9._-]+$")
    role_code: str = Field(pattern=r"^[a-z_]{3,30}$")
    position: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=160)


class SuaTaiKhoan(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role_code: str | None = Field(default=None, pattern=r"^[a-z_]{3,30}$")
    position: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=160)
    is_active: bool | None = None
    # Sinh một mật khẩu ngẫu nhiên và trả về một lần
    dat_lai_mat_khau: bool = False
    # …hoặc quản trị tự đặt mật khẩu. Tối thiểu 10 ký tự, khớp với chỗ người dùng
    # tự đổi mật khẩu ở `/auth/doi-mat-khau` — hai đường không được lệch chuẩn.
    mat_khau_moi: str | None = Field(default=None, min_length=10, max_length=256)
    # Đặt mật khẩu cho NGƯỜI KHÁC thì mặc định vẫn bắt họ đổi ở lần đăng nhập đầu:
    # quản trị đang biết mật khẩu đó. Bỏ cờ này khi cố ý muốn dùng luôn.
    buoc_doi_mat_khau: bool = True


async def _mucs(db: AsyncSession, kp_id: str) -> dict[str, int]:
    """Mã vai trò -> mức, trong phạm vi khu phố này."""
    rows = (
        await db.execute(
            text("SELECT code, level FROM role WHERE tenant_id = CAST(:t AS uuid)"),
            {"t": kp_id},
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _muc_cua_toi(db: AsyncSession, user_id: str, kp_id: str) -> int:
    muc = await db.scalar(
        text("""SELECT r.level FROM membership m JOIN role r ON r.id = m.role_id
                WHERE m.user_id = CAST(:u AS uuid) AND m.tenant_id = CAST(:t AS uuid)
                  AND m.deleted_at IS NULL"""),
        {"u": user_id, "t": kp_id},
    )
    # Quản trị nền tảng vào hỗ trợ không có membership — coi như mức cao nhất
    return muc if muc is not None else 100


async def _la_thanh_vien(db: AsyncSession, uid: str, kp_id: str) -> dict | None:
    return (
        await db.execute(
            text("""SELECT m.id::text AS mid, u.full_name, r.code AS vai_tro, r.level
                    FROM membership m
                    JOIN app_user u ON u.id = m.user_id
                    JOIN role r ON r.id = m.role_id
                    WHERE m.user_id = CAST(:u AS uuid) AND m.tenant_id = CAST(:t AS uuid)
                      AND m.deleted_at IS NULL"""),
            {"u": uid, "t": kp_id},
        )
    ).mappings().first()


async def _con_quan_tri_khac(db: AsyncSession, kp_id: str, tru_uid: str) -> bool:
    n = await db.scalar(
        text("""SELECT count(*) FROM membership m
                JOIN role r ON r.id = m.role_id
                JOIN app_user u ON u.id = m.user_id
                WHERE m.tenant_id = CAST(:t AS uuid) AND m.deleted_at IS NULL
                  AND m.status = 'active' AND u.is_active AND r.level >= 100
                  AND m.user_id <> CAST(:u AS uuid)"""),
        {"t": kp_id, "u": tru_uid},
    )
    return bool(n)


async def _ghi_nhat_ky(slug: str, user: CurrentUser, request: Request, **kw) -> None:
    """Nhật ký về tài khoản ghi vào CSDL CỦA khu phố — Ban điều hành tự tra được."""
    try:
        async with session_khu_pho(slug)() as db:
            await db.execute(
                text("""
                INSERT INTO audit_log (actor_user_id, actor_name, ho_tro, action, module,
                                       entity_type, entity_id, changes, ip, user_agent)
                VALUES (CAST(:uid AS uuid), :name, :ht, :action, 'settings',
                        'app_user', CAST(:eid AS uuid), CAST(:ch AS jsonb),
                        CAST(:ip AS inet), :ua)
            """),
                {
                    "uid": user.id, "name": user.full_name, "ht": user.ho_tro,
                    "action": kw["action"], "eid": kw.get("eid"), "ch": kw.get("changes"),
                    "ip": request.client.host if request.client else None,
                    "ua": request.headers.get("user-agent", "")[:300],
                },
            )
            await db.commit()
    except Exception as exc:  # noqa: BLE001 — lỗi nhật ký không chặn nghiệp vụ
        log.error("taikhoan.audit_failed", slug=slug, error=str(exc))


# --------------------------------------------------------------------------- #
@router.get("/vai-tro", dependencies=[Depends(require("user:read"))])
async def danh_sach_vai_tro(
    user: CurrentUser = Depends(require("user:read")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> list[dict]:
    """Vai trò cấp được, kèm số quyền — để giao diện giải thích chọn cái nào."""
    cua_toi = await _muc_cua_toi(db, user.id, kp.id)
    rows = (
        await db.execute(
            text("""
            SELECT r.code, r.name, r.level,
                   (SELECT count(*) FROM role_permission rp WHERE rp.role_id = r.id) AS so_quyen,
                   (SELECT count(*) FROM membership m
                     WHERE m.role_id = r.id AND m.deleted_at IS NULL)                 AS so_nguoi
            FROM role r WHERE r.tenant_id = CAST(:t AS uuid)
            ORDER BY r.level DESC
        """),
            {"t": kp.id},
        )
    ).mappings().all()
    return [{**dict(r), "cap_duoc": r["level"] <= cua_toi} for r in rows]


@router.get("/{uid}/quyen", dependencies=[Depends(require("user:read"))])
async def quyen_cua_vai_tro(
    uid: str,
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> list[str]:
    """Quyền thực tế của một tài khoản trong khu phố này."""
    if not await _la_thanh_vien(db, uid, kp.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tài khoản không thuộc khu phố này")
    rows = (
        await db.execute(
            text("""SELECT rp.permission_code FROM membership m
                    JOIN role_permission rp ON rp.role_id = m.role_id
                    WHERE m.user_id = CAST(:u AS uuid) AND m.tenant_id = CAST(:t AS uuid)
                      AND m.deleted_at IS NULL
                    ORDER BY rp.permission_code"""),
            {"u": uid, "t": kp.id},
        )
    ).all()
    return [r[0] for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def tao(
    body: TaoTaiKhoan,
    request: Request,
    user: CurrentUser = Depends(require("user:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> dict:
    """Tạo tài khoản cho cán bộ của khu phố này. Trả mật khẩu tạm, chỉ hiện một lần."""
    mucs = await _mucs(db, kp.id)
    if body.role_code not in mucs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Không có vai trò '{body.role_code}'")

    cua_toi = await _muc_cua_toi(db, user.id, kp.id)
    if mucs[body.role_code] > cua_toi:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Không cấp được vai trò cao hơn vai trò của chính bạn.",
        )

    if await db.scalar(
        text("SELECT 1 FROM app_user WHERE lower(username) = :u"),
        {"u": body.username.lower()},
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Tên đăng nhập '{body.username}' đã có người dùng. Chọn tên khác.",
        )

    mat_khau = secrets.token_urlsafe(9)
    uid = (
        await db.execute(
            text("""INSERT INTO app_user
                    (username, email, phone, password_hash, full_name,
                     is_active, must_change_password, is_platform_admin)
                    VALUES (:u, :e, :p, :h, :n, true, true, false)
                    RETURNING id::text"""),
            {"u": body.username, "e": body.email or None, "p": body.phone or None,
             "h": hash_password(mat_khau), "n": body.full_name.strip()},
        )
    ).scalar_one()

    role_id = await db.scalar(
        text("SELECT id FROM role WHERE tenant_id = CAST(:t AS uuid) AND code = :c"),
        {"t": kp.id, "c": body.role_code},
    )
    await db.execute(
        text("""INSERT INTO membership (user_id, tenant_id, role_id, position, status)
                VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :r, :pos, 'active')"""),
        {"u": uid, "t": kp.id, "r": role_id, "pos": body.position},
    )
    await db.commit()

    await _ghi_nhat_ky(
        kp.slug, user, request, action="tao_tai_khoan", eid=uid,
        changes=f'{{"username": "{body.username}", "vai_tro": "{body.role_code}"}}',
    )
    log.info("taikhoan.created", kp=kp.slug, username=body.username, role=body.role_code)

    return {
        "id": uid,
        "username": body.username,
        "mat_khau_tam": mat_khau,
        "luu_y": "Mật khẩu chỉ hiện MỘT LẦN. Người dùng buộc phải đổi ở lần đăng nhập đầu.",
    }


@router.patch("/{uid}")
async def sua(
    uid: str,
    body: SuaTaiKhoan,
    request: Request,
    user: CurrentUser = Depends(require("user:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> dict:
    """Đổi vai trò, khoá/mở, hoặc đặt lại mật khẩu cho một tài khoản của khu phố."""
    tv = await _la_thanh_vien(db, uid, kp.id)
    if not tv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tài khoản không thuộc khu phố này")

    cua_toi = await _muc_cua_toi(db, user.id, kp.id)
    if tv["level"] > cua_toi:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Không sửa được tài khoản có vai trò cao hơn bạn."
        )

    la_chinh_minh = uid == user.id

    # Đổi vai trò
    if body.role_code and body.role_code != tv["vai_tro"]:
        mucs = await _mucs(db, kp.id)
        if body.role_code not in mucs:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Không có vai trò '{body.role_code}'")
        if mucs[body.role_code] > cua_toi:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Không cấp được vai trò cao hơn vai trò của bạn."
            )
        if la_chinh_minh:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Không tự đổi vai trò của chính mình. Nhờ một quản trị khác làm.",
            )
        if tv["level"] >= 100 and not await _con_quan_tri_khac(db, kp.id, uid):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Đây là quản trị duy nhất đang hoạt động của khu phố. "
                "Cấp quyền quản trị cho người khác trước đã.",
            )
        rid = await db.scalar(
            text("SELECT id FROM role WHERE tenant_id = CAST(:t AS uuid) AND code = :c"),
            {"t": kp.id, "c": body.role_code},
        )
        await db.execute(
            text("""UPDATE membership SET role_id = :r
                    WHERE user_id = CAST(:u AS uuid) AND tenant_id = CAST(:t AS uuid)
                      AND deleted_at IS NULL"""),
            {"r": rid, "u": uid, "t": kp.id},
        )

    # Khoá / mở tài khoản
    if body.is_active is not None:
        if la_chinh_minh and not body.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự khoá tài khoản của mình.")
        if not body.is_active and tv["level"] >= 100 and not await _con_quan_tri_khac(
            db, kp.id, uid
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Khoá tài khoản này thì khu phố không còn quản trị nào vào được.",
            )
        await db.execute(
            text("UPDATE app_user SET is_active = :a WHERE id = CAST(:u AS uuid)"),
            {"a": body.is_active, "u": uid},
        )
        # Khoá thì cắt luôn các phiên đang mở
        if not body.is_active:
            await db.execute(
                text("DELETE FROM refresh_token WHERE user_id = CAST(:u AS uuid)"), {"u": uid}
            )

    if body.position is not None:
        await db.execute(
            text("""UPDATE membership SET position = :p
                    WHERE user_id = CAST(:u AS uuid) AND tenant_id = CAST(:t AS uuid)
                      AND deleted_at IS NULL"""),
            {"p": body.position or None, "u": uid, "t": kp.id},
        )

    if body.full_name or body.phone is not None or body.email is not None:
        await db.execute(
            text("""UPDATE app_user SET
                        full_name = COALESCE(:n, full_name),
                        phone     = COALESCE(:p, phone),
                        email     = COALESCE(:e, email)
                    WHERE id = CAST(:u AS uuid)"""),
            {"n": body.full_name, "p": body.phone or None, "e": body.email or None, "u": uid},
        )

    if body.dat_lai_mat_khau and body.mat_khau_moi:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Chọn một trong hai: sinh mật khẩu ngẫu nhiên, hoặc tự đặt mật khẩu.",
        )

    mat_khau = None
    tu_dat = False
    if body.dat_lai_mat_khau or body.mat_khau_moi:
        # Tự đặt cho CHÍNH MÌNH thì không bắt đổi lại ngay (vô nghĩa). Đặt cho
        # người khác thì bắt đổi, vì quản trị đang biết mật khẩu của họ.
        tu_dat = bool(body.mat_khau_moi)
        moi = body.mat_khau_moi or secrets.token_urlsafe(9)
        buoc_doi = (not la_chinh_minh) if tu_dat else True
        if tu_dat and not body.buoc_doi_mat_khau:
            buoc_doi = False
        await db.execute(
            text("""UPDATE app_user SET password_hash = :h, must_change_password = :bd,
                           failed_login_count = 0, locked_until = NULL
                    WHERE id = CAST(:u AS uuid)"""),
            {"h": hash_password(moi), "bd": buoc_doi, "u": uid},
        )
        # Mật khẩu đổi thì mọi phiên cũ phải hết hiệu lực
        await db.execute(
            text("DELETE FROM refresh_token WHERE user_id = CAST(:u AS uuid)"), {"u": uid}
        )
        # Chỉ trả về mật khẩu do MÁY sinh. Mật khẩu quản trị tự gõ thì họ đã biết,
        # dội lại vào phản hồi chỉ thêm một chỗ nữa nó bị ghi vào log.
        if not tu_dat:
            mat_khau = moi

    await db.commit()

    viec = []
    if body.role_code and body.role_code != tv["vai_tro"]:
        viec.append(f"đổi vai trò {tv['vai_tro']} -> {body.role_code}")
    if body.is_active is not None:
        viec.append("mở khoá" if body.is_active else "khoá tài khoản")
    if body.dat_lai_mat_khau:
        viec.append("đặt lại mật khẩu (sinh ngẫu nhiên)")
    if body.mat_khau_moi:
        viec.append("đặt mật khẩu mới")
    await _ghi_nhat_ky(
        kp.slug, user, request,
        action="sua_tai_khoan", eid=uid,
        changes=f'{{"viec": "{", ".join(viec) or "sửa thông tin"}"}}',
    )

    kq: dict = {"success": True, "da_lam": viec or ["sửa thông tin"]}
    if mat_khau:
        kq["mat_khau_tam"] = mat_khau
        kq["luu_y"] = "Mật khẩu chỉ hiện MỘT LẦN. Người dùng buộc phải đổi ở lần đăng nhập đầu."
    elif tu_dat:
        kq["luu_y"] = (
            "Đã đặt mật khẩu. Mọi phiên đang mở của tài khoản này đã bị đăng xuất."
            + ("" if la_chinh_minh else " Người dùng phải đổi lại ở lần đăng nhập đầu.")
        )
    return kq


@router.delete("/{uid}")
async def thu_hoi(
    uid: str,
    request: Request,
    user: CurrentUser = Depends(require("user:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> dict:
    """Thu hồi quyền truy cập khu phố này.

    Không xoá bản ghi tài khoản: nhật ký còn trỏ tới người này, xoá đi thì các dòng
    nhật ký cũ mất tên người thực hiện. Chỉ gỡ `membership` và cắt phiên đang mở.
    """
    tv = await _la_thanh_vien(db, uid, kp.id)
    if not tv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tài khoản không thuộc khu phố này")
    if uid == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự thu hồi tài khoản của mình.")

    cua_toi = await _muc_cua_toi(db, user.id, kp.id)
    if tv["level"] > cua_toi:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Không thu hồi được tài khoản có vai trò cao hơn bạn."
        )
    if tv["level"] >= 100 and not await _con_quan_tri_khac(db, kp.id, uid):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Đây là quản trị duy nhất của khu phố. Cấp quyền quản trị cho người khác trước đã.",
        )

    await db.execute(
        text("""UPDATE membership SET deleted_at = now(), status = 'revoked'
                WHERE user_id = CAST(:u AS uuid) AND tenant_id = CAST(:t AS uuid)
                  AND deleted_at IS NULL"""),
        {"u": uid, "t": kp.id},
    )
    await db.execute(
        text("DELETE FROM refresh_token WHERE user_id = CAST(:u AS uuid)"), {"u": uid}
    )
    await db.commit()

    await _ghi_nhat_ky(
        kp.slug, user, request, action="thu_hoi_tai_khoan", eid=uid,
        changes=f'{{"ho_ten": "{tv["full_name"]}"}}',
    )
    log.warning("taikhoan.revoked", kp=kp.slug, uid=uid, by=user.id)
    return {"success": True, "message": f"Đã thu hồi quyền truy cập của {tv['full_name']}."}
