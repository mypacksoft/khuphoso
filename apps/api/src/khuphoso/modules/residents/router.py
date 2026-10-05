"""Phân hệ cư dân, hộ khẩu, tổ dân phố.

Ba điểm khác hẳn bản cũ:
  1. Lọc và tìm kiếm chạy trong Postgres, không load cả mảng vào RAM rồi .filter()
  2. Số CCCD mã hoá bằng pgcrypto, chỉ hiện 4 số cuối trừ khi có quyền `resident:read_pii`
  3. Mọi truy vấn đi qua RLS — không có đường nào đọc chéo khu phố
"""

import json
from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.config import get_settings
from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

log = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/cu-dan", tags=["cư dân"])

GENDERS = ("nam", "nu", "khac")
STATUSES = ("thuong_tru", "tam_tru", "tam_vang", "vang_lai")


# --------------------------------------------------------------------------- #
# Lược đồ
# --------------------------------------------------------------------------- #
class CuDanIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    dob: date | None = None
    gender: str | None = Field(default=None, pattern="^(nam|nu|khac)$")
    id_card: str | None = Field(default=None, max_length=20)
    household_id: str | None = None
    group_id: str | None = None
    relation_to_head: str | None = None
    residence_status: str = Field(default="thuong_tru", pattern="^(thuong_tru|tam_tru|tam_vang|vang_lai)$")
    # Thời hạn đăng ký tạm trú. Chỉ có nghĩa với `residence_status = 'tam_tru'`,
    # nhưng không chặn cứng: người chuyển sang thường trú vẫn giữ lại để tra cứu.
    tam_tru_tu_ngay: date | None = None
    tam_tru_den_ngay: date | None = None
    phone: str | None = None
    email: str | None = None
    occupation: str | None = None
    education_level: str | None = None
    note: str | None = None
    is_head: bool = False
    classifications: list[str] = Field(default_factory=list, description="mã phân loại")
    # Nhạy cảm — chỉ ghi khi khu phố bật thu và người dùng có quyền
    ethnicity: str | None = None
    religion: str | None = None
    party_join_date: date | None = None
    party_position: str | None = None
    # Địa chỉ và tên chủ hộ KHAI lúc nhập liệu, dùng để gom thành hộ về sau.
    # Sau khi đã gán vào hộ thì địa chỉ chính thức là địa chỉ của hộ.
    dia_chi_khai: str | None = Field(default=None, max_length=300)
    ten_chu_ho_khai: str | None = Field(default=None, max_length=120)


class ToDanPhoIn(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    # Chọn từ danh sách nhân khẩu là đường chính xác: ra đúng một `resident_id`.
    leader_resident_id: str | None = None
    # Chỉ dùng khi tổ trưởng CHƯA có hồ sơ nhân khẩu trong khu phố này.
    leader_name: str | None = None
    # Bỏ trống thì đọc theo số của tổ trưởng; điền thì đây là số riêng của tổ.
    phone: str | None = None
    note: str | None = None
    sort_order: int = 0


class ToDanPhoSua(BaseModel):
    """Chỉ trường nào gửi lên mới bị đổi. `code` không sửa được sau khi tạo.

    Riêng `leader_resident_id`: chuỗi rỗng nghĩa là GỠ tổ trưởng, không gửi nghĩa
    là giữ nguyên. `COALESCE(:x, cot)` không phân biệt được hai ý đó.
    """
    name: str | None = Field(default=None, min_length=1, max_length=120)
    leader_resident_id: str | None = None
    leader_name: str | None = None
    phone: str | None = None
    note: str | None = None
    sort_order: int | None = None


# --------------------------------------------------------------------------- #
# Tiện ích
# --------------------------------------------------------------------------- #
def cccd_fields(id_card: str | None) -> dict:
    """Chuẩn bị 3 trường CCCD. Số đầy đủ chỉ tồn tại ở dạng mã hoá."""
    if not id_card:
        return {"enc": None, "last4": None, "hash": None}
    clean = "".join(ch for ch in id_card if ch.isdigit())
    if not clean:
        return {"enc": None, "last4": None, "hash": None}
    return {"enc": clean, "last4": clean[-4:], "hash": clean}


# --------------------------------------------------------------------------- #
# Tổ dân phố
# --------------------------------------------------------------------------- #
@router.get("/to-dan-pho", dependencies=[Depends(require("resident:read"))])
async def ds_to_dan_pho(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (
        await db.execute(
            text("""
            SELECT g.id::text, g.code, g.name, g.sort_order,
                   g.leader_resident_id::text,
                   -- Ưu tiên tên trong hồ sơ nhân khẩu: đổi tên ở hồ sơ thì danh
                   -- sách tổ đổi theo, khỏi phải nhớ sửa hai chỗ
                   COALESCE(t.full_name, g.leader_name)      AS leader_name,
                   -- Số riêng của tổ nếu có khai, không thì lấy số của tổ trưởng
                   COALESCE(NULLIF(g.phone, ''), t.phone)    AS phone,
                   t.phone                                   AS dt_to_truong,
                   th.code                                   AS ma_ho_to_truong,
                   (SELECT count(*) FROM resident r
                     WHERE r.group_id = g.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   (SELECT count(*) FROM household h
                     WHERE h.group_id = g.id AND h.deleted_at IS NULL) AS so_ho
            FROM neighborhood_group g
            LEFT JOIN resident  t  ON t.id = g.leader_resident_id AND t.deleted_at IS NULL
            LEFT JOIN household th ON th.id = t.household_id
            WHERE g.deleted_at IS NULL
            ORDER BY g.sort_order, g.name
        """)
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/to-dan-pho", status_code=201)
async def tao_to_dan_pho(
    body: ToDanPhoIn,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        gid = (
            await db.execute(
                text("""INSERT INTO neighborhood_group
                        (code, name, leader_resident_id, leader_name, phone, note, sort_order)
                        VALUES (:code, :name, CAST(NULLIF(:tt, '') AS uuid),
                                :leader, :phone, :note, :so)
                        RETURNING id::text"""),
                {"code": body.code, "name": body.name, "tt": body.leader_resident_id or "",
                 "leader": body.leader_name, "phone": body.phone,
                 "note": body.note, "so": body.sort_order},
            )
        ).scalar_one()
    except Exception as exc:  # noqa: BLE001
        if "unique" in str(exc).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, f"Mã tổ '{body.code}' đã tồn tại") from None
        raise
    await ghi_audit(db, user, request, action="create", etype="neighborhood_group", eid=gid)
    await db.commit()
    return {"id": gid, "code": body.code, "name": body.name}


@router.patch("/to-dan-pho/{gid}")
async def sua_to_dan_pho(
    gid: str,
    body: ToDanPhoSua,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Đổi tên tổ, tổ trưởng, số điện thoại. Mã tổ giữ nguyên."""
    r = (
        await db.execute(
            text("""UPDATE neighborhood_group SET
                        name        = COALESCE(:n, name),
                        leader_name = COALESCE(CAST(:l AS text), leader_name),
                        -- Gán tổ trưởng mới mà KHÔNG khai số riêng thì xoá số cũ:
                        -- không thì tổ giữ nguyên số của tổ trưởng TRƯỚC, mà nhìn
                        -- vào bảng lại tưởng đó là số của người mới.
                        phone       = CASE
                            WHEN CAST(:p AS text) IS NOT NULL THEN CAST(:p AS text)
                            WHEN CAST(:tt AS text) IS NOT NULL
                                 AND CAST(:tt AS text) <> '' THEN ''
                            ELSE phone
                        END,
                        note        = COALESCE(CAST(:g AS text), note),
                        sort_order  = COALESCE(CAST(:s AS int), sort_order),
                        -- Không gửi = giữ nguyên; gửi chuỗi rỗng = gỡ tổ trưởng.
                        -- COALESCE một nhánh không diễn tả được hai ý đó.
                        leader_resident_id = CASE
                            WHEN CAST(:tt AS text) IS NULL THEN leader_resident_id
                            ELSE CAST(NULLIF(CAST(:tt AS text), '') AS uuid)
                        END
                    WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL
                    RETURNING id::text"""),
            {"n": body.name, "l": body.leader_name, "p": body.phone,
             "g": body.note, "s": body.sort_order, "tt": body.leader_resident_id,
             "i": gid},
        )
    ).scalar()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tổ dân phố")
    await ghi_audit(db, user, request, action="update", etype="neighborhood_group", eid=gid)
    await db.commit()
    return {"success": True, "id": gid}


@router.post("/to-dan-pho/{gid}/chuyen")
async def chuyen_to(
    gid: str,
    den: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Chuyển toàn bộ hộ và nhân khẩu của tổ `gid` sang tổ `den`.

    Có endpoint này thì mới nhập tổ vào nhau được — không thì cán bộ phải mở từng
    hộ sửa tay, mà một tổ có cả trăm hộ.
    """
    if gid == den:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tổ nguồn và tổ đích trùng nhau")
    for i in (gid, den):
        co = await db.scalar(
            text("SELECT 1 FROM neighborhood_group WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"),
            {"i": i},
        )
        if not co:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tổ dân phố")

    n_ho = (await db.execute(
        text("UPDATE household SET group_id = CAST(:d AS uuid) WHERE group_id = CAST(:g AS uuid)"),
        {"d": den, "g": gid},
    )).rowcount
    n_nk = (await db.execute(
        text("UPDATE resident SET group_id = CAST(:d AS uuid) WHERE group_id = CAST(:g AS uuid)"),
        {"d": den, "g": gid},
    )).rowcount
    await ghi_audit(
        db, user, request, action="update", etype="neighborhood_group", eid=gid,
        changes=json.dumps({"chuyen_sang": den, "so_ho": n_ho, "so_nhan_khau": n_nk}),
    )
    await db.commit()
    log.info("group.merged", tu=gid, den=den, ho=n_ho, nhan_khau=n_nk)
    return {"success": True, "so_ho": n_ho, "so_nhan_khau": n_nk}


@router.delete("/to-dan-pho/{gid}")
async def xoa_to_dan_pho(
    gid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Xoá một tổ dân phố. Tổ còn hộ hoặc nhân khẩu thì KHÔNG cho xoá.

    Cho xoá thì những hộ đó rơi vào trạng thái "chưa phân tổ" mà không ai biết —
    đến kỳ rà soát mới phát hiện thiếu cả trăm hộ. Bắt chuyển đi trước.
    """
    r = (
        await db.execute(
            text("""SELECT g.name,
                           (SELECT count(*) FROM household h
                             WHERE h.group_id = g.id AND h.deleted_at IS NULL) AS so_ho,
                           (SELECT count(*) FROM resident r
                             WHERE r.group_id = g.id AND r.deleted_at IS NULL) AS so_nk
                    FROM neighborhood_group g
                    WHERE g.id = CAST(:i AS uuid) AND g.deleted_at IS NULL"""),
            {"i": gid},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tổ dân phố")
    if r["so_ho"] or r["so_nk"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Tổ “{r['name']}” còn {r['so_ho']} hộ và {r['so_nk']} nhân khẩu. "
            "Chuyển sang tổ khác trước rồi mới xoá được.",
        )
    await db.execute(
        text("UPDATE neighborhood_group SET deleted_at = now() WHERE id = CAST(:i AS uuid)"),
        {"i": gid},
    )
    await ghi_audit(db, user, request, action="delete", etype="neighborhood_group", eid=gid)
    await db.commit()
    return {"success": True}


# --------------------------------------------------------------------------- #
# Danh sách cư dân — lọc đa tiêu chí, chạy trong Postgres
# --------------------------------------------------------------------------- #
@router.get("", dependencies=[Depends(require("resident:read"))])
async def danh_sach(
    q: str | None = Query(default=None, description="tìm theo tên, không dấu cũng được"),
    group_id: str | None = None,
    residence_status: str | None = Query(default=None, pattern="^(thuong_tru|tam_tru|tam_vang|vang_lai)$"),
    gender: str | None = Query(default=None, pattern="^(nam|nu|khac)$"),
    tuoi_tu: int | None = Query(default=None, ge=0, le=150),
    tuoi_den: int | None = Query(default=None, ge=0, le=150),
    phan_loai: str | None = Query(default=None, description="mã phân loại, phân tách bởi dấu phẩy"),
    co_dien_thoai: bool | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    # Rỗng = không lọc. 'qua_han' = đã hết hạn. 'sap_het' = còn dưới 30 ngày.
    han_tam_tru: str | None = Query(default=None, pattern="^(qua_han|sap_het)$"),
    # Hồ sơ có dấu cảnh báo trong ghi chú — dựng ra khi nhập hàng loạt từ file
    # có chỗ không chắc. Ô tìm kiếm chỉ tra họ tên, CCCD và điện thoại, KHÔNG tra
    # ghi chú, nên không có cờ này thì không có đường nào lọc ra chúng.
    can_ra_soat: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    codes = [c.strip() for c in phan_loai.split(",")] if phan_loai else None
    p = {
        "q": q.strip() if q else None,
        "gid": group_id, "st": residence_status, "gd": gender,
        "t1": tuoi_tu, "t2": tuoi_den,
        "codes": codes or ["__none__"], "has_codes": bool(codes),
        "phone": co_dien_thoai, "limit": limit, "offset": offset,
        "htt": han_tam_tru, "crs": can_ra_soat,
    }

    WHERE = """
        WHERE r.deleted_at IS NULL
          AND (CAST(:q AS text) IS NULL
               OR r.full_name_search LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
               OR r.id_card_last4 = CAST(:q AS text)
               OR r.phone LIKE '%' || CAST(:q AS text) || '%')
          AND (CAST(:gid AS uuid) IS NULL OR r.group_id = CAST(:gid AS uuid))
          AND (CAST(:st  AS text) IS NULL OR r.residence_status = CAST(:st AS text))
          AND (CAST(:gd  AS text) IS NULL OR r.gender = CAST(:gd AS text))
          AND (CAST(:t1  AS int) IS NULL OR r.dob IS NOT NULL
               AND extract(year from age(r.dob)) >= CAST(:t1 AS int))
          AND (CAST(:t2  AS int) IS NULL OR r.dob IS NOT NULL
               AND extract(year from age(r.dob)) <= CAST(:t2 AS int))
          AND (CAST(:phone AS boolean) IS NULL
               OR (CAST(:phone AS boolean) = true  AND r.phone IS NOT NULL AND r.phone <> '')
               OR (CAST(:phone AS boolean) = false AND (r.phone IS NULL OR r.phone = '')))
          AND (CAST(:has_codes AS boolean) = false OR EXISTS (
                SELECT 1 FROM resident_classification rc
                JOIN classification c ON c.id = rc.classification_id
                WHERE rc.resident_id = r.id AND c.code IN :codes))
          -- Người chưa khai thời hạn thì KHÔNG tính là quá hạn: không biết hạn
          -- thì không thể kết luận đã hết hạn, gộp vào là báo động giả hàng nghìn dòng
          AND (NOT CAST(:crs AS boolean) OR r.note LIKE '⚠%')
          AND (CAST(:htt AS text) IS NULL
               OR (CAST(:htt AS text) = 'qua_han'
                   AND r.tam_tru_den_ngay IS NOT NULL
                   AND r.tam_tru_den_ngay < CURRENT_DATE)
               OR (CAST(:htt AS text) = 'sap_het'
                   AND r.tam_tru_den_ngay IS NOT NULL
                   AND r.tam_tru_den_ngay >= CURRENT_DATE
                   AND r.tam_tru_den_ngay < CURRENT_DATE + 30))
    """

    rows = (
        await db.execute(
            text(f"""
            SELECT r.id::text, r.full_name, r.dob, r.gender, r.residence_status,
                   r.phone, r.occupation, r.is_head, r.relation_to_head,
                   r.id_card_last4,
                   CASE WHEN r.dob IS NOT NULL
                        THEN extract(year from age(r.dob))::int END AS tuoi,
                   r.note,
                   r.tam_tru_den_ngay,
                   -- Số âm nghĩa là đã quá hạn ngần ấy ngày. Tính ở máy chủ để
                   -- mọi máy con ra cùng một con số, không phụ thuộc đồng hồ máy.
                   CASE WHEN r.tam_tru_den_ngay IS NOT NULL
                        THEN (r.tam_tru_den_ngay - CURRENT_DATE) END AS con_ngay_tam_tru,
                   g.name AS to_dan_pho, h.code AS ma_ho, COALESCE(h.address, r.dia_chi_khai) AS dia_chi,
                   COALESCE((
                     SELECT json_agg(json_build_object('code', c.code, 'name', c.name, 'color', c.color))
                     FROM resident_classification rc JOIN classification c ON c.id = rc.classification_id
                     WHERE rc.resident_id = r.id
                   ), '[]'::json) AS phan_loai
            FROM resident r
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            LEFT JOIN household h ON h.id = r.household_id
            {WHERE}
            ORDER BY r.full_name
            LIMIT :limit OFFSET :offset
        """).bindparams(bindparam("codes", expanding=True)),
            p,
        )
    ).mappings().all()

    total = (
        await db.execute(
            text(f"SELECT count(*) FROM resident r {WHERE}").bindparams(
                bindparam("codes", expanding=True)
            ),
            p,
        )
    ).scalar_one()
    return {"tong_so": total, "limit": limit, "offset": offset, "items": [dict(r) for r in rows]}


@router.get("/thong-ke", dependencies=[Depends(require("resident:read"))])
async def thong_ke(db: AsyncSession = Depends(get_db)) -> dict:
    """Số liệu tổng hợp cho bảng điều khiển."""
    tong = (
        await db.execute(
            text("""
            SELECT count(*) AS tong,
                   count(*) FILTER (WHERE gender='nam')  AS nam,
                   count(*) FILTER (WHERE gender='nu')   AS nu,
                   count(*) FILTER (WHERE residence_status='thuong_tru') AS thuong_tru,
                   count(*) FILTER (WHERE residence_status='tam_tru')    AS tam_tru,
                   count(*) FILTER (WHERE dob IS NOT NULL AND age(dob) < interval '16 years')  AS tre_em,
                   count(*) FILTER (WHERE dob IS NOT NULL AND age(dob) >= interval '60 years') AS nct,
                   count(*) FILTER (WHERE phone IS NOT NULL AND phone <> '') AS co_dien_thoai
            FROM resident WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()

    theo_to = (
        await db.execute(
            text("""
            SELECT g.name, count(r.id) AS so_nguoi
            FROM neighborhood_group g
            LEFT JOIN resident r ON r.group_id = g.id AND r.deleted_at IS NULL
            WHERE g.deleted_at IS NULL GROUP BY g.id, g.name, g.sort_order
            ORDER BY g.sort_order, g.name
        """)
        )
    ).mappings().all()

    theo_pl = (
        await db.execute(
            text("""
            SELECT c.code, c.name, c.color, count(rc.resident_id) AS so_nguoi
            FROM classification c
            LEFT JOIN resident_classification rc ON rc.classification_id = c.id
            LEFT JOIN resident r ON r.id = rc.resident_id AND r.deleted_at IS NULL
            WHERE c.is_active
            GROUP BY c.id, c.code, c.name, c.color, c.sort_order
            HAVING count(rc.resident_id) > 0
            ORDER BY c.sort_order
        """)
        )
    ).mappings().all()

    ho = (
        await db.execute(
            text("""
            SELECT count(*) AS tong_ho,
                   count(*) FILTER (WHERE geo_status='verified') AS da_kiem_chung,
                   count(*) FILTER (WHERE geo_status='auto')     AS so_bo,
                   count(*) FILTER (WHERE geom IS NULL)          AS chua_dinh_vi
            FROM household WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()

    return {
        "cu_dan": dict(tong),
        "ho_khau": dict(ho),
        "theo_to": [dict(r) for r in theo_to],
        "theo_phan_loai": [dict(r) for r in theo_pl],
    }


@router.get("/{rid}", dependencies=[Depends(require("resident:read"))])
async def chi_tiet(
    rid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            text("""
            SELECT r.id::text, r.full_name, r.dob, r.gender, r.residence_status,
                   r.phone, r.email, r.occupation, r.education_level, r.note,
                   r.is_head, r.relation_to_head, r.id_card_last4,
                   r.household_id::text, r.group_id::text,
                   r.dia_chi_khai, r.ten_chu_ho_khai,
                   r.tam_tru_tu_ngay, r.tam_tru_den_ngay,
                   CASE WHEN r.tam_tru_den_ngay IS NOT NULL
                        THEN (r.tam_tru_den_ngay - CURRENT_DATE) END AS con_ngay_tam_tru,
                   g.name AS to_dan_pho, h.code AS ma_ho, COALESCE(h.address, r.dia_chi_khai) AS dia_chi,
                   r.created_at, r.updated_at
            FROM resident r
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            LEFT JOIN household h ON h.id = r.household_id
            WHERE r.id = CAST(:id AS uuid) AND r.deleted_at IS NULL
        """),
            {"id": rid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cư dân")

    out = dict(row)

    # Số CCCD đầy đủ: cần quyền riêng, và MỌI lần xem đều ghi nhật ký (PHẦN G.4)
    if user.can("resident:read_pii"):
        full = (
            await db.execute(
                text("""SELECT pgp_sym_decrypt(id_card_enc, :k) FROM resident
                        WHERE id = CAST(:id AS uuid) AND id_card_enc IS NOT NULL"""),
                {"id": rid, "k": settings.secret_key},
            )
        ).scalar_one_or_none()
        out["id_card"] = full
        if full:
            await ghi_audit(db, user, request, action="view_pii", etype="resident", eid=rid,
                            changes='{"field":"id_card"}')
            await db.commit()

    out["phan_loai"] = [
        dict(r)
        for r in (
            await db.execute(
                text("""SELECT c.code, c.name, c.color, rc.valid_from, rc.note
                        FROM resident_classification rc
                        JOIN classification c ON c.id = rc.classification_id
                        WHERE rc.resident_id = CAST(:id AS uuid) ORDER BY c.sort_order"""),
                {"id": rid},
            )
        ).mappings().all()
    ]
    if row["household_id"]:
        out["thanh_vien_ho"] = [
            dict(r)
            for r in (
                await db.execute(
                    text("""SELECT id::text, full_name, relation_to_head, dob, gender, is_head
                            FROM resident WHERE household_id = CAST(:h AS uuid)
                              AND deleted_at IS NULL ORDER BY is_head DESC, dob"""),
                    {"h": row["household_id"]},
                )
            ).mappings().all()
        ]
    return out


@router.post("", status_code=201)
async def tao_moi(
    body: CuDanIn,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cc = cccd_fields(body.id_card)

    # Chặn trùng CCCD trong cùng khu phố
    if cc["hash"]:
        trung = (
            await db.execute(
                text("""SELECT full_name FROM resident
                        WHERE id_card_hash = encode(digest(:h, 'sha256'), 'hex')
                          AND deleted_at IS NULL LIMIT 1"""),
                {"h": cc["hash"]},
            )
        ).scalar_one_or_none()
        if trung:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Số CCCD này đã có trong hệ thống: {trung}"
            )

    rid = (
        await db.execute(
            text("""
            INSERT INTO resident (
                household_id, group_id, full_name, dob, gender,
                id_card_enc, id_card_last4, id_card_hash,
                relation_to_head, residence_status, phone, email, occupation,
                education_level, note, is_head, ethnicity, religion,
                party_join_date, party_position, dia_chi_khai, ten_chu_ho_khai,
                tam_tru_tu_ngay, tam_tru_den_ngay,
                created_by, updated_by)
            VALUES (
                CAST(:hh AS uuid), CAST(:gid AS uuid), :name, :dob, :gender,
                CASE WHEN CAST(:cc AS text) IS NULL THEN NULL
                     ELSE pgp_sym_encrypt(CAST(:cc AS text), :k) END,
                :last4,
                CASE WHEN CAST(:cc AS text) IS NULL THEN NULL
                     ELSE encode(digest(CAST(:cc AS text), 'sha256'), 'hex') END,
                :rel, :st, :phone, :email, :occ, :edu, :note, :head, :eth, :rel_gion,
                :pjd, :ppos, :dck, :tchk, :ttu, :tden,
                CAST(:uid AS uuid), CAST(:uid AS uuid))
            RETURNING id::text
        """),
            {
                "ttu": body.tam_tru_tu_ngay, "tden": body.tam_tru_den_ngay,
                "hh": body.household_id, "gid": body.group_id, "name": body.full_name.strip(),
                "dob": body.dob, "gender": body.gender, "cc": cc["hash"], "last4": cc["last4"],
                "k": settings.secret_key, "rel": body.relation_to_head,
                "st": body.residence_status, "phone": body.phone, "email": body.email,
                "occ": body.occupation, "edu": body.education_level, "note": body.note,
                "head": body.is_head, "eth": body.ethnicity, "rel_gion": body.religion,
                "pjd": body.party_join_date, "ppos": body.party_position,
                "dck": body.dia_chi_khai, "tchk": body.ten_chu_ho_khai, "uid": user.id,
            },
        )
    ).scalar_one()

    if body.classifications:
        n_pl = (
            await db.execute(
                text("""
                INSERT INTO resident_classification (resident_id, classification_id)
                SELECT CAST(:r AS uuid), c.id
                FROM classification c
                WHERE c.code IN :codes
                ON CONFLICT DO NOTHING
                """).bindparams(bindparam("codes", expanding=True)),
                {"r": rid, "codes": body.classifications},
            )
        ).rowcount
        if n_pl != len(body.classifications):
            log.warning("resident.classification_partial",
                        yeu_cau=body.classifications, gan_duoc=n_pl)

    if body.is_head and body.household_id:
        await db.execute(
            text("UPDATE household SET head_resident_id = CAST(:r AS uuid) WHERE id = CAST(:h AS uuid)"),
            {"r": rid, "h": body.household_id},
        )

    await ghi_audit(db, user, request, action="create", etype="resident", eid=rid)
    await db.commit()
    log.info("resident.created", id=rid, kp=user.slug)
    return {"id": rid, "full_name": body.full_name}


@router.delete("/{rid}")
async def xoa(
    rid: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:delete")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = (
        await db.execute(
            text("""UPDATE resident SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL RETURNING id"""),
            {"id": rid, "u": user.id},
        )
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cư dân")
    await ghi_audit(db, user, request, action="delete", etype="resident", eid=rid)
    await db.commit()
    return {"success": True}


class XoaHangLoat(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)
    ly_do: str | None = Field(default=None, max_length=300)


@router.post("/xoa-hang-loat")
async def xoa_hang_loat(
    body: XoaHangLoat,
    request: Request,
    user: CurrentUser = Depends(require("resident:delete")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Xoá nhiều nhân khẩu cùng lúc — tick chọn trên bảng rồi xoá.

    CHỈ vai trò có quyền `resident:delete` (Ban điều hành, Quản trị hệ thống) làm
    được. Xoá MỀM: đặt `deleted_at`, dữ liệu vẫn nằm trong cơ sở dữ liệu và khôi
    phục được — xoá hàng loạt mà mất luôn thì lỡ tay một cái là mất hàng trăm hồ sơ.

    Ghi nhật ký TỪNG người, không phải một dòng gộp: sau này cần biết ai đã xoá ai
    thì tra được đến từng hồ sơ.

    Người đang là CHỦ HỘ thì không xoá kèm ở đây — xoá chủ hộ mà bỏ lại vợ con
    trong hộ không có ai đứng tên là sai nghiệp vụ. Trả về danh sách đó để cán bộ
    xử lý hộ trước.
    """
    # Chủ hộ: chặn lại, báo riêng
    chu_ho = [
        r[0]
        for r in (
            await db.execute(
                text("""SELECT r.id::text FROM resident r
                        JOIN household h ON h.head_resident_id = r.id
                        WHERE r.id = ANY(:ids) AND r.deleted_at IS NULL"""),
                {"ids": body.ids},
            )
        ).all()
    ]
    duoc_xoa = [i for i in body.ids if i not in set(chu_ho)]

    rows = (
        await db.execute(
            text("""UPDATE resident SET deleted_at = now(), updated_by = CAST(:u AS uuid)
                    WHERE id = ANY(:ids) AND deleted_at IS NULL
                    RETURNING id::text, full_name"""),
            {"ids": duoc_xoa, "u": user.id},
        )
    ).all()

    for rid, ten in rows:
        await ghi_audit(
            db, user, request, action="delete", etype="resident", eid=rid,
            changes=json.dumps(
                {"full_name": ten, "hang_loat": True, "ly_do": body.ly_do},
                ensure_ascii=False,
            ),
        )
    await db.commit()
    log.warning("resident.xoa_hang_loat", so=len(rows), boi=user.id)
    return {
        "success": True,
        "da_xoa": len(rows),
        "bo_qua_chu_ho": len(chu_ho),
        "loi_nhan": (
            f"Đã xoá {len(rows)} nhân khẩu."
            + (f" {len(chu_ho)} người là chủ hộ nên chưa xoá — xử lý hộ của họ trước."
               if chu_ho else "")
        ),
    }


@router.get("/danh-muc/phan-loai", dependencies=[Depends(require("resident:read"))])
async def danh_muc_phan_loai(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (
        await db.execute(
            text("""SELECT code, name, khoi, color, is_sensitive
                    FROM classification
                    WHERE is_active
                    ORDER BY sort_order"""),
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# GÁN / GỠ MỘT NHÓM ĐOÀN THỂ
#
# Màn hình Chi bộ, Đoàn thể… thêm người bằng cách tra tên trong danh sách nhân
# khẩu rồi gán vào nhóm đang xem. Không dùng `PATCH /cu-dan/{id}` cho việc này:
# ở đó `classifications` là danh sách ĐẦY ĐỦ, gửi lên một mã là xoá sạch các
# nhóm khác của người ta — đảng viên kiêm tổ trưởng sẽ mất mất diện tổ trưởng.
#
# Hai endpoint dưới đây chỉ đụng đúng một dòng của đúng một nhóm.
# ─────────────────────────────────────────────────────────────────────────────


async def _tim_nhom(db: AsyncSession, code: str) -> dict:
    r = (
        await db.execute(
            text("""SELECT id::text, name, is_sensitive FROM classification
                    WHERE code = :c AND is_active"""),
            {"c": code},
        )
    ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Không có nhóm '{code}'")
    return dict(r)


@router.post("/{rid}/phan-loai/{code}", status_code=201)
async def gan_nhom(
    rid: str,
    code: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Gán một nhân khẩu vào một nhóm đoàn thể / diện chính sách."""
    nhom = await _tim_nhom(db, code)
    ten = (
        await db.execute(
            text("SELECT full_name FROM resident WHERE id = CAST(:r AS uuid) AND deleted_at IS NULL"),
            {"r": rid},
        )
    ).scalar()
    if not ten:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhân khẩu")

    them = (
        await db.execute(
            text("""INSERT INTO resident_classification (resident_id, classification_id)
                    VALUES (CAST(:r AS uuid), CAST(:c AS uuid))
                    ON CONFLICT DO NOTHING
                    RETURNING resident_id"""),
            {"r": rid, "c": nhom["id"]},
        )
    ).first()
    if them is None:
        # Đã ở trong nhóm rồi — không phải lỗi, nói cho người dùng biết là đủ
        return {"success": True, "da_co": True, "full_name": ten, "nhom": nhom["name"]}

    await ghi_audit(
        db, user, request, action="update", etype="resident", eid=rid,
        changes=json.dumps({"gan_nhom": code}, ensure_ascii=False),
    )
    await db.commit()
    log.info("resident.classified", id=rid, nhom=code)
    return {"success": True, "da_co": False, "full_name": ten, "nhom": nhom["name"]}


@router.delete("/{rid}/phan-loai/{code}")
async def go_nhom(
    rid: str,
    code: str,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Gỡ một nhân khẩu khỏi một nhóm — hồ sơ nhân khẩu vẫn còn nguyên."""
    nhom = await _tim_nhom(db, code)
    await db.execute(
        text("""DELETE FROM resident_classification
                WHERE resident_id = CAST(:r AS uuid) AND classification_id = CAST(:c AS uuid)"""),
        {"r": rid, "c": nhom["id"]},
    )
    await ghi_audit(
        db, user, request, action="update", etype="resident", eid=rid,
        changes=json.dumps({"go_nhom": code}, ensure_ascii=False),
    )
    await db.commit()
    log.info("resident.unclassified", id=rid, nhom=code)
    return {"success": True}


class CuDanSua(BaseModel):
    """Chỉ trường nào gửi lên mới bị đổi — không gửi thì giữ nguyên."""
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    dob: date | None = None
    gender: str | None = Field(default=None, pattern="^(nam|nu|khac)$")
    id_card: str | None = Field(default=None, max_length=20)
    household_id: str | None = None
    group_id: str | None = None
    relation_to_head: str | None = None
    residence_status: str | None = Field(
        default=None, pattern="^(thuong_tru|tam_tru|tam_vang|vang_lai)$"
    )
    phone: str | None = None
    email: str | None = None
    occupation: str | None = None
    education_level: str | None = None
    tam_tru_tu_ngay: date | None = None
    tam_tru_den_ngay: date | None = None
    note: str | None = None
    is_head: bool | None = None
    classifications: list[str] | None = None
    # Địa chỉ và tên chủ hộ KHAI lúc nhập liệu, dùng để gom thành hộ về sau.
    # Sau khi đã gán vào hộ thì địa chỉ chính thức là địa chỉ của hộ.
    dia_chi_khai: str | None = Field(default=None, max_length=300)
    ten_chu_ho_khai: str | None = Field(default=None, max_length=120)
    # Gỡ nhân khẩu ra khỏi hộ. Cần cờ riêng vì `household_id = null` nghĩa là
    # "không đổi" chứ không phải "xoá" — id không có khái niệm chuỗi rỗng.
    go_khoi_ho: bool = False

@router.patch("/{rid}")
async def cap_nhat(
    rid: str,
    body: CuDanSua,
    request: Request,
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cu = (
        await db.execute(
            text("SELECT full_name FROM resident WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"),
            {"i": rid},
        )
    ).scalar_one_or_none()
    if not cu:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cư dân")
    cc = cccd_fields(body.id_card)
    if cc["hash"]:
        trung = (
            await db.execute(
                text("""SELECT full_name FROM resident
                        WHERE id_card_hash = encode(digest(:h,'sha256'),'hex')
                          AND id <> CAST(:i AS uuid) AND deleted_at IS NULL LIMIT 1"""),
                {"h": cc["hash"], "i": rid},
            )
        ).scalar_one_or_none()
        if trung:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Số CCCD này đã thuộc về: {trung}"
            )
    await db.execute(
        text("""
        UPDATE resident SET
            full_name        = COALESCE(:name, full_name),
            dob              = COALESCE(CAST(:dob AS date), dob),
            gender           = COALESCE(:gender, gender),
            household_id     = CASE WHEN COALESCE(CAST(:go AS boolean), false) THEN NULL
                                    ELSE COALESCE(CAST(:hh AS uuid), household_id) END,
            group_id         = COALESCE(CAST(:gid AS uuid), group_id),
            relation_to_head = CASE WHEN CAST(:rel AS text) IS NULL THEN relation_to_head
                                    ELSE NULLIF(CAST(:rel AS text), '') END,
            residence_status = COALESCE(:st, residence_status),
            phone            = CASE WHEN CAST(:phone AS text) IS NULL THEN phone
                                    ELSE NULLIF(CAST(:phone AS text), '') END,
            email            = CASE WHEN CAST(:email AS text) IS NULL THEN email
                                    ELSE NULLIF(CAST(:email AS text), '') END,
            occupation       = CASE WHEN CAST(:occ AS text) IS NULL THEN occupation
                                    ELSE NULLIF(CAST(:occ AS text), '') END,
            education_level  = COALESCE(:edu, education_level),
            note             = CASE WHEN CAST(:note AS text) IS NULL THEN note
                                    ELSE NULLIF(CAST(:note AS text), '') END,
            dia_chi_khai     = CASE WHEN CAST(:dck AS text) IS NULL THEN dia_chi_khai
                                    ELSE NULLIF(CAST(:dck AS text), '') END,
            ten_chu_ho_khai  = CASE WHEN CAST(:tchk AS text) IS NULL THEN ten_chu_ho_khai
                                    ELSE NULLIF(CAST(:tchk AS text), '') END,
            is_head          = CASE WHEN COALESCE(CAST(:go AS boolean), false) THEN false
                                    ELSE COALESCE(CAST(:head AS boolean), is_head) END,
            tam_tru_tu_ngay  = COALESCE(CAST(:ttu AS date), tam_tru_tu_ngay),
            tam_tru_den_ngay = COALESCE(CAST(:tden AS date), tam_tru_den_ngay),
            id_card_enc      = CASE WHEN CAST(:cc AS text) IS NULL THEN id_card_enc
                                    ELSE pgp_sym_encrypt(CAST(:cc AS text), :k) END,
            id_card_last4    = COALESCE(:last4, id_card_last4),
            id_card_hash     = CASE WHEN CAST(:cc AS text) IS NULL THEN id_card_hash
                                    ELSE encode(digest(CAST(:cc AS text),'sha256'),'hex') END,
            updated_by       = CAST(:u AS uuid)
        WHERE id = CAST(:i AS uuid)
    """),
        {
            "name": body.full_name, "dob": body.dob, "gender": body.gender,
            "hh": body.household_id, "gid": body.group_id, "rel": body.relation_to_head,
            "st": body.residence_status, "phone": body.phone, "email": body.email,
            "ttu": body.tam_tru_tu_ngay, "tden": body.tam_tru_den_ngay,
            "occ": body.occupation, "edu": body.education_level, "note": body.note,
            "head": body.is_head, "cc": cc["hash"], "last4": cc["last4"],
            "k": settings.secret_key, "u": user.id, "i": rid,
         "dck": body.dia_chi_khai, "tchk": body.ten_chu_ho_khai,
         "go": body.go_khoi_ho},
    )
    # Danh sách phân loại gửi lên là bản thay thế toàn bộ, không phải bổ sung
    if body.classifications is not None:
        await db.execute(
            text("DELETE FROM resident_classification WHERE resident_id = CAST(:r AS uuid)"),
            {"r": rid},
        )
        if body.classifications:
            await db.execute(
                text("""
                INSERT INTO resident_classification (resident_id, classification_id)
                SELECT CAST(:r AS uuid), c.id
                FROM classification c
                WHERE c.code IN :codes
                ON CONFLICT DO NOTHING
                """).bindparams(bindparam("codes", expanding=True)),
                {"r": rid, "codes": body.classifications},
            )
    await ghi_audit(db, user, request, action="update", etype="resident", eid=rid)
    await db.commit()
    log.info("resident.updated", id=rid)
    return {"success": True, "id": rid}
