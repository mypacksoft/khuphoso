"""Chuyển nhân khẩu, hộ khẩu sang khu phố khác.

Bà con chuyển từ khu phố 3 sang khu phố 5 thì bên nhận không phải gõ lại từ đầu:
khu phố 3 gửi hồ sơ đi, khu phố 5 bấm "Tiếp nhận" là xong.

BÊN NHẬN PHẢI BẤM NHẬN. Không tự đẩy hồ sơ vào sổ người khác — chuyển hộ khẩu là
việc hành chính có hai đầu, bên kia phải biết và đồng ý. Cũng nhờ vậy mà không ai
nhét được dữ liệu rác vào khu phố khác.

NGUỒN CHỈ XOÁ SAU KHI BÊN KIA ĐÃ NHẬN. Xoá trước rồi bên kia từ chối là mất người
giữa đường. Thà trùng một lúc còn hơn mất — mà thực tế không trùng, vì bản nguồn
chỉ được gỡ đúng lúc bản đích đã ghi xong.

CCCD ĐI Ở DẠNG ĐÃ MÃ HOÁ, không bao giờ giải ra khi nằm ở database dùng chung.
"""

import json
from datetime import date, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.database import PlatformSession, session_khu_pho
from khuphoso.core.deps import (
    CurrentUser,
    KhuPho,
    current_user,
    get_db,
    ghi_audit,
    require,
    resolve_khu_pho,
)

log = structlog.get_logger()
router = APIRouter(prefix="/chuyen-khu-pho", tags=["chuyển khu phố"])

TRANG_THAI = {
    "cho_tiep_nhan": "Chờ tiếp nhận",
    "da_tiep_nhan": "Đã tiếp nhận",
    "tu_choi": "Bên nhận từ chối",
    "da_huy": "Đã huỷ",
    "qua_han": "Quá hạn, tự huỷ",
}

# Những cột của `resident` đi theo hồ sơ. Liệt kê tường minh chứ không SELECT *:
# thêm cột mới vào `resident` mà quên nghĩ thì nó không tự lọt sang database khác.
COT_NHAN_KHAU = [
    "full_name", "dob", "gender", "id_card_last4", "id_card_hash",
    "relation_to_head", "residence_status", "phone", "email", "occupation",
    "ethnicity", "religion", "education_level", "note",
    "party_join_date", "party_official_date", "party_position", "party_status",
    "org_join_date", "org_position", "org_status",
    "dia_chi_khai", "ten_chu_ho_khai", "tam_tru_tu_ngay", "tam_tru_den_ngay",
]

COT_HO = [
    "code", "address", "phone", "household_type", "residence_type", "note",
]

# Ảnh chụp cất ngày tháng dưới dạng chuỗi ISO, vì JSON không có kiểu ngày. Lúc
# ghi trở lại phải đổi về đúng kiểu `date`.
#
# Ép kiểu trong SQL (`CAST(:dob AS date)`) KHÔNG cứu được: Postgres nhìn câu lệnh
# rồi suy luôn tham số đó là kiểu date, nên trình điều khiển vẫn đòi một đối
# tượng ngày chứ không nhận chuỗi. Đổi ở Python vừa gọn vừa đúng bản chất.
#
# Liệt kê ra đây để thêm cột ngày mới thì không quên.
COT_NGAY = {
    "dob", "party_join_date", "party_official_date", "org_join_date",
    "tam_tru_tu_ngay", "tam_tru_den_ngay",
}


def _mo(gia_tri, cot: str):
    """Ngược của `_goi`: chuỗi ISO trở lại thành `date` cho đúng kiểu cột."""
    if cot in COT_NGAY and isinstance(gia_tri, str) and gia_tri:
        try:
            return date.fromisoformat(gia_tri[:10])
        except ValueError:
            return None
    return gia_tri


def _goi(v):
    """Đưa giá trị về dạng JSON cất được. `date` phải thành chuỗi."""
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        # `id_card_enc` là bytea — giữ nguyên khối mã hoá, KHÔNG giải ra
        return bytes(v).hex()
    return v


async def _chup_nhan_khau(db: AsyncSession, rid: str) -> dict | None:
    cot = ", ".join(f"r.{c}" for c in COT_NHAN_KHAU)
    r = (
        await db.execute(
            text(f"""
            SELECT {cot}, r.id_card_enc,
                   (SELECT array_agg(k.code) FROM resident_classification rc
                     JOIN classification k ON k.id = rc.classification_id
                    WHERE rc.resident_id = r.id) AS phan_loai
            FROM resident r
            WHERE r.id = CAST(:i AS uuid) AND r.deleted_at IS NULL
        """),
            {"i": rid},
        )
    ).mappings().first()
    return {k: _goi(v) for k, v in dict(r).items()} if r else None


@router.get("/khu-pho-nhan", dependencies=[Depends(require("resident:read"))])
async def khu_pho_nhan(kp: KhuPho | None = Depends(resolve_khu_pho)) -> list[dict]:
    """Các khu phố khác đang dùng KhuPhoSo — nơi có thể chuyển hồ sơ tới."""
    async with PlatformSession() as db:
        rows = (
            await db.execute(
                text("""
                SELECT slug, name, full_name, ward, district, province
                FROM tenant
                WHERE deleted_at IS NULL AND status = 'active' AND id <> CAST(:t AS uuid)
                ORDER BY province NULLS LAST, ward NULLS LAST, name
            """),
                {"t": kp.id if kp else None},
            )
        ).mappings().all()
    return [dict(r) for r in rows]


class GuiDi(BaseModel):
    loai: str = Field(pattern="^(nhan_khau|ho_khau)$")
    nguon_id: str
    den_slug: str
    ly_do: str | None = Field(default=None, max_length=300)


@router.post("", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require("resident:write"))])
async def gui_di(
    body: GuiDi,
    request: Request,
    kp: KhuPho | None = Depends(resolve_khu_pho),
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Gửi hồ sơ sang khu phố khác. Bên kia bấm nhận thì hồ sơ mới rời khỏi đây."""
    async with PlatformSession() as pdb:
        den = (
            await pdb.execute(
                text("""SELECT id::text, slug, name FROM tenant
                        WHERE slug = :s AND deleted_at IS NULL AND status = 'active'"""),
                {"s": body.den_slug},
            )
        ).mappings().first()
        if not den:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Không có khu phố “{body.den_slug}” đang hoạt động trên hệ thống.",
            )
        if den["id"] == kp.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Không chuyển hồ sơ cho chính khu phố mình."
            )

        dang_cho = await pdb.scalar(
            text("""SELECT 1 FROM chuyen_khu_pho
                    WHERE tu_tenant_id = CAST(:t AS uuid) AND nguon_id = CAST(:n AS uuid)
                      AND trang_thai = 'cho_tiep_nhan'"""),
            {"t": kp.id, "n": body.nguon_id},
        )
        if dang_cho:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Hồ sơ này đã gửi đi và đang chờ bên kia tiếp nhận.",
            )

    # ── Chụp hồ sơ từ database của khu phố mình ─────────────────────────────
    if body.loai == "nhan_khau":
        nk = await _chup_nhan_khau(db, body.nguon_id)
        if not nk:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhân khẩu này")
        du_lieu = {"nhan_khau": nk}
        tom_tat = nk["full_name"] + (f" · sinh {nk['dob'][:4]}" if nk.get("dob") else "")
        so_nguoi = 1
    else:
        ho = (
            await db.execute(
                text(f"""SELECT {', '.join(COT_HO)} FROM household
                         WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
                {"i": body.nguon_id},
            )
        ).mappings().first()
        if not ho:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hộ này")
        ids = [
            r[0]
            for r in (
                await db.execute(
                    text("""SELECT id::text FROM resident
                            WHERE household_id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
                    {"i": body.nguon_id},
                )
            ).all()
        ]
        thanh_vien = [await _chup_nhan_khau(db, i) for i in ids]
        thanh_vien = [x for x in thanh_vien if x]
        du_lieu = {"ho": {k: _goi(v) for k, v in dict(ho).items()},
                   "thanh_vien": thanh_vien}
        chu = next((x["full_name"] for x in thanh_vien
                    if (x.get("relation_to_head") or "").lower() == "chủ hộ"), None)
        tom_tat = f"Hộ {ho['code']}" + (f" — {chu}" if chu else "") + \
                  f" · {len(thanh_vien)} nhân khẩu"
        so_nguoi = len(thanh_vien)

    async with PlatformSession() as pdb:
        cid = (
            await pdb.execute(
                text("""
                INSERT INTO chuyen_khu_pho
                    (tu_tenant_id, den_tenant_id, loai, nguon_id, tom_tat, so_nguoi,
                     du_lieu, ly_do, nguoi_gui_id, nguoi_gui)
                VALUES (CAST(:tu AS uuid), CAST(:den AS uuid), :l, CAST(:n AS uuid),
                        :tt, :sn, CAST(:d AS jsonb), :ly, CAST(:ug AS uuid), :ugt)
                RETURNING id::text
            """),
                {"tu": kp.id, "den": den["id"], "l": body.loai, "n": body.nguon_id,
                 "tt": tom_tat, "sn": so_nguoi,
                 "d": json.dumps(du_lieu, ensure_ascii=False),
                 "ly": body.ly_do, "ug": user.id, "ugt": user.full_name},
            )
        ).scalar_one()
        await pdb.commit()

    await ghi_audit(db, user, request, action="update", etype=body.loai, eid=body.nguon_id)
    await db.commit()
    log.info("chuyen_kp.gui", tu=kp.slug, den=den["slug"], loai=body.loai, so_nguoi=so_nguoi)
    return {
        "success": True, "id": cid, "den": den["name"],
        "loi_nhan": f"Đã gửi hồ sơ sang {den['name']}. Hồ sơ vẫn ở sổ của mình cho tới khi "
                    "bên kia bấm tiếp nhận.",
    }


def _bay(r: dict) -> dict:
    r["ten_trang_thai"] = TRANG_THAI.get(r["trang_thai"], r["trang_thai"])
    r.pop("du_lieu", None)  # danh sách không cần chở theo cả hồ sơ
    return r


@router.get("/di", dependencies=[Depends(require("resident:read"))])
async def gui_di_ds(
    trang_thai: str | None = Query(default=None),
    kp: KhuPho | None = Depends(resolve_khu_pho),
) -> dict:
    async with PlatformSession() as db:
        rows = (
            await db.execute(
                text("""
                SELECT c.id::text, c.loai, c.tom_tat, c.so_nguoi, c.trang_thai, c.ly_do,
                       c.nguoi_gui, c.nguoi_nhan, c.created_at, c.xu_ly_luc, c.het_han_luc,
                       t.name AS ten_khu_pho, t.slug AS slug_khu_pho, t.full_name AS kp_day_du
                FROM chuyen_khu_pho c JOIN tenant t ON t.id = c.den_tenant_id
                WHERE c.tu_tenant_id = CAST(:t AS uuid)
                  AND (CAST(:tt AS text) IS NULL OR c.trang_thai = CAST(:tt AS text))
                ORDER BY c.created_at DESC LIMIT 200
            """),
                {"t": kp.id if kp else None, "tt": trang_thai},
            )
        ).mappings().all()
        cho = await db.scalar(
            text("""SELECT count(*) FROM chuyen_khu_pho
                    WHERE tu_tenant_id = CAST(:t AS uuid) AND trang_thai = 'cho_tiep_nhan'"""),
            {"t": kp.id if kp else None},
        )
    return {"dang_cho": cho, "items": [_bay(dict(r)) for r in rows]}


@router.get("/den", dependencies=[Depends(require("resident:read"))])
async def nhan_ds(
    trang_thai: str | None = Query(default=None),
    kp: KhuPho | None = Depends(resolve_khu_pho),
) -> dict:
    async with PlatformSession() as db:
        rows = (
            await db.execute(
                text("""
                SELECT c.id::text, c.loai, c.tom_tat, c.so_nguoi, c.trang_thai, c.ly_do,
                       c.nguoi_gui, c.nguoi_nhan, c.created_at, c.xu_ly_luc, c.het_han_luc,
                       t.name AS ten_khu_pho, t.slug AS slug_khu_pho, t.full_name AS kp_day_du
                FROM chuyen_khu_pho c JOIN tenant t ON t.id = c.tu_tenant_id
                WHERE c.den_tenant_id = CAST(:t AS uuid)
                  AND (CAST(:tt AS text) IS NULL OR c.trang_thai = CAST(:tt AS text))
                ORDER BY c.created_at DESC LIMIT 200
            """),
                {"t": kp.id if kp else None, "tt": trang_thai},
            )
        ).mappings().all()
        cho = await db.scalar(
            text("""SELECT count(*) FROM chuyen_khu_pho
                    WHERE den_tenant_id = CAST(:t AS uuid) AND trang_thai = 'cho_tiep_nhan'"""),
            {"t": kp.id if kp else None},
        )
    return {"dang_cho": cho, "items": [_bay(dict(r)) for r in rows]}


@router.get("/{cid}", dependencies=[Depends(require("resident:read"))])
async def chi_tiet(cid: str, kp: KhuPho | None = Depends(resolve_khu_pho)) -> dict:
    """Xem trước hồ sơ trước khi bấm nhận. Chỉ hai đầu của lần chuyển này xem được."""
    async with PlatformSession() as db:
        r = (
            await db.execute(
                text("""
                SELECT c.*, tg.name AS tu_khu_pho, tn.name AS den_khu_pho,
                       tg.full_name AS tu_day_du
                FROM chuyen_khu_pho c
                JOIN tenant tg ON tg.id = c.tu_tenant_id
                JOIN tenant tn ON tn.id = c.den_tenant_id
                WHERE c.id = CAST(:c AS uuid)
                  AND (c.tu_tenant_id = CAST(:t AS uuid) OR c.den_tenant_id = CAST(:t AS uuid))
            """),
                {"c": cid, "t": kp.id if kp else None},
            )
        ).mappings().first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có lần chuyển này")
    d = dict(r)
    d["ten_trang_thai"] = TRANG_THAI.get(d["trang_thai"], d["trang_thai"])
    d["la_ben_nhan"] = str(d["den_tenant_id"]) == str(kp.id if kp else "")
    for k in ("id", "tu_tenant_id", "den_tenant_id", "nguon_id"):
        d[k] = str(d[k])
    return d


async def _ghi_vao_so(kdb: AsyncSession, du_lieu: dict, loai: str, tu_khu_pho: str) -> dict:
    """Ghi hồ sơ vào database của khu phố nhận."""
    cot = ", ".join(COT_NHAN_KHAU)
    tham = ", ".join(f":{c}" for c in COT_NHAN_KHAU)

    async def them_nguoi(nk: dict, hid: str | None) -> str:
        p = {c: _mo(nk.get(c), c) for c in COT_NHAN_KHAU}
        p["hid"] = hid
        # `id_card_enc` đi ở dạng hex của khối đã mã hoá — dựng lại nguyên khối,
        # không hề giải mã ở bất cứ chặng nào
        p["enc"] = nk.get("id_card_enc")
        rid = (
            await kdb.execute(
                text(f"""
                INSERT INTO resident ({cot}, household_id, id_card_enc)
                VALUES ({tham}, CAST(:hid AS uuid),
                        CASE WHEN CAST(:enc AS text) IS NULL THEN NULL
                             ELSE decode(CAST(:enc AS text), 'hex') END)
                RETURNING id::text
            """),
                p,
            )
        ).scalar_one()
        for ma in nk.get("phan_loai") or []:
            await kdb.execute(
                text("""INSERT INTO resident_classification (resident_id, classification_id)
                        SELECT CAST(:r AS uuid), id FROM classification WHERE code = :c
                        ON CONFLICT DO NOTHING"""),
                {"r": rid, "c": ma},
            )
        return rid

    if loai == "nhan_khau":
        rid = await them_nguoi(du_lieu["nhan_khau"], None)
        return {"so_nguoi": 1, "resident_id": rid}

    ho = du_lieu["ho"]
    # Mã hộ có thể trùng với hộ sẵn có bên nhận — thêm đuôi cho khỏi đụng
    ma = ho.get("code") or "CHUYEN-DEN"
    for i in range(0, 50):
        thu = ma if i == 0 else f"{ma}-{i + 1}"
        if not await kdb.scalar(
            text("SELECT 1 FROM household WHERE code = :c AND deleted_at IS NULL"), {"c": thu}
        ):
            ma = thu
            break
    hid = (
        await kdb.execute(
            text("""
            INSERT INTO household (code, address, phone, household_type, residence_type, note)
            VALUES (:code, :address, :phone, :household_type, :residence_type,
                    CONCAT_WS(' · ', CAST(:note AS text), CAST(:tu AS text)))
            RETURNING id::text
        """),
            {**{c: ho.get(c) for c in COT_HO}, "tu": f"Chuyển đến từ {tu_khu_pho}"},
        )
    ).scalar_one()

    chu_ho = None
    for nk in du_lieu.get("thanh_vien") or []:
        rid = await them_nguoi(nk, hid)
        if (nk.get("relation_to_head") or "").lower() == "chủ hộ":
            chu_ho = rid
    if chu_ho:
        await kdb.execute(
            text("""UPDATE household SET head_resident_id = CAST(:r AS uuid)
                    WHERE id = CAST(:h AS uuid)"""),
            {"r": chu_ho, "h": hid},
        )
        await kdb.execute(
            text("UPDATE resident SET is_head = true WHERE id = CAST(:r AS uuid)"),
            {"r": chu_ho},
        )
    return {"so_nguoi": len(du_lieu.get("thanh_vien") or []), "household_id": hid, "ma_ho": ma}


@router.post("/{cid}/tiep-nhan", dependencies=[Depends(require("resident:write"))])
async def tiep_nhan(
    cid: str,
    request: Request,
    kp: KhuPho | None = Depends(resolve_khu_pho),
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Nhận hồ sơ vào sổ của mình, rồi mới gỡ bản gốc ở khu phố gửi."""
    async with PlatformSession() as pdb:
        c = (
            await pdb.execute(
                text("""
                SELECT c.id::text, c.loai, c.nguon_id::text, c.du_lieu, c.tom_tat,
                       c.trang_thai, tg.slug AS tu_slug, tg.name AS tu_ten
                FROM chuyen_khu_pho c JOIN tenant tg ON tg.id = c.tu_tenant_id
                WHERE c.id = CAST(:c AS uuid) AND c.den_tenant_id = CAST(:t AS uuid)
            """),
                {"c": cid, "t": kp.id if kp else None},
            )
        ).mappings().first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có lần chuyển này")
    if c["trang_thai"] != "cho_tiep_nhan":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Hồ sơ này đang ở trạng thái “{TRANG_THAI.get(c['trang_thai'])}”, không nhận lại được.",
        )

    du_lieu = c["du_lieu"] if isinstance(c["du_lieu"], dict) else json.loads(c["du_lieu"] or "{}")
    kq = await _ghi_vao_so(db, du_lieu, c["loai"], c["tu_ten"])
    await ghi_audit(db, user, request, action="create", etype=c["loai"],
                    eid=kq.get("resident_id") or kq.get("household_id"))
    await db.commit()

    # Ghi xong bên nhận mới đánh dấu đã nhận và XOÁ ảnh chụp khỏi database dùng chung
    async with PlatformSession() as pdb:
        await pdb.execute(
            text("""UPDATE chuyen_khu_pho SET
                      trang_thai = 'da_tiep_nhan', du_lieu = NULL,
                      nguoi_nhan_id = CAST(:u AS uuid), nguoi_nhan = :un,
                      xu_ly_luc = now(), updated_at = now()
                    WHERE id = CAST(:c AS uuid)"""),
            {"u": user.id, "un": user.full_name, "c": cid},
        )
        await pdb.commit()

    # Gỡ bản gốc bên gửi — CHỈ tới bước này, khi bản đích đã ghi xong.
    # Hỏng ở đây thì tệ nhất là hồ sơ tồn tại hai nơi, còn hơn mất giữa đường.
    try:
        async with session_khu_pho(c["tu_slug"])() as sdb:
            bang = "resident" if c["loai"] == "nhan_khau" else "household"
            await sdb.execute(
                text(f"""UPDATE {bang} SET deleted_at = now(),
                           note = CONCAT_WS(' · ', note, CAST(:ghi AS text))
                         WHERE id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
                {"i": c["nguon_id"], "ghi": f"Đã chuyển sang {kp.name if kp else 'khu phố khác'}"},
            )
            if c["loai"] == "ho_khau":
                await sdb.execute(
                    text("""UPDATE resident SET deleted_at = now()
                            WHERE household_id = CAST(:i AS uuid) AND deleted_at IS NULL"""),
                    {"i": c["nguon_id"]},
                )
            await sdb.commit()
    except Exception as exc:  # noqa: BLE001
        # Không nuốt lặng: hồ sơ nằm hai nơi phải có dấu vết để người ta còn dọn
        log.error("chuyen_kp.go_nguon_hong", chuyen=cid, tu=c["tu_slug"], error=str(exc))

    log.info("chuyen_kp.nhan", chuyen=cid, tu=c["tu_slug"], den=kp.slug if kp else None,
             so_nguoi=kq["so_nguoi"])
    return {
        "success": True, **kq,
        "loi_nhan": f"Đã tiếp nhận {c['tom_tat']} từ {c['tu_ten']}. "
                    f"Hồ sơ bên {c['tu_ten']} đã được gỡ khỏi sổ của họ.",
    }


class TuChoi(BaseModel):
    ly_do: str = Field(min_length=3, max_length=300)


@router.post("/{cid}/tu-choi", dependencies=[Depends(require("resident:write"))])
async def tu_choi(
    cid: str,
    body: TuChoi,
    user: CurrentUser = Depends(current_user),
    kp: KhuPho | None = Depends(resolve_khu_pho),
) -> dict:
    """Từ chối nhận. Hồ sơ vẫn nguyên ở khu phố gửi, không mất gì."""
    async with PlatformSession() as pdb:
        n = (
            await pdb.execute(
                text("""UPDATE chuyen_khu_pho SET
                          trang_thai = 'tu_choi', du_lieu = NULL, ly_do = :ly,
                          nguoi_nhan_id = CAST(:u AS uuid), nguoi_nhan = :un,
                          xu_ly_luc = now(), updated_at = now()
                        WHERE id = CAST(:c AS uuid) AND den_tenant_id = CAST(:t AS uuid)
                          AND trang_thai = 'cho_tiep_nhan'"""),
                {"ly": body.ly_do, "u": user.id, "un": user.full_name,
                 "c": cid, "t": kp.id if kp else None},
            )
        ).rowcount
        await pdb.commit()
    if not n:
        raise HTTPException(status.HTTP_409_CONFLICT, "Hồ sơ này không còn chờ tiếp nhận.")
    return {"success": True,
            "loi_nhan": "Đã từ chối. Hồ sơ vẫn nguyên ở khu phố gửi, không mất gì."}


@router.post("/{cid}/huy", dependencies=[Depends(require("resident:write"))])
async def huy(
    cid: str,
    kp: KhuPho | None = Depends(resolve_khu_pho),
    user: CurrentUser = Depends(current_user),
) -> dict:
    """Bên gửi rút lại hồ sơ khi bên kia chưa nhận."""
    async with PlatformSession() as pdb:
        n = (
            await pdb.execute(
                text("""UPDATE chuyen_khu_pho SET
                          trang_thai = 'da_huy', du_lieu = NULL,
                          xu_ly_luc = now(), updated_at = now()
                        WHERE id = CAST(:c AS uuid) AND tu_tenant_id = CAST(:t AS uuid)
                          AND trang_thai = 'cho_tiep_nhan'"""),
                {"c": cid, "t": kp.id if kp else None},
            )
        ).rowcount
        await pdb.commit()
    if not n:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Không rút lại được — có thể bên kia đã tiếp nhận rồi.",
        )
    log.info("chuyen_kp.huy", chuyen=cid, boi=user.id)
    return {"success": True, "loi_nhan": "Đã rút lại hồ sơ."}
