"""Cơ sở kinh doanh trên địa bàn khu phố.

Việc thật của cán bộ với phân hệ này không phải là "lưu danh sách quán xá", mà là
**biết giấy tờ nào sắp hết hạn**. Giấy chứng nhận an toàn thực phẩm có thời hạn;
hết hạn mà quán vẫn bán là chuyện khu phố phải nhắc trước, không đợi đoàn kiểm tra
xuống mới biết. Vì vậy danh sách luôn tính sẵn số ngày còn lại và có bộ lọc riêng
cho nhóm sắp hết hạn.

Chủ cơ sở nối thẳng vào hồ sơ nhân khẩu khi là người trong khu phố (`owner_resident_id`),
còn người ngoài địa bàn thì chỉ ghi tên. Giữ cả hai để không mất dữ liệu.
"""

from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()
router = APIRouter(prefix="/kinh-doanh", tags=["cơ sở kinh doanh"])

TRANG_THAI = {
    "dang_hoat_dong": "Đang hoạt động",
    "tam_nghi": "Tạm nghỉ",
    "da_dong_cua": "Đã đóng cửa",
}

# Ngưỡng nhắc giấy an toàn thực phẩm sắp hết hạn — đủ thời gian để chủ quán đi làm lại
NGAY_NHAC_ATTP = 60


class CoSoIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    owner_resident_id: str | None = None
    owner_name: str | None = Field(default=None, max_length=120)
    household_id: str | None = None
    group_id: str | None = None
    nganh_nghe: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=30)
    so_gpkd: str | None = Field(default=None, max_length=60)
    ngay_cap_gpkd: date | None = None
    so_attp: str | None = Field(default=None, max_length=60)
    ngay_cap_attp: date | None = None
    ngay_het_han_attp: date | None = None
    so_pccc: str | None = Field(default=None, max_length=60)
    ngay_cap_pccc: date | None = None
    trang_thai: str | None = Field(
        default=None, pattern="^(dang_hoat_dong|tam_nghi|da_dong_cua)$"
    )
    so_lao_dong: int | None = Field(default=None, ge=0)
    note: str | None = None


@router.get("", dependencies=[Depends(require("business:read"))])
async def danh_sach(
    q: str | None = None,
    nganh_nghe: str | None = None,
    trang_thai: str | None = Query(
        default=None, pattern="^(dang_hoat_dong|tam_nghi|da_dong_cua)$"
    ),
    giay_to: str | None = Query(
        default=None,
        pattern="^(attp_sap_het|attp_het_han|thieu_gpkd|thieu_attp)$",
        description="lọc theo tình trạng giấy tờ",
    ),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q and q.strip() else None, "nn": nganh_nghe, "tt": trang_thai,
         "gt": giay_to, "nhac": NGAY_NHAC_ATTP, "limit": limit, "offset": offset}
    WHERE = """
        WHERE b.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR kp_unaccent(b.name) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR b.address_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR kp_unaccent(coalesce(b.owner_name,'')) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:nn AS text) IS NULL OR b.nganh_nghe = CAST(:nn AS text))
          AND (CAST(:tt AS text) IS NULL OR b.trang_thai = CAST(:tt AS text))
          AND (CAST(:gt AS text) IS NULL
               OR (CAST(:gt AS text) = 'attp_sap_het'
                   AND b.ngay_het_han_attp IS NOT NULL
                   AND b.ngay_het_han_attp >= CURRENT_DATE
                   AND b.ngay_het_han_attp <= CURRENT_DATE + CAST(:nhac AS int))
               OR (CAST(:gt AS text) = 'attp_het_han'
                   AND b.ngay_het_han_attp IS NOT NULL
                   AND b.ngay_het_han_attp < CURRENT_DATE)
               OR (CAST(:gt AS text) = 'thieu_gpkd' AND NULLIF(btrim(b.so_gpkd),'') IS NULL)
               OR (CAST(:gt AS text) = 'thieu_attp' AND NULLIF(btrim(b.so_attp),'') IS NULL))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT b.id::text, b.name, b.nganh_nghe, b.address, b.phone, b.trang_thai,
                   b.so_gpkd, b.so_attp, b.ngay_het_han_attp, b.geo_status,
                   COALESCE(b.owner_name, c.full_name) AS chu_co_so,
                   b.owner_resident_id::text, g.name AS to_dan_pho,
                   (b.ngay_het_han_attp - CURRENT_DATE) AS attp_con_ngay,
                   CASE WHEN b.geom IS NOT NULL
                        THEN json_build_object('lat', ST_Y(b.geom::geometry),
                                               'lng', ST_X(b.geom::geometry)) END AS toa_do
            FROM business b
            LEFT JOIN resident c ON c.id = b.owner_resident_id AND c.deleted_at IS NULL
            LEFT JOIN neighborhood_group g ON g.id = b.group_id
            {WHERE}
            ORDER BY b.ngay_het_han_attp ASC NULLS LAST, b.name
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = (
        await db.execute(text(f"SELECT count(*) FROM business b {WHERE}"), p)
    ).scalar_one()
    return {
        "tong_so": tong,
        "items": [
            {**dict(r), "ten_trang_thai": TRANG_THAI.get(r["trang_thai"], r["trang_thai"])}
            for r in rows
        ],
    }


@router.get("/tong-quan", dependencies=[Depends(require("business:read"))])
async def tong_quan(db: AsyncSession = Depends(get_db)) -> dict:
    """Số liệu cho thẻ đầu màn hình, và để chuông biết có việc gì cần nhắc."""
    r = (
        await db.execute(
            text("""
            SELECT count(*)                                                   AS tong,
                   count(*) FILTER (WHERE trang_thai = 'dang_hoat_dong')      AS dang_hoat_dong,
                   count(*) FILTER (WHERE NULLIF(btrim(so_gpkd),'') IS NULL)  AS thieu_gpkd,
                   count(*) FILTER (WHERE NULLIF(btrim(so_attp),'') IS NULL)  AS thieu_attp,
                   count(*) FILTER (WHERE ngay_het_han_attp IS NOT NULL
                                      AND ngay_het_han_attp < CURRENT_DATE)   AS attp_het_han,
                   count(*) FILTER (WHERE ngay_het_han_attp IS NOT NULL
                                      AND ngay_het_han_attp >= CURRENT_DATE
                                      AND ngay_het_han_attp
                                          <= CURRENT_DATE
                                             + CAST(:nhac AS int))            AS attp_sap_het
            FROM business WHERE deleted_at IS NULL
        """),
            {"nhac": NGAY_NHAC_ATTP},
        )
    ).mappings().one()
    return {**dict(r), "nguong_nhac_ngay": NGAY_NHAC_ATTP}


@router.get("/nganh-nghe", dependencies=[Depends(require("business:read"))])
async def danh_muc_nganh_nghe(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Ngành nghề đã nhập, để ô lọc gợi ý đúng cái khu phố đang có."""
    rows = (
        await db.execute(
            text("""SELECT nganh_nghe, count(*) AS so_luong FROM business
                    WHERE deleted_at IS NULL AND NULLIF(btrim(nganh_nghe),'') IS NOT NULL
                    GROUP BY nganh_nghe ORDER BY count(*) DESC, nganh_nghe""")
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{bid}", dependencies=[Depends(require("business:read"))])
async def chi_tiet(bid: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""
            SELECT b.id::text, b.name, b.owner_resident_id::text, b.owner_name,
                   b.household_id::text, b.group_id::text, b.nganh_nghe, b.address, b.phone,
                   b.so_gpkd, b.ngay_cap_gpkd, b.so_attp, b.ngay_cap_attp,
                   b.ngay_het_han_attp, b.so_pccc, b.ngay_cap_pccc,
                   b.trang_thai, b.so_lao_dong, b.note,
                   b.geo_status, b.geo_source, b.geo_accuracy_m,
                   COALESCE(b.owner_name, c.full_name) AS chu_co_so,
                   g.name AS to_dan_pho,
                   (b.ngay_het_han_attp - CURRENT_DATE) AS attp_con_ngay,
                   CASE WHEN b.geom IS NOT NULL
                        THEN json_build_object('lat', ST_Y(b.geom::geometry),
                                               'lng', ST_X(b.geom::geometry)) END AS toa_do,
                   b.created_at, b.updated_at
            FROM business b
            LEFT JOIN resident c ON c.id = b.owner_resident_id AND c.deleted_at IS NULL
            LEFT JOIN neighborhood_group g ON g.id = b.group_id
            WHERE b.id = CAST(:i AS uuid) AND b.deleted_at IS NULL
        """),
            {"i": bid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở kinh doanh")
    return {**dict(r), "ten_trang_thai": TRANG_THAI.get(r["trang_thai"], r["trang_thai"])}


def _tham_so(body: CoSoIn, uid: str, bid: str | None = None) -> dict:
    return {
        "n": body.name.strip() if body.name else None,
        "ord": body.owner_resident_id, "on": body.owner_name,
        "hh": body.household_id, "gid": body.group_id,
        "nn": body.nganh_nghe, "a": body.address, "p": body.phone,
        "gpkd": body.so_gpkd, "ngpkd": body.ngay_cap_gpkd,
        "attp": body.so_attp, "nattp": body.ngay_cap_attp, "hhattp": body.ngay_het_han_attp,
        "pccc": body.so_pccc, "npccc": body.ngay_cap_pccc,
        "tt": body.trang_thai, "sld": body.so_lao_dong, "note": body.note,
        "u": uid, "i": bid,
    }


@router.post("", status_code=201)
async def tao_moi(
    body: CoSoIn,
    request: Request,
    user: CurrentUser = Depends(require("business:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    bid = (
        await db.execute(
            text("""
            INSERT INTO business
                (name, owner_resident_id, owner_name, household_id, group_id, nganh_nghe,
                 address, phone, so_gpkd, ngay_cap_gpkd, so_attp, ngay_cap_attp,
                 ngay_het_han_attp, so_pccc, ngay_cap_pccc, trang_thai, so_lao_dong, note,
                 created_by, updated_by)
            VALUES (:n, CAST(:ord AS uuid), :on, CAST(:hh AS uuid), CAST(:gid AS uuid), :nn,
                    :a, :p, :gpkd, CAST(:ngpkd AS date), :attp, CAST(:nattp AS date),
                    CAST(:hhattp AS date), :pccc, CAST(:npccc AS date),
                    COALESCE(CAST(:tt AS text), 'dang_hoat_dong'), CAST(:sld AS int), :note,
                    CAST(:u AS uuid), CAST(:u AS uuid))
            RETURNING id::text
        """),
            _tham_so(body, user.id),
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="business", eid=bid)
    await db.commit()
    log.info("business.created", id=bid, name=body.name[:60])
    return {"id": bid}


@router.patch("/{bid}")
async def cap_nhat(
    bid: str,
    body: CoSoIn,
    request: Request,
    user: CurrentUser = Depends(require("business:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE business SET
                name              = COALESCE(:n, name),
                owner_resident_id = COALESCE(CAST(:ord AS uuid), owner_resident_id),
                owner_name        = CASE WHEN CAST(:on AS text) IS NULL THEN owner_name
                                         ELSE NULLIF(CAST(:on AS text), '') END,
                household_id      = COALESCE(CAST(:hh AS uuid), household_id),
                group_id          = COALESCE(CAST(:gid AS uuid), group_id),
                nganh_nghe        = CASE WHEN CAST(:nn AS text) IS NULL THEN nganh_nghe
                                         ELSE NULLIF(CAST(:nn AS text), '') END,
                address           = CASE WHEN CAST(:a AS text) IS NULL THEN address
                                         ELSE NULLIF(CAST(:a AS text), '') END,
                phone             = CASE WHEN CAST(:p AS text) IS NULL THEN phone
                                         ELSE NULLIF(CAST(:p AS text), '') END,
                so_gpkd           = CASE WHEN CAST(:gpkd AS text) IS NULL THEN so_gpkd
                                         ELSE NULLIF(CAST(:gpkd AS text), '') END,
                ngay_cap_gpkd     = COALESCE(CAST(:ngpkd AS date), ngay_cap_gpkd),
                so_attp           = CASE WHEN CAST(:attp AS text) IS NULL THEN so_attp
                                         ELSE NULLIF(CAST(:attp AS text), '') END,
                ngay_cap_attp     = COALESCE(CAST(:nattp AS date), ngay_cap_attp),
                ngay_het_han_attp = COALESCE(CAST(:hhattp AS date), ngay_het_han_attp),
                so_pccc           = CASE WHEN CAST(:pccc AS text) IS NULL THEN so_pccc
                                         ELSE NULLIF(CAST(:pccc AS text), '') END,
                ngay_cap_pccc     = COALESCE(CAST(:npccc AS date), ngay_cap_pccc),
                trang_thai        = COALESCE(CAST(:tt AS text), trang_thai),
                so_lao_dong       = COALESCE(CAST(:sld AS int), so_lao_dong),
                note              = CASE WHEN CAST(:note AS text) IS NULL THEN note
                                         ELSE NULLIF(CAST(:note AS text), '') END,
                updated_by        = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            _tham_so(body, user.id, bid),
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở kinh doanh")
    await ghi_audit(db, user, request, action="update", etype="business", eid=bid)
    await db.commit()
    return {"success": True}


@router.delete("/{bid}")
async def xoa(
    bid: str,
    request: Request,
    user: CurrentUser = Depends(require("business:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE business SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"i": bid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở kinh doanh")
    await ghi_audit(db, user, request, action="delete", etype="business", eid=bid)
    await db.commit()
    return {"success": True}
