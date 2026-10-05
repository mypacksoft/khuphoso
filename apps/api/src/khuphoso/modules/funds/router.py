"""Sổ quỹ của khu phố.

Đây là quỹ **của khu phố**, hoàn toàn tách khỏi Quỹ 1 (quỹ phát triển nền tảng
ở `platform_ledger`, công khai tại minhbach.khuphoso.vn). Mọi truy vấn ở đây đi qua
RLS nên khu phố này không thể thấy sổ quỹ của khu phố khác.
"""

from datetime import date

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
router = APIRouter(prefix="/quy", tags=["sổ quỹ khu phố"], dependencies=[Depends(yeu_cau_goi("quy"))])


class QuyIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    fund_type: str = Field(default="hoat_dong")
    description: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    bank_holder: str | None = None


class QuyCapNhat(BaseModel):
    is_public: bool | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None


class DotThuIn(BaseModel):
    fund_id: str
    name: str = Field(min_length=2, max_length=120)
    period: str | None = None
    per_household_amount: int | None = Field(default=None, ge=0)
    start_date: date | None = None
    end_date: date | None = None


class PhieuThuIn(BaseModel):
    fund_id: str
    campaign_id: str | None = None
    household_id: str | None = None
    payer_name: str | None = None
    amount: int = Field(ge=0)
    method: str = Field(default="tien_mat", pattern="^(tien_mat|chuyen_khoan|vietqr)$")
    status: str = Field(default="da_dong", pattern="^(chua_dong|da_dong|mien_giam)$")
    exempt_reason: str | None = None
    receipt_number: str | None = None
    note: str | None = None


class PhieuChiIn(BaseModel):
    fund_id: str
    amount: int = Field(gt=0)
    description: str = Field(min_length=3, max_length=300)
    category: str | None = None
    payee: str | None = None
    voucher_number: str | None = None
    approved_by: str | None = None
    note: str | None = None


@router.get("", dependencies=[Depends(require("fund:read"))])
async def danh_sach_quy(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Các quỹ của khu phố kèm số dư tính từ phiếu thu/chi."""
    rows = (
        await db.execute(
            text("""
            SELECT f.id::text, f.code, f.name, f.fund_type, f.description,
                   f.bank_name, f.bank_account, f.bank_holder, f.opening_balance,
                   f.is_public,
                   COALESCE(thu.tong, 0)  AS tong_thu,
                   COALESCE(chi.tong, 0)  AS tong_chi,
                   f.opening_balance + COALESCE(thu.tong,0) - COALESCE(chi.tong,0) AS so_du,
                   COALESCE(thu.so_phieu, 0) AS so_phieu_thu,
                   COALESCE(chi.so_phieu, 0) AS so_phieu_chi
            FROM fund f
            LEFT JOIN (
                SELECT fund_id, sum(amount) AS tong, count(*) AS so_phieu
                FROM fund_receipt WHERE status = 'da_dong' GROUP BY fund_id
            ) thu ON thu.fund_id = f.id
            LEFT JOIN (
                SELECT fund_id, sum(amount) AS tong, count(*) AS so_phieu
                FROM fund_expense GROUP BY fund_id
            ) chi ON chi.fund_id = f.id
            WHERE f.deleted_at IS NULL AND f.is_active
            ORDER BY f.sort_order, f.name
        """)
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/tong-quan", dependencies=[Depends(require("fund:read"))])
async def tong_quan(db: AsyncSession = Depends(get_db)) -> dict:
    r = (
        await db.execute(
            text("""
            SELECT
              (SELECT COALESCE(sum(amount),0) FROM fund_receipt WHERE status='da_dong') AS tong_thu,
              (SELECT COALESCE(sum(amount),0) FROM fund_expense)                        AS tong_chi,
              (SELECT COALESCE(sum(opening_balance),0) FROM fund WHERE deleted_at IS NULL) AS dau_ky,
              (SELECT count(*) FROM fund WHERE deleted_at IS NULL AND is_active)        AS so_quy,
              (SELECT COALESCE(sum(amount),0) FROM fund_receipt
                WHERE status='da_dong' AND paid_at >= date_trunc('month', now()))       AS thu_thang_nay,
              (SELECT COALESCE(sum(amount),0) FROM fund_expense
                WHERE paid_at >= date_trunc('month', now()))                            AS chi_thang_nay
        """)
        )
    ).mappings().one()
    d = dict(r)
    d["so_du"] = float(d["dau_ky"]) + float(d["tong_thu"]) - float(d["tong_chi"])
    return d


@router.post("", status_code=201)
async def tao_quy(
    body: QuyIn,
    request: Request,
    user: CurrentUser = Depends(require("fund:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        fid = (
            await db.execute(
                text("""
                INSERT INTO fund (code, name, fund_type, description,
                                  bank_name, bank_account, bank_holder, created_by)
                VALUES (:c, :n, :t, :d, :bn, :ba, :bh, CAST(:u AS uuid))
                RETURNING id::text
            """),
                {"c": body.code, "n": body.name, "t": body.fund_type, "d": body.description,
                 "bn": body.bank_name, "ba": body.bank_account, "bh": body.bank_holder,
                 "u": user.id},
            )
        ).scalar_one()
    except Exception as exc:  # noqa: BLE001
        if "unique" in str(exc).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, f"Mã quỹ '{body.code}' đã có") from None
        raise
    await ghi_audit(db, user, request, action="create", etype="fund", eid=fid)
    await db.commit()
    return {"id": fid, "code": body.code, "name": body.name}


@router.patch("/{fid}")
async def cap_nhat_quy(
    fid: str,
    body: QuyCapNhat,
    request: Request,
    user: CurrentUser = Depends(require("fund:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cập nhật quỹ — hiện dùng để bật/tắt CÔNG KHAI cho cư dân xem trên cổng thông tin."""
    row = (
        await db.execute(
            text("""
            UPDATE fund SET
                is_public   = COALESCE(CAST(:pub AS boolean), is_public),
                name        = COALESCE(:n, name),
                description = COALESCE(:d, description)
            WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
            RETURNING id::text, is_public
        """),
            {"pub": body.is_public, "n": body.name, "d": body.description, "id": fid},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy quỹ")
    await ghi_audit(
        db, user, request, action="update", etype="fund", eid=fid,
        changes=f'{{"is_public": {str(row["is_public"]).lower()}}}',
    )
    await db.commit()
    return dict(row)


@router.get("/dot-thu", dependencies=[Depends(require("fund:read"))])
async def danh_sach_dot_thu(
    fund_id: str | None = None, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    rows = (
        await db.execute(
            text("""
            SELECT c.id::text, c.fund_id::text, f.name AS ten_quy, c.name, c.period,
                   c.per_household_amount, c.target_amount, c.status,
                   c.start_date, c.end_date,
                   COALESCE(r.da_thu, 0)   AS da_thu,
                   COALESCE(r.so_ho_dong, 0) AS so_ho_dong,
                   (SELECT count(*) FROM household h
                     WHERE h.deleted_at IS NULL)                    AS tong_so_ho
            FROM fund_campaign c
            JOIN fund f ON f.id = c.fund_id
            LEFT JOIN (
                SELECT campaign_id, sum(amount) AS da_thu,
                       count(DISTINCT household_id) AS so_ho_dong
                FROM fund_receipt WHERE status = 'da_dong' GROUP BY campaign_id
            ) r ON r.campaign_id = c.id
            WHERE c.deleted_at IS NULL
              AND (CAST(:f AS uuid) IS NULL OR c.fund_id = CAST(:f AS uuid))
            ORDER BY c.start_date DESC NULLS LAST, c.name
        """),
            {"f": fund_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/dot-thu", status_code=201)
async def tao_dot_thu(
    body: DotThuIn,
    request: Request,
    user: CurrentUser = Depends(require("fund:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cid = (
        await db.execute(
            text("""
            INSERT INTO fund_campaign (fund_id, name, period,
                                       per_household_amount, start_date, end_date, created_by)
            VALUES (CAST(:f AS uuid), :n, :p, :m, :s, :e, CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"f": body.fund_id, "n": body.name, "p": body.period,
             "m": body.per_household_amount, "s": body.start_date, "e": body.end_date,
             "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="fund_campaign", eid=cid)
    await db.commit()
    return {"id": cid, "name": body.name}


@router.get("/dot-thu/{cid}/theo-ho", dependencies=[Depends(require("fund:read"))])
async def theo_ho(cid: str, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Danh sách hộ và tình trạng đóng của một đợt thu — ai đã đóng, ai chưa."""
    rows = (
        await db.execute(
            text("""
            SELECT h.id::text AS household_id, h.code AS ma_ho, h.address,
                   c.full_name AS chu_ho,
                   (SELECT count(*) FROM resident r
                     WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nhan_khau,
                   r.id::text AS receipt_id, r.amount, r.status, r.paid_at,
                   r.method, r.exempt_reason
            FROM household h
            LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
            LEFT JOIN fund_receipt r
                   ON r.household_id = h.id AND r.campaign_id = CAST(:c AS uuid)
            WHERE h.deleted_at IS NULL
            ORDER BY h.code
        """),
            {"c": cid},
        )
    ).mappings().all()
    return [
        {**dict(r), "status": r["status"] or "chua_dong", "amount": float(r["amount"] or 0)}
        for r in rows
    ]


@router.post("/phieu-thu", status_code=201)
async def ghi_thu(
    body: PhieuThuIn,
    request: Request,
    user: CurrentUser = Depends(require("fund:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rid = (
        await db.execute(
            text("""
            INSERT INTO fund_receipt (fund_id, campaign_id, household_id,
                                      payer_name, amount, method, status, exempt_reason,
                                      receipt_number, paid_at, collected_by, note, created_by)
            VALUES (CAST(:f AS uuid), CAST(:c AS uuid), CAST(:h AS uuid),
                    :pn, :a, :m, :st, :er, :rn,
                    CASE WHEN CAST(:st AS text) = 'da_dong' THEN now() END,
                    :cb, :nt, CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"f": body.fund_id, "c": body.campaign_id, "h": body.household_id,
             "pn": body.payer_name, "a": body.amount, "m": body.method, "st": body.status,
             "er": body.exempt_reason, "rn": body.receipt_number,
             "cb": user.id, "nt": body.note, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="fund_receipt", eid=rid)
    await db.commit()
    log.info("fund.receipt", id=rid, amount=body.amount)
    return {"id": rid}


@router.post("/phieu-chi", status_code=201)
async def ghi_chi(
    body: PhieuChiIn,
    request: Request,
    user: CurrentUser = Depends(require("fund:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    eid = (
        await db.execute(
            text("""
            INSERT INTO fund_expense (fund_id, amount, category, description,
                                      payee, voucher_number, approved_by, approved_at,
                                      note, created_by)
            VALUES (CAST(:f AS uuid), :a, :ct, :d, :p, :v, CAST(:ab AS text),
                    -- CAST bắt buộc: `:ab IS NOT NULL` không cho asyncpg suy ra kiểu
                    -- của tham số, máy chủ trả AmbiguousParameterError
                    CASE WHEN CAST(:ab AS text) IS NOT NULL THEN now() END,
                    :nt, CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"f": body.fund_id, "a": body.amount, "ct": body.category, "d": body.description,
             "p": body.payee, "v": body.voucher_number, "ab": body.approved_by,
             "nt": body.note, "u": user.id},
        )
    ).scalar_one()
    await ghi_audit(db, user, request, action="create", etype="fund_expense", eid=eid)
    await db.commit()
    log.info("fund.expense", id=eid, amount=body.amount)
    return {"id": eid}


@router.get("/so-cai", dependencies=[Depends(require("fund:read"))])
async def so_cai(
    fund_id: str | None = None,
    limit: int = Query(default=100, le=300),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Sổ cái gộp thu và chi của khu phố, mới nhất trước."""
    rows = (
        await db.execute(
            text("""
            SELECT * FROM (
                SELECT r.id::text, 'thu' AS loai, r.amount, f.name AS ten_quy,
                       COALESCE(r.payer_name, h.code, 'Không rõ') AS doi_tac,
                       COALESCE(c.name, 'Thu lẻ') AS noi_dung,
                       r.method AS hinh_thuc, r.paid_at AS thoi_gian
                FROM fund_receipt r
                JOIN fund f ON f.id = r.fund_id
                LEFT JOIN household h ON h.id = r.household_id
                LEFT JOIN fund_campaign c ON c.id = r.campaign_id
                WHERE r.status = 'da_dong'
                  AND (CAST(:f AS uuid) IS NULL OR r.fund_id = CAST(:f AS uuid))
                UNION ALL
                SELECT e.id::text, 'chi', e.amount, f.name,
                       COALESCE(e.payee, '—'), e.description,
                       COALESCE(e.category, '—'), e.paid_at
                FROM fund_expense e
                JOIN fund f ON f.id = e.fund_id
                WHERE (CAST(:f AS uuid) IS NULL OR e.fund_id = CAST(:f AS uuid))
            ) x
            ORDER BY thoi_gian DESC NULLS LAST
            LIMIT :l
        """),
            {"f": fund_id, "l": limit},
        )
    ).mappings().all()
    return [{**dict(r), "amount": float(r["amount"])} for r in rows]
