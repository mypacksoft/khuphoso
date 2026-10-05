"""Gom nhân khẩu rời thành hộ khẩu, dựa trên địa chỉ và tên chủ hộ đã khai.

VÌ SAO CẦN
Dữ liệu nhập từ sổ giấy chỉ có địa chỉ và tên, không có mã hộ. Nhân khẩu nằm rời thì
không biết ai ở chung nhà với ai — mà hộ mới là đơn vị làm việc chính của cán bộ.

QUY TẮC GHÉP — đúng cách cán bộ vẫn làm trên giấy

  Hộ thường trú
    · Cùng địa chỉ + cùng tên chủ hộ  -> một hộ.
    · Cả địa chỉ chỉ có một nhóm và không ai khai tên chủ hộ -> gom chung thành
      một hộ, vì một địa chỉ một hộ thì không có gì để nhầm.
    · Địa chỉ có nhiều tên chủ hộ khác nhau, lại còn người không khai tên -> KHÔNG
      đoán người đó thuộc hộ nào. Để riêng cho cán bộ rà tay.

  Hộ tạm trú
    Một địa chỉ nhà trọ gần như luôn có nhiều hộ không liên quan gì nhau, nên
    BẮT BUỘC có tên chủ hộ mới ghép. Thiếu tên thì để riêng, không suy đoán.

SO KHỚP ĐỊA CHỈ
Bỏ dấu, thường hoá, bỏ các chữ chỉ loại đường ("đường", "hẻm", "số nhà"…) rồi so
CHÍNH XÁC. Không dùng so gần đúng: ghép nhầm hai nhà thành một hộ là sai hồ sơ hộ
tịch và cán bộ rất khó phát hiện. Thà để sót cho người rà còn hơn ghép bừa.

LUÔN XEM TRƯỚC
Mặc định chỉ trả về dự kiến. Phải gửi `xac_nhan: true` mới thực sự ghi.
"""

import re
import unicodedata
from collections import Counter, defaultdict

import structlog
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require

from .households import sinh_ma_ho

log = structlog.get_logger()
router = APIRouter(prefix="/ho-khau", tags=["hộ khẩu"])

# Chữ chỉ loại đường/khu vực — viết hay không viết vẫn là cùng một chỗ
BO_TU = (
    "duong", "pho", "hem", "ngo", "ngach", "so nha", "to dan pho", "khu pho",
    "phuong", "xa", "quan", "huyen", "thanh pho", "tinh", "tp", "kp",
)


def khong_dau(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def chuan_dia_chi(dia_chi: str | None) -> str:
    """Rút địa chỉ về dạng so khớp. Chuỗi rỗng nghĩa là không đủ căn cứ để ghép."""
    if not dia_chi or not dia_chi.strip():
        return ""
    s = khong_dau(dia_chi)
    s = re.sub(r"[.,;]+", " ", s)
    for tu in BO_TU:
        s = re.sub(rf"\b{tu}\b", " ", s)
    # Giữ dấu / vì "123/45" khác hẳn "12345"
    s = re.sub(r"[^a-z0-9/]+", " ", s)
    s = re.sub(r"\s*/\s*", "/", s)
    return re.sub(r"\s+", " ", s).strip()


def chuan_ten(ten: str | None) -> str:
    if not ten or not ten.strip():
        return ""
    return re.sub(r"\s+", " ", khong_dau(ten)).strip()


def pho_bien(cac_gia_tri) -> str | None:
    """Giá trị xuất hiện nhiều nhất, bỏ qua rỗng — dùng chọn cách viết địa chỉ."""
    d = [v for v in cac_gia_tri if v]
    return Counter(d).most_common(1)[0][0] if d else None


class GopTuDiaChi(BaseModel):
    household_type: str = Field(default="thuong_tru", pattern="^(thuong_tru|tam_tru)$")
    xac_nhan: bool = Field(
        default=False, description="false = chỉ xem trước, true = thực sự tạo hộ và gán"
    )
    group_id: str | None = Field(default=None, description="giới hạn trong một tổ dân phố")


@router.post("/gop-tu-dia-chi")
async def gop_tu_dia_chi(
    body: GopTuDiaChi,
    request: Request,
    user: CurrentUser = Depends(require("household:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    dien = body.household_type
    trang_thai = "tam_tru" if dien == "tam_tru" else "thuong_tru"

    rows = (
        await db.execute(
            text("""
            SELECT r.id::text, r.full_name, r.dob, r.gender, r.relation_to_head, r.is_head,
                   r.phone, r.group_id::text AS group_id, r.dia_chi_khai, r.ten_chu_ho_khai,
                   g.name AS to_dan_pho
            FROM resident r
            LEFT JOIN neighborhood_group g ON g.id = r.group_id
            WHERE r.deleted_at IS NULL AND r.household_id IS NULL
              AND r.residence_status = :tt
              AND (CAST(:gid AS uuid) IS NULL OR r.group_id = CAST(:gid AS uuid))
            ORDER BY r.full_name
        """),
            {"tt": trang_thai, "gid": body.group_id},
        )
    ).mappings().all()

    # Hộ đã có, để ghép vào thay vì tạo trùng
    ho_co = (
        await db.execute(
            text("""SELECT h.id::text AS id, h.code, h.address, h.group_id::text AS group_id,
                           c.full_name AS chu_ho
                    FROM household h
                    LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
                    WHERE h.deleted_at IS NULL AND h.household_type = :d"""),
            {"d": dien},
        )
    ).mappings().all()

    theo_dc_ten: dict[tuple[str, str], dict] = {}
    theo_dc: dict[str, list[dict]] = defaultdict(list)
    for h in ho_co:
        dc = chuan_dia_chi(h["address"])
        if not dc:
            continue
        theo_dc_ten[(dc, chuan_ten(h["chu_ho"]))] = dict(h)
        theo_dc[dc].append(dict(h))

    # ── Gom ứng viên ──────────────────────────────────────────────────────── #
    nhom: dict[tuple[str, str], list[dict]] = defaultdict(list)
    bo_qua: list[dict] = []

    for r in rows:
        dc = chuan_dia_chi(r["dia_chi_khai"])
        ten = chuan_ten(r["ten_chu_ho_khai"])
        if not dc:
            bo_qua.append({**dict(r), "ly_do": "Chưa khai địa chỉ nên không có căn cứ để gom"})
            continue
        if dien == "tam_tru" and not ten:
            bo_qua.append({
                **dict(r),
                "ly_do": "Hộ tạm trú phải có tên chủ hộ — một địa chỉ trọ có nhiều hộ",
            })
            continue
        nhom[(dc, ten)].append(dict(r))

    # Đếm số tên chủ hộ khác nhau tại từng địa chỉ, kể cả hộ đã tồn tại
    ten_tai_dc: dict[str, set[str]] = defaultdict(set)
    for dc, ten in nhom:
        ten_tai_dc[dc].add(ten)
    for h in ho_co:
        dc = chuan_dia_chi(h["address"])
        if dc:
            ten_tai_dc[dc].add(chuan_ten(h["chu_ho"]))

    # ── Quyết định từng nhóm ──────────────────────────────────────────────── #
    du_kien: list[dict] = []

    for (dc, ten), ds in sorted(nhom.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        cac_ten = ten_tai_dc[dc]
        # Nhóm không tên, mà địa chỉ này còn có tên khác -> không biết thuộc hộ nào
        if not ten and len(cac_ten - {""}) > 0:
            for r in ds:
                bo_qua.append({
                    **r,
                    "ly_do": (
                        f"Địa chỉ này có {len(cac_ten - {''})} chủ hộ khác nhau mà người này "
                        "không khai tên chủ hộ — cần chọn tay"
                    ),
                })
            continue

        ho_khop = theo_dc_ten.get((dc, ten))
        # Địa chỉ chỉ có duy nhất một hộ đã tồn tại và không nhóm nào có tên khác
        if not ho_khop and not ten and len(theo_dc[dc]) == 1:
            ho_khop = theo_dc[dc][0]

        dia_chi_dep = pho_bien(r["dia_chi_khai"] for r in ds) or dc
        ten_dep = pho_bien(r["ten_chu_ho_khai"] for r in ds)
        gid = pho_bien(r["group_id"] for r in ds)

        # Ai làm chủ hộ: khớp tên khai > đã đánh dấu is_head > khai quan hệ "chủ hộ"
        chu = next((r for r in ds if ten and chuan_ten(r["full_name"]) == ten), None)
        chu = chu or next((r for r in ds if r["is_head"]), None)
        chu = chu or next(
            (r for r in ds if chuan_ten(r["relation_to_head"]) in ("chu ho", "chu")), None
        )

        du_kien.append({
            "dia_chi": dia_chi_dep,
            "chu_ho_khai": ten_dep,
            "to_dan_pho": pho_bien(r["to_dan_pho"] for r in ds),
            "group_id": gid,
            "so_nguoi": len(ds),
            "ho_dang_co": ho_khop["code"] if ho_khop else None,
            "ho_id": ho_khop["id"] if ho_khop else None,
            "chu_ho_id": chu["id"] if chu else None,
            "chu_ho_ten": chu["full_name"] if chu else None,
            "viec": "gan_vao_ho_co" if ho_khop else "tao_ho_moi",
            "thanh_vien": [
                {"id": r["id"], "full_name": r["full_name"], "dob": r["dob"],
                 "gender": r["gender"], "la_chu_ho": bool(chu and r["id"] == chu["id"])}
                for r in ds
            ],
        })

    ket_qua: dict = {
        "dien": dien,
        "xem_truoc": not body.xac_nhan,
        "tong_nhan_khau_roi": len(rows),
        "se_tao_ho_moi": sum(1 for d in du_kien if d["viec"] == "tao_ho_moi"),
        "se_gan_vao_ho_co": sum(1 for d in du_kien if d["viec"] == "gan_vao_ho_co"),
        "se_gan_nhan_khau": sum(d["so_nguoi"] for d in du_kien),
        "du_kien": du_kien,
        "bo_qua": bo_qua,
    }

    if not body.xac_nhan:
        return ket_qua

    # ── Thực hiện ─────────────────────────────────────────────────────────── #
    da_tao, da_gan = 0, 0
    for d in du_kien:
        hid = d["ho_id"]
        if not hid:
            ma = await sinh_ma_ho(db, d["group_id"])
            hid = (
                await db.execute(
                    text("""INSERT INTO household
                            (code, group_id, address, household_type, created_by, updated_by)
                            VALUES (:c, CAST(:g AS uuid), :a, :ht,
                                    CAST(:u AS uuid), CAST(:u AS uuid))
                            RETURNING id::text"""),
                    {"c": ma, "g": d["group_id"], "a": d["dia_chi"], "ht": dien, "u": user.id},
                )
            ).scalar_one()
            d["ma_ho"] = ma
            da_tao += 1
        else:
            d["ma_ho"] = d["ho_dang_co"]

        ids = [t["id"] for t in d["thanh_vien"]]
        await db.execute(
            text("""UPDATE resident SET household_id = CAST(:h AS uuid),
                           group_id = COALESCE(group_id,
                               (SELECT group_id FROM household WHERE id = CAST(:h AS uuid))),
                           updated_by = CAST(:u AS uuid)
                    WHERE id = ANY(CAST(:ids AS uuid[]))"""),
            {"h": hid, "u": user.id, "ids": ids},
        )
        da_gan += len(ids)

        if d["chu_ho_id"]:
            await db.execute(
                text("""UPDATE resident SET is_head = (id = CAST(:c AS uuid)),
                               relation_to_head = CASE WHEN id = CAST(:c AS uuid)
                                                       THEN 'Chủ hộ' ELSE relation_to_head END
                        WHERE household_id = CAST(:h AS uuid) AND deleted_at IS NULL"""),
                {"c": d["chu_ho_id"], "h": hid},
            )
            await db.execute(
                text("""UPDATE household SET head_resident_id = CAST(:c AS uuid)
                        WHERE id = CAST(:h AS uuid) AND head_resident_id IS NULL"""),
                {"c": d["chu_ho_id"], "h": hid},
            )

    await ghi_audit(
        db, user, request, action="gop_ho", etype="household",
        changes=(
            f'{{"dien": "{dien}", "ho_moi": {da_tao}, "nhan_khau_da_gan": {da_gan}}}'
        ),
    )
    await db.commit()
    log.info("household.merged", dien=dien, ho_moi=da_tao, nhan_khau=da_gan, by=user.id)

    return {**ket_qua, "xem_truoc": False, "da_tao_ho": da_tao, "da_gan_nhan_khau": da_gan}

@router.get("/dia-chi-goi-y", dependencies=[Depends(require("household:read"))])
async def dia_chi_goi_y(
    q: str | None = None,
    limit: int = 15,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Các địa chỉ đã có trong khu phố, để gõ tới đâu gợi ý tới đó.

    Gộp cả địa chỉ của hộ lẫn địa chỉ do nhân khẩu tự khai. Cán bộ chọn từ gợi ý
    thì cách viết thống nhất, gom hộ về sau mới khớp — gõ tay mỗi lần một kiểu
    ("123/45 Nguyễn Duy Trinh" / "123/45 Ng. Duy Trinh") là hỏng.
    """
    rows = (
        await db.execute(
            text("""
            WITH gop AS (
                SELECT h.address AS dia_chi, h.code AS ma_ho,
                       c.full_name AS chu_ho, h.household_type,
                       (SELECT count(*) FROM resident r
                         WHERE r.household_id = h.id AND r.deleted_at IS NULL) AS so_nguoi
                FROM household h
                LEFT JOIN resident c ON c.id = h.head_resident_id AND c.deleted_at IS NULL
                WHERE h.deleted_at IS NULL AND h.address IS NOT NULL

                UNION ALL

                SELECT r.dia_chi_khai, NULL, NULL, NULL,
                       count(*) OVER (PARTITION BY kp_unaccent(r.dia_chi_khai))
                FROM resident r
                WHERE r.deleted_at IS NULL AND r.household_id IS NULL
                  AND NULLIF(btrim(r.dia_chi_khai), '') IS NOT NULL
            )
            SELECT DISTINCT ON (kp_unaccent(dia_chi))
                   dia_chi, ma_ho, chu_ho, household_type, so_nguoi
            FROM gop
            WHERE CAST(:q AS text) IS NULL
               OR kp_unaccent(dia_chi) LIKE '%' || kp_unaccent(CAST(:q AS text)) || '%'
            ORDER BY kp_unaccent(dia_chi), ma_ho NULLS LAST
            LIMIT :l
        """),
            {"q": q.strip() if q and q.strip() else None, "l": min(limit, 50)},
        )
    ).mappings().all()
    return [dict(r) for r in rows]
