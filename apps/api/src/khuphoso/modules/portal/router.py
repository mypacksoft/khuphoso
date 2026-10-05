"""Cổng thông tin cư dân — API CÔNG KHAI (không cần đăng nhập).

Khu phố lấy theo TÊN MIỀN (`get_db` giải slug từ Host), nên các route ở đây chỉ
dùng `Depends(get_db)` và KHÔNG gắn `require(...)`.

NGUYÊN TẮC RIÊNG TƯ: tuyệt đối không trả dữ liệu cư dân / CCCD / hộ khẩu / vị trí
nhà ra công khai. Chỉ những thứ vốn công khai: sự kiện, danh bạ cơ sở kinh doanh,
và tiếp nhận phản ánh từ người dân.
"""

import re
import unicodedata
import uuid as _uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import (
    CurrentUser,
    KhuPho,
    get_db,
    ghi_audit,
    require,
    resolve_khu_pho,
)

# File biểu mẫu lưu trên đĩa, phục vụ tải công khai. Nhận doc/docx/pdf/xls/xlsx + ảnh.
GOC_BM = Path("data/bieu-mau")
KIEU_BM = {
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/pdf": ".pdf",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
DUOI_BM = {".doc", ".docx", ".pdf", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"}
BM_TOI_DA_MB = 20


def _thu_muc_bm(slug: str) -> Path:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã khu phố không hợp lệ")
    d = GOC_BM / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _don_ten_bm(ten: str) -> str:
    ten = unicodedata.normalize("NFC", ten).strip()
    ten = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", ten)
    return ten[:180] or "bieu-mau"

log = structlog.get_logger()
router = APIRouter(prefix="/portal", tags=["portal công khai"])
# Router quản trị cổng thông tin (cán bộ cấu hình) — cần quyền settings:write.
admin_router = APIRouter(prefix="/cong-thong-tin", tags=["cổng thông tin (quản trị)"])


@router.get("/thong-tin")
async def thong_tin(
    kp: KhuPho | None = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if kp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chưa xác định được khu phố")
    cfg = (
        await db.execute(text("SELECT gioi_thieu, lien_he FROM portal_config WHERE id = 1"))
    ).mappings().first()
    s = kp.settings or {}
    return {
        "name": kp.name,
        "ward": s.get("ward"),
        "gioi_thieu": cfg["gioi_thieu"] if cfg else None,
        "lien_he": (cfg["lien_he"] if cfg else []) or [],  # [{chuc_vu, ho_ten, sdt}]
    }


@router.get("/su-kien")
async def su_kien(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            text("""
            SELECT id::text, name, event_type, starts_at, location, gift_desc, status
            FROM event
            WHERE deleted_at IS NULL AND status <> 'da_huy'
            ORDER BY starts_at DESC NULLS LAST, created_at DESC
            LIMIT 100
        """)
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.get("/co-so-kinh-doanh")
async def co_so_kinh_doanh(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            text("""
            SELECT id::text, name, nganh_nghe, address, phone, trang_thai,
                   CASE WHEN geom IS NOT NULL
                        THEN json_build_object('lat', ST_Y(geom::geometry),
                                               'lng', ST_X(geom::geometry)) END AS toa_do
            FROM business
            WHERE deleted_at IS NULL AND trang_thai = 'dang_hoat_dong'
            ORDER BY kp_unaccent(name)
            LIMIT 1000
        """)
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.get("/quy")
async def quy_cong_khai(db: AsyncSession = Depends(get_db)) -> dict:
    """Các quỹ khu phố ĐƯỢC TICK CÔNG KHAI — số dư + khoản chi gần đây.

    Chỉ hiện quỹ của chính khu phố (is_public = true), KHÔNG phải quỹ nền tảng.
    Không lộ tên người đóng góp; phần chi (tiền đi đâu) mới là thứ cần minh bạch.
    """
    funds = (
        await db.execute(
            text("""
            SELECT f.name, f.description,
                   f.opening_balance + COALESCE(thu.tong,0) - COALESCE(chi.tong,0) AS so_du,
                   COALESCE(thu.tong,0) AS tong_thu, COALESCE(chi.tong,0) AS tong_chi
            FROM fund f
            LEFT JOIN (SELECT fund_id, sum(amount) tong FROM fund_receipt
                       WHERE status='da_dong' GROUP BY fund_id) thu ON thu.fund_id = f.id
            LEFT JOIN (SELECT fund_id, sum(amount) tong FROM fund_expense
                       GROUP BY fund_id) chi ON chi.fund_id = f.id
            WHERE f.deleted_at IS NULL AND f.is_active AND f.is_public
            ORDER BY f.sort_order, f.name
        """)
        )
    ).mappings().all()
    chi = (
        await db.execute(
            text("""
            SELECT e.description, e.payee, e.amount, e.paid_at, f.name AS ten_quy
            FROM fund_expense e JOIN fund f ON f.id = e.fund_id
            WHERE f.deleted_at IS NULL AND f.is_public
            ORDER BY e.paid_at DESC
            LIMIT 20
        """)
        )
    ).mappings().all()
    tong = sum(float(f["so_du"]) for f in funds)
    return {
        "funds": [dict(f) for f in funds],
        "chi_gan_day": [dict(c) for c in chi],
        "tong_so_du": tong,
    }


class PhanAnhPortal(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    mo_ta: str | None = Field(default=None, max_length=2000)
    loai: str = Field(
        default="khac",
        pattern="^(ha_tang|ve_sinh|an_ninh|trat_tu|cay_xanh|chieu_sang|ngap_nuoc|khac)$",
    )
    dia_chi: str | None = Field(default=None, max_length=300)
    nguoi_bao: str | None = Field(default=None, max_length=120)
    dien_thoai: str = Field(min_length=8, max_length=20)
    # Bẫy spam: form thật ẩn ô này bằng CSS; bot điền vào thì ta lặng lẽ bỏ qua.
    website: str | None = None


@router.post("/phan-anh", status_code=201)
async def gui_phan_anh(
    body: PhanAnhPortal,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # 1) Honeypot: bot điền -> giả vờ thành công, không ghi gì.
    if body.website:
        log.info("portal.phan_anh.honeypot")
        return {"success": True, "id": None}

    # 2) Số điện thoại bắt buộc và phải có chữ số thật.
    sdt = "".join(c for c in body.dien_thoai if c.isdigit())
    if len(sdt) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Số điện thoại không hợp lệ")

    # 3) Giới hạn tần suất: tối đa 3 phản ánh / số điện thoại / 10 phút.
    gan_day = await db.scalar(
        text("""SELECT count(*) FROM phan_anh
                WHERE dien_thoai = :sdt AND created_at > now() - interval '10 minutes'"""),
        {"sdt": body.dien_thoai},
    )
    if gan_day and gan_day >= 3:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Bạn đã gửi nhiều phản ánh trong thời gian ngắn. Vui lòng thử lại sau ít phút.",
        )

    pid = (
        await db.execute(
            text("""
            INSERT INTO phan_anh (title, mo_ta, loai, dia_chi, nguoi_bao, dien_thoai, trang_thai)
            VALUES (:t, :m, :l, :dc, :nb, :sdt, 'moi')
            RETURNING id::text
        """),
            {"t": body.title, "m": body.mo_ta, "l": body.loai, "dc": body.dia_chi,
             "nb": body.nguoi_bao, "sdt": body.dien_thoai},
        )
    ).scalar_one()
    await db.commit()
    log.info("portal.phan_anh.created", id=pid)
    return {"success": True, "id": pid}


@router.get("/phan-anh/tra-cuu")
async def tra_cuu_phan_anh(
    ma: str,
    dien_thoai: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tra tiến độ phản ánh của tôi bằng 8 ký tự đầu mã phiếu + số điện thoại đã gửi."""
    row = (
        await db.execute(
            text("""
            SELECT id::text, title, loai, trang_thai, ly_do, ket_qua,
                   created_at, ngay_xong
            FROM phan_anh
            WHERE deleted_at IS NULL
              AND dien_thoai = :sdt
              AND left(id::text, 8) = lower(:ma)
            ORDER BY created_at DESC
            LIMIT 1
        """),
            {"sdt": dien_thoai, "ma": ma.strip()},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản ánh khớp mã và số điện thoại")
    return dict(row)


@router.get("/bieu-mau")
async def bieu_mau_cong_khai(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            text("""
            SELECT b.id::text, b.ten, b.mo_ta, b.nhom, b.url,
                   COALESCE((
                     SELECT json_agg(json_build_object(
                              'id', f.id::text, 'ten_goc', f.ten_goc, 'kich_thuoc', f.kich_thuoc)
                            ORDER BY f.sort_order, f.created_at)
                     FROM bieu_mau_file f WHERE f.bieu_mau_id = b.id), '[]'::json) AS files
            FROM bieu_mau b WHERE b.is_public
            ORDER BY b.nhom, b.sort_order, b.ten
        """)
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.get("/bieu-mau/file/{fid}")
async def tai_bieu_mau(
    fid: str,
    kp: KhuPho | None = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    if kp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chưa xác định được khu phố")
    r = (
        await db.execute(
            text("SELECT ten_luu, ten_goc, kieu FROM bieu_mau_file WHERE id = CAST(:i AS uuid)"),
            {"i": fid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy file")
    duong = _thu_muc_bm(kp.slug) / r["ten_luu"]
    if not duong.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy file")
    return FileResponse(
        duong, media_type=r["kieu"] or "application/octet-stream", filename=r["ten_goc"]
    )


# ═══════════════════════════════ QUẢN TRỊ CỔNG THÔNG TIN ═══════════════════════

import json  # noqa: E402


class CauHinhIn(BaseModel):
    gioi_thieu: str | None = None
    # [{chuc_vu, ho_ten, sdt}]
    lien_he: list[dict] = Field(default_factory=list)


class BieuMauIn(BaseModel):
    ten: str = Field(min_length=1, max_length=200)
    mo_ta: str | None = None
    nhom: str = Field(default="khac", pattern="^(cu_tru|kinh_doanh|dan_chu|khac)$")
    url: str | None = Field(default=None, max_length=1000)
    sort_order: int = 0
    is_public: bool = True


@admin_router.get("/cau-hinh", dependencies=[Depends(require("settings:write"))])
async def lay_cau_hinh(db: AsyncSession = Depends(get_db)) -> dict:
    cfg = (
        await db.execute(text("SELECT gioi_thieu, lien_he FROM portal_config WHERE id = 1"))
    ).mappings().first()
    return {"gioi_thieu": cfg["gioi_thieu"] if cfg else None,
            "lien_he": (cfg["lien_he"] if cfg else []) or []}


@admin_router.put("/cau-hinh")
async def luu_cau_hinh(
    body: CauHinhIn,
    request: Request,
    user: CurrentUser = Depends(require("settings:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        text("""
        INSERT INTO portal_config (id, gioi_thieu, lien_he, updated_by)
        VALUES (1, :gt, CAST(:lh AS jsonb), CAST(:u AS uuid))
        ON CONFLICT (id) DO UPDATE SET
            gioi_thieu = EXCLUDED.gioi_thieu, lien_he = EXCLUDED.lien_he,
            updated_by = EXCLUDED.updated_by, updated_at = now()
    """),
        {"gt": body.gioi_thieu, "lh": json.dumps(body.lien_he, ensure_ascii=False), "u": user.id},
    )
    await ghi_audit(db, user, request, action="update", etype="portal_config", eid="1")
    await db.commit()
    return {"success": True}


@admin_router.get("/bieu-mau", dependencies=[Depends(require("settings:write"))])
async def ds_bieu_mau(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            text("""
            SELECT b.id::text, b.ten, b.mo_ta, b.nhom, b.url, b.sort_order, b.is_public,
                   COALESCE((
                     SELECT json_agg(json_build_object(
                              'id', f.id::text, 'ten_goc', f.ten_goc, 'kich_thuoc', f.kich_thuoc)
                            ORDER BY f.sort_order, f.created_at)
                     FROM bieu_mau_file f WHERE f.bieu_mau_id = b.id), '[]'::json) AS files
            FROM bieu_mau b ORDER BY b.nhom, b.sort_order, b.ten
        """)
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@admin_router.post("/bieu-mau/{bid}/file", status_code=201)
async def tai_len_bieu_mau(
    bid: str,
    tep: UploadFile = File(...),
    user: CurrentUser = Depends(require("settings:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    co = await db.scalar(
        text("SELECT 1 FROM bieu_mau WHERE id = CAST(:i AS uuid)"), {"i": bid}
    )
    if not co:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy biểu mẫu")

    duoi = KIEU_BM.get((tep.content_type or "").lower())
    if not duoi:
        # Nhiều trình duyệt gửi .doc là octet-stream → nhận theo đuôi tên file.
        gc = Path(tep.filename or "").suffix.lower()
        duoi = gc if gc in DUOI_BM else None
    if not duoi:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ nhận file Word, PDF, Excel hoặc ảnh (doc, docx, pdf, xls, xlsx, jpg, png).",
        )
    du_lieu = await tep.read()
    if len(du_lieu) > BM_TOI_DA_MB * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File quá {BM_TOI_DA_MB}MB."
        )
    ten_luu = f"{_uuid.uuid4().hex}{duoi}"
    (_thu_muc_bm(kp.slug) / ten_luu).write_bytes(du_lieu)
    ten_goc = _don_ten_bm(tep.filename or f"bieu-mau{duoi}")
    fid = (
        await db.execute(
            text("""INSERT INTO bieu_mau_file (bieu_mau_id, ten_goc, ten_luu, kieu,
                                               kich_thuoc, created_by)
                    VALUES (CAST(:b AS uuid), :tg, :tl, :k, :kt, CAST(:u AS uuid))
                    RETURNING id::text"""),
            {"b": bid, "tg": ten_goc, "tl": ten_luu, "k": tep.content_type,
             "kt": len(du_lieu), "u": user.id},
        )
    ).scalar_one()
    await db.commit()
    return {"id": fid, "ten_goc": ten_goc, "kich_thuoc": len(du_lieu)}


@admin_router.delete("/bieu-mau/file/{fid}")
async def xoa_file_bieu_mau(
    fid: str,
    user: CurrentUser = Depends(require("settings:write")),
    kp: KhuPho = Depends(resolve_khu_pho),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("DELETE FROM bieu_mau_file WHERE id = CAST(:i AS uuid) RETURNING ten_luu"),
            {"i": fid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy file")
    (_thu_muc_bm(kp.slug) / r["ten_luu"]).unlink(missing_ok=True)
    await db.commit()
    return {"success": True}


@admin_router.post("/bieu-mau", status_code=201)
async def them_bieu_mau(
    body: BieuMauIn,
    user: CurrentUser = Depends(require("settings:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    bid = (
        await db.execute(
            text("""INSERT INTO bieu_mau (ten, mo_ta, nhom, url, sort_order, is_public, created_by)
                    VALUES (:t, :m, :n, :u, :o, :p, CAST(:uid AS uuid)) RETURNING id::text"""),
            {"t": body.ten, "m": body.mo_ta, "n": body.nhom, "u": body.url,
             "o": body.sort_order, "p": body.is_public, "uid": user.id},
        )
    ).scalar_one()
    await db.commit()
    return {"id": bid}


@admin_router.patch("/bieu-mau/{bid}")
async def sua_bieu_mau(
    bid: str,
    body: BieuMauIn,
    user: CurrentUser = Depends(require("settings:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""UPDATE bieu_mau SET ten=:t, mo_ta=:m, nhom=:n, url=:u,
                           sort_order=:o, is_public=:p
                    WHERE id=CAST(:id AS uuid) RETURNING id::text"""),
            {"t": body.ten, "m": body.mo_ta, "n": body.nhom, "u": body.url,
             "o": body.sort_order, "p": body.is_public, "id": bid},
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy biểu mẫu")
    await db.commit()
    return {"id": row}


@admin_router.delete("/bieu-mau/{bid}")
async def xoa_bieu_mau(
    bid: str,
    user: CurrentUser = Depends(require("settings:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(text("DELETE FROM bieu_mau WHERE id=CAST(:id AS uuid)"), {"id": bid})
    await db.commit()
    return {"success": True}
