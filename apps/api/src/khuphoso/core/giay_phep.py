"""Giấy phép sử dụng — kích hoạt phần mềm bằng key do tác giả cấp.

MỖI BẢN CÀI PHẢI ĐƯỢC ĐĂNG KÝ. Khu phố muốn chạy phần mềm phải đăng ký tại
https://khuphoso.vn/dang-ky-repo (hoặc liên hệ montacapital2026@gmail.com) để nhận
một "key kích hoạt". Chưa có key hợp lệ thì API chặn mọi nghiệp vụ và trả lỗi rõ
ràng chứ không âm thầm cho qua.

KHÔNG TỰ CHẾ ĐƯỢC KEY. Key là một chuỗi JWT ký bằng chữ ký số Ed25519. Chỉ tác giả
— người giữ KHOÁ RIÊNG — mới ký ra key hợp lệ. Bản phần mềm này chỉ giữ KHOÁ CÔNG
KHAI để KIỂM chữ ký, không đủ để tạo key, nên dù có toàn bộ mã nguồn cũng không tự
cấp phép cho mình được.

KEY GẮN VỚI TỪNG KHU PHỐ. Mỗi key ký cho đúng một mã khu phố (`sub`), nên không
mang key của khu phố này sang chạy cho khu phố khác. Key `sub = "*"` là key dùng
chung (ví dụ bản dùng thử), chạy cho mọi khu phố.

Đặt key vào biến môi trường `LICENSE_KEY` trong `.env` rồi khởi động lại API.
"""

from __future__ import annotations

from datetime import datetime, timezone

import jwt
import structlog

from khuphoso.core.config import get_settings

log = structlog.get_logger()

EMAIL_DANG_KY = "montacapital2026@gmail.com"
LINK_DANG_KY = "https://khuphoso.vn/dang-ky-repo"
_ISS = "khuphoso"

# Khoá CÔNG KHAI để kiểm chữ ký. An toàn khi để lộ — không ký được key từ khoá này.
# Khoá riêng tương ứng do tác giả giữ, KHÔNG nằm trong mã nguồn.
KHOA_CONG_KHAI = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAA6m5FMs3U4EuxA3MYh9knoAlDWYow+khvARB9iOPMeg=
-----END PUBLIC KEY-----"""


def kiem_tra(slug: str | None) -> dict:
    """Trạng thái giấy phép cho khu phố `slug`.

    Trả về dict luôn có `kich_hoat` (bool). Khi chưa kích hoạt có thêm `ly_do`
    (`chua_co_key` | `het_han` | `key_khong_hop_le` | `sai_khu_pho`). Khi đã kích
    hoạt có thêm `ten`, `cap_cho`, `het_han`.
    """
    key = (get_settings().license_key or "").strip()
    if not key:
        return {"kich_hoat": False, "ly_do": "chua_co_key"}

    try:
        payload = jwt.decode(
            key,
            KHOA_CONG_KHAI,
            algorithms=["EdDSA"],
            issuer=_ISS,
            options={"require": ["iss", "sub", "iat"]},
        )
    except jwt.ExpiredSignatureError:
        return {"kich_hoat": False, "ly_do": "het_han"}
    except Exception as exc:  # noqa: BLE001 — mọi lỗi giải mã đều là key không hợp lệ
        log.info("giay_phep.khong_hop_le", loi=str(exc)[:120])
        return {"kich_hoat": False, "ly_do": "key_khong_hop_le"}

    cap_cho = payload.get("sub")
    # Key gắn với một khu phố cụ thể thì chỉ chạy cho đúng khu phố đó.
    if cap_cho not in (None, "*") and slug and cap_cho != slug:
        return {"kich_hoat": False, "ly_do": "sai_khu_pho", "cap_cho": cap_cho}

    exp = payload.get("exp")
    return {
        "kich_hoat": True,
        "ten": payload.get("ten"),
        "cap_cho": cap_cho,
        "het_han": (
            datetime.fromtimestamp(exp, timezone.utc).date().isoformat() if exp else None
        ),
    }
