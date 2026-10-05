"""Dò toạ độ từ địa chỉ chữ.

HAI NHÀ CUNG CẤP — tự chọn theo cấu hình

  Nominatim (OpenStreetMap)   MẶC ĐỊNH. Miễn phí, không cần khoá, không cần thẻ.
  Google Geocoding            Dùng khi có `GOOGLE_MAPS_API_KEY` trong `.env`.
                              Chính xác hơn với hẻm ngách, nhưng phải bật thanh toán.

VÌ SAO BẢN MIỄN PHÍ ĐỦ DÙNG Ở ĐÂY
Toạ độ dò tự động **luôn** phải được cán bộ tới tận nơi xác minh, dù dò bằng Google
hay OpenStreetMap — không dịch vụ nào biết chính xác căn nhà trong hẻm 123/45/7.
Việc của bước dò tự động chỉ là đưa cán bộ tới GẦN đúng chỗ, phần còn lại là đi bộ
và bấm "Lấy GPS của tôi". Với mục đích đó thì chênh lệch chính xác giữa hai nhà
cung cấp gần như không đổi kết quả cuối cùng.

Đổi sang Google chỉ đáng khi khu phố quá nhiều hẻm sâu và cán bộ mất công đi tìm.

GIỚI HẠN CỦA NOMINATIM — phải tôn trọng, không thì bị chặn IP
  · tối đa 1 yêu cầu mỗi giây
  · bắt buộc khai User-Agent nêu rõ ứng dụng và cách liên hệ
  · không được dò hàng loạt ồ ạt
Phần dò hàng loạt vì thế tự giãn nhịp và chỉ chạy từng đợt nhỏ.
"""

import asyncio
import time
from dataclasses import dataclass

import httpx
import structlog

from khuphoso.core.config import get_settings

log = structlog.get_logger()
settings = get_settings()

# Nominatim yêu cầu User-Agent nêu rõ ứng dụng và cách liên hệ
UA = "KhuPhoSo/0.1 (nen tang quan tri khu pho phi loi nhuan; +https://khuphoso.vn)"
NHIP_TOI_THIEU = 1.1  # giây giữa hai lần gọi Nominatim

SAI_SO_GOOGLE = {
    "ROOFTOP": 10.0,
    "RANGE_INTERPOLATED": 30.0,
    "GEOMETRIC_CENTER": 80.0,
    "APPROXIMATE": 250.0,
}
SAI_SO_OSM = {
    "house": 25.0,
    "building": 30.0,
    "residential": 120.0,
    "road": 150.0,
    "neighbourhood": 400.0,
}

_lan_goi_cuoi = 0.0
_khoa_nhip = asyncio.Lock()


class LoiCauHinhGeocode(RuntimeError):
    """Nhà cung cấp từ chối vì cấu hình sai (khoá hỏng, hết hạn mức, bị chặn)."""


@dataclass
class KetQuaDo:
    lat: float
    lng: float
    nguon: str
    """Sai số ước lượng, mét. Càng lớn càng cần đi thực địa xác minh."""
    sai_so_m: float | None = None
    dia_chi_tra_ve: str | None = None


def ten_nha_cung_cap() -> str:
    return "google" if settings.google_maps_api_key else "openstreetmap"


def _ghep_dia_chi(
    dia_chi: str, ward: str | None, district: str | None, province: str | None
) -> str:
    """Ghép phường/quận/tỉnh để thu hẹp vùng tìm — cùng tên đường có ở nhiều nơi."""
    phan = [dia_chi.strip()]
    phan += [p.strip() for p in (ward, district, province) if p and p.strip()]
    if not any("việt nam" in p.lower() or "vietnam" in p.lower() for p in phan):
        phan.append("Việt Nam")
    return ", ".join(phan)


async def _do_google(day_du: str) -> KetQuaDo | None:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={
                "address": day_du,
                "region": "vn",
                "language": "vi",
                "key": settings.google_maps_api_key,
            },
        )
    if r.status_code != 200:
        log.warning("geocode.google_http", status=r.status_code)
        return None

    d = r.json()
    tt = d.get("status")
    if tt == "ZERO_RESULTS":
        return None
    if tt in ("REQUEST_DENIED", "INVALID_REQUEST"):
        raise LoiCauHinhGeocode(
            f"Google từ chối ({tt}): {d.get('error_message') or 'không rõ lý do'}. "
            "Kiểm tra khoá đã bật Geocoding API và phần hạn chế khoá."
        )
    if tt == "OVER_QUERY_LIMIT":
        raise LoiCauHinhGeocode(
            "Khoá Google đã hết hạn mức. Kiểm tra thanh toán và hạn mức trong Google Cloud."
        )
    if tt != "OK" or not d.get("results"):
        log.warning("geocode.google_status_la", status=tt)
        return None

    kq = d["results"][0]
    vt = kq["geometry"]["location"]
    muc = kq["geometry"].get("location_type", "APPROXIMATE")
    return KetQuaDo(
        lat=vt["lat"],
        lng=vt["lng"],
        nguon=f"google:{muc.lower()}",
        sai_so_m=SAI_SO_GOOGLE.get(muc, 250.0),
        dia_chi_tra_ve=kq.get("formatted_address"),
    )


async def _do_osm(day_du: str) -> KetQuaDo | None:
    global _lan_goi_cuoi
    # Giãn nhịp tối thiểu 1 giây giữa hai lần gọi — điều kiện sử dụng của Nominatim
    async with _khoa_nhip:
        cho = NHIP_TOI_THIEU - (time.monotonic() - _lan_goi_cuoi)
        if cho > 0:
            await asyncio.sleep(cho)
        _lan_goi_cuoi = time.monotonic()

    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": UA}) as c:
        r = await c.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": day_du,
                "format": "jsonv2",
                "countrycodes": "vn",
                "limit": 1,
                "addressdetails": 0,
            },
        )
    if r.status_code in (403, 429):
        raise LoiCauHinhGeocode(
            "OpenStreetMap tạm chặn vì gọi quá nhanh. Chờ ít phút rồi dò tiếp, "
            "hoặc chuyển sang khoá Google nếu cần dò nhiều."
        )
    if r.status_code != 200:
        log.warning("geocode.osm_http", status=r.status_code)
        return None

    ds = r.json()
    if not ds:
        return None

    kq = ds[0]
    loai = kq.get("addresstype") or kq.get("type") or ""
    return KetQuaDo(
        lat=float(kq["lat"]),
        lng=float(kq["lon"]),
        nguon=f"osm:{loai or 'khac'}",
        sai_so_m=SAI_SO_OSM.get(loai, 300.0),
        dia_chi_tra_ve=kq.get("display_name"),
    )


async def do_toa_do(
    dia_chi: str,
    *,
    ward: str | None = None,
    district: str | None = None,
    province: str | None = None,
) -> KetQuaDo | None:
    """Dò toạ độ. Trả None khi không tìm thấy địa chỉ.

    Ném `LoiCauHinhGeocode` khi nhà cung cấp từ chối vì cấu hình hoặc hạn mức —
    lỗi đó khác hẳn "không tìm thấy", nơi gọi phải phân biệt để báo cho đúng.
    """
    if not dia_chi or not dia_chi.strip():
        return None

    day_du = _ghep_dia_chi(dia_chi, ward, district, province)
    dung_google = bool(settings.google_maps_api_key)

    try:
        kq = await (_do_google(day_du) if dung_google else _do_osm(day_du))
    except LoiCauHinhGeocode:
        raise
    except Exception as exc:  # noqa: BLE001 — mất mạng không được làm hỏng nghiệp vụ
        log.warning("geocode.loi_mang", error=str(exc), dia_chi=dia_chi[:60])
        return None

    if kq:
        log.info("geocode.ok", nguon=kq.nguon, sai_so=kq.sai_so_m, dia_chi=dia_chi[:60])
    else:
        log.info("geocode.khong_thay", nguon=ten_nha_cung_cap(), dia_chi=dia_chi[:60])
    return kq
