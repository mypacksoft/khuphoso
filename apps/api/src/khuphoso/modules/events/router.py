"""Sự kiện & danh sách khách mời.

Điểm mạnh: TỰ GOM khách mời bằng cách lọc cư dân theo độ tuổi từ–đến, giới tính,
đoàn thể / diện chính sách, tổ dân phố — thay vì gõ tay từng người. Ví dụ "tặng
quà người cao tuổi từ 60 tuổi" chỉ cần đặt tuổi_tu=60 là ra danh sách.

Điểm danh và đánh dấu "đã nhận quà" nằm ngay trên danh sách khách.
Dùng lại quyền `resident:read` / `resident:write` (khách mời là dữ liệu cư dân).
"""

import re
import unicodedata
import uuid as _uuid
from datetime import datetime
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, KhuPho, get_db, ghi_audit, require, resolve_khu_pho

log = structlog.get_logger()
router = APIRouter(prefix="/su-kien", tags=["sự kiện"])

GOC_SK = Path("data/su-kien")
KIEU_ANH = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
ANH_TOI_DA_MB = 10


def _thu_muc_sk(slug: str) -> Path:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã khu phố không hợp lệ")
    d = GOC_SK / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _dt(s: str | None) -> datetime | None:
    """Chuỗi ISO từ ô datetime-local -> datetime. asyncpg cần object, không nhận str."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class SuKienIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    event_type: str = Field(
        default="tang_qua", pattern="^(tang_qua|hop_mat|van_nghe|tuyen_truyen|khac)$"
    )
    starts_at: str | None = None
    location: str | None = None
    description: str | None = None
    gift_desc: str | None = None
    status: str = Field(default="sap_dien_ra", pattern="^(sap_dien_ra|da_dien_ra|da_huy)$")


class LocKhach(BaseModel):
    """Bộ lọc cư dân để gom khách mời."""
    tuoi_tu: int | None = Field(default=None, ge=0, le=150)
    tuoi_den: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None, pattern="^(nam|nu|khac)$")
    phan_loai: str | None = None  # mã classification (đoàn thể / chính sách)
    group_id: str | None = None   # tổ dân phố
    dien_cu_tru: str | None = Field(
        default=None, pattern="^(thuong_tru|tam_tru|tam_vang|vang_lai)$"
    )


class ThemKhach(BaseModel):
    resident_ids: list[str] = Field(min_length=1)


class GoKhach(BaseModel):
    guest_ids: list[str] = Field(min_length=1)


class CapNhatKhach(BaseModel):
    attended: bool | None = None
    gift_received: bool | None = None
    note: str | None = None


def _loc_where() -> str:
    """Mệnh đề WHERE lọc cư dân dùng chung cho xem trước và gom khách."""
    return """
        r.deleted_at IS NULL
        AND (CAST(:tuoi_tu AS int) IS NULL
             OR (r.dob IS NOT NULL
                 AND extract(year from age(r.dob)) >= CAST(:tuoi_tu AS int)))
        AND (CAST(:tuoi_den AS int) IS NULL
             OR (r.dob IS NOT NULL
                 AND extract(year from age(r.dob)) <= CAST(:tuoi_den AS int)))
        AND (CAST(:gender AS text) IS NULL OR r.gender = CAST(:gender AS text))
        AND (CAST(:gid AS uuid) IS NULL OR r.group_id = CAST(:gid AS uuid))
        AND (CAST(:dien AS text) IS NULL OR r.residence_status = CAST(:dien AS text))
        AND (CAST(:pl AS text) IS NULL OR EXISTS (
              SELECT 1 FROM resident_classification rc
              JOIN classification c ON c.id = rc.classification_id
              WHERE rc.resident_id = r.id AND c.code = CAST(:pl AS text)))
    """


def _loc_params(f: LocKhach) -> dict:
    return {
        "tuoi_tu": f.tuoi_tu, "tuoi_den": f.tuoi_den, "gender": f.gender,
        "gid": f.group_id, "dien": f.dien_cu_tru, "pl": f.phan_loai,
    }


@router.get("", dependencies=[Depends(require("resident:read"))])
async def danh_sach(
    q: str | None = Query(default=None),
    status_loc: str | None = Query(
        default=None, alias="status", pattern="^(sap_dien_ra|da_dien_ra|da_huy)$"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q else None, "st": status_loc}
    WHERE = """
        WHERE e.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL OR e.name ILIKE '%'||CAST(:q AS text)||'%')
          AND (CAST(:st AS text) IS NULL OR e.status = CAST(:st AS text))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT e.id::text, e.code, e.name, e.event_type, e.starts_at, e.location,
                   e.gift_desc, e.status,
                   (SELECT count(*) FROM event_guest g WHERE g.event_id = e.id) AS so_khach,
                   (SELECT count(*) FROM event_guest g WHERE g.event_id = e.id AND g.attended) AS so_diem_danh,
                   (SELECT count(*) FROM event_guest g WHERE g.event_id = e.id AND g.gift_received) AS so_nhan_qua
            FROM event e
            {WHERE}
            ORDER BY e.starts_at DESC NULLS LAST, e.created_at DESC
        """),
            p,
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.get("/loc-cu-dan", dependencies=[Depends(require("resident:read"))])
async def xem_truoc_loc(
    tuoi_tu: int | None = Query(default=None, ge=0, le=150),
    tuoi_den: int | None = Query(default=None, ge=0, le=150),
    gender: str | None = Query(default=None, pattern="^(nam|nu|khac)$"),
    phan_loai: str | None = Query(default=None),
    group_id: str | None = Query(default=None),
    dien_cu_tru: str | None = Query(
        default=None, pattern="^(thuong_tru|tam_tru|tam_vang|vang_lai)$"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Xem trước có bao nhiêu cư dân khớp bộ lọc, kèm 50 người đầu."""
    f = LocKhach(
        tuoi_tu=tuoi_tu, tuoi_den=tuoi_den, gender=gender,
        phan_loai=phan_loai, group_id=group_id, dien_cu_tru=dien_cu_tru,
    )
    p = _loc_params(f)
    tong = (
        await db.execute(text(f"SELECT count(*) FROM resident r WHERE {_loc_where()}"), p)
    ).scalar_one()
    rows = (
        await db.execute(
            text(f"""
            SELECT r.id::text, r.full_name, r.gender, r.phone, r.residence_status,
                   CASE WHEN r.dob IS NOT NULL THEN extract(year from age(r.dob))::int END AS tuoi,
                   g.name AS to_dan_pho
            FROM resident r
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            WHERE {_loc_where()}
            ORDER BY r.dob NULLS LAST, r.full_name
            LIMIT 50
        """),
            p,
        )
    ).mappings().all()
    return {"tong": tong, "items": [dict(r) for r in rows]}


@router.get("/{eid}", dependencies=[Depends(require("resident:read"))])
async def chi_tiet(eid: str, db: AsyncSession = Depends(get_db)) -> dict:
    e = (
        await db.execute(
            text("""
            SELECT e.id::text, e.code, e.name, e.event_type, e.starts_at, e.location,
                   e.description, e.gift_desc, e.status, e.created_at
            FROM event e WHERE e.id = CAST(:id AS uuid) AND e.deleted_at IS NULL
        """),
            {"id": eid},
        )
    ).mappings().first()
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sự kiện")
    khach = (
        await db.execute(
            text("""
            SELECT eg.id::text AS gid, eg.attended, eg.gift_received, eg.note,
                   r.id::text AS resident_id, r.full_name, r.gender, r.phone, r.id_card_last4,
                   CASE WHEN r.dob IS NOT NULL THEN extract(year from age(r.dob))::int END AS tuoi,
                   r.residence_status, g.name AS to_dan_pho
            FROM event_guest eg
            JOIN resident r ON r.id = eg.resident_id AND r.deleted_at IS NULL
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            WHERE eg.event_id = CAST(:id AS uuid)
            ORDER BY r.full_name
        """),
            {"id": eid},
        )
    ).mappings().all()
    so = len(khach)
    return {
        **dict(e),
        "khach": [dict(k) for k in khach],
        "thong_ke": {
            "so_khach": so,
            "so_diem_danh": sum(1 for k in khach if k["attended"]),
            "so_nhan_qua": sum(1 for k in khach if k["gift_received"]),
        },
    }


@router.post("", status_code=201)
async def tao_moi(
    body: SuKienIn,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    lon = await db.scalar(
        text("SELECT max(NULLIF(regexp_replace(split_part(code,'-',2),'\\D','','g'),'')::int) "
             "FROM event WHERE split_part(code,'-',1)='SK'")
    )
    code = f"SK-{(lon or 0) + 1:03d}"
    eid = (
        await db.execute(
            text("""
            INSERT INTO event (code, name, event_type, starts_at, location, description,
                               gift_desc, status, created_by, updated_by)
            VALUES (:c, :n, :et, CAST(:sa AS timestamptz), :loc, :d, :gd, :st,
                    CAST(:u AS uuid), CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"c": code, "n": body.name, "et": body.event_type, "sa": _dt(body.starts_at),
             "loc": body.location, "d": body.description, "gd": body.gift_desc,
             "st": body.status, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="event", eid=eid)
    await db.commit()
    return {"id": eid, "code": code}


@router.patch("/{eid}")
async def cap_nhat(
    eid: str,
    body: SuKienIn,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""
            UPDATE event SET name=:n, event_type=:et, starts_at=CAST(:sa AS timestamptz),
                   location=:loc, description=:d, gift_desc=:gd, status=:st,
                   updated_by=CAST(:u AS uuid)
            WHERE id=CAST(:id AS uuid) AND deleted_at IS NULL
            RETURNING id::text, code
        """),
            {"n": body.name, "et": body.event_type, "sa": _dt(body.starts_at), "loc": body.location,
             "d": body.description, "gd": body.gift_desc, "st": body.status,
             "u": user.id, "id": eid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sự kiện")
    await ghi_audit(db, user, request, action="update", etype="event", eid=eid)
    await db.commit()
    return dict(row)


@router.delete("/{eid}")
async def xoa(
    eid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = (
        await db.execute(
            text("""UPDATE event SET deleted_at=now(), updated_by=CAST(:u AS uuid)
                    WHERE id=CAST(:id AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"id": eid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sự kiện")
    await ghi_audit(db, user, request, action="delete", etype="event", eid=eid)
    await db.commit()
    return {"success": True}


@router.post("/{eid}/them-khach-loc")
async def them_khach_loc(
    eid: str,
    body: LocKhach,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Gom vào danh sách khách tất cả cư dân khớp bộ lọc (trùng thì bỏ qua)."""
    ok = await db.scalar(
        text("SELECT 1 FROM event WHERE id=CAST(:id AS uuid) AND deleted_at IS NULL"),
        {"id": eid},
    )
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sự kiện")
    p = {**_loc_params(body), "eid": eid}
    n = (
        await db.execute(
            text(f"""
            INSERT INTO event_guest (event_id, resident_id)
            SELECT CAST(:eid AS uuid), r.id FROM resident r WHERE {_loc_where()}
            ON CONFLICT (event_id, resident_id) DO NOTHING
        """),
            p,
        )
    ).rowcount
    await ghi_audit(db, user, request, action="update", etype="event", eid=eid,
                    changes=f'{{"them_khach_loc": {n}}}')
    await db.commit()
    return {"da_them": n}


@router.post("/{eid}/them-khach")
async def them_khach(
    eid: str,
    body: ThemKhach,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = (
        await db.execute(
            text("""
            INSERT INTO event_guest (event_id, resident_id)
            SELECT CAST(:eid AS uuid), unnest(CAST(:ids AS uuid[]))
            ON CONFLICT (event_id, resident_id) DO NOTHING
        """),
            {"eid": eid, "ids": body.resident_ids},
        )
    ).rowcount
    await db.commit()
    return {"da_them": n}


@router.post("/{eid}/go-khach")
async def go_khach(
    eid: str,
    body: GoKhach,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = (
        await db.execute(
            text("""DELETE FROM event_guest
                    WHERE event_id=CAST(:eid AS uuid) AND id = ANY(CAST(:ids AS uuid[]))"""),
            {"eid": eid, "ids": body.guest_ids},
        )
    ).rowcount
    await db.commit()
    return {"da_go": n}


@router.patch("/{eid}/khach/{gid}")
async def cap_nhat_khach(
    eid: str,
    gid: str,
    body: CapNhatKhach,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""
            UPDATE event_guest SET
                attended      = COALESCE(CAST(:at AS boolean), attended),
                gift_received = COALESCE(CAST(:gr AS boolean), gift_received),
                note          = COALESCE(:note, note)
            WHERE id=CAST(:gid AS uuid) AND event_id=CAST(:eid AS uuid)
            RETURNING id::text, attended, gift_received
        """),
            {"at": body.attended, "gr": body.gift_received, "note": body.note,
             "gid": gid, "eid": eid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy khách mời")
    await db.commit()
    return dict(row)
