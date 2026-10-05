"""Thông tin khu phố hiện tại, ghi lượt xem, và trạng thái giấy phép.

Ba endpoint nhẹ mà giao diện cần ngay khi mở trang — kể cả lúc chưa đăng nhập và
kể cả lúc phần mềm chưa kích hoạt (nên nằm trong danh sách MIEN_TRU của middleware
giấy phép ở `main.py`):

  * GET  /khu-pho/hien-tai   — tên khu phố để hiện trên màn hình đăng nhập/cổng
  * POST /luot-xem           — đếm lượt mở trang, ẩn danh, hỏng thì bỏ qua
  * GET  /giay-phep/trang-thai — phần mềm đã kích hoạt chưa, để hiện màn hình kích hoạt
"""

from fastapi import APIRouter, Depends, Response, status

from khuphoso.core.deps import KhuPho, resolve_khu_pho
from khuphoso.core.giay_phep import EMAIL_DANG_KY, LINK_DANG_KY, kiem_tra

router = APIRouter(tags=["khu phố"])


@router.get("/khu-pho/hien-tai")
async def hien_tai(kp: KhuPho | None = Depends(resolve_khu_pho)) -> dict | None:
    """Tên và thông tin hiển thị của khu phố đang truy cập (theo tên miền)."""
    if kp is None:
        return None
    s = kp.settings or {}
    return {
        "slug": kp.slug,
        "name": kp.name,
        "ward": s.get("ward") or s.get("phuong"),
        "status": kp.status,
        "settings": {
            "quoc_hieu": s.get("quoc_hieu"),
            "tieu_ngu": s.get("tieu_ngu"),
            "logo_url": s.get("logo_url"),
            "mau_chu_dao": s.get("mau_chu_dao"),
        },
    }


@router.post("/luot-xem", status_code=status.HTTP_204_NO_CONTENT)
async def luot_xem() -> Response:
    """Đếm lượt mở trang — bản tự vận hành chưa lưu thống kê, nhận rồi bỏ qua.

    Vẫn giữ endpoint để giao diện không nhận 404; khi nào cần thống kê thì thêm
    bảng và ghi vào đây.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/giay-phep/trang-thai")
async def giay_phep_trang_thai(kp: KhuPho | None = Depends(resolve_khu_pho)) -> dict:
    """Trạng thái kích hoạt — giao diện dựa vào đây để hiện màn hình kích hoạt."""
    tt = kiem_tra(kp.slug if kp else None)
    return {
        **tt,
        "slug": kp.slug if kp else None,
        "ten_khu_pho": kp.name if kp else None,
        "email_dang_ky": EMAIL_DANG_KY,
        "link_dang_ky": LINK_DANG_KY,
    }
