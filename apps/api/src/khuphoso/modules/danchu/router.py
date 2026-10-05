"""Thực hiện dân chủ ở cơ sở — Luật 10/2022/QH15.

Hai phần: hội nghị nhân dân (bàn và quyết định), và bảng kiểm nội dung phải công khai.

── ĐƠN VỊ BIỂU QUYẾT LÀ ĐẠI DIỆN HỘ, KHÔNG PHẢI ĐẦU NGƯỜI ───────────────────
Một hộ 9 người vẫn chỉ một phiếu. Và tỉ lệ tán thành tính trên TỔNG SỐ HỘ của
địa bàn, không phải trên số hộ có mặt: hội nghị vắng không làm nhỏ mẫu số đi để
dễ thông qua hơn.

Vì thế `tong_so_ho` được CHỐT vào lúc mở hội nghị (`POST /hoi-nghi/{id}/chot-so-ho`)
chứ không đếm động mỗi lần đọc. Số hộ thay đổi hằng ngày, mà kết quả biểu quyết
đã ghi vào biên bản thì không được đổi theo — nếu đếm động, một hộ mới chuyển
đến tháng sau có thể làm một nghị quyết đã thông qua thành không thông qua.

── TỈ LỆ ĐỂ MÁY TÍNH, KHÔNG ĐỂ NGƯỜI TỰ NHẨM ────────────────────────────────
Thư ký hội nghị đang ghi biên bản giữa cuộc họp, bắt họ tính 4.160 trên 8.318 có
quá 50% không là chỗ dễ sai. Máy chủ tính và trả về `da_thong_qua` rõ ràng.
"""

from datetime import date, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()
from khuphoso.core.goi import yeu_cau_goi

# Mục thuộc gói trả phí. Khoá Ở ĐÂY chứ không chỉ giấu menu — giấu menu
# chỉ cho gọn mắt, ai gõ thẳng địa chỉ vẫn vào được.
hoi_nghi = APIRouter(prefix="/hoi-nghi", tags=["dân chủ cơ sở"], dependencies=[Depends(yeu_cau_goi("dan_chu"))])
cong_khai = APIRouter(prefix="/cong-khai", tags=["dân chủ cơ sở"], dependencies=[Depends(yeu_cau_goi("dan_chu"))])

TRANG_THAI = {
    "chuan_bi": "Đang chuẩn bị",
    "dang_hop": "Đang họp",
    "da_hop": "Đã họp xong",
    "huy": "Đã huỷ",
}

HINH_THUC = {
    "gio_tay": "Giơ tay tại hội nghị",
    "phieu_kin": "Bỏ phiếu kín",
    "phieu_tung_ho": "Phát phiếu tới từng hộ",
    "truc_tuyen": "Lấy ý kiến trực tuyến",
}


class HoiNghiIn(BaseModel):
    """Tạo hội nghị. Tiêu đề bắt buộc; xem `HoiNghiSua` cho lệnh sửa."""
    title: str = Field(min_length=3, max_length=250)
    group_id: str | None = None
    thoi_gian: datetime | None = None
    dia_diem: str | None = None
    chu_tri: str | None = None
    thu_ky: str | None = None
    so_ho_du: int | None = Field(default=None, ge=0)
    ty_le_du_toi_thieu: float | None = Field(default=None, ge=0, le=100)
    noi_dung: str | None = None


class HoiNghiSua(BaseModel):
    """Sửa hội nghị: MỌI trường đều tuỳ chọn.

    Không dùng chung model với lệnh tạo được: ở đó `title` bắt buộc, nên sửa mỗi
    trạng thái hay mỗi số hộ dự sẽ bị từ chối 422 vì thiếu tiêu đề.
    """
    title: str | None = Field(default=None, min_length=3, max_length=250)
    group_id: str | None = None
    thoi_gian: datetime | None = None
    dia_diem: str | None = None
    chu_tri: str | None = None
    thu_ky: str | None = None
    so_ho_du: int | None = Field(default=None, ge=0)
    ty_le_du_toi_thieu: float | None = Field(default=None, ge=0, le=100)
    trang_thai: str | None = Field(default=None, pattern="^(chuan_bi|dang_hop|da_hop|huy)$")
    noi_dung: str | None = None
    bien_ban: str | None = None


class NoiDungIn(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    mo_ta: str | None = None
    hinh_thuc: str = Field(
        default="gio_tay", pattern="^(gio_tay|phieu_kin|phieu_tung_ho|truc_tuyen)$"
    )
    tan_thanh: int = Field(default=0, ge=0)
    khong_tan_thanh: int = Field(default=0, ge=0)
    khong_y_kien: int = Field(default=0, ge=0)
    ty_le_yeu_cau: float = Field(default=50, ge=0, le=100)
    ket_qua: str | None = None
    sort_order: int = 0


class CongKhaiIn(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    mo_ta: str | None = None
    nhom: str | None = None
    bat_buoc: bool = True
    dinh_ky_thang: int | None = Field(default=None, ge=1, le=120)
    sort_order: int = 0


class CongKhaiSua(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    mo_ta: str | None = None
    nhom: str | None = None
    bat_buoc: bool | None = None
    da_cong_khai: bool | None = None
    hinh_thuc: str | None = None
    ngay_cong_khai: date | None = None
    nguoi_thuc_hien: str | None = None
    ghi_chu: str | None = None
    dinh_ky_thang: int | None = Field(default=None, ge=1, le=120)


# ═══════════════════════════════════════════════════ HỘI NGHỊ NHÂN DÂN ══


@hoi_nghi.get("", dependencies=[Depends(require("meeting:read"))])
async def danh_sach(
    q: str | None = None,
    trang_thai: str | None = Query(default=None, pattern="^(chuan_bi|dang_hop|da_hop|huy)$"),
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q else None, "tt": trang_thai, "limit": limit, "offset": offset}
    WHERE = """
        WHERE h.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR h.title_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:tt AS text) IS NULL OR h.trang_thai = CAST(:tt AS text))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT h.id::text, h.title, h.thoi_gian, h.dia_diem, h.chu_tri, h.thu_ky,
                   h.trang_thai, h.tong_so_ho, h.so_ho_du, h.ty_le_du_toi_thieu,
                   g.name AS to_dan_pho,
                   (SELECT count(*) FROM noi_dung_bieu_quyet n
                     WHERE n.hoi_nghi_id = h.id) AS so_noi_dung
            FROM hoi_nghi h
            LEFT JOIN neighborhood_group g ON g.id = h.group_id
            {WHERE}
            ORDER BY h.thoi_gian DESC NULLS LAST, h.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = await db.scalar(text(f"SELECT count(*) FROM hoi_nghi h {WHERE}"), p)
    return {"tong_so": tong, "items": [_gan_ty_le(dict(r)) for r in rows]}


def _gan_ty_le(h: dict) -> dict:
    """Tính tỉ lệ hộ dự và kết luận hội nghị có đủ điều kiện tiến hành không."""
    tong = h.get("tong_so_ho") or 0
    du = h.get("so_ho_du") or 0
    h["ty_le_du"] = round(du * 100 / tong, 1) if tong else None
    h["ten_trang_thai"] = TRANG_THAI.get(h.get("trang_thai", ""), h.get("trang_thai"))
    # Chưa chốt tổng số hộ thì chưa kết luận được — trả None chứ không trả False,
    # để màn hình phân biệt "chưa đủ điều kiện" với "chưa biết"
    h["du_dieu_kien"] = (
        None if not tong else h["ty_le_du"] > float(h.get("ty_le_du_toi_thieu") or 50)
    )
    return h


@hoi_nghi.get("/{hid}", dependencies=[Depends(require("meeting:read"))])
async def chi_tiet(hid: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""
            SELECT h.id::text, h.title, h.group_id::text, h.thoi_gian, h.dia_diem,
                   h.chu_tri, h.thu_ky, h.trang_thai, h.tong_so_ho, h.so_ho_du,
                   h.ty_le_du_toi_thieu, h.noi_dung, h.bien_ban,
                   g.name AS to_dan_pho
            FROM hoi_nghi h
            LEFT JOIN neighborhood_group g ON g.id = h.group_id
            WHERE h.id = CAST(:i AS uuid) AND h.deleted_at IS NULL
        """),
            {"i": hid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hội nghị")

    out = _gan_ty_le(dict(r))
    nd = (
        await db.execute(
            text("""SELECT id::text, title, mo_ta, hinh_thuc, tan_thanh, khong_tan_thanh,
                           khong_y_kien, ty_le_yeu_cau, ket_qua, sort_order
                    FROM noi_dung_bieu_quyet
                    WHERE hoi_nghi_id = CAST(:i AS uuid)
                    ORDER BY sort_order, created_at"""),
            {"i": hid},
        )
    ).mappings().all()
    out["noi_dung_bieu_quyet"] = [_tinh_ket_qua(dict(x), out["tong_so_ho"]) for x in nd]
    return out


def _tinh_ket_qua(n: dict, tong_so_ho: int) -> dict:
    """Tính tỉ lệ tán thành TRÊN TỔNG SỐ HỘ và kết luận thông qua hay không.

    Máy tính chứ không để thư ký nhẩm giữa cuộc họp — 4.160 trên 8.318 có quá 50%
    không là chỗ rất dễ sai, mà sai thì sai vào biên bản.
    """
    n["ten_hinh_thuc"] = HINH_THUC.get(n.get("hinh_thuc", ""), n.get("hinh_thuc"))
    n["tong_phieu"] = (n["tan_thanh"] or 0) + (n["khong_tan_thanh"] or 0) + (n["khong_y_kien"] or 0)
    if not tong_so_ho:
        n["ty_le_tan_thanh"] = None
        n["da_thong_qua"] = None
        return n
    n["ty_le_tan_thanh"] = round((n["tan_thanh"] or 0) * 100 / tong_so_ho, 1)
    n["da_thong_qua"] = n["ty_le_tan_thanh"] > float(n.get("ty_le_yeu_cau") or 50)
    return n


@hoi_nghi.post("", status_code=201)
async def tao(
    body: HoiNghiIn,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    hid = (
        await db.execute(
            text("""
            INSERT INTO hoi_nghi (title, group_id, thoi_gian, dia_diem, chu_tri, thu_ky,
                                  so_ho_du, ty_le_du_toi_thieu, noi_dung, created_by)
            VALUES (:t, CAST(NULLIF(:g,'') AS uuid), :tg, :dd, :ct, :tk,
                    COALESCE(:shd, 0), COALESCE(:tl, 50), :nd, CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"t": body.title.strip(), "g": body.group_id or "", "tg": body.thoi_gian,
             "dd": body.dia_diem, "ct": body.chu_tri, "tk": body.thu_ky,
             "shd": body.so_ho_du, "tl": body.ty_le_du_toi_thieu,
             "nd": body.noi_dung, "u": user.id},
        )
    ).scalar_one()
    # Chốt luôn tổng số hộ tại thời điểm tạo
    await _chot_so_ho(db, hid)
    await ghi_audit(db, user, request, action="create", etype="hoi_nghi", eid=hid)
    await db.commit()
    return {"id": hid, "title": body.title}


async def _chot_so_ho(db: AsyncSession, hid: str) -> int:
    """Đếm và ghi cứng tổng số hộ trong phạm vi hội nghị.

    Phạm vi là cả khu phố nếu không chọn tổ, còn chọn tổ thì chỉ hộ của tổ đó.
    """
    n = await db.scalar(
        text("""
        SELECT count(*) FROM household h
        WHERE h.deleted_at IS NULL
          AND ((SELECT group_id FROM hoi_nghi WHERE id = CAST(:i AS uuid)) IS NULL
               OR h.group_id = (SELECT group_id FROM hoi_nghi WHERE id = CAST(:i AS uuid)))
    """),
        {"i": hid},
    )
    await db.execute(
        text("UPDATE hoi_nghi SET tong_so_ho = :n WHERE id = CAST(:i AS uuid)"),
        {"n": n or 0, "i": hid},
    )
    return n or 0


@hoi_nghi.post("/{hid}/chot-so-ho")
async def chot_so_ho(
    hid: str,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Đếm lại tổng số hộ và chốt vào hội nghị.

    Chỉ dùng khi hội nghị CHƯA họp xong. Chốt lại sau khi đã biểu quyết là đổi mẫu
    số của một kết quả đã ghi vào biên bản — chặn ở đây.
    """
    tt = await db.scalar(
        text("SELECT trang_thai FROM hoi_nghi WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"),
        {"i": hid},
    )
    if tt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hội nghị")
    if tt == "da_hop":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Hội nghị đã họp xong. Chốt lại tổng số hộ lúc này là đổi mẫu số của kết quả "
            "đã ghi vào biên bản.",
        )
    n = await _chot_so_ho(db, hid)
    await ghi_audit(db, user, request, action="update", etype="hoi_nghi", eid=hid)
    await db.commit()
    return {"tong_so_ho": n}


@hoi_nghi.patch("/{hid}")
async def sua(
    hid: str,
    body: HoiNghiSua,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE hoi_nghi SET
                title      = COALESCE(:t, title),
                group_id   = COALESCE(CAST(NULLIF(:g,'') AS uuid), group_id),
                thoi_gian  = COALESCE(CAST(:tg AS timestamptz), thoi_gian),
                dia_diem   = COALESCE(CAST(:dd AS text), dia_diem),
                chu_tri    = COALESCE(CAST(:ct AS text), chu_tri),
                thu_ky     = COALESCE(CAST(:tk AS text), thu_ky),
                so_ho_du   = COALESCE(CAST(:shd AS int), so_ho_du),
                ty_le_du_toi_thieu = COALESCE(CAST(:tl AS numeric), ty_le_du_toi_thieu),
                trang_thai = COALESCE(CAST(:tt AS text), trang_thai),
                noi_dung   = COALESCE(CAST(:nd AS text), noi_dung),
                bien_ban   = COALESCE(CAST(:bb AS text), bien_ban),
                updated_by = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            {"t": body.title, "g": body.group_id or "", "tg": body.thoi_gian,
             "dd": body.dia_diem, "ct": body.chu_tri, "tk": body.thu_ky,
             "shd": body.so_ho_du, "tl": body.ty_le_du_toi_thieu,
             "tt": body.trang_thai, "nd": body.noi_dung, "bb": body.bien_ban,
             "u": user.id, "i": hid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hội nghị")
    await ghi_audit(db, user, request, action="update", etype="hoi_nghi", eid=hid)
    await db.commit()
    return {"success": True}


@hoi_nghi.delete("/{hid}")
async def xoa(
    hid: str,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE hoi_nghi SET deleted_at = now()
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id::text"""),
            {"i": hid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hội nghị")
    await ghi_audit(db, user, request, action="delete", etype="hoi_nghi", eid=hid)
    await db.commit()
    return {"success": True}


# ── Nội dung biểu quyết ─────────────────────────────────────────────────────


@hoi_nghi.post("/{hid}/noi-dung", status_code=201)
async def them_noi_dung(
    hid: str,
    body: NoiDungIn,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    co = await db.scalar(
        text("SELECT 1 FROM hoi_nghi WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"),
        {"i": hid},
    )
    if not co:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hội nghị")
    nid = (
        await db.execute(
            text("""
            INSERT INTO noi_dung_bieu_quyet
                (hoi_nghi_id, title, mo_ta, hinh_thuc, tan_thanh, khong_tan_thanh,
                 khong_y_kien, ty_le_yeu_cau, ket_qua, sort_order)
            VALUES (CAST(:h AS uuid), :t, :m, :hf, :tt, :ktt, :kyk, :tl, :kq, :o)
            RETURNING id::text
        """),
            {"h": hid, "t": body.title.strip(), "m": body.mo_ta, "hf": body.hinh_thuc,
             "tt": body.tan_thanh, "ktt": body.khong_tan_thanh, "kyk": body.khong_y_kien,
             "tl": body.ty_le_yeu_cau, "kq": body.ket_qua, "o": body.sort_order},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="hoi_nghi", eid=hid)
    await db.commit()
    return {"id": nid}


@hoi_nghi.patch("/noi-dung/{nid}")
async def sua_noi_dung(
    nid: str,
    body: NoiDungIn,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE noi_dung_bieu_quyet SET
                title = :t, mo_ta = :m, hinh_thuc = :hf,
                tan_thanh = :tt, khong_tan_thanh = :ktt, khong_y_kien = :kyk,
                ty_le_yeu_cau = :tl, ket_qua = :kq, sort_order = :o
            WHERE id = CAST(:i AS uuid)
            RETURNING hoi_nghi_id::text
        """),
            {"t": body.title.strip(), "m": body.mo_ta, "hf": body.hinh_thuc,
             "tt": body.tan_thanh, "ktt": body.khong_tan_thanh, "kyk": body.khong_y_kien,
             "tl": body.ty_le_yeu_cau, "kq": body.ket_qua, "o": body.sort_order, "i": nid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung")
    await ghi_audit(db, user, request, action="update", etype="hoi_nghi", eid=r)
    await db.commit()
    return {"success": True}


@hoi_nghi.delete("/noi-dung/{nid}")
async def xoa_noi_dung(
    nid: str,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("DELETE FROM noi_dung_bieu_quyet WHERE id = CAST(:i AS uuid) "
                 "RETURNING hoi_nghi_id::text"),
            {"i": nid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung")
    await ghi_audit(db, user, request, action="delete", etype="hoi_nghi", eid=r)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════ BẢNG KIỂM CÔNG KHAI ══


@cong_khai.get("", dependencies=[Depends(require("meeting:read"))])
async def danh_sach_cong_khai(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            text("""
            SELECT id::text, title, mo_ta, nhom, bat_buoc, da_cong_khai, hinh_thuc,
                   ngay_cong_khai, nguoi_thuc_hien, ghi_chu, dinh_ky_thang, sort_order,
                   -- Đã công khai nhưng quá kỳ phải làm lại thì coi như CHƯA làm.
                   -- Không tính ra thì bảng kiểm luôn xanh và mất tác dụng nhắc.
                   CASE
                       WHEN NOT da_cong_khai THEN false
                       WHEN dinh_ky_thang IS NULL THEN false
                       WHEN ngay_cong_khai IS NULL THEN true
                       ELSE ngay_cong_khai + (dinh_ky_thang || ' months')::interval
                            < CURRENT_DATE
                   END AS qua_han,
                   CASE
                       WHEN da_cong_khai AND dinh_ky_thang IS NOT NULL
                            AND ngay_cong_khai IS NOT NULL
                       THEN (ngay_cong_khai + (dinh_ky_thang || ' months')::interval)::date
                   END AS han_lam_lai
            FROM noi_dung_cong_khai
            WHERE deleted_at IS NULL
            ORDER BY sort_order, title
        """)
        )
    ).mappings().all()
    ds = [dict(r) for r in rows]
    bat_buoc = [x for x in ds if x["bat_buoc"]]
    xong = [x for x in bat_buoc if x["da_cong_khai"] and not x["qua_han"]]
    return {
        "tong_so": len(ds),
        "so_bat_buoc": len(bat_buoc),
        "so_da_lam": len(xong),
        "so_qua_han": len([x for x in ds if x["qua_han"]]),
        "ty_le": round(len(xong) * 100 / len(bat_buoc), 1) if bat_buoc else 100.0,
        "items": ds,
    }


@cong_khai.post("", status_code=201)
async def them_cong_khai(
    body: CongKhaiIn,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cid = (
        await db.execute(
            text("""INSERT INTO noi_dung_cong_khai
                        (title, mo_ta, nhom, bat_buoc, dinh_ky_thang, sort_order)
                    VALUES (:t, :m, :n, :bb, :dk, :o) RETURNING id::text"""),
            {"t": body.title.strip(), "m": body.mo_ta, "n": body.nhom,
             "bb": body.bat_buoc, "dk": body.dinh_ky_thang, "o": body.sort_order},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="cong_khai", eid=cid)
    await db.commit()
    return {"id": cid}


@cong_khai.patch("/{cid}")
async def sua_cong_khai(
    cid: str,
    body: CongKhaiSua,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE noi_dung_cong_khai SET
                title           = COALESCE(:t, title),
                mo_ta           = COALESCE(CAST(:m AS text), mo_ta),
                nhom            = COALESCE(CAST(:n AS text), nhom),
                bat_buoc        = COALESCE(CAST(:bb AS boolean), bat_buoc),
                da_cong_khai    = COALESCE(CAST(:dck AS boolean), da_cong_khai),
                hinh_thuc       = COALESCE(CAST(:hf AS text), hinh_thuc),
                -- Đánh dấu đã công khai mà quên điền ngày thì lấy hôm nay, không
                -- thì mục đó không bao giờ bị tính là tới hạn làm lại
                ngay_cong_khai  = CASE
                    WHEN CAST(:nck AS date) IS NOT NULL THEN CAST(:nck AS date)
                    WHEN COALESCE(CAST(:dck AS boolean), false) AND ngay_cong_khai IS NULL
                        THEN CURRENT_DATE
                    ELSE ngay_cong_khai END,
                nguoi_thuc_hien = COALESCE(CAST(:nth AS text), nguoi_thuc_hien),
                ghi_chu         = COALESCE(CAST(:gc AS text), ghi_chu),
                dinh_ky_thang   = COALESCE(CAST(:dk AS int), dinh_ky_thang)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            {"t": body.title, "m": body.mo_ta, "n": body.nhom, "bb": body.bat_buoc,
             "dck": body.da_cong_khai, "hf": body.hinh_thuc, "nck": body.ngay_cong_khai,
             "nth": body.nguoi_thuc_hien, "gc": body.ghi_chu, "dk": body.dinh_ky_thang,
             "i": cid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung")
    await ghi_audit(db, user, request, action="update", etype="cong_khai", eid=cid)
    await db.commit()
    return {"success": True}


@cong_khai.delete("/{cid}")
async def xoa_cong_khai(
    cid: str,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE noi_dung_cong_khai SET deleted_at = now()
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id::text"""),
            {"i": cid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung")
    await ghi_audit(db, user, request, action="delete", etype="cong_khai", eid=cid)
    await db.commit()
    return {"success": True}
