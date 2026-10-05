"""Sổ đoàn viên, hội viên — theo dõi từng nhóm đoàn thể.

Theo đề nghị của Đoàn Thanh niên khu phố: chức vụ, ngày kết nạp, ai đã chuyển đi,
ai đang sinh hoạt Đảng, ai học lớp cảm tình Đảng. Làm cho Đoàn trước nhưng dùng
chung được cho Hội Phụ nữ, Cựu chiến binh và mọi nhóm khác.

CHUYỂN ĐI KHÔNG XOÁ HỒ SƠ. Đoàn viên chuyển đi thì trừ khỏi tổng số nhưng bản ghi
vẫn còn — ai từng sinh hoạt, chuyển đi ngày nào, đi đâu. Xoá hẳn là mất lịch sử,
mà lịch sử đó chính là thứ cần khi làm báo cáo cuối năm hoặc khi người ta quay về.

"SINH HOẠT ĐẢNG" VÀ "CẢM TÌNH ĐẢNG" KHÔNG PHẢI CỘT RIÊNG. Đó là thuộc tính của
người, không phải của việc họ sinh hoạt Đoàn — nên tính bằng cách xem người đó có
đồng thời thuộc nhóm Đảng viên / Cảm tình Đảng hay không. Thêm cột thì mỗi nhóm
lại phải thêm một cột, mà số nhóm thì khu phố tự tạo thêm được.
"""

from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, current_user, get_db, ghi_audit, require

log = structlog.get_logger()
router = APIRouter(prefix="/cu-dan/nhom", tags=["nhân khẩu"])

TRANG_THAI = {
    "dang_sinh_hoat": "Đang sinh hoạt",
    "da_chuyen_di": "Đã chuyển đi",
    "thoi_sinh_hoat": "Thôi sinh hoạt",
}


async def _lay_nhom(ma: str, db: AsyncSession) -> dict:
    r = (
        await db.execute(
            text("""SELECT id::text, code, name, khoi, icon, is_sensitive
                    FROM classification WHERE code = :c"""),
            {"c": ma},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Không có nhóm “{ma}”")
    return dict(r)


@router.get("/{ma}/tong-quan", dependencies=[Depends(require("resident:read"))])
async def tong_quan(ma: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Số liệu để làm báo cáo: tổng số, kết nạp từng năm, đã chuyển đi."""
    nhom = await _lay_nhom(ma, db)

    dem = (
        await db.execute(
            text("""
            SELECT
              count(*) FILTER (WHERE rc.trang_thai = 'dang_sinh_hoat')  AS dang_sinh_hoat,
              count(*) FILTER (WHERE rc.trang_thai = 'da_chuyen_di')    AS da_chuyen_di,
              count(*) FILTER (WHERE rc.trang_thai = 'thoi_sinh_hoat')  AS thoi_sinh_hoat,
              count(*)                                                   AS tung_sinh_hoat,
              count(*) FILTER (WHERE rc.trang_thai = 'dang_sinh_hoat'
                                 AND rc.chuc_vu IS NOT NULL AND rc.chuc_vu <> '')
                                                                         AS co_chuc_vu,
              count(*) FILTER (WHERE rc.trang_thai = 'dang_sinh_hoat'
                                 AND rc.ngay_ket_nap IS NULL)            AS thieu_ngay_ket_nap
            FROM resident_classification rc
            JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
            WHERE rc.classification_id = CAST(:n AS uuid)
        """),
            {"n": nhom["id"]},
        )
    ).mappings().one()

    # Đang sinh hoạt mà đồng thời ở nhóm Đảng viên / Cảm tình Đảng
    keo = (
        await db.execute(
            text("""
            SELECT
              count(*) FILTER (WHERE k.code = 'dang_vien')     AS sinh_hoat_dang,
              count(*) FILTER (WHERE k.code = 'cam_tinh_dang') AS cam_tinh_dang
            FROM resident_classification rc
            JOIN resident r  ON r.id = rc.resident_id AND r.deleted_at IS NULL
            JOIN resident_classification rk ON rk.resident_id = r.id
            JOIN classification k ON k.id = rk.classification_id
            WHERE rc.classification_id = CAST(:n AS uuid)
              AND rc.trang_thai = 'dang_sinh_hoat'
              AND k.code IN ('dang_vien', 'cam_tinh_dang')
        """),
            {"n": nhom["id"]},
        )
    ).mappings().one()

    theo_nam = [
        dict(r)
        for r in (
            await db.execute(
                text("""
            SELECT EXTRACT(YEAR FROM rc.ngay_ket_nap)::int AS nam,
                   count(*)                                AS so_nguoi,
                   count(*) FILTER (WHERE rc.trang_thai = 'dang_sinh_hoat') AS con_sinh_hoat
            FROM resident_classification rc
            JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
            WHERE rc.classification_id = CAST(:n AS uuid) AND rc.ngay_ket_nap IS NOT NULL
            GROUP BY 1 ORDER BY 1 DESC
        """),
                {"n": nhom["id"]},
            )
        ).mappings().all()
    ]

    # Độ tuổi: Đoàn Thanh niên có giới hạn tuổi nên đây là con số hay phải rà
    tuoi = (
        await db.execute(
            text("""
            SELECT
              round(avg(EXTRACT(YEAR FROM age(r.dob))))::int AS tuoi_tb,
              min(EXTRACT(YEAR FROM age(r.dob)))::int        AS tre_nhat,
              max(EXTRACT(YEAR FROM age(r.dob)))::int        AS lon_nhat,
              count(*) FILTER (WHERE r.dob IS NULL)          AS thieu_ngay_sinh
            FROM resident_classification rc
            JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
            WHERE rc.classification_id = CAST(:n AS uuid) AND rc.trang_thai = 'dang_sinh_hoat'
        """),
            {"n": nhom["id"]},
        )
    ).mappings().one()

    return {
        "nhom": nhom,
        **dict(dem),
        **dict(keo),
        "theo_nam": theo_nam,
        "do_tuoi": dict(tuoi),
    }


@router.get("/{ma}/thanh-vien", dependencies=[Depends(require("resident:read"))])
async def thanh_vien(
    ma: str,
    q: str | None = None,
    trang_thai: str = Query(default="dang_sinh_hoat",
                            pattern="^(dang_sinh_hoat|da_chuyen_di|thoi_sinh_hoat|tat_ca)$"),
    nam_ket_nap: int | None = Query(default=None, ge=1930, le=2100),
    limit: int = Query(default=50, le=300),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    nhom = await _lay_nhom(ma, db)
    p = {"n": nhom["id"], "q": q.strip() if q else None,
         "tt": None if trang_thai == "tat_ca" else trang_thai,
         "nam": nam_ket_nap, "limit": limit, "offset": offset}
    WHERE = """
        WHERE rc.classification_id = CAST(:n AS uuid)
          AND r.deleted_at IS NULL
          AND (CAST(:tt AS text) IS NULL OR rc.trang_thai = CAST(:tt AS text))
          AND (CAST(:nam AS int) IS NULL
               OR EXTRACT(YEAR FROM rc.ngay_ket_nap) = CAST(:nam AS int))
          AND (CAST(:q AS text) IS NULL
               OR r.full_name_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR r.id_card_last4 = CAST(:q AS text)
               OR r.phone LIKE '%' || CAST(:q AS text) || '%')
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT r.id::text, r.full_name, r.dob, r.gender, r.phone,
                   r.occupation, r.id_card_last4, r.residence_status,
                   g.name AS to_dan_pho,
                   h.code AS ma_ho,
                   rc.chuc_vu, rc.ngay_ket_nap, rc.trang_thai,
                   rc.ngay_chuyen_di, rc.noi_chuyen_den, rc.note,
                   EXTRACT(YEAR FROM age(r.dob))::int AS tuoi,
                   EXISTS (SELECT 1 FROM resident_classification x
                            JOIN classification k ON k.id = x.classification_id
                           WHERE x.resident_id = r.id AND k.code = 'dang_vien') AS sinh_hoat_dang,
                   EXISTS (SELECT 1 FROM resident_classification x
                            JOIN classification k ON k.id = x.classification_id
                           WHERE x.resident_id = r.id AND k.code = 'cam_tinh_dang') AS cam_tinh_dang
            FROM resident_classification rc
            JOIN resident r ON r.id = rc.resident_id
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            LEFT JOIN household h ON h.id = r.household_id
            {WHERE}
            -- Người có chức vụ lên trước (ban chấp hành), rồi tới người vào lâu nhất
            ORDER BY (rc.chuc_vu IS NULL OR rc.chuc_vu = ''),
                     rc.ngay_ket_nap NULLS LAST, r.full_name
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()

    tong = await db.scalar(
        text(f"""SELECT count(*) FROM resident_classification rc
                 JOIN resident r ON r.id = rc.resident_id {WHERE}"""),
        p,
    )
    return {
        "tong_so": tong,
        "nhom": nhom,
        "items": [{**dict(r), "ten_trang_thai": TRANG_THAI.get(r["trang_thai"], r["trang_thai"])}
                  for r in rows],
    }


class SuaThanhVien(BaseModel):
    chuc_vu: str | None = Field(default=None, max_length=120)
    ngay_ket_nap: date | None = None
    note: str | None = Field(default=None, max_length=500)


@router.patch("/{ma}/thanh-vien/{rid}", dependencies=[Depends(require("resident:write"))])
async def sua_thanh_vien(
    ma: str,
    rid: str,
    body: SuaThanhVien,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    nhom = await _lay_nhom(ma, db)
    n = (
        await db.execute(
            text("""
            UPDATE resident_classification SET
                chuc_vu      = CASE WHEN CAST(:cv AS text) IS NULL THEN chuc_vu
                                    ELSE NULLIF(CAST(:cv AS text), '') END,
                ngay_ket_nap = COALESCE(:nkn, ngay_ket_nap),
                note         = CASE WHEN CAST(:gc AS text) IS NULL THEN note
                                    ELSE NULLIF(CAST(:gc AS text), '') END,
                updated_at   = now()
            WHERE resident_id = CAST(:r AS uuid) AND classification_id = CAST(:n AS uuid)
        """),
            {"cv": body.chuc_vu, "nkn": body.ngay_ket_nap, "gc": body.note,
             "r": rid, "n": nhom["id"]},
        )
    ).rowcount
    if not n:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Người này không thuộc nhóm “{nhom['name']}”"
        )
    await ghi_audit(db, user, request, action="update", etype="resident", eid=rid)
    await db.commit()
    return {"success": True}


class ChuyenDi(BaseModel):
    ngay_chuyen_di: date | None = None
    noi_chuyen_den: str | None = Field(default=None, max_length=200)
    ly_do: str | None = Field(default=None, max_length=300)
    # Thôi sinh hoạt vì lý do khác (quá tuổi, xin thôi) chứ không phải chuyển đi
    thoi_sinh_hoat: bool = False


@router.post("/{ma}/thanh-vien/{rid}/chuyen-di",
             dependencies=[Depends(require("resident:write"))])
async def chuyen_di(
    ma: str,
    rid: str,
    body: ChuyenDi,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trừ khỏi tổng số nhưng GIỮ hồ sơ — vẫn tra lại được trong danh sách đã chuyển đi."""
    nhom = await _lay_nhom(ma, db)
    tt = "thoi_sinh_hoat" if body.thoi_sinh_hoat else "da_chuyen_di"
    n = (
        await db.execute(
            text("""
            UPDATE resident_classification SET
                trang_thai     = :tt,
                ngay_chuyen_di = COALESCE(:ngay, CURRENT_DATE),
                noi_chuyen_den = NULLIF(:noi, ''),
                note           = COALESCE(NULLIF(:ly, ''), note),
                updated_at     = now()
            WHERE resident_id = CAST(:r AS uuid) AND classification_id = CAST(:n AS uuid)
              AND trang_thai = 'dang_sinh_hoat'
        """),
            {"tt": tt, "ngay": body.ngay_chuyen_di, "noi": body.noi_chuyen_den,
             "ly": body.ly_do, "r": rid, "n": nhom["id"]},
        )
    ).rowcount
    if not n:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Người này không đang sinh hoạt ở “{nhom['name']}” — có thể đã chuyển đi rồi.",
        )
    await ghi_audit(db, user, request, action="update", etype="resident", eid=rid)
    await db.commit()
    log.info("nhom.chuyen_di", nhom=ma, resident=rid, trang_thai=tt)
    return {"success": True, "trang_thai": tt, "ten_trang_thai": TRANG_THAI[tt]}


@router.post("/{ma}/thanh-vien/{rid}/quay-lai",
             dependencies=[Depends(require("resident:write"))])
async def quay_lai(
    ma: str,
    rid: str,
    request: Request,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Người chuyển đi rồi quay về — bật lại sinh hoạt, giữ nguyên ngày kết nạp cũ."""
    nhom = await _lay_nhom(ma, db)
    n = (
        await db.execute(
            text("""
            UPDATE resident_classification SET
                trang_thai = 'dang_sinh_hoat',
                ngay_chuyen_di = NULL, noi_chuyen_den = NULL, updated_at = now()
            WHERE resident_id = CAST(:r AS uuid) AND classification_id = CAST(:n AS uuid)
              AND trang_thai <> 'dang_sinh_hoat'
        """),
            {"r": rid, "n": nhom["id"]},
        )
    ).rowcount
    if not n:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Người này đang sinh hoạt bình thường rồi."
        )
    await ghi_audit(db, user, request, action="update", etype="resident", eid=rid)
    await db.commit()
    return {"success": True}
