"""Chuông thông báo — gom việc còn tồn của khu phố vào một chỗ.

Gom mọi việc còn tồn vào một chỗ, theo đúng cách app cũ làm:

    họp trong 2 ngày tới     -> ngưỡng lấy từ app cũ: xa hơn thì nhiễu, gần hơn
                                thì không kịp chuẩn bị
    kế hoạch quá hạn / sắp   -> trưởng khu phố cần biết ngay khi mở phần mềm
    giấy ATTP sắp hết hạn    -> nhắc trước để chủ quán kịp đi làm lại
    văn bản đến quá hạn      -> hoả tốc/thượng khẩn thì nhắc ngay, không đợi tới hạn
    hộ chưa có toạ độ        -> không chỉ đường tới nhà được
    hộ chưa có chủ hộ        -> hồ sơ hộ khẩu chưa hoàn chỉnh
    nhân khẩu thiếu CCCD     -> vướng khi làm giấy tờ
    đợt thu đang mở          -> còn hạn, còn hộ chưa đóng

Tất cả đều đọc từ database CỦA khu phố đang truy cập.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.deps import get_db, require

router = APIRouter(prefix="/thong-bao", tags=["thông báo"])


@router.get("", dependencies=[Depends(require("resident:read"))])
async def danh_sach(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Việc còn tồn, xếp theo mức khẩn. Không có việc gì thì trả mảng rỗng."""
    ds: list[dict] = []


    # ── Họp sắp tới ─────────────────────────────────────────────────────── #
    hop = (
        await db.execute(
            text("""
            SELECT title, location, starts_at,
                   (starts_at::date - CURRENT_DATE) AS con_ngay
            FROM meeting
            WHERE deleted_at IS NULL AND status = 'sap_dien_ra'
              AND starts_at >= now() AND starts_at <= now() + interval '2 days'
            ORDER BY starts_at
        """)
        )
    ).mappings().all()
    for m in hop:
        gio = m["starts_at"].astimezone().strftime("%H:%M %d/%m")
        ds.append({
            "id": f"hop-{m['starts_at'].isoformat()}",
            "nhom": "LỊCH HỌP",
            "nhan": "Hôm nay" if m["con_ngay"] == 0 else "Sắp họp",
            "muc": "gap" if m["con_ngay"] == 0 else "canh",
            "tieu_de": m["title"],
            "mo_ta": f"Lúc {gio}" + (f" tại {m['location']}" if m["location"] else ""),
        })

    # ── Kế hoạch quá hạn hoặc sắp tới hạn ───────────────────────────────── #
    kh = (
        await db.execute(
            text("""
            SELECT title, deadline, phu_trach, tien_do,
                   (deadline - CURRENT_DATE) AS con_ngay
            FROM plan
            WHERE deleted_at IS NULL AND status <> 'hoan_thanh'
              AND deadline IS NOT NULL
              AND deadline <= CURRENT_DATE + 2
            ORDER BY deadline
        """)
        )
    ).mappings().all()
    for k in kh:
        con = k["con_ngay"]
        ds.append({
            "id": f"kh-{k['deadline']}-{k['title'][:20]}",
            "nhom": "KẾ HOẠCH KHU PHỐ",
            "nhan": "Quá hạn" if con < 0 else ("Hết hạn hôm nay" if con == 0 else "Sắp đến hạn"),
            "muc": "gap" if con <= 0 else "canh",
            "tieu_de": k["title"],
            "mo_ta": (
                (f"Đã quá hạn {abs(con)} ngày" if con < 0
                 else "Hạn hôm nay" if con == 0 else f"Còn {con} ngày")
                + f" · tiến độ {k['tien_do']}%"
                + (f" · {k['phu_trach']}" if k["phu_trach"] else "")
            ),
        })


    # ── Văn bản đến quá hạn hoặc chưa xử lý ─────────────────────────────── #
    vb = (
        await db.execute(
            text("""
            SELECT title, so_ky_hieu, don_vi, han_xu_ly, do_khan,
                   (han_xu_ly - CURRENT_DATE) AS con_ngay
            FROM official_document
            WHERE deleted_at IS NULL AND loai = 'den'
              AND trang_thai IN ('moi','dang_xu_ly')
              AND (do_khan IN ('hoa_toc','thuong_khan')
                   OR (han_xu_ly IS NOT NULL AND han_xu_ly <= CURRENT_DATE + 2))
            ORDER BY han_xu_ly NULLS LAST
        """)
        )
    ).mappings().all()
    for v in vb:
        con = v["con_ngay"]
        gap = v["do_khan"] in ("hoa_toc", "thuong_khan") or (con is not None and con <= 0)
        ds.append({
            "id": f"vb-{v['so_ky_hieu'] or v['title'][:24]}",
            "nhom": "VĂN BẢN ĐẾN",
            "nhan": (
                "Hoả tốc" if v["do_khan"] == "hoa_toc"
                else "Thượng khẩn" if v["do_khan"] == "thuong_khan"
                else "Quá hạn" if con is not None and con < 0
                else "Sắp hết hạn"
            ),
            "muc": "gap" if gap else "canh",
            "tieu_de": (f"{v['so_ky_hieu']} — " if v["so_ky_hieu"] else "") + v["title"],
            "mo_ta": (
                (v["don_vi"] + " · " if v["don_vi"] else "")
                + (
                    f"quá hạn xử lý {abs(con)} ngày" if con is not None and con < 0
                    else "hạn xử lý hôm nay" if con == 0
                    else f"còn {con} ngày" if con is not None
                    else "chưa đặt hạn xử lý"
                )
            ),
        })

    # ── Giấy an toàn thực phẩm sắp hết hạn ──────────────────────────────── #
    attp = (
        await db.execute(
            text("""
            SELECT name, ngay_het_han_attp,
                   (ngay_het_han_attp - CURRENT_DATE) AS con_ngay
            FROM business
            WHERE deleted_at IS NULL AND trang_thai = 'dang_hoat_dong'
              AND ngay_het_han_attp IS NOT NULL
              AND ngay_het_han_attp <= CURRENT_DATE + 60
            ORDER BY ngay_het_han_attp
        """)
        )
    ).mappings().all()
    for b in attp:
        con = b["con_ngay"]
        ds.append({
            "id": f"attp-{b['name'][:24]}",
            "nhom": "CƠ SỞ KINH DOANH",
            "nhan": "Hết hạn ATTP" if con < 0 else "Sắp hết hạn",
            "muc": "gap" if con < 0 else "canh",
            "tieu_de": b["name"],
            "mo_ta": (
                f"Giấy an toàn thực phẩm đã hết hạn {abs(con)} ngày"
                if con < 0 else f"Giấy an toàn thực phẩm còn {con} ngày"
            ),
        })

    r = (
        await db.execute(
            text("""
            SELECT count(*) FILTER (WHERE geo_status = 'pending')            AS chua_dinh_vi,
                   count(*) FILTER (WHERE head_resident_id IS NULL)          AS thieu_chu_ho,
                   count(*)                                                  AS tong
            FROM household WHERE deleted_at IS NULL
        """)
        )
    ).mappings().one()

    if r["chua_dinh_vi"]:
        ds.append({
            "id": "geo",
            "nhom": "ĐỊA CHỈ SỐ",
            "nhan": "Cần ghim",
            "muc": "canh",
            "tieu_de": f"{r['chua_dinh_vi']} hộ chưa có toạ độ trên bản đồ",
            "mo_ta": "Hộ chưa ghim vị trí thì không bấm chỉ đường tới nhà được. "
                     "Mở Địa chỉ số để ghim.",
        })

    if r["thieu_chu_ho"]:
        ds.append({
            "id": "chu-ho",
            "nhom": "HỘ KHẨU",
            "nhan": "Thiếu",
            "muc": "canh",
            "tieu_de": f"{r['thieu_chu_ho']} hộ chưa xác định chủ hộ",
            "mo_ta": "Hồ sơ hộ chưa hoàn chỉnh. Vào hộ, chọn một thành viên làm chủ hộ.",
        })

    # ── Phản ánh hiện trường ─────────────────────────────────────────────
    pa = (
        await db.execute(
            text("""
            SELECT count(*) FILTER (WHERE muc_do = 'khan_cap')       AS khan_cap,
                   count(*) FILTER (WHERE han_xu_ly < CURRENT_DATE)  AS qua_han
            FROM phan_anh
            WHERE deleted_at IS NULL
              AND trang_thai IN ('moi','dang_xu_ly','da_chuyen_phuong')
        """)
        )
    ).mappings().one()

    if pa["khan_cap"]:
        ds.append({
            "id": "phan-anh-khan",
            "nhom": "PHẢN ÁNH",
            "nhan": "Khẩn cấp",
            "muc": "canh",
            "tieu_de": f"{pa['khan_cap']} phản ánh khẩn cấp chưa xử lý xong",
            "mo_ta": "Việc đánh dấu khẩn cấp cần xử lý trong ngày.",
        })
    if pa["qua_han"]:
        ds.append({
            "id": "phan-anh-qua-han",
            "nhom": "PHẢN ÁNH",
            "nhan": "Quá hạn",
            "muc": "canh",
            "tieu_de": f"{pa['qua_han']} phản ánh quá hạn xử lý",
            "mo_ta": "Mở màn hình Phản ánh hiện trường, lọc “Đã quá hạn” để có danh sách.",
        })

    # ── Tạm trú hết hạn ──────────────────────────────────────────────────
    # Hết hạn mà không gia hạn thì việc cư trú không còn được đăng ký. Cán bộ
    # phải nhắc bà con đi gia hạn, nên đây là mục có thứ hạng cao trong chuông.
    tt = (
        await db.execute(
            text("""
            SELECT count(*) FILTER (WHERE tam_tru_den_ngay < CURRENT_DATE) AS qua_han,
                   count(*) FILTER (WHERE tam_tru_den_ngay >= CURRENT_DATE
                                      AND tam_tru_den_ngay < CURRENT_DATE + 30) AS sap_het
            FROM resident
            WHERE deleted_at IS NULL AND residence_status = 'tam_tru'
              AND tam_tru_den_ngay IS NOT NULL
        """)
        )
    ).mappings().one()

    if tt["qua_han"]:
        ds.append({
            "id": "tam-tru-qua-han",
            "nhom": "TẠM TRÚ",
            "nhan": "Quá hạn",
            "muc": "canh",
            "tieu_de": f"{tt['qua_han']} người đã hết hạn tạm trú",
            "mo_ta": "Hết hạn mà chưa gia hạn thì việc cư trú không còn được đăng ký. "
                     "Mở màn hình NK tạm trú, lọc “Đã quá hạn” để có danh sách đi nhắc.",
        })
    if tt["sap_het"]:
        ds.append({
            "id": "tam-tru-sap-het",
            "nhom": "TẠM TRÚ",
            "nhan": "Sắp hết",
            "muc": "tin",
            "tieu_de": f"{tt['sap_het']} người sắp hết hạn tạm trú trong 30 ngày",
            "mo_ta": "Nhắc trước để bà con kịp đi gia hạn, đỡ phải đăng ký lại từ đầu.",
        })

    thieu_cccd = await db.scalar(
        text("""SELECT count(*) FROM resident
                WHERE deleted_at IS NULL AND id_card_enc IS NULL
                  AND residence_status IN ('thuong_tru','tam_tru')""")
    )
    if thieu_cccd:
        ds.append({
            "id": "cccd",
            "nhom": "NHÂN KHẨU",
            "nhan": "Thiếu",
            "muc": "tin",
            "tieu_de": f"{thieu_cccd} nhân khẩu chưa có số định danh",
            "mo_ta": "Thiếu CCCD sẽ vướng khi xác nhận giấy tờ cho bà con.",
        })

    dot = (
        await db.execute(
            text("""
            SELECT c.name, c.end_date,
                   (c.end_date - CURRENT_DATE) AS con_lai,
                   (SELECT count(DISTINCT household_id) FROM fund_receipt r
                     WHERE r.campaign_id = c.id) AS da_dong
            FROM fund_campaign c
            WHERE c.status = 'dang_thu' AND c.deleted_at IS NULL
            ORDER BY c.end_date NULLS LAST
        """)
        )
    ).mappings().all()

    tong_ho = r["tong"] or 0
    for d in dot:
        con = d["con_lai"]
        con_thieu = max(tong_ho - (d["da_dong"] or 0), 0)
        ds.append({
            "id": f"dot-{d['name']}",
            "nhom": "QUỸ KHU PHỐ",
            "nhan": "Sắp hết hạn" if con is not None and con <= 7 else "Đang thu",
            "muc": "gap" if con is not None and con <= 3 else "tin",
            "tieu_de": d["name"],
            "mo_ta": (
                f"Còn {con_thieu} hộ chưa đóng"
                + (f" · còn {con} ngày" if con is not None and con >= 0 else "")
                + (" · ĐÃ QUÁ HẠN" if con is not None and con < 0 else "")
            ),
        })

    # Việc gấp lên trước
    thu_tu = {"gap": 0, "canh": 1, "tin": 2}
    ds.sort(key=lambda x: thu_tu.get(x["muc"], 3))
    return ds
