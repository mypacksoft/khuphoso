"""Xác minh địa chỉ theo tuyến đường — dành cho người đi thực địa.

CÁCH LÀM VIỆC THẬT
Cán bộ không đi xác minh theo danh sách hộ xếp theo mã hộ. Họ đi BỘ DỌC MỘT CON
ĐƯỜNG: đứng đầu đường, đi tới từng nhà theo số nhà tăng dần, tới nhà nào bấm lấy
toạ độ nhà đó, xong đi tiếp. Đi ngược chiều thì xếp giảm dần.

Nên màn hình phải là: chọn tổ -> chọn tuyến đường -> hiện lần lượt từng nhà theo
đúng thứ tự đi bộ, mỗi lần một nhà, một nút bấm.

TÁCH SỐ NHÀ VÀ TÊN ĐƯỜNG
Cơ sở dữ liệu chỉ có một ô `address` dạng "123/45 Đường Lê Thị Trung". Tách bằng
biểu thức chính quy ngay trong truy vấn:

    123/45 Đường Lê Thị Trung  ->  số nhà 123, hẻm 45, đường "Đường Lê Thị Trung"
    56 Đường 22/12             ->  số nhà 56,  hẻm 0,  đường "Đường 22/12"

Chú ý "Đường 22/12" — dấu / nằm trong TÊN đường chứ không phải số hẻm. Vì thế chỉ
cắt phần số ở ĐẦU chuỗi, và phải có khoảng trắng sau nó.

Sắp xếp theo (số nhà, hẻm, phần còn lại) chứ không theo chuỗi: sắp theo chuỗi thì
"10" đứng trước "9" và người đi bộ phải quay đầu lại giữa đường.
"""

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import get_db, require

log = structlog.get_logger()
from khuphoso.core.goi import yeu_cau_goi
# Mục thuộc gói trả phí. Khoá Ở ĐÂY chứ không chỉ giấu menu — giấu menu
# chỉ cho gọn mắt, ai gõ thẳng địa chỉ vẫn vào được.
router = APIRouter(prefix="/ho-khau/tuyen-duong", tags=["hộ khẩu"], dependencies=[Depends(yeu_cau_goi("ban_do"))])

# ── TÁCH ĐỊA CHỈ THÀNH (TUYẾN, SỐ NHÀ) ─────────────────────────────────────
#
# Địa bàn Việt Nam có hai kiểu đánh địa chỉ, và một khu phố thường có cả hai:
#
#   Dạng ĐƯỜNG   "56 Đường 22/12, ..."      -> tuyến "Đường 22/12", số nhà 56
#   Dạng LÔ      "38A/A12, khu phố 3, ..."  -> tuyến "Lô A12",      số nhà 38
#
# Dạng lô hay gặp ở khu tái định cư và khu dân cư quy hoạch — Khu phố 3 An Phú
# gần như toàn bộ là dạng này. Bản đầu chỉ nhận dạng đường nên 8.318 hộ ra 1.607
# "tuyến", mỗi tuyến một căn nhà: màn hình đi thực địa thành vô dụng.
#
# Thứ tự thử: LÔ TRƯỚC. Vì "38A/A12" nếu thử dạng đường trước sẽ khớp nhầm thành
# số nhà 38 và tên đường "A/A12".
#
# Chú ý "Đường 22/12": dấu / nằm trong TÊN đường. Phân biệt được vì phần sau dấu
# / của địa chỉ dạng lô luôn bắt đầu bằng CHỮ CÁI (A12, B3, C9), còn "22/12" thì
# phần sau là số.
# `\y` chứ KHÔNG phải `\b`: trong Postgres `\b` là ký tự backspace, không phải
# ranh giới từ như trong Perl hay Python. Dùng nhầm thì biểu thức không bao giờ
# khớp mà cũng không báo lỗi — chỉ lặng lẽ trả về 1.607 "tuyến đường".
TACH_LO = r'^\s*([0-9]+)\s*[A-Za-z0-9]*\s*/\s*([A-Za-z]{1,2}\s*[0-9]{1,3})\y'
TACH_DUONG = r'^\s*([0-9]+)([A-Za-zÀ-ỹ]?)(?:\s*/\s*([0-9]+)([A-Za-zÀ-ỹ]?))?(?:\s*/\s*([0-9]+))?\s+'

# Cột dẫn xuất dùng chung cho cả hai truy vấn bên dưới.
#
# Địa chỉ dạng lô: bỏ luôn phần đuôi hành chính ("khu phố 3, Phường An Phú, Thành
# phố Hồ Chí Minh") vì nó giống hệt nhau ở mọi hộ — giữ lại thì tên tuyến dài
# ngoằng mà không thêm thông tin gì.
COT_TACH = f"""
    CASE
        WHEN h.address ~ '{TACH_LO}'
            THEN 'Lô ' || upper(regexp_replace(
                     (regexp_match(h.address, '{TACH_LO}'))[2], '\\s+', '', 'g'))
        ELSE NULLIF(regexp_replace(h.address, '{TACH_DUONG}', ''), '')
    END AS ten_duong,
    CASE
        WHEN h.address ~ '{TACH_LO}'
            THEN ((regexp_match(h.address, '{TACH_LO}'))[1])::int
        ELSE COALESCE(((regexp_match(h.address, '{TACH_DUONG}'))[1])::int, 0)
    END AS so_nha,
    CASE
        WHEN h.address ~ '{TACH_LO}' THEN 0
        ELSE COALESCE(((regexp_match(h.address, '{TACH_DUONG}'))[3])::int, 0)
    END AS so_hem,
    CASE
        WHEN h.address ~ '{TACH_LO}' THEN 0
        ELSE COALESCE(((regexp_match(h.address, '{TACH_DUONG}'))[5])::int, 0)
    END AS so_ngach
"""


@router.get("", dependencies=[Depends(require("household:read"))])
async def danh_sach_tuyen(
    group_id: str | None = Query(default=None, description="lọc theo tổ dân phố"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Các tuyến đường có hộ, kèm số hộ đã và chưa xác minh.

    Sắp theo số hộ CHƯA xác minh giảm dần: tuyến còn nhiều việc nhất lên đầu, đó
    là tuyến người đi thực địa nên chọn.
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT ten_duong,
                   count(*)                                          AS so_ho,
                   count(*) FILTER (WHERE geo_status = 'verified')    AS da_xac_minh,
                   count(*) FILTER (WHERE geo_status <> 'verified')   AS chua_xac_minh,
                   min(so_nha)                                       AS so_nha_dau,
                   max(so_nha)                                       AS so_nha_cuoi
            FROM (
                SELECT h.geo_status, {COT_TACH}
                FROM household h
                WHERE h.deleted_at IS NULL
                  AND h.address IS NOT NULL AND h.address <> ''
                  AND (CAST(:g AS uuid) IS NULL OR h.group_id = CAST(:g AS uuid))
            ) x
            WHERE ten_duong IS NOT NULL
            GROUP BY ten_duong
            ORDER BY chua_xac_minh DESC, ten_duong
        """),
            {"g": group_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/ho", dependencies=[Depends(require("household:read"))])
async def ho_tren_tuyen(
    duong: str = Query(description="tên đường đúng như trả về ở danh sách tuyến"),
    group_id: str | None = None,
    thu_tu: str = Query(default="tang", pattern="^(tang|giam)$"),
    chi_chua_xac_minh: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Các hộ trên một tuyến, xếp theo đúng thứ tự đi bộ dọc đường.

    `chi_chua_xac_minh` mặc định bật: người đi thực địa chỉ quan tâm nhà chưa làm.
    Hộ nào vừa xác minh xong sẽ tự rời khỏi danh sách ở lần tải sau — đúng cảm giác
    "gạch tên khỏi danh sách" khi làm việc trên giấy.
    """
    huong = "ASC" if thu_tu == "tang" else "DESC"
    rows = (
        await db.execute(
            text(f"""
            SELECT id, code, address, ten_duong, so_nha, so_hem, so_ngach,
                   geo_status, ten_trang_thai, chu_ho, so_nhan_khau, lat, lng
            FROM (
                SELECT h.id::text, h.code, h.address, h.geo_status,
                       CASE h.geo_status
                           WHEN 'verified' THEN 'Đã xác minh tại chỗ'
                           WHEN 'manual'   THEN 'Ghim tay'
                           WHEN 'auto'     THEN 'Sơ bộ tự động'
                           WHEN 'failed'   THEN 'Dò không ra'
                           ELSE 'Chưa có toạ độ'
                       END AS ten_trang_thai,
                       c.full_name AS chu_ho,
                       (SELECT count(*) FROM resident r
                         WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                       ST_Y(h.geom::geometry) AS lat,
                       ST_X(h.geom::geometry) AS lng,
                       {COT_TACH}
                FROM household h
                LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
                WHERE h.deleted_at IS NULL
                  AND h.address IS NOT NULL AND h.address <> ''
                  AND (CAST(:g AS uuid) IS NULL OR h.group_id = CAST(:g AS uuid))
            ) x
            WHERE ten_duong = :d
              AND (NOT CAST(:cxm AS boolean) OR geo_status <> 'verified')
            ORDER BY so_nha {huong}, so_hem {huong}, so_ngach {huong}, code {huong}
        """),
            {"g": group_id, "d": duong, "cxm": chi_chua_xac_minh},
        )
    ).mappings().all()
    return [
        {**dict(r), "toa_do": {"lat": r["lat"], "lng": r["lng"]} if r["lat"] else None}
        for r in rows
    ]
