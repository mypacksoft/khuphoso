"""Nhập nhân khẩu hàng loạt từ Excel, tự dựng hộ khẩu theo địa chỉ và tên chủ hộ.

VÌ SAO
Khu phố nào cũng đã có sẵn một file Excel danh sách dân cư — gõ lại từng người vào
màn hình thì 3000 nhân khẩu mất hàng tháng. Nhưng file đó chỉ có địa chỉ và tên, KHÔNG
có mã hộ; nhập thô vào thì được 3000 người rời rạc không thuộc hộ nào.

Nên bước nhập và bước dựng hộ phải đi liền nhau: đọc file, nhóm các dòng thành hộ theo
đúng quy tắc của `gop_ho.py`, tạo hộ, rồi mới ghi nhân khẩu vào đúng hộ đó.

QUY TẮC DỰNG HỘ — dùng lại nguyên của `gop_ho.py`, không viết bản thứ hai
  · Thường trú: cùng địa chỉ + cùng tên chủ hộ -> một hộ. Một địa chỉ chỉ có một
    nhóm và không ai khai tên chủ hộ -> vẫn gom, vì không có gì để nhầm.
  · Địa chỉ có nhiều tên chủ hộ khác nhau mà lại có người bỏ trống tên -> KHÔNG đoán.
    Người đó nhập vào nhưng để rời, cán bộ rà tay.
  · Tạm trú: bắt buộc có tên chủ hộ mới ghép. Một nhà trọ có nhiều hộ không liên quan.

LUÔN XEM TRƯỚC
`POST /cu-dan/nhap-excel` mặc định chỉ ĐỌC và trả về dự kiến: bao nhiêu hộ, bao nhiêu
người, dòng nào lỗi. Phải gửi lại kèm `xac_nhan: true` mới thực sự ghi. Nhập nhầm 3000
dòng rồi mới biết thì dọn rất mệt.
"""

import io
import re
from collections import defaultdict
from datetime import date, datetime

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from khuphoso.core.config import get_settings
from khuphoso.core.deps import CurrentUser, get_db, ghi_audit, require
from khuphoso.modules.residents.gop_ho import (
    chuan_dia_chi,
    chuan_ten,
    khong_dau as _bo_dau,
    pho_bien,
)
from khuphoso.modules.residents.router import cccd_fields

log = structlog.get_logger()
router = APIRouter(prefix="/cu-dan", tags=["nhân khẩu"])

TOI_DA_DONG = 5000
TOI_DA_MB = 10

# Cột trong file mẫu -> (khoá nội bộ, bắt buộc?). Khoá đọc theo TÊN CỘT chứ không
# theo vị trí: cán bộ hay chèn thêm cột hoặc đổi thứ tự, khoá theo vị trí là hỏng.
COT = {
    "họ và tên": ("full_name", True),
    "ngày sinh": ("dob", False),
    "giới tính": ("gender", False),
    "số cccd": ("id_card", False),
    "quan hệ với chủ hộ": ("relation_to_head", False),
    "tên chủ hộ": ("ten_chu_ho", False),
    "địa chỉ": ("dia_chi", False),
    "diện cư trú": ("residence_status", False),
    "tổ dân phố": ("to_dan_pho", False),
    "điện thoại": ("phone", False),
    "nghề nghiệp": ("occupation", False),
    "ghi chú": ("note", False),
}

# Tên cột khác mà vẫn cùng một ý. File do Công an phường xuất ra dùng bộ tên riêng,
# bắt cán bộ đổi tiêu đề trước khi nhập là bắt họ làm việc thừa và dễ gõ sai.
BI_DANH = {
    "họ tên": "họ và tên",
    "họ và tên đệm": "họ và tên",
    "năm sinh": "ngày sinh",
    "ngày tháng năm sinh": "ngày sinh",
    "đdcn": "số cccd",
    "số định danh": "số cccd",
    "số định danh cá nhân": "số cccd",
    "cccd": "số cccd",
    "cmnd": "số cccd",
    "chủ hộ": "tên chủ hộ",
    "họ tên chủ hộ": "tên chủ hộ",
    "địa chỉ cư trú": "địa chỉ",
    "nơi thường trú": "địa chỉ",
    "nơi ở hiện tại": "địa chỉ",
    "thời hạn": "hết hạn tạm trú",
    "thời hạn tạm trú": "hết hạn tạm trú",
    "hạn tạm trú": "hết hạn tạm trú",
    "sđt": "điện thoại",
    "số điện thoại": "điện thoại",
    "tổ": "tổ dân phố",
}

# Cột chỉ có ở file tạm trú
COT["hết hạn tạm trú"] = ("tam_tru_den_ngay", False)

GIOI_TINH = {
    "nam": "nam", "m": "nam", "male": "nam",
    "nữ": "nu", "nu": "nu", "f": "nu", "female": "nu",
    "khác": "khac", "khac": "khac",
}

DIEN = {
    "thường trú": "thuong_tru", "thuong tru": "thuong_tru", "tt": "thuong_tru",
    "tạm trú": "tam_tru", "tam tru": "tam_tru",
    "tạm vắng": "tam_vang", "tam vang": "tam_vang",
    "vãng lai": "vang_lai", "vang lai": "vang_lai",
}

# Chữ ở cột "quan hệ" cho biết người này LÀ chủ hộ
LA_CHU_HO = {"chủ hộ", "chu ho", "chủ hộ gia đình", "ch"}


def _chuoi(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return str(v).strip()


def _dinh_danh(v: str) -> str | None:
    """Bù số 0 đầu mà Excel cắt mất.

    Excel lưu ô số định danh dạng SỐ nên "074209009940" thành 74209009940. Số định
    danh luôn đúng 12 chữ số, nên thiếu bao nhiêu thì bù bấy nhiêu số 0 vào đầu.
    """
    s = re.sub(r"\D", "", v or "")
    if not s or len(s) > 12:
        return s or None
    return s.zfill(12) if len(s) >= 9 else s


def _ngay(v) -> date | None:
    """Excel trả về datetime hoặc chuỗi. Nhận cả dd/mm/yyyy lẫn yyyy-mm-dd."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for mau in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, mau).date()
        except ValueError:
            continue
    return None


# ═══════════════════════════════════════════════════════════ FILE MẪU ══


@router.get("/nhap-excel/mau", dependencies=[Depends(require("resident:read"))])
async def tai_mau() -> StreamingResponse:
    """File mẫu có sẵn tiêu đề, chú thích cách điền và hai dòng ví dụ.

    Không phát file tĩnh mà sinh tại chỗ: tên cột ở đây và bảng `COT` bên trên
    phải luôn khớp nhau, để hai chỗ thì sớm muộn cũng lệch.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Nhân khẩu"

    tieu_de = list(COT.keys())
    ws.append([t.title() for t in tieu_de])
    for i, t in enumerate(tieu_de, start=1):
        o = ws.cell(row=1, column=i)
        o.font = Font(bold=True, color="FFFFFF", size=10)
        o.fill = PatternFill("solid", fgColor="0055CC")
        o.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[o.column_letter].width = 22 if COT[t][0] != "full_name" else 26
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"

    ws.append([
        "Nguyễn Văn An", "12/03/1958", "Nam", "074123456789", "Chủ hộ",
        "", "225 Đường Lê Thị Trung", "Thường trú", "Tổ 1", "0908111222", "Hưu trí", "",
        "",
    ])
    ws.append([
        "Trần Thị Bảy", "20/07/1962", "Nữ", "", "Vợ",
        "Nguyễn Văn An", "225 Đường Lê Thị Trung", "Thường trú", "Tổ 1", "", "Nội trợ", "",
        "",
    ])
    ws.append([
        "Lý Văn Cường", "05/09/1995", "Nam", "074095004321", "Chủ hộ",
        "", "12/B4 Đường An Phú 02", "Tạm trú", "Tổ 3", "0933444555", "Công nhân", "",
        "30/06/2028",
    ])

    huong_dan = [
        "",
        "CÁCH ĐIỀN",
        "· Họ và tên: bắt buộc. Các cột khác để trống được, bổ sung sau.",
        "· Ngày sinh: dd/mm/yyyy, hoặc để Excel định dạng ngày.",
        "· Giới tính: Nam / Nữ / Khác.",
        "· Diện cư trú: Thường trú / Tạm trú / Tạm vắng / Vãng lai. Bỏ trống thì hiểu là Thường trú.",
        "· Hết hạn tạm trú: chỉ điền cho người TẠM TRÚ. Hết hạn thì chuông tự nhắc đi gia hạn.",
        "",
        "HỆ THỐNG TỰ DỰNG HỘ KHẨU — không cần cột mã hộ",
        "· Người là chủ hộ: ghi 'Chủ hộ' ở cột Quan hệ với chủ hộ, để trống cột Tên chủ hộ.",
        "· Thành viên: ghi quan hệ (Vợ, Con, Cha…) và ghi ĐÚNG tên chủ hộ ở cột Tên chủ hộ.",
        "· Cùng địa chỉ + cùng tên chủ hộ thì được xếp vào một hộ.",
        "· Một địa chỉ chỉ có một nhà, cả nhà bỏ trống tên chủ hộ: vẫn gom được thành một hộ.",
        "· Một địa chỉ có NHIỀU hộ mà lại có người bỏ trống tên chủ hộ: hệ thống KHÔNG đoán,",
        "  người đó vẫn được nhập nhưng để rời, cán bộ gán tay sau.",
        "· Hộ TẠM TRÚ bắt buộc có tên chủ hộ, vì một nhà trọ thường có nhiều hộ không liên quan.",
        "",
        "· Tối đa 5.000 dòng và 10MB mỗi lần nhập.",
        "· Xoá ba dòng ví dụ ở trên trước khi nhập thật.",
        "",
        "NẾU FILE CỦA ANH/CHỊ DÙNG TÊN CỘT KHÁC",
        "Hệ thống nhận cả các tên thường gặp khác: HỌ TÊN, NĂM SINH, ĐDCN, CHỦ HỘ,",
        "THỜI HẠN, SĐT, TỔ… nên không phải đổi tiêu đề trước khi nhập.",
        "Cột CHỦ HỘ điền cho mọi dòng cũng được: ai có HỌ TÊN trùng ô CHỦ HỘ thì là chủ hộ.",
    ]
    for d in huong_dan:
        ws.append([d])
    for i in range(len(tieu_de) + 4, len(tieu_de) + 4 + len(huong_dan)):
        ws.cell(row=i, column=1).font = Font(size=9, color="475569")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="mau-nhap-nhan-khau.xlsx"'},
    )


# ══════════════════════════════════════════════════════════════ ĐỌC ══


def _doc_file(du_lieu: bytes) -> tuple[list[dict], list[str]]:
    """Đọc workbook thành các bản ghi đã chuẩn hoá, kèm danh sách lỗi từng dòng."""
    from openpyxl import load_workbook

    try:
        wb = load_workbook(io.BytesIO(du_lieu), read_only=True, data_only=True)
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không đọc được file. Cần file Excel .xlsx — nếu đang là .xls hoặc .csv "
            "thì mở bằng Excel rồi Lưu thành .xlsx.",
        ) from None

    ws = wb.active
    hang = ws.iter_rows(values_only=True)
    try:
        dau = next(hang)
    except StopIteration:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File rỗng") from None

    # Khớp tiêu đề không phân biệt hoa thường và dấu cách thừa
    vi_tri: dict[str, int] = {}
    for i, o in enumerate(dau):
        ten = re.sub(r"\s+", " ", _chuoi(o)).lower().strip(" :.*")
        ten = BI_DANH.get(ten, ten)
        if ten in COT and COT[ten][0] not in vi_tri:
            vi_tri[COT[ten][0]] = i

    if "full_name" not in vi_tri:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không tìm thấy cột “Họ và tên” ở dòng đầu. Tải file mẫu và giữ nguyên "
            "dòng tiêu đề.",
        )

    ban_ghi: list[dict] = []
    loi: list[str] = []
    # [tổng ô kiểu ngày, số ô có ngày > 12] — xem chú thích ở cuối hàm
    dem_o_ngay = [0, 0]
    for so_dong, r in enumerate(hang, start=2):
        if so_dong > TOI_DA_DONG + 1:
            loi.append(f"Bỏ qua từ dòng {so_dong}: quá {TOI_DA_DONG} dòng cho một lần nhập.")
            break

        def lay(k: str) -> str:
            i = vi_tri.get(k)
            return _chuoi(r[i]) if i is not None and i < len(r) else ""

        ten = re.sub(r"\s+", " ", lay("full_name"))
        if not ten:
            # Dòng trống hoàn toàn là chuyện bình thường ở cuối bảng, không báo lỗi
            if any(_chuoi(o) for o in r):
                loi.append(f"Dòng {so_dong}: bỏ qua vì thiếu họ và tên.")
            continue
        if len(ten) < 2:
            loi.append(f"Dòng {so_dong}: “{ten}” quá ngắn, bỏ qua.")
            continue

        i_dob = vi_tri.get("dob")
        dob_tho = r[i_dob] if i_dob is not None and i_dob < len(r) else None
        dob = _ngay(dob_tho)
        if dob_tho and not dob:
            loi.append(f"Dòng {so_dong}: không hiểu ngày sinh “{_chuoi(dob_tho)}”, để trống.")
        # Ô mà Excel TỰ nhận thành ngày — dùng để dò xem nó có đảo ngày/tháng không
        if isinstance(dob_tho, (datetime, date)) and dob:
            dem_o_ngay[0] += 1
            if dob.day > 12:
                dem_o_ngay[1] += 1

        quan_he = lay("relation_to_head")
        ten_ch = re.sub(r"\s+", " ", lay("ten_chu_ho"))
        # File không có cột quan hệ thì nhận ra chủ hộ bằng cách khác: người nào
        # có HỌ TÊN trùng với ô CHỦ HỘ chính là chủ hộ. Đây là cách file của Công
        # an phường ghi — cột CHỦ HỘ điền cho MỌI dòng, kể cả chính chủ hộ.
        tu_la_chu = bool(ten_ch) and _bo_dau(ten) == _bo_dau(ten_ch)
        ban_ghi.append({
            "dong": so_dong,
            "full_name": ten,
            "dob": dob,
            "gender": GIOI_TINH.get(lay("gender").lower()) or None,
            "id_card": _dinh_danh(lay("id_card")),
            "relation_to_head": quan_he or None,
            "la_chu_ho": tu_la_chu
                          or chuan_ten(quan_he) in {chuan_ten(x) for x in LA_CHU_HO},
            # Chủ hộ tự khai thì bỏ trống ô này, không thì gom hộ sẽ tự ghép người
            # đó với chính mình thành một khoá riêng
            "ten_chu_ho": "" if tu_la_chu else ten_ch,
            "tam_tru_den_ngay": _ngay(
                r[vi_tri["tam_tru_den_ngay"]]
                if "tam_tru_den_ngay" in vi_tri and vi_tri["tam_tru_den_ngay"] < len(r)
                else None
            ),
            "dia_chi": lay("dia_chi"),
            "residence_status": DIEN.get(lay("residence_status").lower()) or "thuong_tru",
            "to_dan_pho": lay("to_dan_pho"),
            "phone": lay("phone") or None,
            "occupation": lay("occupation") or None,
            "note": lay("note") or None,
        })

    wb.close()

    # ── Dò xem Excel có đảo ngày và tháng không ───────────────────────────────
    #
    # Excel chạy trên máy đặt vùng Mỹ đọc "20/12/1981" theo kiểu tháng/ngày. Tháng
    # 20 không hợp lệ nên ô đó giữ nguyên chuỗi, còn "01/03/2003" thì nó nuốt gọn
    # và biến thành 1 tháng 3 trong khi ý người nhập là 1 tháng 3... hoặc 3 tháng 1.
    #
    # Dấu hiệu nhận ra: trong các ô Excel TỰ nhận thành ngày, gần như không ô nào
    # có ngày > 12. Ngày sinh thật thì khoảng 60% rơi vào ngày 13–31, nên tỉ lệ
    # gần 0% là bằng chứng chắc chắn.
    #
    # KHÔNG tự sửa: dòng nào cả ngày lẫn tháng đều ≤ 12 thì không có cách nào biết
    # đâu là ngày đâu là tháng. Sửa bừa là ghi sai ngày sinh của bà con. Chỉ cảnh
    # báo và chỉ cách xuất lại file cho đúng.
    tong, lon12 = dem_o_ngay
    if tong >= 30 and lon12 * 100 / tong < 5:
        loi.insert(0, (
            f"⚠ NGÀY VÀ THÁNG CÓ THỂ BỊ ĐẢO. Trong {tong} ô ngày sinh mà Excel tự nhận, "
            f"chỉ {lon12} ô có ngày lớn hơn 12 — ngày sinh thật thì phải khoảng 60%. "
            "Dấu hiệu này nghĩa là Excel đã đọc theo kiểu tháng/ngày. "
            "Cách sửa: mở file gốc, chọn cột ngày sinh, định dạng ô thành Text, "
            "nhập lại ngày rồi lưu; hoặc xuất lại từ hệ thống dân cư ra .csv. "
            "Hệ thống KHÔNG tự đảo lại vì với dòng có cả ngày lẫn tháng đều ≤ 12 "
            "thì không phân biệt được, đảo bừa là ghi sai ngày sinh."
        ))

    return ban_ghi, loi


# ════════════════════════════════════════════════════════ DỰNG HỘ ══


def _dung_ho(ban_ghi: list[dict]) -> tuple[list[dict], list[dict]]:
    """Nhóm bản ghi thành hộ. Trả về (danh sách hộ, những người để rời).

    Dùng đúng quy tắc của `gop_ho.py`. Khoá ghép là (địa chỉ chuẩn hoá, tên chủ hộ
    chuẩn hoá); người tự khai mình là chủ hộ thì khoá lấy chính tên họ.
    """
    theo_dia_chi: dict[str, list[dict]] = defaultdict(list)
    roi: list[dict] = []

    for b in ban_ghi:
        da = chuan_dia_chi(b["dia_chi"])
        if not da:
            # Không có địa chỉ thì không có căn cứ nào để biết ai ở chung nhà ai
            roi.append(b)
            continue
        theo_dia_chi[da].append(b)

    ho: list[dict] = []
    for da, nhom in theo_dia_chi.items():
        # Tên chủ hộ của từng người: tự khai là chủ hộ -> lấy tên mình
        for b in nhom:
            b["_khoa_ten"] = chuan_ten(b["full_name"] if b["la_chu_ho"] else b["ten_chu_ho"])

        ten_co = {b["_khoa_ten"] for b in nhom if b["_khoa_ten"]}
        khuyet = [b for b in nhom if not b["_khoa_ten"]]

        # Cả địa chỉ không ai khai tên chủ hộ -> một nhà, gom chung
        if not ten_co:
            if any(b["residence_status"] == "tam_tru" for b in nhom):
                # Nhà trọ thiếu tên chủ hộ thì không đoán được hộ nào với hộ nào
                roi.extend(nhom)
                continue
            ho.append({"dia_chi": pho_bien([b["dia_chi"] for b in nhom]),
                       "ten_chu_ho": "", "thanh_vien": nhom})
            continue

        theo_ten: dict[str, list[dict]] = defaultdict(list)
        for b in nhom:
            if b["_khoa_ten"]:
                theo_ten[b["_khoa_ten"]].append(b)

        # Địa chỉ chỉ có MỘT hộ: người khuyết tên gom luôn vào đó, không có gì để nhầm.
        # Có từ hai hộ trở lên: KHÔNG đoán, để rời cho cán bộ rà tay.
        if len(theo_ten) == 1 and khuyet:
            theo_ten[next(iter(theo_ten))].extend(khuyet)
        else:
            roi.extend(khuyet)

        for _, tv in theo_ten.items():
            tam = any(b["residence_status"] == "tam_tru" for b in tv)
            chu = next((b for b in tv if b["la_chu_ho"]), None)
            ho.append({
                "dia_chi": pho_bien([b["dia_chi"] for b in tv]),
                "ten_chu_ho": chu["full_name"] if chu else (tv[0]["ten_chu_ho"] or ""),
                "household_type": "tam_tru" if tam else "thuong_tru",
                "thanh_vien": tv,
            })

    for h in ho:
        h.setdefault("household_type", "thuong_tru")
    return ho, roi


# ═══════════════════════════════════════════════════════════ NHẬP ══


@router.post("/nhap-excel")
async def nhap_excel(
    request: Request,
    tep: UploadFile = File(...),
    xac_nhan: bool = Form(default=False),
    user: CurrentUser = Depends(require("resident:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Đọc file Excel, dựng hộ, và (khi `xac_nhan`) ghi vào cơ sở dữ liệu."""
    du_lieu = await tep.read()
    if len(du_lieu) > TOI_DA_MB * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File quá {TOI_DA_MB}MB. Chia nhỏ ra nhiều lần nhập.",
        )
    if not (tep.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ nhận file .xlsx. Mở bằng Excel rồi “Lưu thành” .xlsx.",
        )

    ban_ghi, loi = _doc_file(du_lieu)
    if not ban_ghi:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không có dòng nào đọc được. Kiểm tra lại cột “Họ và tên”.",
        )

    ho, roi = _dung_ho(ban_ghi)

    # Trùng với người đã có trong khu phố: cùng họ tên + cùng ngày sinh.
    # Chỉ CẢNH BÁO chứ không tự bỏ — hai người trùng tên trùng ngày sinh là có thật,
    # và bỏ nhầm thì cán bộ không biết là đã sót ai.
    trung = []
    for b in ban_ghi:
        if not b["dob"]:
            continue
        n = await db.scalar(
            text("""SELECT count(*) FROM resident
                    WHERE deleted_at IS NULL AND dob = :d
                      AND kp_unaccent(full_name) = kp_unaccent(:n)"""),
            {"d": b["dob"], "n": b["full_name"]},
        )
        if n:
            trung.append(f"Dòng {b['dong']}: {b['full_name']} ({b['dob']}) đã có trong khu phố.")

    tom_tat = {
        "so_dong_doc_duoc": len(ban_ghi),
        "so_ho_se_tao": len(ho),
        "so_nguoi_vao_ho": sum(len(h["thanh_vien"]) for h in ho),
        "so_nguoi_de_roi": len(roi),
        "canh_bao": loi + trung,
        "xem_truoc": [
            {
                "dia_chi": h["dia_chi"],
                "ten_chu_ho": h["ten_chu_ho"] or None,
                "household_type": h["household_type"],
                "thanh_vien": [t["full_name"] for t in h["thanh_vien"]],
            }
            for h in ho[:25]
        ],
        "nguoi_de_roi": [
            {"dong": b["dong"], "full_name": b["full_name"], "dia_chi": b["dia_chi"] or None}
            for b in roi[:25]
        ],
    }

    if not xac_nhan:
        return {"da_ghi": False, **tom_tat}

    # ── Ghi thật ─────────────────────────────────────────────────────────── #
    # Tổ dân phố: khớp theo tên, tổ chưa có thì tạo. Không tự tạo thì cột "Tổ dân
    # phố" trong file coi như vứt đi, mà đó là thứ cán bộ điền sẵn.
    to_map: dict[str, str] = {}
    for r in (await db.execute(
        text("SELECT id::text, name, code FROM neighborhood_group WHERE deleted_at IS NULL")
    )).all():
        to_map[chuan_ten(r[1])] = r[0]
        to_map[chuan_ten(r[2])] = r[0]

    async def id_to(ten: str) -> str | None:
        k = chuan_ten(ten)
        if not k:
            return None
        if k in to_map:
            return to_map[k]
        ma = re.sub(r"[^a-z0-9]+", "-", k)[:30] or "to"
        gid = await db.scalar(
            text("""INSERT INTO neighborhood_group (code, name)
                    VALUES (:c, :n) ON CONFLICT (code) DO NOTHING RETURNING id::text"""),
            {"c": ma, "n": ten.strip()},
        )
        if gid is None:
            gid = await db.scalar(
                text("SELECT id::text FROM neighborhood_group WHERE code = :c"), {"c": ma}
            )
        to_map[k] = gid
        return gid

    # Mã hộ tự sinh nối tiếp mã đang có, tránh đè lên hộ cũ
    dem = await db.scalar(text("SELECT count(*) FROM household")) or 0
    so_ho = so_nk = 0

    async def ghi_nguoi(b: dict, hid: str | None) -> str:
        gid = await id_to(b["to_dan_pho"])
        cc = cccd_fields(b["id_card"])
        return await db.scalar(
            text("""
            INSERT INTO resident (household_id, group_id, full_name, dob, gender,
                                  id_card_enc, id_card_last4, id_card_hash,
                                  relation_to_head, residence_status, phone, occupation,
                                  note, is_head, dia_chi_khai, ten_chu_ho_khai,
                                  tam_tru_den_ngay, created_by)
            VALUES (CAST(:h AS uuid), CAST(:g AS uuid), :n, :d, :gt,
                    CASE WHEN CAST(:cc AS text) IS NULL THEN NULL
                         ELSE pgp_sym_encrypt(CAST(:cc AS text), :k) END,
                    :last4,
                    CASE WHEN CAST(:cc AS text) IS NULL THEN NULL
                         ELSE encode(digest(CAST(:cc AS text), 'sha256'), 'hex') END,
                    :qh, :rs, :sdt, :ngh, :gc, :ch,
                    NULLIF(:dck, ''), NULLIF(:tch, ''), :tden, CAST(:u AS uuid))
            RETURNING id::text
        """),
            {"h": hid, "g": gid, "n": b["full_name"], "d": b["dob"], "gt": b["gender"],
             "cc": cc["hash"], "last4": cc["last4"], "k": get_settings().secret_key,
             "qh": b["relation_to_head"], "rs": b["residence_status"],
             "sdt": b["phone"], "ngh": b["occupation"], "gc": b["note"],
             "ch": bool(b["la_chu_ho"]) and hid is not None,
             "dck": "" if hid else b["dia_chi"], "tch": "" if hid else b["ten_chu_ho"],
             "tden": b.get("tam_tru_den_ngay"), "u": user.id},
        )

    for h in ho:
        dem += 1
        gid = await id_to(pho_bien([t["to_dan_pho"] for t in h["thanh_vien"]]) or "")
        hid = await db.scalar(
            text("""INSERT INTO household (code, group_id, address, household_type, created_by)
                    VALUES (:c, CAST(:g AS uuid), :a, :t, CAST(:u AS uuid))
                    ON CONFLICT (code) DO NOTHING
                    RETURNING id::text"""),
            {"c": f"NK-{dem:04d}", "g": gid, "a": h["dia_chi"],
             "t": h["household_type"], "u": user.id},
        )
        if hid is None:  # mã trùng, lùi sang mã khác
            dem += 1000
            hid = await db.scalar(
                text("""INSERT INTO household (code, group_id, address, household_type, created_by)
                        VALUES (:c, CAST(:g AS uuid), :a, :t, CAST(:u AS uuid))
                        RETURNING id::text"""),
                {"c": f"NK-{dem:04d}", "g": gid, "a": h["dia_chi"],
                 "t": h["household_type"], "u": user.id},
            )
        so_ho += 1

        chu_id = None
        for t in h["thanh_vien"]:
            rid = await ghi_nguoi(t, hid)
            so_nk += 1
            if t["la_chu_ho"] and chu_id is None:
                chu_id = rid
        # Không ai tự khai là chủ hộ thì lấy người đầu tiên: hộ không có chủ hộ thì
        # sổ hộ khẩu in ra trống chỗ quan trọng nhất
        if chu_id is None and h["thanh_vien"]:
            chu_id = await db.scalar(
                text("""SELECT id::text FROM resident WHERE household_id = CAST(:h AS uuid)
                        ORDER BY created_at LIMIT 1"""),
                {"h": hid},
            )
            await db.execute(
                text("""UPDATE resident SET is_head = true, relation_to_head = 'Chủ hộ'
                        WHERE id = CAST(:r AS uuid)"""),
                {"r": chu_id},
            )
        await db.execute(
            text("UPDATE household SET head_resident_id = CAST(:r AS uuid) WHERE id = CAST(:h AS uuid)"),
            {"r": chu_id, "h": hid},
        )

    for b in roi:
        await ghi_nguoi(b, None)
        so_nk += 1

    await ghi_audit(
        db, user, request, action="create", etype="resident", eid=None,
        changes=f'{{"nhap_excel":{{"so_ho":{so_ho},"so_nhan_khau":{so_nk}}}}}',
    )
    await db.commit()
    log.info("resident.import", ho=so_ho, nhan_khau=so_nk, boi=user.full_name)

    return {"da_ghi": True, "so_ho_da_tao": so_ho, "so_nhan_khau_da_tao": so_nk, **tom_tat}
