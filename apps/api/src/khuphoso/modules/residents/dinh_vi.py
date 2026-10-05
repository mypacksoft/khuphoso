"""Định vị hộ: dò tự động từ địa chỉ, rồi cán bộ đi thực địa xác minh.

QUY TRÌNH BA BƯỚC — cố ý không gộp làm một

  1. `pending`  Vừa nhập địa chỉ, chưa có toạ độ.
  2. `auto`     Máy dò được toạ độ từ địa chỉ chữ. **Chưa tin được.** Không dịch vụ
                bản đồ nào biết chính xác căn nhà trong hẻm 123/45/7 — toạ độ này
                chỉ đủ để đi tới gần. Hộ ở trạng thái này hiện cờ "cần xác minh".
  3. `verified` Cán bộ đã tới tận nơi và xác nhận. Chỉ trạng thái này mới coi là
                toạ độ đúng.

Cán bộ đứng tại nhà bấm "Lấy GPS của tôi" thì toạ độ lấy từ máy điện thoại, chính
xác hơn hẳn dò theo địa chỉ chữ, và ghi thẳng thành `verified`. Vì bước 2 luôn phải
được bước 3 kiểm lại, nên dò bằng nguồn miễn phí hay trả phí đều cho kết quả cuối
cùng như nhau — chỉ khác quãng đường cán bộ phải đi tìm.

Sai lệch giữa vị trí dò tự động và vị trí thực đo được lưu lại (`geo_note`) để về
sau biết chất lượng dò của cả khu phố tới đâu.
"""

import math

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, KhuPho, get_db, ghi_audit, require, resolve_khu_pho
from khuphoso.core.geocode import LoiCauHinhGeocode, do_toa_do, ten_nha_cung_cap

log = structlog.get_logger()
router = APIRouter(prefix="/ho-khau", tags=["hộ khẩu"])

# Dò hàng loạt: chặn số lượng mỗi lần gọi để request không treo quá lâu, và để
# một cú bấm nhầm không đốt hết hạn mức Google trong một lần.
TOI_DA_MOI_LAN = 40


def khoang_cach_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Khoảng cách hai điểm trên mặt cầu, mét (công thức haversine)."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _thong_tin_hanh_chinh(kp: KhuPho, db: AsyncSession) -> dict:
    """Phường/quận/tỉnh của khu phố — ghép vào địa chỉ để dò cho trúng vùng."""
    from khuphoso.core.database import PlatformSession  # noqa: PLC0415

    async with PlatformSession() as p:
        r = (
            await p.execute(
                text("SELECT ward, district, province FROM tenant WHERE id = CAST(:t AS uuid)"),
                {"t": kp.id},
            )
        ).mappings().first()
    return dict(r) if r else {}


async def _luu_ket_qua_do(db: AsyncSession, hid: str, kq, uid: str) -> bool:
    """Ghi toạ độ dò được với trạng thái `auto` — chưa phải vị trí đã kiểm chứng."""
    if not kq:
        await db.execute(
            text("""UPDATE household SET geo_status = 'failed', geo_source = 'khong_do_duoc',
                           geo_updated_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:h AS uuid) AND geo_status IN ('pending','failed')"""),
            {"h": hid, "u": uid},
        )
        return False

    await db.execute(
        text("""
        UPDATE household SET
            geom = ST_SetSRID(ST_MakePoint(CAST(:lng AS double precision),
                                           CAST(:lat AS double precision)), 4326)::geography,
            geo_status     = 'auto',
            geo_source     = :nguon,
            geo_accuracy_m = :sai_so,
            geo_updated_at = now(),
            geo_updated_by = CAST(:u AS uuid),
            updated_by     = CAST(:u AS uuid)
        WHERE id = CAST(:h AS uuid)
    """),
        {"h": hid, "lat": kq.lat, "lng": kq.lng, "nguon": kq.nguon,
         "sai_so": kq.sai_so_m, "u": uid},
    )
    return True


# --------------------------------------------------------------------------- #
@router.post("/{hid}/do-vi-tri")
async def do_vi_tri(
    hid: str,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Dò toạ độ của MỘT hộ từ địa chỉ. Kết quả luôn ở trạng thái cần xác minh."""
    ho = (
        await db.execute(
            text("""SELECT code, address FROM household
                    WHERE id = CAST(:h AS uuid) AND deleted_at IS NULL"""),
            {"h": hid},
        )
    ).mappings().first()
    if not ho:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ")
    if not ho["address"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Hộ chưa có địa chỉ. Nhập địa chỉ trước rồi mới dò được vị trí.",
        )

    hc = await _thong_tin_hanh_chinh(kp, db)
    try:
        kq = await do_toa_do(ho["address"], **hc)
    except LoiCauHinhGeocode as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None
    duoc = await _luu_ket_qua_do(db, hid, kq, user.id)
    await ghi_audit(
        db, user, request, action="do_vi_tri", etype="household", eid=hid,
        changes=(f'{{"lat": {kq.lat}, "lng": {kq.lng}, "nguon": "{kq.nguon}"}}' if kq else None),
    )
    await db.commit()

    if not duoc:
        return {
            "success": False,
            "message": f"Không dò được toạ độ của '{ho['address']}'. "
                       "Ghim tay trên bản đồ giúp.",
        }
    return {
        "success": True,
        "lat": kq.lat, "lng": kq.lng,
        "nguon": kq.nguon, "sai_so_m": kq.sai_so_m,
        "dia_chi_tra_ve": kq.dia_chi_tra_ve,
        "geo_status": "auto",
        "message": f"Đã đặt vị trí sơ bộ cho hộ #{ho['code']}. "
                   "Cần cán bộ tới tận nơi xác minh trước khi tin.",
    }


@router.post("/do-vi-tri-hang-loat")
async def do_hang_loat(
    request: Request,
    so_luong: int = Query(default=TOI_DA_MOI_LAN, ge=1, le=TOI_DA_MOI_LAN),
    user: CurrentUser = Depends(require("household:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Dò cho các hộ chưa có toạ độ, theo từng đợt để kiểm soát chi phí và thời gian."""
    ds = (
        await db.execute(
            text("""SELECT id::text, code, address FROM household
                    WHERE deleted_at IS NULL AND geom IS NULL
                      AND NULLIF(btrim(address), '') IS NOT NULL
                      AND geo_status IN ('pending', 'failed')
                    ORDER BY code LIMIT :n"""),
            {"n": so_luong},
        )
    ).mappings().all()

    if not ds:
        con = await db.scalar(
            text("""SELECT count(*) FROM household
                    WHERE deleted_at IS NULL AND geom IS NULL
                      AND NULLIF(btrim(address), '') IS NULL""")
        )
        return {
            "da_do": 0, "khong_do_duoc": 0, "con_lai": 0,
            "message": (
                f"Không còn hộ nào để dò. {con} hộ chưa có địa chỉ nên không dò được."
                if con else "Mọi hộ có địa chỉ đều đã có toạ độ."
            ),
        }

    hc = await _thong_tin_hanh_chinh(kp, db)
    duoc, hong = 0, 0
    chi_tiet: list[dict] = []

    for h in ds:
        try:
            kq = await do_toa_do(h["address"], **hc)
        except LoiCauHinhGeocode as exc:
            # Lỗi cấu hình thì dừng ngay, dò tiếp cũng hỏng hết
            await db.rollback()
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None
        if await _luu_ket_qua_do(db, h["id"], kq, user.id):
            duoc += 1
            chi_tiet.append({"code": h["code"], "address": h["address"],
                             "nguon": kq.nguon, "sai_so_m": kq.sai_so_m})
        else:
            hong += 1
            chi_tiet.append({"code": h["code"], "address": h["address"], "nguon": None})

    con_lai = await db.scalar(
        text("""SELECT count(*) FROM household
                WHERE deleted_at IS NULL AND geom IS NULL
                  AND NULLIF(btrim(address), '') IS NOT NULL
                  AND geo_status IN ('pending', 'failed')""")
    )

    await ghi_audit(
        db, user, request, action="do_vi_tri", etype="household",
        changes=f'{{"hang_loat": true, "da_do": {duoc}, "hong": {hong}}}',
    )
    await db.commit()
    log.info("geo.bulk", kp=kp.slug, duoc=duoc, hong=hong, con_lai=con_lai)

    return {
        "da_do": duoc, "khong_do_duoc": hong, "con_lai": con_lai,
        "chi_tiet": chi_tiet,
        "nha_cung_cap": ten_nha_cung_cap(),
        "message": (
            f"Đã đặt vị trí sơ bộ cho {duoc} hộ. Tất cả đang ở trạng thái CẦN XÁC MINH — "
            "cán bộ tới nơi xác nhận thì mới tin được."
            + (f" {hong} hộ không dò được, phải ghim tay." if hong else "")
            + (f" Còn {con_lai} hộ, bấm tiếp để dò đợt sau." if con_lai else "")
        ),
    }


class XacMinh(BaseModel):
    """Toạ độ đo tại chỗ. Không gửi thì chỉ xác nhận vị trí đang có là đúng."""

    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    do_chinh_xac_m: float | None = Field(default=None, ge=0)
    ghi_chu: str | None = Field(default=None, max_length=300)


@router.post("/{hid}/xac-minh")
async def xac_minh(
    hid: str,
    body: XacMinh,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cán bộ đã tới tận nơi: xác nhận vị trí đúng, hoặc ghi đè bằng GPS đo được."""
    ho = (
        await db.execute(
            text("""SELECT code, geo_status, geo_source,
                           ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
                    FROM household WHERE id = CAST(:h AS uuid) AND deleted_at IS NULL"""),
            {"h": hid},
        )
    ).mappings().first()
    if not ho:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ")

    co_toa_do_moi = body.lat is not None and body.lng is not None
    if not co_toa_do_moi and ho["lat"] is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Hộ chưa có toạ độ nào để xác minh. Ghim vị trí hoặc gửi kèm GPS đo tại chỗ.",
        )

    # Ghi lại độ lệch giữa vị trí dò tự động và vị trí đo thật — để biết chất lượng dò
    lech = None
    if co_toa_do_moi and ho["lat"] is not None:
        lech = round(khoang_cach_m(ho["lat"], ho["lng"], body.lat, body.lng))

    ghi_chu = body.ghi_chu
    if lech is not None:
        ghi_chu = (
            f"Xác minh tại chỗ, lệch {lech}m so với vị trí {ho['geo_source'] or 'cũ'}."
            + (f" {body.ghi_chu}" if body.ghi_chu else "")
        )

    await db.execute(
        text("""
        UPDATE household SET
            geom = CASE WHEN CAST(:lat AS double precision) IS NOT NULL
                        THEN ST_SetSRID(ST_MakePoint(CAST(:lng AS double precision),
                                                     CAST(:lat AS double precision)),
                                        4326)::geography
                        ELSE geom END,
            geo_status     = 'verified',
            geo_source     = CASE WHEN CAST(:lat AS double precision) IS NOT NULL
                                  THEN 'gps_tai_cho' ELSE COALESCE(geo_source, 'xac_nhan_tay') END,
            geo_accuracy_m = CASE WHEN CAST(:dcx AS numeric) IS NOT NULL
                                  THEN CAST(:dcx AS numeric) ELSE geo_accuracy_m END,
            geo_note       = COALESCE(CAST(:gc AS text), geo_note),
            geo_updated_at = now(),
            geo_updated_by = CAST(:u AS uuid),
            updated_by     = CAST(:u AS uuid)
        WHERE id = CAST(:h AS uuid)
    """),
        {"h": hid, "lat": body.lat, "lng": body.lng,
         "dcx": body.do_chinh_xac_m, "gc": ghi_chu, "u": user.id},
    )
    await ghi_audit(
        db, user, request, action="xac_minh_vi_tri", etype="household", eid=hid,
        changes=(f'{{"lech_m": {lech}}}' if lech is not None else '{"xac_nhan": true}'),
    )
    await db.commit()
    log.info("geo.verified", hid=hid, lech_m=lech, by=user.id)

    return {
        "success": True,
        "geo_status": "verified",
        "lech_m": lech,
        "message": (
            f"Đã xác minh hộ #{ho['code']}."
            + (f" Vị trí cũ lệch {lech}m, đã cập nhật theo GPS đo tại chỗ." if lech else "")
        ),
    }


@router.get("/dinh-vi/tong-quan", dependencies=[Depends(require("household:read"))])
async def tong_quan_dinh_vi(db: AsyncSession = Depends(get_db)) -> dict:
    """Đếm hộ theo trạng thái định vị — để màn hình bản đồ biết còn bao nhiêu việc."""
    r = (
        await db.execute(
            text("""
            SELECT count(*)                                                 AS tong,
                   count(*) FILTER (WHERE geo_status = 'pending')           AS chua_do,
                   count(*) FILTER (WHERE geo_status = 'auto')              AS can_xac_minh,
                   count(*) FILTER (WHERE geo_status = 'verified')          AS da_xac_minh,
                   count(*) FILTER (WHERE geo_status = 'manual')            AS ghim_tay,
                   count(*) FILTER (WHERE geo_status = 'failed')            AS khong_do_duoc,
                   count(*) FILTER (WHERE NULLIF(btrim(address),'') IS NULL) AS thieu_dia_chi
            FROM household WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()
    return {**dict(r), "do_tu_dong_san_sang": True, "nha_cung_cap": ten_nha_cung_cap()}


@router.get("/{hid}/lich-su-vi-tri", dependencies=[Depends(require("household:read"))])
async def lich_su_vi_tri(hid: str, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Lịch sử ghim, đo, xác minh vị trí của một hộ — ai làm, lúc nào, ở đâu.

    Đọc từ `audit_log` chứ không dựng bảng lịch sử riêng: mọi thao tác vị trí đã
    ghi audit sẵn, dựng thêm bảng là hai nơi phải giữ đồng bộ. Tính luôn độ lệch
    so với lần trước để thấy mỗi lần sửa dịch bao xa.
    """
    rows = (
        await db.execute(
            text("""
            SELECT created_at, action, actor_name, ho_tro, ip, changes
            FROM audit_log
            WHERE entity_id = :h AND entity_type = 'household'
              AND action IN ('ghim_vi_tri', 'do_vi_tri', 'xac_minh_vi_tri', 'go_ghim')
            ORDER BY created_at DESC
            LIMIT 100
        """),
            {"h": hid},
        )
    ).mappings().all()

    TEN = {
        "ghim_vi_tri": "Ghim tay trên bản đồ",
        "do_vi_tri": "Đo bằng GPS tại chỗ",
        "xac_minh_vi_tri": "Xác minh tại chỗ",
        "go_ghim": "Gỡ ghim",
    }
    ds = []
    truoc = None
    for r in rows:
        ch = r["changes"] if isinstance(r["changes"], dict) else {}
        lat, lng = ch.get("lat"), ch.get("lng")
        lech = None
        # rows xếp mới→cũ, nên "lần trước" của dòng này là dòng ngay SAU nó
        if lat is not None and truoc and truoc[0] is not None:
            lech = round(khoang_cach_m(lat, lng, truoc[0], truoc[1]))
        ds.append({
            "luc": r["created_at"],
            "hanh_dong": TEN.get(r["action"], r["action"]),
            "nguoi": r["actor_name"] or "—",
            "qua_ho_tro": bool(r["ho_tro"]),
            "lat": lat, "lng": lng,
            "xac_nhan": ch.get("xac_nhan"),
            "lech_lan_truoc_m": lech,
        })
        if lat is not None:
            truoc = (lat, lng)
    return ds
