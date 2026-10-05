"""Gói dịch vụ — mục nào thuộc gói nào, và khoá ở tầng máy chủ.

MỘT NGUỒN SỰ THẬT DUY NHẤT. Bảng `TINH_NANG` dưới đây quyết định cả ba nơi: menu
hiện hay ẩn, máy chủ cho hay chặn, và trang giới thiệu ghi gì. Ba nơi mà ba bảng
khác nhau thì sớm muộn cũng lệch, rồi khu phố trả tiền xong vẫn không dùng được.

KHOÁ Ở MÁY CHỦ, KHÔNG CHỈ GIẤU MENU. Giấu menu chỉ là cho gọn mắt — ai gõ thẳng
địa chỉ vẫn vào được. Chặn thật phải chặn ở đây.

HẾT HẠN KHÔNG XOÁ GÌ CẢ. Quá hạn thì mục nâng cao khoá lại, dữ liệu vẫn nguyên;
gia hạn là mở ra dùng tiếp. Xoá dữ liệu của người ta vì họ thôi đóng góp là điều
một dự án phi lợi nhuận không được phép làm.
"""

from datetime import date

import structlog
from fastapi import Depends, HTTPException, status
from sqlalchemy import text

from khuphoso.core.database import PlatformSession
from khuphoso.core.deps import CurrentUser, KhuPho, current_user, resolve_khu_pho

log = structlog.get_logger()

# Bậc gói. Số lớn hơn bao trùm số nhỏ hơn.
BAC = {"dong_hanh": 0, "duy_tri": 1, "chung_tay": 2, "bao_tro": 2}

TEN_GOI = {
    "dong_hanh": "Đồng hành",
    "duy_tri": "Duy trì",
    "chung_tay": "Chung tay",
    "bao_tro": "Bảo trợ",
}

# Số tài khoản tối đa. `None` là không giới hạn.
SO_TAI_KHOAN = {"dong_hanh": 5, "duy_tri": 30, "chung_tay": None, "bao_tro": None}

# Mục nào cần bậc nào. Không có trong bảng này = mọi gói đều dùng được.
#
# Danh sách khớp đúng với bảng mức đóng góp trên khuphoso.vn — sửa ở đây thì
# nhớ sửa cả trang đó, và ngược lại.
TINH_NANG: dict[str, dict] = {
    "ban_do": {
        "ten": "Bản đồ hộ khẩu",
        "bac": 1,
        "mo_ta": "Ghim vị trí từng hộ, chỉ đường vào tận nhà trong hẻm",
    },
    "quy": {
        "ten": "Sổ quỹ khu phố",
        "bac": 1,
        "mo_ta": "Thu quỹ theo hộ, mã QR chuyển khoản, bảng công khai tự sinh",
    },
    "nhap_ai": {
        "ten": "Nhập liệu bằng AI",
        "bac": 1,
        "mo_ta": "Đọc danh sách từ ảnh chụp, tệp scan",
    },
    # Zalo TẠM TẮT — chưa có tài khoản Zalo OA nên chưa gửi tin được. Hứa trong
    # bảng gói mà không dùng được là mất tin hơn không hứa. Bật lại thì bỏ dấu
    # chú thích và thêm vào bảng mức đóng góp trên khuphoso.vn.
    # "zalo": {
    #     "ten": "Kết nối Zalo",
    #     "bac": 1,
    #     "mo_ta": "Gửi giấy mời họp, nhắc đóng quỹ qua Zalo",
    # },
    "dan_chu": {
        "ten": "Bộ công cụ Luật Dân chủ cơ sở",
        "bac": 2,
        "mo_ta": "Hội nghị nhân dân, biểu quyết theo đại diện hộ, bảng kiểm công khai",
    },
    "ten_mien_rieng": {
        "ten": "Tên miền riêng",
        "bac": 2,
        "mo_ta": "Dùng tên miền của khu phố thay cho địa chỉ mặc định",
    },
}


def bac_cua(plan_code: str | None, den_ngay: date | None) -> int:
    """Bậc thực tế đang có. Quá hạn thì tụt về mức miễn phí.

    `bao_tro` và `dong_hanh` không có hạn — một bên miễn phí, một bên đã tài trợ
    trọn gói, cả hai đều không phải gia hạn hằng tháng.
    """
    b = BAC.get(plan_code or "dong_hanh", 0)
    if b == 0 or plan_code == "bao_tro":
        return b
    if den_ngay is None or den_ngay < date.today():
        return 0
    return b


async def trang_thai_goi(kp: KhuPho | None) -> dict:
    """Gói hiện tại của khu phố, kèm danh sách mục đang mở."""
    if kp is None:
        return {"plan_code": "dong_hanh", "bac": 0, "tinh_nang": {}, "qua_han": False}

    async with PlatformSession() as db:
        r = (
            await db.execute(
                text("""SELECT p.code, p.name, p.price_monthly, t.plan_den_ngay,
                               (SELECT count(*) FROM membership m
                                 WHERE m.tenant_id = t.id AND m.deleted_at IS NULL) AS so_tk
                        FROM tenant t LEFT JOIN plan p ON p.id = t.plan_id
                        WHERE t.id = CAST(:t AS uuid)"""),
                {"t": kp.id},
            )
        ).mappings().first()

    ma = (r["code"] if r else None) or "dong_hanh"
    den = r["plan_den_ngay"] if r else None
    b = bac_cua(ma, den)
    # Đã từng trả tiền mà nay tụt bậc — khác hẳn khu phố chưa bao giờ nâng cấp
    qua_han = bool(den and den < date.today() and BAC.get(ma, 0) > 0)

    return {
        "plan_code": ma,
        "ten_goi": TEN_GOI.get(ma, ma),
        "gia_thang": float(r["price_monthly"]) if r and r["price_monthly"] else 0,
        "den_ngay": den,
        "con_ngay": (den - date.today()).days if den else None,
        "bac": b,
        "qua_han": qua_han,
        "so_tai_khoan_toi_da": SO_TAI_KHOAN.get(ma if not qua_han else "dong_hanh", 5),
        "so_tai_khoan_dang_dung": r["so_tk"] if r else 0,
        "tinh_nang": {
            k: {**v, "mo": b >= v["bac"], "ten_goi_can": TEN_GOI[_goi_toi_thieu(v["bac"])]}
            for k, v in TINH_NANG.items()
        },
    }


def _goi_toi_thieu(bac: int) -> str:
    """Gói rẻ nhất mở được bậc này — để nói cho người ta biết cần nâng lên đâu."""
    for ma, b in (("dong_hanh", 0), ("duy_tri", 1), ("chung_tay", 2)):
        if b >= bac:
            return ma
    return "chung_tay"


def yeu_cau_goi(ma_tinh_nang: str):
    """Chặn ở máy chủ nếu gói hiện tại chưa mở mục này.

    Dùng làm `dependencies=[Depends(yeu_cau_goi("quy"))]` trên router.

    PHỤ THUỘC `current_user` DÙ KHÔNG DÙNG TỚI. Dependency này khai ở cấp router
    nên FastAPI chạy nó TRƯỚC các dependency của từng endpoint — kể cả trước
    `require(...)`. Không buộc đăng nhập ở đây thì người lạ gọi vào nhận 402 thay
    vì 401, tức là biết được khu phố đang ở gói nào mà chưa cần tài khoản.
    Trạng thái gói là chuyện nội bộ, không nói cho người chưa đăng nhập.
    """
    can = TINH_NANG[ma_tinh_nang]

    async def kiem(
        kp: KhuPho | None = Depends(resolve_khu_pho),
        _nguoi: CurrentUser = Depends(current_user),
    ) -> None:
        tt = await trang_thai_goi(kp)
        if tt["bac"] >= can["bac"]:
            return
        can_goi = TEN_GOI[_goi_toi_thieu(can["bac"])]
        loi = (
            f"“{can['ten']}” thuộc mức {can_goi}. "
            + (
                f"Gói của khu phố đã hết hạn ngày {tt['den_ngay']:%d/%m/%Y}, gia hạn là dùng "
                "lại được ngay — dữ liệu vẫn còn nguyên."
                if tt["qua_han"]
                else f"Khu phố đang ở mức {tt['ten_goi']}. Nâng cấp trong mục Gói dịch vụ."
            )
        )
        log.info("goi.chan", tinh_nang=ma_tinh_nang, bac_can=can["bac"], bac_co=tt["bac"])
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, loi)

    return kiem
