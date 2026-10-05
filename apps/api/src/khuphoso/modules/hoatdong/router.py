"""Lịch họp và Kế hoạch khu phố.

Hai phân hệ này nuôi chuông thông báo: cuộc họp sắp tới và kế hoạch sắp/đã quá hạn
là hai thứ trưởng khu phố cần biết ngay khi mở phần mềm, không phải đi tìm.

Ngưỡng nhắc lấy theo phần mềm cũ: **2 ngày**. Xa hơn thì nhắc sớm quá thành nhiễu,
gần hơn thì không kịp chuẩn bị.
"""

from datetime import date, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()

CO_QUAN = {
    "dang": "Đảng",
    "chinh_quyen": "Chính quyền",
    "mat_tran": "Mặt trận",
    "doan_the": "Đoàn thể",
}

# ══════════════════════════════════════════════════════════════ LỊCH HỌP ══
hop = APIRouter(prefix="/lich-hop", tags=["lịch họp"])


class HopIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    starts_at: datetime
    ends_at: datetime | None = None
    location: str | None = Field(default=None, max_length=200)
    co_quan: str | None = Field(default=None, pattern="^(dang|chinh_quyen|mat_tran|doan_the)$")
    thanh_phan: str | None = None
    noi_dung: str | None = None


class HopSua(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = None
    co_quan: str | None = Field(default=None, pattern="^(dang|chinh_quyen|mat_tran|doan_the)$")
    status: str | None = Field(default=None, pattern="^(sap_dien_ra|da_dien_ra|da_huy)$")
    thanh_phan: str | None = None
    noi_dung: str | None = None
    bien_ban: str | None = None
    so_nguoi_du: int | None = Field(default=None, ge=0)


@hop.get("", dependencies=[Depends(require("meeting:read"))])
async def ds_hop(
    q: str | None = None,
    trang_thai: str | None = Query(default=None, pattern="^(sap_dien_ra|da_dien_ra|da_huy)$"),
    co_quan: str | None = Query(default=None, pattern="^(dang|chinh_quyen|mat_tran|doan_the)$"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q and q.strip() else None, "tt": trang_thai, "cq": co_quan,
         "limit": limit, "offset": offset}
    WHERE = """
        WHERE deleted_at IS NULL
          AND (CAST(:q  AS text) IS NULL
               OR kp_unaccent(title) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR kp_unaccent(coalesce(location,'')) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:tt AS text) IS NULL OR status  = CAST(:tt AS text))
          AND (CAST(:cq AS text) IS NULL OR co_quan = CAST(:cq AS text))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT id::text, title, starts_at, ends_at, location, co_quan, status,
                   thanh_phan, so_nguoi_du, bien_ban IS NOT NULL AS co_bien_ban,
                   (starts_at::date - CURRENT_DATE) AS con_ngay
            FROM meeting {WHERE}
            ORDER BY CASE WHEN status = 'sap_dien_ra' THEN 0 ELSE 1 END,
                     CASE WHEN status = 'sap_dien_ra' THEN starts_at END ASC,
                     starts_at DESC
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = (await db.execute(text(f"SELECT count(*) FROM meeting {WHERE}"), p)).scalar_one()
    return {
        "tong_so": tong,
        "items": [{**dict(r), "ten_co_quan": CO_QUAN.get(r["co_quan"] or "")} for r in rows],
    }


@hop.get("/{mid}", dependencies=[Depends(require("meeting:read"))])
async def chi_tiet_hop(mid: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""SELECT id::text, title, starts_at, ends_at, location, co_quan, status,
                           thanh_phan, noi_dung, bien_ban, so_nguoi_du, created_at, updated_at
                    FROM meeting WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
            {"i": mid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cuộc họp")
    return {**dict(r), "ten_co_quan": CO_QUAN.get(r["co_quan"] or "")}


@hop.post("", status_code=201)
async def tao_hop(
    body: HopIn,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    mid = (
        await db.execute(
            text("""INSERT INTO meeting
                    (title, starts_at, ends_at, location, co_quan, thanh_phan, noi_dung,
                     created_by, updated_by)
                    VALUES (:t, :s, :e, :l, :cq, :tp, :nd, CAST(:u AS uuid), CAST(:u AS uuid))
                    RETURNING id::text"""),
            {"t": body.title.strip(), "s": body.starts_at, "e": body.ends_at,
             "l": body.location, "cq": body.co_quan, "tp": body.thanh_phan,
             "nd": body.noi_dung, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="meeting", eid=mid)
    await db.commit()
    return {"id": mid}


@hop.patch("/{mid}")
async def sua_hop(
    mid: str,
    body: HopSua,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE meeting SET
                title       = COALESCE(:t, title),
                starts_at   = COALESCE(CAST(:s AS timestamptz), starts_at),
                ends_at     = COALESCE(CAST(:e AS timestamptz), ends_at),
                location    = CASE WHEN CAST(:l AS text) IS NULL THEN location
                                   ELSE NULLIF(CAST(:l AS text), '') END,
                co_quan     = COALESCE(CAST(:cq AS text), co_quan),
                status      = COALESCE(CAST(:st AS text), status),
                thanh_phan  = CASE WHEN CAST(:tp AS text) IS NULL THEN thanh_phan
                                   ELSE NULLIF(CAST(:tp AS text), '') END,
                noi_dung    = CASE WHEN CAST(:nd AS text) IS NULL THEN noi_dung
                                   ELSE NULLIF(CAST(:nd AS text), '') END,
                bien_ban    = CASE WHEN CAST(:bb AS text) IS NULL THEN bien_ban
                                   ELSE NULLIF(CAST(:bb AS text), '') END,
                so_nguoi_du = COALESCE(CAST(:sn AS int), so_nguoi_du),
                updated_by  = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            {"t": body.title, "s": body.starts_at, "e": body.ends_at, "l": body.location,
             "cq": body.co_quan, "st": body.status, "tp": body.thanh_phan,
             "nd": body.noi_dung, "bb": body.bien_ban, "sn": body.so_nguoi_du,
             "u": user.id, "i": mid},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cuộc họp")
    await ghi_audit(db, user, request, action="update", etype="meeting", eid=mid)
    await db.commit()
    return {"success": True}


@hop.delete("/{mid}")
async def xoa_hop(
    mid: str,
    request: Request,
    user: CurrentUser = Depends(require("meeting:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE meeting SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"i": mid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cuộc họp")
    await ghi_audit(db, user, request, action="delete", etype="meeting", eid=mid)
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════ KẾ HOẠCH KHU PHỐ ══
ke_hoach = APIRouter(prefix="/ke-hoach", tags=["kế hoạch"])

UU_TIEN = {"thap": "Thấp", "binh_thuong": "Bình thường", "cao": "Cao", "khan": "Khẩn"}
TRANG_THAI_KH = {
    "chua_bat_dau": "Chưa bắt đầu",
    "dang_thuc_hien": "Đang thực hiện",
    "hoan_thanh": "Hoàn thành",
    "tam_dung": "Tạm dừng",
}


class KeHoachIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    deadline: date | None = None
    uu_tien: str = Field(default="binh_thuong", pattern="^(thap|binh_thuong|cao|khan)$")
    phu_trach: str | None = Field(default=None, max_length=160)
    noi_dung: str | None = None


class KeHoachSua(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    deadline: date | None = None
    status: str | None = Field(
        default=None, pattern="^(chua_bat_dau|dang_thuc_hien|hoan_thanh|tam_dung)$"
    )
    tien_do: int | None = Field(default=None, ge=0, le=100)
    uu_tien: str | None = Field(default=None, pattern="^(thap|binh_thuong|cao|khan)$")
    phu_trach: str | None = None
    noi_dung: str | None = None
    ket_qua: str | None = None


@ke_hoach.get("", dependencies=[Depends(require("plan:read"))])
async def ds_ke_hoach(
    q: str | None = None,
    trang_thai: str | None = Query(
        default=None, pattern="^(chua_bat_dau|dang_thuc_hien|hoan_thanh|tam_dung)$"
    ),
    qua_han: bool = Query(default=False, description="chỉ lấy việc đã quá hạn"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q and q.strip() else None, "tt": trang_thai,
         "qh": qua_han, "limit": limit, "offset": offset}
    WHERE = """
        WHERE deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR kp_unaccent(title) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:tt AS text) IS NULL OR status = CAST(:tt AS text))
          AND (NOT CAST(:qh AS boolean)
               OR (status <> 'hoan_thanh' AND deadline IS NOT NULL AND deadline < CURRENT_DATE))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT id::text, title, deadline, status, tien_do, uu_tien, phu_trach,
                   done_at, (deadline - CURRENT_DATE) AS con_ngay,
                   (status <> 'hoan_thanh' AND deadline IS NOT NULL
                    AND deadline < CURRENT_DATE) AS da_qua_han
            FROM plan {WHERE}
            ORDER BY CASE WHEN status = 'hoan_thanh' THEN 1 ELSE 0 END,
                     deadline ASC NULLS LAST, created_at DESC
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    tong = (await db.execute(text(f"SELECT count(*) FROM plan {WHERE}"), p)).scalar_one()
    return {
        "tong_so": tong,
        "items": [
            {**dict(r), "ten_trang_thai": TRANG_THAI_KH.get(r["status"], r["status"]),
             "ten_uu_tien": UU_TIEN.get(r["uu_tien"], r["uu_tien"])}
            for r in rows
        ],
    }


@ke_hoach.get("/{pid}", dependencies=[Depends(require("plan:read"))])
async def chi_tiet_ke_hoach(pid: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""SELECT id::text, title, deadline, status, tien_do, uu_tien, phu_trach,
                           noi_dung, ket_qua, started_at, done_at, created_at, updated_at,
                           (deadline - CURRENT_DATE) AS con_ngay
                    FROM plan WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
            {"i": pid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kế hoạch")
    return {**dict(r), "ten_trang_thai": TRANG_THAI_KH.get(r["status"], r["status"])}


@ke_hoach.post("", status_code=201)
async def tao_ke_hoach(
    body: KeHoachIn,
    request: Request,
    user: CurrentUser = Depends(require("plan:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    pid = (
        await db.execute(
            text("""INSERT INTO plan (title, deadline, uu_tien, phu_trach, noi_dung,
                                      created_by, updated_by)
                    VALUES (:t, CAST(:d AS date), :ut, :pt, :nd,
                            CAST(:u AS uuid), CAST(:u AS uuid))
                    RETURNING id::text"""),
            {"t": body.title.strip(), "d": body.deadline, "ut": body.uu_tien,
             "pt": body.phu_trach, "nd": body.noi_dung, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="plan", eid=pid)
    await db.commit()
    return {"id": pid}


@ke_hoach.patch("/{pid}")
async def sua_ke_hoach(
    pid: str,
    body: KeHoachSua,
    request: Request,
    user: CurrentUser = Depends(require("plan:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""
            UPDATE plan SET
                title      = COALESCE(:t, title),
                deadline   = COALESCE(CAST(:d AS date), deadline),
                status     = COALESCE(CAST(:st AS text), status),
                -- Đánh dấu hoàn thành thì tiến độ tự lên 100, khỏi phải kéo tay
                tien_do    = CASE WHEN CAST(:st AS text) = 'hoan_thanh' THEN 100
                                  ELSE COALESCE(CAST(:td AS int), tien_do) END,
                uu_tien    = COALESCE(CAST(:ut AS text), uu_tien),
                phu_trach  = CASE WHEN CAST(:pt AS text) IS NULL THEN phu_trach
                                  ELSE NULLIF(CAST(:pt AS text), '') END,
                noi_dung   = CASE WHEN CAST(:nd AS text) IS NULL THEN noi_dung
                                  ELSE NULLIF(CAST(:nd AS text), '') END,
                ket_qua    = CASE WHEN CAST(:kq AS text) IS NULL THEN ket_qua
                                  ELSE NULLIF(CAST(:kq AS text), '') END,
                started_at = CASE WHEN CAST(:st AS text) = 'dang_thuc_hien'
                                   AND started_at IS NULL THEN now() ELSE started_at END,
                done_at    = CASE WHEN CAST(:st AS text) = 'hoan_thanh' THEN now()
                                  WHEN CAST(:st AS text) IS NOT NULL THEN NULL
                                  ELSE done_at END,
                updated_by = CAST(:u AS uuid)
            WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
            RETURNING id::text
        """),
            {"t": body.title, "d": body.deadline, "st": body.status, "td": body.tien_do,
             "ut": body.uu_tien, "pt": body.phu_trach, "nd": body.noi_dung,
             "kq": body.ket_qua, "u": user.id, "i": pid},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kế hoạch")
    await ghi_audit(db, user, request, action="update", etype="plan", eid=pid)
    await db.commit()
    return {"success": True}


@ke_hoach.delete("/{pid}")
async def xoa_ke_hoach(
    pid: str,
    request: Request,
    user: CurrentUser = Depends(require("plan:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = (
        await db.execute(
            text("""UPDATE plan SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"i": pid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kế hoạch")
    await ghi_audit(db, user, request, action="delete", etype="plan", eid=pid)
    await db.commit()
    return {"success": True}
