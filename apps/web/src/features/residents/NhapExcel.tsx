/**
 * Nhập danh sách nhân khẩu từ Excel.
 *
 * Ba bước, đi thẳng một chiều: tải mẫu → chọn file → xem trước → ghi.
 *
 * Bước XEM TRƯỚC là bước quan trọng nhất và không bỏ qua được. Máy chủ đọc file,
 * dựng thử hộ khẩu, rồi trả về "sẽ tạo bao nhiêu hộ, bao nhiêu người, dòng nào có
 * vấn đề" mà KHÔNG ghi gì. Nhập nhầm 3000 dòng rồi mới biết thì dọn rất mệt.
 *
 * Màn hình nói rõ ba con số mà cán bộ cần đối chiếu với file gốc của mình:
 *   · bao nhiêu dòng đọc được (so với số dòng trong file)
 *   · bao nhiêu hộ dựng được
 *   · bao nhiêu người KHÔNG xếp được vào hộ nào — đây là chỗ hay bị bỏ sót nhất
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  ONumber,
  Rong,
  ThanhTieuDe,
} from '@/components/ui';
import { postForm, taiTep } from '@/lib/api';
import { so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

interface XemTruoc {
  da_ghi: boolean;
  so_dong_doc_duoc: number;
  so_ho_se_tao: number;
  so_nguoi_vao_ho: number;
  so_nguoi_de_roi: number;
  canh_bao: string[];
  xem_truoc: {
    dia_chi: string | null;
    ten_chu_ho: string | null;
    household_type: string;
    thanh_vien: string[];
  }[];
  nguoi_de_roi: { dong: number; full_name: string; dia_chi: string | null }[];
  so_ho_da_tao?: number;
  so_nhan_khau_da_tao?: number;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function NhapExcel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const oTep = useRef<HTMLInputElement>(null);

  const [tep, setTep] = useState<File | null>(null);
  const [kq, setKq] = useState<XemTruoc | null>(null);
  const [loi, setLoi] = useState('');
  const [keo, setKeo] = useState(false);

  useEffect(() => {
    datManHinh({ tieu_de: '📥 Nhập từ Excel' });
  }, [datManHinh]);

  const gui = useMutation({
    mutationFn: ({ t, ghi }: { t: File; ghi: boolean }) => {
      const fd = new FormData();
      fd.append('tep', t);
      if (ghi) fd.append('xac_nhan', 'true');
      return postForm<XemTruoc>('/cu-dan/nhap-excel', fd);
    },
    onSuccess: (r) => {
      setLoi('');
      setKq(r);
      if (r.da_ghi) {
        for (const k of ['cu-dan', 'ho-khau', 'to-dan-pho', 'thong-ke', 'ho-khau-ban-do', 'thong-bao']) {
          void qc.invalidateQueries({ queryKey: [k] });
        }
      }
    },
    onError: (e) => {
      setKq(null);
      setLoi(e instanceof Error ? e.message : 'Không đọc được file');
    },
  });

  if (!can('resident:write')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được nhập dữ liệu." />;
  }

  const chon = (t: File | null | undefined) => {
    if (!t) return;
    setTep(t);
    setKq(null);
    setLoi('');
    gui.mutate({ t, ghi: false });
  };

  const lamLai = () => {
    setTep(null);
    setKq(null);
    setLoi('');
  };

  return (
    <>
      <ThanhTieuDe
        tieu_de="Nhập nhân khẩu từ Excel"
        mo_ta="Hệ thống tự dựng hộ khẩu theo địa chỉ và tên chủ hộ — file không cần cột mã hộ"
      >
        <Button
          mau="luc"
          icon={Download}
          onClick={() =>
            taiTep('/cu-dan/nhap-excel/mau', 'mau-nhap-nhan-khau.xlsx').catch((e: unknown) =>
              setLoi(e instanceof Error ? e.message : 'Không tải được file mẫu'),
            )
          }
        >
          TẢI FILE MẪU
        </Button>
      </ThanhTieuDe>

      {loi && (
        <CanhBao loai="loi" emoji="⚠️">
          {loi}
        </CanhBao>
      )}

      {/* ── Bước 1: chọn file ───────────────────────────────────────────── */}
      {!kq?.da_ghi && (
        <Card
          className={cx(
            'p-6 text-center transition-colors',
            keo && 'border-blue-400 bg-blue-50/50',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setKeo(true);
          }}
          onDragLeave={() => setKeo(false)}
          onDrop={(e) => {
            e.preventDefault();
            setKeo(false);
            chon(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={oTep}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              chon(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-[12.5px] font-bold text-slate-800">
            {tep ? tep.name : 'Kéo file .xlsx vào đây, hoặc bấm chọn'}
          </p>
          <p className="mt-0.5 text-[10.5px] font-medium text-slate-400">
            {tep
              ? `${mb(tep.size)} · bấm chọn lại nếu nhầm file`
              : 'Tối đa 5.000 dòng và 10MB. Chưa có file thì tải mẫu ở nút phía trên.'}
          </p>
          <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              mau="trang"
              icon={Upload}
              onClick={() => oTep.current?.click()}
              disabled={gui.isPending}
            >
              {gui.isPending ? 'ĐANG ĐỌC FILE…' : tep ? 'CHỌN FILE KHÁC' : 'CHỌN FILE EXCEL'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Bước 2: xem trước ───────────────────────────────────────────── */}
      {kq && !kq.da_ghi && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ONumber
              nhan="Dòng đọc được"
              gia_tri={so(kq.so_dong_doc_duoc)}
              icon={FileSpreadsheet}
              mau="slate"
            />
            <ONumber
              nhan="Hộ sẽ tạo"
              gia_tri={so(kq.so_ho_se_tao)}
              icon={FileSpreadsheet}
              mau="blue"
            />
            <ONumber
              nhan="Người vào hộ"
              gia_tri={so(kq.so_nguoi_vao_ho)}
              icon={FileSpreadsheet}
              mau="emerald"
            />
            <ONumber
              nhan="Người để rời"
              gia_tri={so(kq.so_nguoi_de_roi)}
              phu={kq.so_nguoi_de_roi ? 'Phải gán hộ bằng tay sau' : 'Ai cũng có hộ'}
              phu_mau={kq.so_nguoi_de_roi ? 'text-amber-700' : 'text-emerald-700'}
              icon={FileSpreadsheet}
              mau={kq.so_nguoi_de_roi ? 'amber' : 'emerald'}
            />
          </div>

          <CanhBao loai="canh" emoji="👀">
            <b>Chưa ghi gì cả.</b> Đây mới là bản dựng thử. Đối chiếu bốn con số trên với file
            của anh/chị, xem vài hộ mẫu bên dưới, thấy đúng thì mới bấm ghi.
          </CanhBao>

          {kq.canh_bao.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-amber-800 uppercase">
                <AlertTriangle className="h-3.5 w-3.5" />
                Cần xem lại ({kq.canh_bao.length})
              </p>
              <div className="custom-scrollbar mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {kq.canh_bao.map((c, i) => (
                  <p key={i} className="text-[11px] font-medium text-amber-900">
                    · {c}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-[10px] font-medium text-amber-700">
                Đây là cảnh báo, không phải lỗi chặn. Vẫn ghi được — nhưng nên sửa file rồi
                nhập lại nếu là lỗi thật.
              </p>
            </Card>
          )}

          {kq.xem_truoc.length > 0 && (
            <Card className="p-3.5">
              <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Hộ dựng thử ({kq.xem_truoc.length} hộ đầu trong {so(kq.so_ho_se_tao)})
              </p>
              <div className="space-y-1.5">
                {kq.xem_truoc.map((h, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11.5px] font-bold text-slate-900">
                        {h.dia_chi || 'chưa có địa chỉ'}
                      </span>
                      <Chip mau={h.household_type === 'tam_tru' ? 'amber' : 'blue'} nho>
                        {h.household_type === 'tam_tru' ? 'Tạm trú' : 'Thường trú'}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-slate-600">
                      <b>{h.ten_chu_ho || 'chưa rõ chủ hộ'}</b> · {h.thanh_vien.length} người:{' '}
                      {h.thanh_vien.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {kq.nguoi_de_roi.length > 0 && (
            <Card className="p-3.5">
              <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Người không xếp được vào hộ nào ({kq.nguoi_de_roi.length} người đầu)
              </p>
              <div className="space-y-0.5">
                {kq.nguoi_de_roi.map((r) => (
                  <p key={r.dong} className="text-[11px] text-slate-700">
                    <span className="font-mono text-slate-400">dòng {r.dong}</span>{' '}
                    <b>{r.full_name}</b>
                    {r.dia_chi ? ` — ${r.dia_chi}` : ' — không có địa chỉ'}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-[10px] font-medium text-slate-400">
                Hệ thống <b>không đoán bừa</b>: một địa chỉ có nhiều hộ mà người này không khai
                tên chủ hộ, hoặc không có địa chỉ. Họ vẫn được nhập, chỉ là chưa thuộc hộ nào —
                gán sau ở màn hình nhân khẩu, hoặc dùng “Gom nhân khẩu vào hộ”.
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              mau="trang"
              onClick={lamLai}
              disabled={gui.isPending}
              className="flex-1 justify-center"
            >
              HUỶ, CHỌN FILE KHÁC
            </Button>
            <Button
              icon={Upload}
              onClick={() => tep && gui.mutate({ t: tep, ghi: true })}
              disabled={gui.isPending || !tep}
              className="flex-1 justify-center"
            >
              {gui.isPending
                ? 'ĐANG GHI…'
                : `GHI ${so(kq.so_ho_se_tao)} HỘ VÀ ${so(kq.so_dong_doc_duoc)} NHÂN KHẨU`}
            </Button>
          </div>
        </>
      )}

      {/* ── Bước 3: xong ────────────────────────────────────────────────── */}
      {kq?.da_ghi && (
        <>
          <CanhBao loai="ok" emoji="✅">
            Đã nhập <b>{so(kq.so_nhan_khau_da_tao ?? 0)} nhân khẩu</b> vào{' '}
            <b>{so(kq.so_ho_da_tao ?? 0)} hộ khẩu</b>.
            {kq.so_nguoi_de_roi > 0 &&
              ` Còn ${so(kq.so_nguoi_de_roi)} người chưa thuộc hộ nào, cần gán bằng tay.`}
          </CanhBao>

          <Card className="p-4">
            <p className="text-[11.5px] font-bold text-slate-800">Việc nên làm tiếp</p>
            <ul className="mt-1.5 space-y-1 text-[11px] font-medium text-slate-600">
              <li>· Mở màn hình Hộ khẩu đối chiếu vài hộ với sổ giấy.</li>
              <li>· Hộ mới nhập chưa có toạ độ — dùng “Xác minh theo tuyến” để đi ghim.</li>
              {kq.so_nguoi_de_roi > 0 && (
                <li>· Gán hộ cho {so(kq.so_nguoi_de_roi)} người còn rời.</li>
              )}
            </ul>
          </Card>

          <Button mau="trang" onClick={lamLai}>
            NHẬP FILE KHÁC
          </Button>
        </>
      )}

      {/* ── Hướng dẫn, luôn hiện ────────────────────────────────────────── */}
      <Card className="p-3.5">
        <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
          Hệ thống dựng hộ khẩu thế nào
        </p>
        <ul className="mt-1.5 space-y-1 text-[11px] font-medium text-slate-600">
          <li>
            · Người là chủ hộ: ghi <b>“Chủ hộ”</b> ở cột <i>Quan hệ với chủ hộ</i>, để trống
            cột <i>Tên chủ hộ</i>.
          </li>
          <li>
            · Thành viên: ghi quan hệ (Vợ, Con, Cha…) và ghi <b>đúng tên chủ hộ</b> ở cột{' '}
            <i>Tên chủ hộ</i>.
          </li>
          <li>· Cùng địa chỉ + cùng tên chủ hộ thì được xếp vào một hộ.</li>
          <li>
            · Một địa chỉ chỉ có một nhà và cả nhà bỏ trống tên chủ hộ: vẫn gom thành một hộ.
          </li>
          <li>
            · Một địa chỉ có nhiều hộ mà có người bỏ trống tên chủ hộ:{' '}
            <b>không đoán</b>, để rời cho cán bộ gán tay.
          </li>
          <li>
            · Hộ <b>tạm trú bắt buộc</b> có tên chủ hộ — một nhà trọ thường có nhiều hộ không
            liên quan nhau.
          </li>
          <li>· Tổ dân phố ghi trong file mà chưa có thì hệ thống tạo mới.</li>
        </ul>
      </Card>
    </>
  );
}
