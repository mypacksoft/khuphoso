"""Hộ gia đình — cây hộ, thành viên, chuyển hộ.

Mã hộ sinh tự động theo dạng `{tổ}-{số thứ tự 3 chữ số}` (ví dụ `3-012`) và
**không đổi** kể cả khi hộ chuyển sang tổ khác — cán bộ đã quen mã nào thì giữ mã đó.
"""

import re

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()
router = APIRouter(prefix="/ho-khau", tags=["hộ khẩu"])


class HoIn(BaseModel):
    group_id: str | None = None
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = None
    # Dien cu tru cua HO — "Ho khau" va "Ho tam tru" la hai man hinh rieng
    household_type: str | None = Field(default=None, pattern="^(thuong_tru|tam_tru)$")
    residence_type: str | None = None
    # Toa do ghim tren ban do. Gui ca hai moi co tac dung; thieu mot cai thi bo qua.
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    geo_status: str | None = Field(
        default=None, pattern="^(pending|auto|verified|manual|failed)$"
    )
    geo_source: str | None = None
    note: str | None = None
    code: str | None = Field(default=None, description="để trống thì hệ thống tự sinh")


class ChuyenHo(BaseModel):
    resident_id: str
    household_id: str | None = None
    relation_to_head: str | None = None
    is_head: bool = False


async def sinh_ma_ho(db: AsyncSession, group_id: str | None) -> str:
    """Sinh mã hộ kế tiếp trong tổ. Không có tổ thì dùng tiền tố `KP`."""
    tien_to = "KP"
    if group_id:
        code = await db.scalar(
            text("SELECT code FROM neighborhood_group WHERE id = CAST(:g AS uuid)"),
            {"g": group_id},
        )
        if code:
            # "to-3" -> "3", "TDP5" -> "5"; không có số thì giữ nguyên mã tổ
            m = re.search(r"\d+", code)
            tien_to = m.group(0) if m else code.upper()

    lon_nhat = await db.scalar(
        text("""
        SELECT max(NULLIF(regexp_replace(split_part(code, '-', 2), '\\D', '', 'g'), '')::int)
        FROM household
        WHERE split_part(code, '-', 1) = :p
    """),
        {"p": tien_to},
    )
    return f"{tien_to}-{(lon_nhat or 0) + 1:03d}"


@router.get("", dependencies=[Depends(require("household:read"))])
async def danh_sach(
    q: str | None = Query(default=None),
    group_id: str | None = None,
    geo_status: str | None = Query(default=None, pattern="^(pending|auto|verified|manual|failed)$"),
    household_type: str | None = Query(
        default=None, pattern="^(thuong_tru|tam_tru)$",
        description="hộ khẩu thường trú hay hộ tạm trú — hai màn hình riêng",
    ),
    limit: int = Query(default=100, le=300),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q else None, "gid": group_id, "gs": geo_status,
         "ht": household_type, "limit": limit, "offset": offset}
    WHERE = """
        WHERE h.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR h.code ILIKE '%' || CAST(:q AS text) || '%'
               OR h.address_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%')
          AND (CAST(:gid AS uuid) IS NULL OR h.group_id = CAST(:gid AS uuid))
          AND (CAST(:gs  AS text) IS NULL OR h.geo_status = CAST(:gs AS text))
          AND (CAST(:ht  AS text) IS NULL OR h.household_type = CAST(:ht AS text))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT h.id::text, h.code, h.address, h.phone, h.geo_status, h.household_type,
                   h.group_id::text, g.name AS to_dan_pho,
                   c.full_name AS chu_ho, c.phone AS dt_chu_ho,
                   (SELECT count(*) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   CASE WHEN h.geom IS NOT NULL
                        THEN json_build_object('lat', ST_Y(h.geom::geometry),
                                               'lng', ST_X(h.geom::geometry)) END AS toa_do
            FROM household h
            LEFT JOIN neighborhood_group g ON g.id = h.group_id
            LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
            {WHERE}
            ORDER BY h.code
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    total = (await db.execute(text(f"SELECT count(*) FROM household h {WHERE}"), p)).scalar_one()
    return {"tong_so": total, "items": [dict(r) for r in rows]}


@router.get("/{hid}", dependencies=[Depends(require("household:read"))])
async def chi_tiet(hid: str, db: AsyncSession = Depends(get_db)) -> dict:
    row = (
        await db.execute(
            text("""
            SELECT h.id::text, h.code, h.address, h.phone, h.household_type, h.residence_type, h.note,
                   h.group_id::text, g.name AS to_dan_pho,
                   h.geo_status, h.geo_source, h.geo_accuracy_m, h.geo_updated_at,
                   h.head_resident_id::text,
                   CASE WHEN h.geom IS NOT NULL
                        THEN json_build_object('lat', ST_Y(h.geom::geometry),
                                               'lng', ST_X(h.geom::geometry)) END AS toa_do,
                   h.created_at, h.updated_at
            FROM household h
            LEFT JOIN neighborhood_group g ON g.id = h.group_id
            WHERE h.id = CAST(:id AS uuid) AND h.deleted_at IS NULL
        """),
            {"id": hid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ")

    tv = (
        await db.execute(
            text("""
            SELECT r.id::text, r.full_name, r.dob, r.gender, r.relation_to_head,
                   r.is_head, r.phone, r.occupation, r.residence_status,
                   CASE WHEN r.dob IS NOT NULL
                        THEN extract(year from age(r.dob))::int END AS tuoi,
                   COALESCE((
                     SELECT json_agg(json_build_object('code', c.code, 'name', c.name, 'color', c.color))
                     FROM resident_classification rc JOIN classification c ON c.id = rc.classification_id
                     WHERE rc.resident_id = r.id
                   ), '[]'::json) AS phan_loai
            FROM resident r
            WHERE r.household_id = CAST(:id AS uuid) AND r.deleted_at IS NULL
            ORDER BY r.is_head DESC, r.dob NULLS LAST
        """),
            {"id": hid},
        )
    ).mappings().all()

    return {**dict(row), "thanh_vien": [dict(r) for r in tv]}


@router.post("", status_code=201)
async def tao_moi(
    body: HoIn,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    code = body.code or await sinh_ma_ho(db, body.group_id)
    try:
        hid = (
            await db.execute(
                text("""
                INSERT INTO household (code, group_id, address, phone,
                                       household_type, residence_type, note,
                                       created_by, updated_by)
                VALUES (:c, CAST(:g AS uuid), :a, :p,
                        COALESCE(CAST(:ht AS text), 'thuong_tru'), :rt, :n,
                        CAST(:u AS uuid), CAST(:u AS uuid))
                RETURNING id::text
            """),
                {"c": code, "g": body.group_id, "a": body.address, "p": body.phone,
                 "ht": body.household_type, "rt": body.residence_type,
                 "n": body.note, "u": user.id},
            )
        ).scalar_one()
    except Exception as exc:  # noqa: BLE001
        if "unique" in str(exc).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, f"Mã hộ '{code}' đã tồn tại") from None
        raise
    await ghi_audit(db, user, request, action="create", etype="household", eid=hid)
    await db.commit()
    log.info("household.created", id=hid, code=code)
    return {"id": hid, "code": code}


@router.patch("/{hid}")
async def cap_nhat(
    hid: str,
    body: HoIn,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""
            UPDATE household SET
                group_id       = COALESCE(CAST(:g AS uuid), group_id),
                address        = COALESCE(:a, address),
                phone          = COALESCE(:p, phone),
                household_type = COALESCE(CAST(:ht AS text), household_type),
                residence_type = COALESCE(:rt, residence_type),
                note           = COALESCE(:n, note),
                geom           = CASE
                                   WHEN CAST(:lat AS double precision) IS NOT NULL
                                    AND CAST(:lng AS double precision) IS NOT NULL
                                   THEN ST_SetSRID(ST_MakePoint(
                                          CAST(:lng AS double precision),
                                          CAST(:lat AS double precision)), 4326)::geography
                                   ELSE geom END,
                geo_status     = CASE
                                   WHEN CAST(:gs AS text) IS NOT NULL THEN CAST(:gs AS text)
                                   WHEN CAST(:lat AS double precision) IS NOT NULL
                                        THEN 'manual'
                                   ELSE geo_status END,
                geo_source     = COALESCE(CAST(:gsrc AS text), geo_source),
                geo_updated_at = CASE
                                   WHEN CAST(:lat AS double precision) IS NOT NULL
                                   THEN now() ELSE geo_updated_at END,
                geo_updated_by = CASE
                                   WHEN CAST(:lat AS double precision) IS NOT NULL
                                   THEN CAST(:u AS uuid) ELSE geo_updated_by END,
                updated_by     = CAST(:u AS uuid)
            WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
            RETURNING id::text, code
        """),
            {"g": body.group_id, "a": body.address, "p": body.phone,
             "ht": body.household_type, "rt": body.residence_type,
             "n": body.note, "u": user.id, "id": hid,
             "lat": body.lat, "lng": body.lng,
             "gs": body.geo_status, "gsrc": body.geo_source},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ")
    await ghi_audit(
        db, user, request,
        action="ghim_vi_tri" if body.lat is not None else "update",
        etype="household", eid=hid,
        changes=(
            f'{{"lat": {body.lat}, "lng": {body.lng}}}' if body.lat is not None else None
        ),
    )
    await db.commit()
    return dict(row)


@router.post("/chuyen-ho")
async def chuyen_ho(
    body: ChuyenHo,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Chuyển một cư dân sang hộ khác, hoặc tách khỏi hộ (household_id = null)."""
    cu = (
        await db.execute(
            text("""SELECT household_id::text, full_name, is_head FROM resident
                    WHERE id = CAST(:r AS uuid) AND deleted_at IS NULL"""),
            {"r": body.resident_id},
        )
    ).mappings().first()
    if not cu:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cư dân")

    # Rời hộ cũ mà đang là chủ hộ thì phải gỡ liên kết chủ hộ, tránh treo FK
    if cu["is_head"] and cu["household_id"]:
        await db.execute(
            text("UPDATE household SET head_resident_id = NULL WHERE id = CAST(:h AS uuid)"),
            {"h": cu["household_id"]},
        )

    await db.execute(
        text("""UPDATE resident SET household_id = CAST(:h AS uuid),
                       relation_to_head = :rel, is_head = :head,
                       group_id = COALESCE(
                           (SELECT group_id FROM household WHERE id = CAST(:h AS uuid)), group_id),
                       updated_by = CAST(:u AS uuid)
                WHERE id = CAST(:r AS uuid)"""),
        {"h": body.household_id, "rel": body.relation_to_head,
         "head": body.is_head, "u": user.id, "r": body.resident_id},
    )

    if body.is_head and body.household_id:
        # Một hộ chỉ có một chủ hộ
        await db.execute(
            text("""UPDATE resident SET is_head = false
                    WHERE household_id = CAST(:h AS uuid) AND id <> CAST(:r AS uuid)"""),
            {"h": body.household_id, "r": body.resident_id},
        )
        await db.execute(
            text("UPDATE household SET head_resident_id = CAST(:r AS uuid) WHERE id = CAST(:h AS uuid)"),
            {"r": body.resident_id, "h": body.household_id},
        )

    await ghi_audit(
        db, user, request, action="update", etype="resident", eid=body.resident_id,
        changes=f'{{"chuyen_ho":{{"tu":{cu["household_id"]!r},"den":{body.household_id!r}}}}}'.replace(
            "'", '"'
        ).replace("None", "null"),
    )
    await db.commit()
    log.info("household.moved", resident=body.resident_id, to=body.household_id)
    return {"success": True}


@router.delete("/{hid}")
async def xoa(
    hid: str,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    con = await db.scalar(
        text("""SELECT count(*) FROM resident
                WHERE household_id = CAST(:h AS uuid) AND deleted_at IS NULL"""),
        {"h": hid},
    )
    if con:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Hộ này còn {con} nhân khẩu. Chuyển họ sang hộ khác trước khi xoá.",
        )
    n = (
        await db.execute(
            text("""UPDATE household SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:h AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"h": hid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ")
    await ghi_audit(db, user, request, action="delete", etype="household", eid=hid)
    await db.commit()
    return {"success": True}
