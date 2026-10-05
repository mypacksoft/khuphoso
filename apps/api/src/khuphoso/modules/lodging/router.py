"""Cơ sở trọ — nhà trọ, nhà cho thuê, kiot.

Một cơ sở trọ gom các HỘ (thường trú lẫn tạm trú) ở cùng địa chỉ. Gán hộ vào cơ
sở bằng gợi ý theo địa chỉ trùng, hoặc chọn tay. Bấm vào cơ sở thấy ngay danh
sách hộ và toàn bộ người đang ở, kèm hạn tạm trú để nhắc gia hạn.

Dùng lại quyền `household:read` / `household:write` — cơ sở trọ là một lát cắt
khác của chính dữ liệu hộ khẩu, không phải phân hệ tách biệt về quyền.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()
router = APIRouter(prefix="/co-so-tro", tags=["cơ sở trọ"])

LOAI = ("nha_tro", "nha_cho_thue", "kiot", "khach_san", "khac")


class CoSoIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    owner_name: str | None = Field(default=None, max_length=150)
    owner_phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    loai: str = Field(default="nha_tro", pattern="^(nha_tro|nha_cho_thue|kiot|khach_san|khac)$")
    has_foreigner: bool = False
    total_rooms: int | None = Field(default=None, ge=0, le=100000)
    note: str | None = None
    code: str | None = Field(default=None, description="để trống thì tự sinh")


class GanHo(BaseModel):
    household_ids: list[str] = Field(min_length=1)


async def _sinh_ma(db: AsyncSession) -> str:
    """Sinh mã cơ sở kế tiếp dạng CST-001."""
    lon_nhat = await db.scalar(
        text(
            "SELECT max(NULLIF(regexp_replace(split_part(code,'-',2),'\\D','','g'),'')::int) "
            "FROM lodging WHERE split_part(code,'-',1) = 'CST'"
        )
    )
    return f"CST-{(lon_nhat or 0) + 1:03d}"


@router.get("", dependencies=[Depends(require("household:read"))])
async def danh_sach(
    q: str | None = Query(default=None),
    loai: str | None = Query(default=None, pattern="^(nha_tro|nha_cho_thue|kiot|khach_san|khac)$"),
    co_nguoi_nn: bool | None = Query(default=None, description="chỉ cơ sở có người nước ngoài"),
    limit: int = Query(default=100, le=2000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = {"q": q.strip() if q else None, "loai": loai, "nn": co_nguoi_nn,
         "limit": limit, "offset": offset}
    WHERE = """
        WHERE l.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR l.name ILIKE '%'||CAST(:q AS text)||'%'
               OR l.owner_name ILIKE '%'||CAST(:q AS text)||'%'
               OR l.address_search LIKE '%'||kp_unaccent(CAST(:q AS text))||'%')
          AND (CAST(:loai AS text) IS NULL OR l.loai = CAST(:loai AS text))
          AND (CAST(:nn AS boolean) IS NULL OR l.has_foreigner = CAST(:nn AS boolean))
    """
    rows = (
        await db.execute(
            text(f"""
            SELECT l.id::text, l.code, l.name, l.owner_name, l.owner_phone,
                   l.address, l.loai, l.has_foreigner, l.total_rooms,
                   (SELECT count(*) FROM household h
                     WHERE h.lodging_id = l.id AND h.deleted_at IS NULL) AS so_ho,
                   (SELECT count(*) FROM resident r JOIN household h ON h.id = r.household_id
                     WHERE h.lodging_id = l.id AND h.deleted_at IS NULL
                       AND r.deleted_at IS NULL) AS so_nguoi,
                   (SELECT count(*) FROM household h JOIN resident r ON r.household_id = h.id
                     WHERE h.lodging_id = l.id AND h.deleted_at IS NULL AND r.deleted_at IS NULL
                       AND r.tam_tru_den_ngay IS NOT NULL
                       AND r.tam_tru_den_ngay < CURRENT_DATE) AS so_qua_han
            FROM lodging l
            {WHERE}
            ORDER BY l.name
            LIMIT :limit OFFSET :offset
        """),
            p,
        )
    ).mappings().all()
    total = (await db.execute(text(f"SELECT count(*) FROM lodging l {WHERE}"), p)).scalar_one()
    return {"tong_so": total, "items": [dict(r) for r in rows]}


@router.get("/goi-y-dia-chi", dependencies=[Depends(require("household:read"))])
async def goi_y_dia_chi(
    address: str = Query(min_length=2),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Gợi ý hộ CHƯA thuộc cơ sở nào có địa chỉ giống một địa chỉ bất kỳ.

    Dùng cho form TẠO cơ sở: vừa gõ địa chỉ là hiện ngay các hộ trùng để tick chọn.
    """
    rows = (
        await db.execute(
            text("""
            SELECT h.id::text, h.code, h.address, h.household_type,
                   c.full_name AS chu_ho,
                   (SELECT count(*) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   round(similarity(h.address_search, kp_unaccent(:a))::numeric, 2) AS do_giong
            FROM household h
            LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
            WHERE h.deleted_at IS NULL AND h.lodging_id IS NULL
              AND h.address IS NOT NULL AND h.address <> ''
              AND similarity(h.address_search, kp_unaccent(:a)) > 0.25
            ORDER BY similarity(h.address_search, kp_unaccent(:a)) DESC
            LIMIT 50
        """),
            {"a": address},
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.get("/{lid}", dependencies=[Depends(require("household:read"))])
async def chi_tiet(lid: str, db: AsyncSession = Depends(get_db)) -> dict:
    cs = (
        await db.execute(
            text("""
            SELECT l.id::text, l.code, l.name, l.owner_name, l.owner_phone, l.address,
                   l.loai, l.has_foreigner, l.total_rooms, l.note,
                   l.created_at, l.updated_at
            FROM lodging l
            WHERE l.id = CAST(:id AS uuid) AND l.deleted_at IS NULL
        """),
            {"id": lid},
        )
    ).mappings().first()
    if not cs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở trọ")

    # Danh sách HỘ trong cơ sở
    ho = (
        await db.execute(
            text("""
            SELECT h.id::text, h.code, h.address, h.room_no, h.household_type,
                   c.full_name AS chu_ho, c.phone AS dt_chu_ho,
                   (SELECT count(*) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   (SELECT max(r.tam_tru_den_ngay) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS han_tam_tru
            FROM household h
            LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
            WHERE h.lodging_id = CAST(:id AS uuid) AND h.deleted_at IS NULL
            ORDER BY h.room_no NULLS LAST, h.code
        """),
            {"id": lid},
        )
    ).mappings().all()

    # Toàn bộ NGƯỜI đang ở — xem nhanh không cần mở từng hộ
    nguoi = (
        await db.execute(
            text("""
            SELECT r.id::text, r.full_name, r.id_card_last4, r.phone, r.gender,
                   r.residence_status, r.tam_tru_den_ngay, h.room_no, h.code AS ma_ho,
                   CASE WHEN r.dob IS NOT NULL THEN extract(year from age(r.dob))::int END AS tuoi
            FROM resident r JOIN household h ON h.id = r.household_id
            WHERE h.lodging_id = CAST(:id AS uuid)
              AND h.deleted_at IS NULL AND r.deleted_at IS NULL
            ORDER BY h.room_no NULLS LAST, r.is_head DESC, r.full_name
        """),
            {"id": lid},
        )
    ).mappings().all()

    so_ho = len(ho)
    so_nguoi = len(nguoi)
    return {
        **dict(cs),
        "ho": [dict(r) for r in ho],
        "nguoi": [dict(r) for r in nguoi],
        "thong_ke": {
            "so_ho": so_ho,
            "so_nguoi": so_nguoi,
            "tong_phong": cs["total_rooms"],
            "phong_trong": (
                max(cs["total_rooms"] - so_ho, 0) if cs["total_rooms"] is not None else None
            ),
            "so_qua_han": sum(
                1 for r in nguoi
                if r["tam_tru_den_ngay"] is not None and str(r["tam_tru_den_ngay"]) < _hom_nay()
            ),
        },
    }


def _hom_nay() -> str:
    from datetime import date

    return date.today().isoformat()


@router.get("/{lid}/goi-y", dependencies=[Depends(require("household:read"))])
async def goi_y_ho(lid: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Gợi ý các hộ CHƯA thuộc cơ sở nào mà địa chỉ giống địa chỉ cơ sở này."""
    addr = await db.scalar(
        text("SELECT address FROM lodging WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL"),
        {"id": lid},
    )
    if not addr:
        return {"items": []}
    rows = (
        await db.execute(
            text("""
            SELECT h.id::text, h.code, h.address, h.household_type,
                   c.full_name AS chu_ho,
                   (SELECT count(*) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   round(similarity(h.address_search, kp_unaccent(:a))::numeric, 2) AS do_giong
            FROM household h
            LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
            WHERE h.deleted_at IS NULL AND h.lodging_id IS NULL
              AND h.address IS NOT NULL AND h.address <> ''
              AND similarity(h.address_search, kp_unaccent(:a)) > 0.25
            ORDER BY similarity(h.address_search, kp_unaccent(:a)) DESC
            LIMIT 50
        """),
            {"a": addr},
        )
    ).mappings().all()
    return {"items": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def tao_moi(
    body: CoSoIn,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    code = body.code or await _sinh_ma(db)
    try:
        lid = (
            await db.execute(
                text("""
                INSERT INTO lodging (code, name, owner_name, owner_phone, address, loai,
                                     has_foreigner, total_rooms, note, created_by, updated_by)
                VALUES (:c, :n, :on, :op, :a, :loai, :nn, :tr, :note,
                        CAST(:u AS uuid), CAST(:u AS uuid))
                RETURNING id::text
            """),
                {"c": code, "n": body.name, "on": body.owner_name, "op": body.owner_phone,
                 "a": body.address, "loai": body.loai, "nn": body.has_foreigner,
                 "tr": body.total_rooms, "note": body.note, "u": user.id},
            )
        ).scalar_one()
    except Exception as exc:  # noqa: BLE001
        if "unique" in str(exc).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, f"Mã '{code}' đã tồn tại") from None
        raise
    await ghi_audit(db, user, request, action="create", etype="lodging", eid=lid)
    await db.commit()
    log.info("lodging.created", id=lid, code=code)
    return {"id": lid, "code": code}


@router.patch("/{lid}")
async def cap_nhat(
    lid: str,
    body: CoSoIn,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""
            UPDATE lodging SET
                name          = :n,
                owner_name    = :on,
                owner_phone   = :op,
                address       = :a,
                loai          = :loai,
                has_foreigner = :nn,
                total_rooms   = :tr,
                note          = :note,
                updated_by    = CAST(:u AS uuid)
            WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
            RETURNING id::text, code
        """),
            {"n": body.name, "on": body.owner_name, "op": body.owner_phone,
             "a": body.address, "loai": body.loai, "nn": body.has_foreigner,
             "tr": body.total_rooms, "note": body.note, "u": user.id, "id": lid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở trọ")
    await ghi_audit(db, user, request, action="update", etype="lodging", eid=lid)
    await db.commit()
    return dict(row)


@router.delete("/{lid}")
async def xoa(
    lid: str,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Gỡ liên kết các hộ trước, rồi xoá mềm cơ sở — hộ vẫn còn nguyên.
    await db.execute(
        text("UPDATE household SET lodging_id = NULL WHERE lodging_id = CAST(:id AS uuid)"),
        {"id": lid},
    )
    n = (
        await db.execute(
            text("""UPDATE lodging SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"id": lid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở trọ")
    await ghi_audit(db, user, request, action="delete", etype="lodging", eid=lid)
    await db.commit()
    return {"success": True}


@router.post("/{lid}/gan-ho")
async def gan_ho(
    lid: str,
    body: GanHo,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    ok = await db.scalar(
        text("SELECT 1 FROM lodging WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL"),
        {"id": lid},
    )
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cơ sở trọ")
    n = (
        await db.execute(
            text("""UPDATE household SET lodging_id = CAST(:id AS uuid), updated_by = CAST(:u AS uuid)
                    WHERE id = ANY(CAST(:ids AS uuid[])) AND deleted_at IS NULL"""),
            {"id": lid, "u": user.id, "ids": body.household_ids},
        )
    ).rowcount
    await ghi_audit(db, user, request, action="update", etype="lodging", eid=lid,
                    changes=f'{{"gan_ho": {n}}}')
    await db.commit()
    return {"da_gan": n}


@router.post("/{lid}/go-ho")
async def go_ho(
    lid: str,
    body: GanHo,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = (
        await db.execute(
            text("""UPDATE household SET lodging_id = NULL, updated_by = CAST(:u AS uuid)
                    WHERE id = ANY(CAST(:ids AS uuid[])) AND lodging_id = CAST(:id AS uuid)"""),
            {"id": lid, "u": user.id, "ids": body.household_ids},
        )
    ).rowcount
    await ghi_audit(db, user, request, action="update", etype="lodging", eid=lid,
                    changes=f'{{"go_ho": {n}}}')
    await db.commit()
    return {"da_go": n}
