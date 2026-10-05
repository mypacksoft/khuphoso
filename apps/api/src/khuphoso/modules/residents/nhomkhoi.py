"""Nhóm trong khối — khu phố tự thêm hội, tổ, ban của mình.

Danh sách nhóm mặc định (Hội Phụ nữ, Đoàn Thanh niên, Tổ dân phòng…) chỉ là chỗ
bắt đầu. Mỗi khu phố mỗi khác: nơi có Hội Khuyến học, nơi có Câu lạc bộ dưỡng
sinh, nơi có Tổ tự quản đường phố. Không thể liệt kê hết từ đây được.

THÊM XONG LÀ HIỆN NGAY TRONG BỘ LỌC. Bộ lọc "Nhóm trong khối" và các thẻ ở đầu
màn hình đều đọc thẳng từ bảng `classification`, nên không phải khai báo thêm
chỗ nào nữa.

XOÁ THÌ CHỈ ẨN, KHÔNG XOÁ HẲN. Nhóm đang có người mà xoá là mất luôn dấu vết ai
từng thuộc nhóm đó — thứ dùng để đối chiếu về sau. Ẩn đi thì nhóm biến khỏi bộ
lọc nhưng vẫn tra lại được.
"""

import re
import unicodedata

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, current_user, get_db, ghi_audit, require

log = structlog.get_logger()
router = APIRouter(prefix="/cu-dan/danh-muc/phan-loai", tags=["nhân khẩu"])

KHOI = {
    "chi_bo": "Chi bộ",
    "chinh_quyen": "Chính quyền",
    "doan_the": "Đoàn thể",
    "chinh_sach": "Chính sách",
    "nhom_khac": "Nhóm khác",
}

# Ba nhóm này các màn hình khác trỏ thẳng vào mã, xoá đi là gãy chỗ khác
HE_THONG = ("dang_vien", "ban_dieu_hanh", "to_truong")


def _ma_tu_ten(ten: str) -> str:
    """"Hội Khuyến học" -> "hoi_khuyen_hoc". `đ` xử lý riêng vì NFD không tách."""
    t = ten.replace("đ", "d").replace("Đ", "D")
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-zA-Z0-9]+", "_", t).strip("_").lower()
    return t[:40] or "nhom"


class NhomIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    khoi: str = Field(pattern="^(chi_bo|chinh_quyen|doan_the|chinh_sach|nhom_khac)$")
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=8)
    # Nhóm nhạy cảm (đảng viên, hộ nghèo…) được đánh dấu để cảnh báo khi xuất danh sách
    is_sensitive: bool = False


class NhomSua(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=8)
    is_sensitive: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


@router.get("/tat-ca", dependencies=[Depends(require("resident:read"))])
async def tat_ca(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Gồm cả nhóm đã ẩn — màn hình quản lý cần thấy để bật lại."""
    rows = (
        await db.execute(
            text("""
            SELECT c.id::text, c.code, c.name, c.khoi, c.color, c.icon,
                   c.is_sensitive, c.is_active, c.sort_order,
                   (SELECT count(*) FROM resident_classification rc
                     JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
                    WHERE rc.classification_id = c.id) AS so_nguoi
            FROM classification c
            ORDER BY c.khoi, c.sort_order NULLS LAST, c.name
        """)
        )
    ).mappings().all()
    return [
        {**dict(r), "ten_khoi": KHOI.get(r["khoi"], r["khoi"]),
         "la_he_thong": r["code"] in HE_THONG}
        for r in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require("resident:write"))])
async def them(
    body: NhomIn,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Thêm một hội, tổ, ban vào khối. Thêm xong hiện ngay trong bộ lọc."""
    ten = body.name.strip()

    # Trùng TÊN trong cùng khối thì chặn — hai "Hội Khuyến học" trong một khối
    # là gõ nhầm, không phải ý muốn
    if await db.scalar(
        text("""SELECT 1 FROM classification
                WHERE khoi = :k AND lower(name) = lower(:n) AND is_active"""),
        {"k": body.khoi, "n": ten},
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Khối {KHOI[body.khoi]} đã có nhóm tên “{ten}” rồi.",
        )

    goc = _ma_tu_ten(ten)
    ma = goc
    for i in range(2, 60):
        if not await db.scalar(text("SELECT 1 FROM classification WHERE code = :c"), {"c": ma}):
            break
        ma = f"{goc}_{i}"

    cuoi = await db.scalar(
        text("SELECT COALESCE(max(sort_order), 0) FROM classification WHERE khoi = :k"),
        {"k": body.khoi},
    )
    rid = (
        await db.execute(
            text("""
            INSERT INTO classification (code, name, khoi, color, icon,
                                        is_sensitive, is_active, sort_order)
            VALUES (:c, :n, :k, :mau, :ic, :nc, true, :o) RETURNING id::text
        """),
            {"c": ma, "n": ten, "k": body.khoi, "mau": body.color,
             "ic": body.icon, "nc": body.is_sensitive, "o": (cuoi or 0) + 1},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="classification", eid=rid)
    await db.commit()
    log.info("phanloai.them", code=ma, khoi=body.khoi)
    return {"success": True, "id": rid, "code": ma, "name": ten}


@router.patch("/{ma}", dependencies=[Depends(require("resident:write"))])
async def sua(
    ma: str,
    body: NhomSua,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cu = (
        await db.execute(
            text("SELECT id::text, code, name, khoi FROM classification WHERE code = :c"),
            {"c": ma},
        )
    ).mappings().first()
    if not cu:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Không có nhóm “{ma}”")

    if body.name and body.name.strip().lower() != cu["name"].lower():
        if await db.scalar(
            text("""SELECT 1 FROM classification
                    WHERE khoi = :k AND lower(name) = lower(:n) AND code <> :c AND is_active"""),
            {"k": cu["khoi"], "n": body.name.strip(), "c": ma},
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Khối này đã có nhóm tên “{body.name.strip()}” rồi.",
            )

    # `code` KHÔNG đổi được: đó là thứ các màn hình khác dùng để trỏ tới nhóm.
    # Đổi tên hiển thị thì thoải mái.
    await db.execute(
        text("""
        UPDATE classification SET
            name         = COALESCE(:n, name),
            color        = CASE WHEN CAST(:mau AS text) IS NULL THEN color
                                ELSE NULLIF(CAST(:mau AS text), '') END,
            icon         = CASE WHEN CAST(:ic AS text) IS NULL THEN icon
                                ELSE NULLIF(CAST(:ic AS text), '') END,
            is_sensitive = COALESCE(:nc, is_sensitive),
            is_active    = COALESCE(:ha, is_active),
            sort_order   = COALESCE(:o, sort_order)
        WHERE code = :c
    """),
        {"n": body.name.strip() if body.name else None, "mau": body.color, "ic": body.icon,
         "nc": body.is_sensitive, "ha": body.is_active, "o": body.sort_order, "c": ma},
    )
    await ghi_audit(db, user, request, action="update", etype="classification", eid=cu["id"])
    await db.commit()
    return {"success": True, "code": ma}


@router.delete("/{ma}", dependencies=[Depends(require("resident:write"))])
async def xoa(
    ma: str,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Nhóm còn người thì chỉ ẩn; nhóm rỗng mới xoá hẳn."""
    cu = (
        await db.execute(
            text("""
            SELECT c.id::text, c.code, c.name,
                   (SELECT count(*) FROM resident_classification rc
                     JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
                    WHERE rc.classification_id = c.id) AS so_nguoi
            FROM classification c WHERE c.code = :c
        """),
            {"c": ma},
        )
    ).mappings().first()
    if not cu:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Không có nhóm “{ma}”")
    if ma in HE_THONG:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"“{cu['name']}” là nhóm hệ thống, không xoá được. Đổi tên hoặc ẩn đi thì được.",
        )

    if cu["so_nguoi"]:
        # Xoá hẳn là mất luôn dấu vết ai từng thuộc nhóm — ẩn thì tra lại được
        await db.execute(
            text("UPDATE classification SET is_active = false WHERE code = :c"), {"c": ma}
        )
        await ghi_audit(db, user, request, action="update", etype="classification", eid=cu["id"])
        await db.commit()
        return {
            "success": True, "da_an": True, "so_nguoi": cu["so_nguoi"],
            "loi_nhan": f"“{cu['name']}” đang có {cu['so_nguoi']} người nên chỉ ẩn khỏi bộ "
                        "lọc, không xoá hẳn. Danh sách người từng thuộc nhóm vẫn tra lại được.",
        }

    await db.execute(text("DELETE FROM classification WHERE code = :c"), {"c": ma})
    await ghi_audit(db, user, request, action="delete", etype="classification", eid=cu["id"])
    await db.commit()
    log.info("phanloai.xoa", code=ma)
    return {"success": True, "da_an": False, "loi_nhan": f"Đã xoá nhóm “{cu['name']}”."}
