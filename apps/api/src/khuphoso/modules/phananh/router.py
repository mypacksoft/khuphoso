"""Phản ánh hiện trường — chụp ảnh tại chỗ, gắn toạ độ, theo dõi tới khi xong.

Cán bộ đi trên đường thấy nắp cống vỡ, bãi rác tự phát, đèn đường hỏng: chụp một
tấm, máy tự gắn toạ độ, gửi luôn. Việc vượt thẩm quyền khu phố thì chuyển phường
và theo dõi cho tới khi phường trả lời.

TOẠ ĐỘ CHỨ KHÔNG CHỈ ĐỊA CHỈ. "Cống vỡ ở đường An Phú 13" thì đội sửa chữa vẫn
phải dò cả con đường. Toạ độ lấy tại chỗ đưa họ tới đúng cái nắp cống đó.

ẢNH NẰM SAU LỚP ĐĂNG NHẬP. Ảnh hiện trường hay lọt vào nhà dân, biển số xe, mặt
người — không đưa lên CDN công khai. Cùng cách làm với tệp đính kèm văn bản.
"""

import re
import unicodedata
import uuid as _uuid
from datetime import date
from pathlib import Path

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, KhuPho, get_db, ghi_audit, require, resolve_khu_pho

log = structlog.get_logger()
router = APIRouter(prefix="/phan-anh", tags=["phản ánh hiện trường"])

GOC_ANH = Path("data/phananh")
# Chỉ nhận ảnh. Phản ánh hiện trường là ảnh chụp, không phải chỗ để đính kèm
# tài liệu — mở rộng ra là mở thêm bề mặt tấn công mà chẳng được gì.
KIEU_CHO_PHEP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}
TOI_DA_MB = 15

LOAI = {
    "ha_tang": "Hạ tầng, đường sá",
    "ve_sinh": "Vệ sinh môi trường",
    "an_ninh": "An ninh trật tự",
    "trat_tu": "Trật tự đô thị",
    "cay_xanh": "Cây xanh",
    "chieu_sang": "Chiếu sáng",
    "ngap_nuoc": "Ngập nước",
    "khac": "Khác",
}

MUC_DO = {"binh_thuong": "Bình thường", "can_som": "Cần sớm", "khan_cap": "Khẩn cấp"}

TRANG_THAI = {
    "moi": "Mới tiếp nhận",
    "dang_xu_ly": "Đang xử lý",
    "da_chuyen_phuong": "Đã chuyển phường",
    "da_xong": "Đã xử lý xong",
    "khong_xu_ly": "Không xử lý",
}

# Việc khẩn cấp mà để quá ngần này ngày là quá hạn, kể cả khi chưa đặt hạn tay
HAN_MAC_DINH = {"khan_cap": 1, "can_som": 3, "binh_thuong": 7}


class PhanAnhIn(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    mo_ta: str | None = None
    loai: str = Field(default="khac", pattern="^(ha_tang|ve_sinh|an_ninh|trat_tu|"
                                              "cay_xanh|chieu_sang|ngap_nuoc|khac)$")
    muc_do: str = Field(default="binh_thuong", pattern="^(binh_thuong|can_som|khan_cap)$")
    dia_chi: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    do_chinh_xac_m: float | None = Field(default=None, ge=0)
    group_id: str | None = None
    household_id: str | None = None
    nguoi_bao: str | None = None
    dien_thoai: str | None = None
    han_xu_ly: date | None = None


class PhanAnhSua(BaseModel):
    """Sửa: mọi trường tuỳ chọn. Không dùng chung model với lệnh tạo."""
    title: str | None = Field(default=None, min_length=3, max_length=250)
    mo_ta: str | None = None
    loai: str | None = Field(default=None, pattern="^(ha_tang|ve_sinh|an_ninh|trat_tu|"
                                                   "cay_xanh|chieu_sang|ngap_nuoc|khac)$")
    muc_do: str | None = Field(default=None, pattern="^(binh_thuong|can_som|khan_cap)$")
    dia_chi: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    do_chinh_xac_m: float | None = Field(default=None, ge=0)
    group_id: str | None = None
    household_id: str | None = None
    nguoi_bao: str | None = None
    dien_thoai: str | None = None
    trang_thai: str | None = Field(
        default=None, pattern="^(moi|dang_xu_ly|da_chuyen_phuong|da_xong|khong_xu_ly)$"
    )
    ly_do: str | None = None
    nguoi_xu_ly: str | None = None
    han_xu_ly: date | None = None
    ngay_xong: date | None = None
    ket_qua: str | None = None


COT = """
    p.id::text, p.title, p.mo_ta, p.loai, p.muc_do, p.dia_chi,
    p.trang_thai, p.ly_do, p.nguoi_bao, p.dien_thoai,
    p.nguoi_xu_ly, p.han_xu_ly, p.ngay_xong, p.ket_qua,
    p.do_chinh_xac_m, p.created_at,
    p.group_id::text, p.household_id::text,
    g.name AS to_dan_pho,
    h.code AS ma_ho,
    ST_Y(p.geom::geometry) AS lat,
    ST_X(p.geom::geometry) AS lng,
    (SELECT count(*) FROM phan_anh_anh a WHERE a.phan_anh_id = p.id) AS so_anh,
    CASE WHEN p.han_xu_ly IS NOT NULL THEN (p.han_xu_ly - CURRENT_DATE) END AS con_ngay
"""


def _bay(r: dict) -> dict:
    """Dịch mã sang tiếng Việt và tính cờ quá hạn."""
    r["ten_loai"] = LOAI.get(r.get("loai", ""), r.get("loai"))
    r["ten_muc_do"] = MUC_DO.get(r.get("muc_do", ""), r.get("muc_do"))
    r["ten_trang_thai"] = TRANG_THAI.get(r.get("trang_thai", ""), r.get("trang_thai"))
    r["toa_do"] = {"lat": r["lat"], "lng": r["lng"]} if r.get("lat") is not None else None
    dang_mo = r.get("trang_thai") in ("moi", "dang_xu_ly", "da_chuyen_phuong")
    r["da_qua_han"] = bool(dang_mo and r.get("con_ngay") is not None and r["con_ngay"] < 0)
    return r


@router.get("", dependencies=[Depends(require("resident:read"))])
async def danh_sach(
    q: str | None = None,
    loai: str | None = None,
    muc_do: str | None = None,
    trang_thai: str | None = None,
    group_id: str | None = None,
    qua_han: bool = False,
    con_mo: bool = Query(default=False, description="chỉ việc chưa xử lý xong"),
    limit: int = Query(default=20, le=300),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q else None, "l": loai, "m": muc_do, "tt": trang_thai,
         "g": group_id, "qh": qua_han, "cm": con_mo, "limit": limit, "offset": offset}
    WHERE = """
        WHERE p.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR p.title_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:l  AS text) IS NULL OR p.loai = CAST(:l AS text))
          AND (CAST(:m  AS text) IS NULL OR p.muc_do = CAST(:m AS text))
          AND (CAST(:tt AS text) IS NULL OR p.trang_thai = CAST(:tt AS text))
          AND (CAST(:g  AS uuid) IS NULL OR p.group_id = CAST(:g AS uuid))
          AND (NOT CAST(:cm AS boolean)
               OR p.trang_thai IN ('moi','dang_xu_ly','da_chuyen_phuong'))
          AND (NOT CAST(:qh AS boolean)
               OR (p.han_xu_ly IS NOT NULL AND p.han_xu_ly < CURRENT_DATE
                   AND p.trang_thai IN ('moi','dang_xu_ly','da_chuyen_phuong')))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT {COT}
            FROM phan_anh p
            LEFT JOIN neighborhood_group g ON g.id = p.group_id
            LEFT JOIN household h ON h.id = p.household_id
            {WHERE}
            -- Khẩn cấp lên trước, rồi tới việc quá hạn lâu nhất
            ORDER BY
                CASE p.muc_do WHEN 'khan_cap' THEN 0 WHEN 'can_som' THEN 1 ELSE 2 END,
                p.han_xu_ly ASC NULLS LAST,
                p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = await db.scalar(text(f"SELECT count(*) FROM phan_anh p {WHERE}"), p)
    return {"tong_so": tong, "items": [_bay(dict(r)) for r in rows]}


@router.get("/tong-quan", dependencies=[Depends(require("resident:read"))])
async def tong_quan(db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""
            SELECT count(*)                                                AS tong,
                   count(*) FILTER (WHERE trang_thai = 'moi')              AS moi,
                   count(*) FILTER (WHERE trang_thai IN ('moi','dang_xu_ly',
                                                         'da_chuyen_phuong')) AS con_mo,
                   count(*) FILTER (WHERE trang_thai = 'da_xong')          AS da_xong,
                   count(*) FILTER (WHERE muc_do = 'khan_cap'
                                     AND trang_thai IN ('moi','dang_xu_ly',
                                                        'da_chuyen_phuong')) AS khan_cap,
                   count(*) FILTER (WHERE han_xu_ly IS NOT NULL
                                     AND han_xu_ly < CURRENT_DATE
                                     AND trang_thai IN ('moi','dang_xu_ly',
                                                        'da_chuyen_phuong')) AS qua_han
            FROM phan_anh WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()
    theo_loai = (
        await db.execute(
            text("""SELECT loai, count(*) AS n FROM phan_anh
                    WHERE deleted_at IS NULL GROUP BY loai ORDER BY n DESC""")
        )
    ).mappings().all()
    return {
        **dict(r),
        "theo_loai": [{**dict(x), "ten_loai": LOAI.get(x["loai"], x["loai"])} for x in theo_loai],
    }


@router.get("/diem-nong", dependencies=[Depends(require("resident:read"))])
async def diem_nong(
    ban_kinh_m: int = Query(default=80, ge=20, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Gom các phản ánh gần nhau thành điểm nóng.

    Ba cái nắp cống vỡ cách nhau 20m là MỘT chỗ hỏng, không phải ba. Xem từng ghim
    riêng lẻ thì không thấy được chỗ nào hỏng đi hỏng lại — mà đó chính là chỗ cần
    sửa tận gốc thay vì vá mãi.

    `ST_ClusterDBSCAN` gom theo khoảng cách; `minpoints := 2` nghĩa là phải có ít
    nhất hai phản ánh mới gọi là điểm nóng.
    """
    rows = (
        await db.execute(
            text("""
            SELECT cum,
                   count(*)                                   AS so_phan_anh,
                   count(*) FILTER (WHERE trang_thai IN ('moi','dang_xu_ly',
                                                         'da_chuyen_phuong')) AS con_mo,
                   ST_Y(ST_Centroid(ST_Collect(g)))           AS lat,
                   ST_X(ST_Centroid(ST_Collect(g)))           AS lng,
                   (array_agg(dia_chi ORDER BY created_at DESC))[1] AS dia_chi,
                   (array_agg(title   ORDER BY created_at DESC))[1] AS moi_nhat,
                   max(created_at)                            AS lan_gan_nhat
            FROM (
                SELECT p.title, p.dia_chi, p.trang_thai, p.created_at,
                       p.geom::geometry AS g,
                       ST_ClusterDBSCAN(p.geom::geometry, eps := :bk / 111320.0,
                                        minpoints := 2) OVER () AS cum
                FROM phan_anh p
                WHERE p.deleted_at IS NULL AND p.geom IS NOT NULL
            ) x
            WHERE cum IS NOT NULL
            GROUP BY cum
            ORDER BY so_phan_anh DESC, lan_gan_nhat DESC
        """),
            {"bk": ban_kinh_m},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{pid}", dependencies=[Depends(require("resident:read"))])
async def chi_tiet(pid: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text(f"""
            SELECT {COT}
            FROM phan_anh p
            LEFT JOIN neighborhood_group g ON g.id = p.group_id
            LEFT JOIN household h ON h.id = p.household_id
            WHERE p.id = CAST(:i AS uuid) AND p.deleted_at IS NULL
        """),
            {"i": pid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản ánh")
    out = _bay(dict(r))
    anh = (
        await db.execute(
            text("""SELECT id::text, ten_goc, kieu, kich_thuoc, la_sau_xu_ly, created_at
                    FROM phan_anh_anh WHERE phan_anh_id = CAST(:i AS uuid)
                    ORDER BY la_sau_xu_ly, created_at"""),
            {"i": pid},
        )
    ).mappings().all()
    out["anh"] = [dict(x) for x in anh]
    return out


@router.post("", status_code=201)
async def tao(
    body: PhanAnhIn,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    pid = (
        await db.execute(
            text("""
            INSERT INTO phan_anh
                (title, mo_ta, loai, muc_do, dia_chi, geom, do_chinh_xac_m,
                 group_id, household_id, nguoi_bao, dien_thoai, han_xu_ly, created_by)
            VALUES (:t, :md, :l, :m, :dc,
                    CASE WHEN CAST(:lat AS double precision) IS NOT NULL
                         THEN ST_SetSRID(ST_MakePoint(CAST(:lng AS double precision),
                                                      CAST(:lat AS double precision)),
                                         4326)::geography END,
                    :cx, CAST(NULLIF(:g,'') AS uuid), CAST(NULLIF(:h,'') AS uuid),
                    :nb, :dt,
                    -- Không đặt hạn tay thì lấy hạn mặc định theo mức độ. Việc
                    -- khẩn cấp không có hạn thì chuông không bao giờ nhắc.
                    COALESCE(CAST(:han AS date), CURRENT_DATE + CAST(:han_md AS int)),
                    CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"t": body.title.strip(), "md": body.mo_ta, "l": body.loai, "m": body.muc_do,
             "dc": body.dia_chi, "lat": body.lat, "lng": body.lng,
             "cx": body.do_chinh_xac_m, "g": body.group_id or "",
             "h": body.household_id or "", "nb": body.nguoi_bao, "dt": body.dien_thoai,
             "han": body.han_xu_ly, "han_md": HAN_MAC_DINH.get(body.muc_do, 7),
             "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="phan_anh", eid=pid)
    await db.commit()
    log.info("phan_anh.created", id=pid, loai=body.loai, muc_do=body.muc_do)
    return {"id": pid, "title": body.title}


@router.patch("/{pid}")
async def sua(
    pid: str,
    body: PhanAnhSua,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE phan_anh SET
                title       = COALESCE(:t, title),
                mo_ta       = COALESCE(CAST(:md AS text), mo_ta),
                loai        = COALESCE(CAST(:l AS text), loai),
                muc_do      = COALESCE(CAST(:m AS text), muc_do),
                dia_chi     = COALESCE(CAST(:dc AS text), dia_chi),
                geom        = CASE WHEN CAST(:lat AS double precision) IS NOT NULL
                                   THEN ST_SetSRID(
                                            ST_MakePoint(CAST(:lng AS double precision),
                                                         CAST(:lat AS double precision)),
                                            4326)::geography
                                   ELSE geom END,
                do_chinh_xac_m = COALESCE(CAST(:cx AS numeric), do_chinh_xac_m),
                group_id    = COALESCE(CAST(NULLIF(:g,'') AS uuid), group_id),
                household_id= COALESCE(CAST(NULLIF(:h,'') AS uuid), household_id),
                nguoi_bao   = COALESCE(CAST(:nb AS text), nguoi_bao),
                dien_thoai  = COALESCE(CAST(:dt AS text), dien_thoai),
                trang_thai  = COALESCE(CAST(:tt AS text), trang_thai),
                ly_do       = COALESCE(CAST(:ld AS text), ly_do),
                nguoi_xu_ly = COALESCE(CAST(:nxl AS text), nguoi_xu_ly),
                han_xu_ly   = COALESCE(CAST(:han AS date), han_xu_ly),
                -- Chuyển sang "đã xong" mà quên điền ngày thì lấy hôm nay: thiếu
                -- ngày xong thì về sau không thống kê được thời gian xử lý
                ngay_xong   = CASE
                    WHEN CAST(:nx AS date) IS NOT NULL THEN CAST(:nx AS date)
                    WHEN CAST(:tt AS text) = 'da_xong' AND ngay_xong IS NULL
                        THEN CURRENT_DATE
                    ELSE ngay_xong END,
                ket_qua     = COALESCE(CAST(:kq AS text), ket_qua),
                updated_by  = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            {"t": body.title, "md": body.mo_ta, "l": body.loai, "m": body.muc_do,
             "dc": body.dia_chi, "lat": body.lat, "lng": body.lng,
             "cx": body.do_chinh_xac_m, "g": body.group_id or "",
             "h": body.household_id or "", "nb": body.nguoi_bao, "dt": body.dien_thoai,
             "tt": body.trang_thai, "ld": body.ly_do, "nxl": body.nguoi_xu_ly,
             "han": body.han_xu_ly, "nx": body.ngay_xong, "kq": body.ket_qua,
             "u": user.id, "i": pid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản ánh")
    await ghi_audit(db, user, request, action="update", etype="phan_anh", eid=pid)
    await db.commit()
    return {"success": True}


@router.delete("/{pid}")
async def xoa(
    pid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE phan_anh SET deleted_at = now()
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id::text"""),
            {"i": pid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản ánh")
    await ghi_audit(db, user, request, action="delete", etype="phan_anh", eid=pid)
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════ ẢNH ══


def _thu_muc(slug: str) -> Path:
    """Thư mục riêng của từng khu phố. Slug đã qua kiểm chuẩn ở tầng định tuyến."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã khu phố không hợp lệ")
    d = GOC_ANH / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _don_ten(ten: str) -> str:
    ten = unicodedata.normalize("NFC", ten).strip()
    ten = re.sub(r"[\\/:*?\"<>|\r\n\t]", "_", ten)
    return ten[:180] or "anh-hien-truong"


@router.post("/{pid}/anh", status_code=201)
async def tai_anh(
    pid: str,
    request: Request,
    tep: UploadFile = File(...),
    la_sau_xu_ly: bool = Form(default=False),
    user: CurrentUser = Depends(require("resident:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    co = await db.scalar(
        text("SELECT 1 FROM phan_anh WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"),
        {"i": pid},
    )
    if not co:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản ánh")

    duoi = KIEU_CHO_PHEP.get((tep.content_type or "").lower())
    if not duoi:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ nhận ảnh (JPG, PNG, WEBP, HEIC).",
        )
    du_lieu = await tep.read()
    if len(du_lieu) > TOI_DA_MB * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Ảnh quá {TOI_DA_MB}MB. Chụp ở độ phân giải thấp hơn.",
        )

    ten_luu = f"{_uuid.uuid4().hex}{duoi}"
    (_thu_muc(kp.slug) / ten_luu).write_bytes(du_lieu)
    ten_goc = _don_ten(tep.filename or f"anh{duoi}")

    aid = (
        await db.execute(
            text("""INSERT INTO phan_anh_anh
                        (phan_anh_id, ten_goc, ten_luu, kieu, kich_thuoc,
                         la_sau_xu_ly, created_by)
                    VALUES (CAST(:p AS uuid), :tg, :tl, :k, :kt, :s, CAST(:u AS uuid))
                    RETURNING id::text"""),
            {"p": pid, "tg": ten_goc, "tl": ten_luu, "k": tep.content_type,
             "kt": len(du_lieu), "s": la_sau_xu_ly, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="update", etype="phan_anh", eid=pid)
    await db.commit()
    return {"id": aid, "ten_goc": ten_goc, "kich_thuoc": len(du_lieu)}


@router.get("/anh/{aid}", dependencies=[Depends(require("resident:read"))])
async def xem_anh(
    aid: str,
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    r = (
        await db.execute(
            text("SELECT ten_luu, ten_goc, kieu FROM phan_anh_anh WHERE id = CAST(:i AS uuid)"),
            {"i": aid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    # Đọc từ thư mục CỦA KHU PHỐ ĐANG ĐĂNG NHẬP. Ảnh của khu phố khác có cùng id
    # thì đường dẫn cũng không tồn tại ở đây -> 404, không lộ gì.
    duong = _thu_muc(kp.slug) / r["ten_luu"]
    if not duong.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    return FileResponse(duong, media_type=r["kieu"] or "image/jpeg", filename=r["ten_goc"])


@router.delete("/anh/{aid}")
async def xoa_anh(
    aid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""DELETE FROM phan_anh_anh WHERE id = CAST(:i AS uuid)
                    RETURNING ten_luu, phan_anh_id::text"""),
            {"i": aid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    (_thu_muc(kp.slug) / r["ten_luu"]).unlink(missing_ok=True)
    await ghi_audit(db, user, request, action="update", etype="phan_anh",
                    eid=r["phan_anh_id"])
    await db.commit()
    return {"success": True}
