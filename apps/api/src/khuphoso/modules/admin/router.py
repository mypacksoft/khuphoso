"""Quản trị trong phạm vi MỘT khu phố: nhật ký và tài khoản.

Nhật ký nằm ở database của chính khu phố, nên Ban điều hành tra được ai đã làm gì
trên dữ liệu của mình — kể cả người từ nền tảng vào hỗ trợ (`ho_tro = true`).

Danh sách tài khoản đọc từ CSDL nền tảng nhưng LỌC theo `membership` của đúng khu
phố đang truy cập, không bao giờ trả tài khoản của khu phố khác.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import KhuPho, get_db, get_platform_db, require, resolve_khu_pho

router = APIRouter(prefix="/he-thong", tags=["hệ thống"])

# Nhãn tiếng Việt cho hành động trong nhật ký — cán bộ đọc, không phải lập trình viên
NHAN = {
    "login": "Đăng nhập",
    "login_ho_tro": "Đăng nhập hỗ trợ (nền tảng)",
    "login_failed": "Đăng nhập thất bại",
    "change_password": "Đổi mật khẩu",
    "create": "Thêm mới",
    "update": "Cập nhật",
    "delete": "Xoá",
    "view_pii": "Xem thông tin định danh",
    "ghim_vi_tri": "Ghim vị trí trên bản đồ",
    "xoa_ghim": "Gỡ ghim vị trí",
    "export": "Xuất dữ liệu",
}
MODULE = {
    "auth": "Xác thực",
    "resident": "Nhân khẩu",
    "household": "Hộ khẩu",
    "fund": "Quỹ khu phố",
    "settings": "Cấu hình",
}


@router.get("/nhat-ky", dependencies=[Depends(require("audit:read"))])
async def nhat_ky(
    action: str | None = None,
    module: str | None = None,
    chi_ho_tro: bool = Query(default=False, description="chỉ xem lượt truy cập từ nền tảng"),
    limit: int = Query(default=100, le=300),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"a": action, "m": module, "ht": chi_ho_tro, "limit": limit, "offset": offset}
    WHERE = """
        WHERE (CAST(:a AS text) IS NULL OR action = CAST(:a AS text))
          AND (CAST(:m AS text) IS NULL OR module = CAST(:m AS text))
          AND (NOT CAST(:ht AS boolean) OR ho_tro)
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT id::text, actor_user_id::text, actor_name, ho_tro, action, module,
                   entity_type, entity_id::text, changes, host(ip) AS ip, user_agent, created_at
            FROM audit_log {WHERE}
            ORDER BY created_at DESC LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = (await db.execute(text(f"SELECT count(*) FROM audit_log {WHERE}"), p)).scalar_one()

    return {
        "tong_so": tong,
        "items": [
            {
                **dict(r),
                "nhan_hanh_dong": NHAN.get(r["action"], r["action"]),
                "nhan_module": MODULE.get(r["module"] or "", r["module"]),
            }
            for r in rows
        ],
    }


@router.get("/nhat-ky/danh-muc", dependencies=[Depends(require("audit:read"))])
async def danh_muc(db: AsyncSession = Depends(get_db)) -> dict:
    """Các hành động và phân hệ thực sự có trong nhật ký, để dựng ô lọc."""
    rows = (
        await db.execute(
            text("""SELECT action, module, count(*) AS n FROM audit_log
                    GROUP BY action, module ORDER BY n DESC""")
        )
    ).mappings().all()
    return {
        "hanh_dong": sorted(
            {r["action"]: {"ma": r["action"], "nhan": NHAN.get(r["action"], r["action"])}
             for r in rows}.values(),
            key=lambda x: x["nhan"],
        ),
        "module": sorted(
            {r["module"]: {"ma": r["module"], "nhan": MODULE.get(r["module"] or "", r["module"])}
             for r in rows if r["module"]}.values(),
            key=lambda x: x["nhan"],
        ),
    }


@router.get("/tai-khoan", dependencies=[Depends(require("user:read"))])
async def tai_khoan(
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_platform_db),
) -> list[dict]:
    """Tài khoản CỦA khu phố này. Không bao giờ trả tài khoản khu phố khác."""
    rows = (
        await db.execute(
            text("""
            SELECT u.id::text, u.username, u.full_name, u.email, u.phone,
                   u.is_active, u.must_change_password, u.last_login_at,
                   r.code AS vai_tro_ma, r.name AS vai_tro, m.position, m.status
            FROM membership m
            JOIN app_user u ON u.id = m.user_id
            JOIN role r     ON r.id = m.role_id
            WHERE m.tenant_id = CAST(:t AS uuid) AND m.deleted_at IS NULL
            ORDER BY r.level, u.full_name
        """),
            {"t": kp.id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]
