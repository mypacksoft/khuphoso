"""Văn bản đến và văn bản đi.

TỆP ĐÍNH KÈM ĐỂ SAU LỚP ĐĂNG NHẬP, KHÔNG ĐƯA LÊN CDN
Văn bản khu phố thường có họ tên, địa chỉ, hoàn cảnh gia đình của bà con. Một
đường dẫn CDN công khai là ai đoán trúng cũng tải được. Ở đây tệp nằm trên đĩa
máy chủ trong thư mục riêng của từng khu phố, muốn tải phải có phiên đăng nhập
hợp lệ VÀ đúng khu phố — cùng một cửa với mọi dữ liệu khác.

TÊN TỆP DO HỆ THỐNG SINH
Không bao giờ ghi đĩa bằng tên người dùng đặt. Người dùng đặt tên `../../.env`
là đọc được tệp ngoài thư mục. Tên gốc chỉ lưu trong cơ sở dữ liệu để hiển thị
và đặt lại khi tải về.
"""

import mimetypes
import re
import unicodedata
import uuid
from datetime import date
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, KhuPho, get_db, ghi_audit, require, resolve_khu_pho

log = structlog.get_logger()
router = APIRouter(prefix="/van-ban", tags=["văn bản"])

GOC_TEP = Path("data/vanban")

# Chỉ nhận các loại tệp thật sự dùng cho văn bản hành chính. Không nhận tệp thực
# thi (.exe, .js, .html) — máy chủ không chạy chúng, nhưng cán bộ tải về mở nhầm
# trên máy mình thì nguy hiểm.
KIEU_CHO_PHEP = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}
TOI_DA_MB = 20

CO_QUAN = {
    "dang": "Đảng",
    "chinh_quyen": "Chính quyền",
    "mat_tran": "Mặt trận",
    "doan_the": "Đoàn thể",
}
TRANG_THAI = {
    "nhap": "Nháp",
    "moi": "Mới nhận",
    "dang_xu_ly": "Đang xử lý",
    "da_xu_ly": "Đã xử lý",
    "luu": "Lưu hồ sơ",
}
DO_KHAN = {
    "thuong": "Thường",
    "khan": "Khẩn",
    "thuong_khan": "Thượng khẩn",
    "hoa_toc": "Hoả tốc",
}


class VanBanIn(BaseModel):
    loai: str = Field(pattern="^(den|di)$")
    so_ky_hieu: str | None = Field(default=None, max_length=60)
    title: str = Field(min_length=3, max_length=300)
    co_quan: str | None = Field(default=None, pattern="^(dang|chinh_quyen|mat_tran|doan_the)$")
    don_vi: str | None = Field(default=None, max_length=200)
    ngay_van_ban: date | None = None
    ngay_nhan: date | None = None
    trich_yeu: str | None = None
    noi_nhan: str | None = None
    nguoi_ky: str | None = Field(default=None, max_length=120)
    chuc_vu_ky: str | None = Field(default=None, max_length=120)
    noi_dung: str | None = None
    trang_thai: str | None = Field(
        default=None, pattern="^(nhap|moi|dang_xu_ly|da_xu_ly|luu)$"
    )
    nguoi_xu_ly: str | None = Field(default=None, max_length=120)
    han_xu_ly: date | None = None
    ket_qua: str | None = None
    do_khan: str | None = Field(default=None, pattern="^(thuong|khan|thuong_khan|hoa_toc)$")


def _nhan(r: dict) -> dict:
    return {
        **r,
        "ten_co_quan": CO_QUAN.get(r.get("co_quan") or ""),
        "ten_trang_thai": TRANG_THAI.get(r.get("trang_thai") or "", r.get("trang_thai")),
        "ten_do_khan": DO_KHAN.get(r.get("do_khan") or "", r.get("do_khan")),
    }


@router.get("", dependencies=[Depends(require("document:read"))])
async def danh_sach(
    loai: str = Query(pattern="^(den|di)$"),
    q: str | None = None,
    co_quan: str | None = Query(default=None, pattern="^(dang|chinh_quyen|mat_tran|doan_the)$"),
    trang_thai: str | None = Query(
        default=None, pattern="^(nhap|moi|dang_xu_ly|da_xu_ly|luu)$"
    ),
    qua_han: bool = Query(default=False, description="chỉ văn bản đến quá hạn xử lý"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"l": loai, "q": q.strip() if q and q.strip() else None, "cq": co_quan,
         "tt": trang_thai, "qh": qua_han, "limit": limit, "offset": offset}
    WHERE = """
        WHERE d.deleted_at IS NULL AND d.loai = CAST(:l AS text)
          AND (CAST(:q AS text) IS NULL
               OR d.title_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR kp_unaccent(coalesce(d.so_ky_hieu,'')) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR kp_unaccent(coalesce(d.don_vi,''))     LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:cq AS text) IS NULL OR d.co_quan    = CAST(:cq AS text))
          AND (CAST(:tt AS text) IS NULL OR d.trang_thai = CAST(:tt AS text))
          AND (NOT CAST(:qh AS boolean)
               OR (d.loai = 'den' AND d.trang_thai IN ('moi','dang_xu_ly')
                   AND d.han_xu_ly IS NOT NULL AND d.han_xu_ly < CURRENT_DATE))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT d.id::text, d.loai, d.so_ky_hieu, d.title, d.co_quan, d.don_vi,
                   d.ngay_van_ban, d.ngay_nhan, d.trich_yeu, d.trang_thai, d.do_khan,
                   d.nguoi_xu_ly, d.han_xu_ly, d.nguoi_ky,
                   (d.han_xu_ly - CURRENT_DATE) AS con_ngay,
                   (d.loai = 'den' AND d.trang_thai IN ('moi','dang_xu_ly')
                    AND d.han_xu_ly IS NOT NULL AND d.han_xu_ly < CURRENT_DATE) AS da_qua_han,
                   (SELECT count(*) FROM document_file f WHERE f.document_id = d.id) AS so_tep
            FROM official_document d {WHERE}
            ORDER BY d.do_khan = 'hoa_toc' DESC,
                     COALESCE(d.ngay_van_ban, d.ngay_nhan) DESC NULLS LAST,
                     d.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = (
        await db.execute(text(f"SELECT count(*) FROM official_document d {WHERE}"), p)
    ).scalar_one()
    return {"tong_so": tong, "items": [_nhan(dict(r)) for r in rows]}


@router.get("/tong-quan", dependencies=[Depends(require("document:read"))])
async def tong_quan(db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""
            SELECT count(*) FILTER (WHERE loai = 'den')                        AS den,
                   count(*) FILTER (WHERE loai = 'di')                         AS di,
                   count(*) FILTER (WHERE loai = 'den' AND trang_thai = 'moi') AS chua_xu_ly,
                   count(*) FILTER (WHERE loai = 'den'
                                     AND trang_thai IN ('moi','dang_xu_ly')
                                     AND han_xu_ly IS NOT NULL
                                     AND han_xu_ly < CURRENT_DATE)             AS qua_han,
                   count(*) FILTER (WHERE loai = 'di' AND trang_thai = 'nhap') AS ban_nhap
            FROM official_document WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()
    return dict(r)


@router.get("/{did}", dependencies=[Depends(require("document:read"))])
async def chi_tiet(did: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""SELECT id::text, loai, so_ky_hieu, title, co_quan, don_vi,
                           ngay_van_ban, ngay_nhan, trich_yeu, noi_nhan, nguoi_ky,
                           chuc_vu_ky, noi_dung, trang_thai, nguoi_xu_ly, han_xu_ly,
                           ket_qua, do_khan, created_at, updated_at,
                           (han_xu_ly - CURRENT_DATE) AS con_ngay
                    FROM official_document
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
            {"i": did},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy văn bản")

    tep = (
        await db.execute(
            text("""SELECT id::text, ten_goc, kieu, kich_thuoc, created_at
                    FROM document_file WHERE document_id = CAST(:i AS uuid)
                    ORDER BY created_at"""),
            {"i": did},
        )
    ).mappings().all()
    return {**_nhan(dict(r)), "tep": [dict(t) for t in tep]}


def _tham_so(b: VanBanIn, uid: str, did: str | None = None) -> dict:
    return {
        "l": b.loai, "skh": b.so_ky_hieu, "t": b.title.strip(), "cq": b.co_quan,
        "dv": b.don_vi, "nvb": b.ngay_van_ban, "nn": b.ngay_nhan, "ty": b.trich_yeu,
        "nhan": b.noi_nhan, "nk": b.nguoi_ky, "cv": b.chuc_vu_ky, "nd": b.noi_dung,
        "tt": b.trang_thai, "nxl": b.nguoi_xu_ly, "hxl": b.han_xu_ly, "kq": b.ket_qua,
        "dk": b.do_khan, "u": uid, "i": did,
    }


@router.post("", status_code=201)
async def tao_moi(
    body: VanBanIn,
    request: Request,
    user: CurrentUser = Depends(require("document:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    did = (
        await db.execute(
            text("""
            INSERT INTO official_document
                (loai, so_ky_hieu, title, co_quan, don_vi, ngay_van_ban, ngay_nhan,
                 trich_yeu, noi_nhan, nguoi_ky, chuc_vu_ky, noi_dung, trang_thai,
                 nguoi_xu_ly, han_xu_ly, ket_qua, do_khan, created_by, updated_by)
            VALUES (:l, :skh, :t, CAST(:cq AS text), :dv, CAST(:nvb AS date),
                    CAST(:nn AS date), :ty, :nhan, :nk, :cv, :nd,
                    COALESCE(CAST(:tt AS text), CASE WHEN :l = 'den' THEN 'moi' ELSE 'nhap' END),
                    :nxl, CAST(:hxl AS date), :kq,
                    COALESCE(CAST(:dk AS text), 'thuong'),
                    CAST(:u AS uuid), CAST(:u AS uuid))
            RETURNING id::text
        """),
            _tham_so(body, user.id),
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="document", eid=did)
    await db.commit()
    log.info("document.created", id=did, loai=body.loai)
    return {"id": did}


@router.patch("/{did}")
async def cap_nhat(
    did: str,
    body: VanBanIn,
    request: Request,
    user: CurrentUser = Depends(require("document:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE official_document SET
                so_ky_hieu   = CASE WHEN CAST(:skh AS text) IS NULL THEN so_ky_hieu
                                    ELSE NULLIF(CAST(:skh AS text), '') END,
                title        = COALESCE(:t, title),
                co_quan      = COALESCE(CAST(:cq AS text), co_quan),
                don_vi       = CASE WHEN CAST(:dv AS text) IS NULL THEN don_vi
                                    ELSE NULLIF(CAST(:dv AS text), '') END,
                ngay_van_ban = COALESCE(CAST(:nvb AS date), ngay_van_ban),
                ngay_nhan    = COALESCE(CAST(:nn AS date), ngay_nhan),
                trich_yeu    = CASE WHEN CAST(:ty AS text) IS NULL THEN trich_yeu
                                    ELSE NULLIF(CAST(:ty AS text), '') END,
                noi_nhan     = CASE WHEN CAST(:nhan AS text) IS NULL THEN noi_nhan
                                    ELSE NULLIF(CAST(:nhan AS text), '') END,
                nguoi_ky     = CASE WHEN CAST(:nk AS text) IS NULL THEN nguoi_ky
                                    ELSE NULLIF(CAST(:nk AS text), '') END,
                chuc_vu_ky   = CASE WHEN CAST(:cv AS text) IS NULL THEN chuc_vu_ky
                                    ELSE NULLIF(CAST(:cv AS text), '') END,
                noi_dung     = CASE WHEN CAST(:nd AS text) IS NULL THEN noi_dung
                                    ELSE NULLIF(CAST(:nd AS text), '') END,
                trang_thai   = COALESCE(CAST(:tt AS text), trang_thai),
                nguoi_xu_ly  = CASE WHEN CAST(:nxl AS text) IS NULL THEN nguoi_xu_ly
                                    ELSE NULLIF(CAST(:nxl AS text), '') END,
                han_xu_ly    = COALESCE(CAST(:hxl AS date), han_xu_ly),
                ket_qua      = CASE WHEN CAST(:kq AS text) IS NULL THEN ket_qua
                                    ELSE NULLIF(CAST(:kq AS text), '') END,
                do_khan      = COALESCE(CAST(:dk AS text), do_khan),
                updated_by   = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            _tham_so(body, user.id, did),
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy văn bản")
    await ghi_audit(db, user, request, action="update", etype="document", eid=did)
    await db.commit()
    return {"success": True}


@router.delete("/{did}")
async def xoa(
    did: str,
    request: Request,
    user: CurrentUser = Depends(require("document:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE official_document SET deleted_at = now(),
                           updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"i": did, "u": user.id},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy văn bản")
    await ghi_audit(db, user, request, action="delete", etype="document", eid=did)
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════ TỆP ĐÍNH KÈM ══
def _thu_muc(slug: str) -> Path:
    """Thư mục riêng của từng khu phố. Slug đã qua kiểm chuẩn ở tầng định tuyến."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã khu phố không hợp lệ")
    d = GOC_TEP / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _don_ten(ten: str) -> str:
    """Rút tên gốc về dạng an toàn để hiển thị và đặt lại khi tải về."""
    ten = unicodedata.normalize("NFC", ten).strip()
    ten = re.sub(r"[\\/:*?\"<>|\r\n\t]", "_", ten)
    return ten[:180] or "tep-dinh-kem"


@router.post("/{did}/tep", status_code=201)
async def tai_len(
    did: str,
    request: Request,
    tep: UploadFile = File(...),
    user: CurrentUser = Depends(require("document:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    co = await db.scalar(
        text("""SELECT 1 FROM official_document
                WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
        {"i": did},
    )
    if not co:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy văn bản")

    kieu = tep.content_type or mimetypes.guess_type(tep.filename or "")[0] or ""
    if kieu not in KIEU_CHO_PHEP:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ nhận PDF, ảnh (JPG/PNG/WEBP), Word và Excel. "
            f"Tệp này là '{kieu or 'không rõ'}'.",
        )

    du_lieu = await tep.read()
    if len(du_lieu) > TOI_DA_MB * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Tệp {len(du_lieu) / 1024 / 1024:.1f}MB, vượt mức {TOI_DA_MB}MB. "
            "Nén ảnh hoặc tách nhỏ tệp PDF.",
        )
    if not du_lieu:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tệp rỗng")

    ten_luu = f"{uuid.uuid4().hex}{KIEU_CHO_PHEP[kieu]}"
    (_thu_muc(kp.slug) / ten_luu).write_bytes(du_lieu)

    fid = (
        await db.execute(
            text("""INSERT INTO document_file
                    (document_id, ten_goc, ten_luu, kieu, kich_thuoc, created_by)
                    VALUES (CAST(:d AS uuid), :tg, :tl, :k, :kt, CAST(:u AS uuid))
                    RETURNING id::text"""),
            {"d": did, "tg": _don_ten(tep.filename or "tep"), "tl": ten_luu,
             "k": kieu, "kt": len(du_lieu), "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(
        db, user, request, action="dinh_kem_tep", etype="document", eid=did,
        changes=f'{{"kich_thuoc": {len(du_lieu)}}}',
    )
    await db.commit()
    log.info("document.file_uploaded", doc=did, kb=len(du_lieu) // 1024)
    return {"id": fid, "ten_goc": _don_ten(tep.filename or "tep"), "kich_thuoc": len(du_lieu)}


@router.get("/tep/{fid}", dependencies=[Depends(require("document:read"))])
async def tai_ve(
    fid: str,
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
):
    """Tải tệp đính kèm. Chỉ ra được tệp của CHÍNH khu phố đang đăng nhập.

    Phiên đăng nhập đã bị `require()` chặn theo khu phố, và tệp lấy từ thư mục
    của khu phố đó, nên không có đường nào chạm sang khu phố khác.
    """
    r = (
        await db.execute(
            text("""SELECT ten_goc, ten_luu, kieu FROM document_file
                    WHERE id = CAST(:i AS uuid)"""),
            {"i": fid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tệp")

    duong_dan = _thu_muc(kp.slug) / r["ten_luu"]
    if not duong_dan.is_file():
        log.error("document.file_missing", fid=fid, path=str(duong_dan))
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tệp không còn trên máy chủ")

    return FileResponse(
        duong_dan,
        media_type=r["kieu"] or "application/octet-stream",
        filename=r["ten_goc"],
    )


@router.delete("/tep/{fid}")
async def xoa_tep(
    fid: str,
    request: Request,
    user: CurrentUser = Depends(require("document:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""DELETE FROM document_file WHERE id = CAST(:i AS uuid)
                    RETURNING ten_luu, document_id::text"""),
            {"i": fid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tệp")

    (_thu_muc(kp.slug) / r["ten_luu"]).unlink(missing_ok=True)
    await ghi_audit(
        db, user, request, action="xoa_tep", etype="document", eid=r["document_id"]
    )
    await db.commit()
    return {"success": True}
