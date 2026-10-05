/**
 * Bảng kiểm nội dung phải công khai — Luật Thực hiện dân chủ ở cơ sở 10/2022/QH15.
 *
 * Khu phố bị kiểm tra việc này. Câu hỏi của đoàn kiểm tra luôn là "nội dung X đã
 * công khai chưa, bằng hình thức gì, ngày nào, ai làm" — nên bốn thứ đó là bốn
 * cột của màn hình, không phải một ô ghi chú tự do.
 *
 * MỤC QUÁ HẠN TÍNH LÀ CHƯA LÀM. Ngân sách phải công khai lại mỗi 6 tháng; công
 * khai một lần hồi năm ngoái rồi để đó thì trên giấy tờ vẫn là chưa làm. Nếu tính
 * là xong thì bảng kiểm lúc nào cũng xanh và mất hẳn tác dụng nhắc việc.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  HopThoai,
  Input,
  NutIcon,
  ONumber,
  Rong,
  Select,
  Spinner,
  Textarea,
  ThanhTieuDe,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { ngay } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

interface Muc {
  id: string;
  title: string;
  mo_ta: string | null;
  nhom: string | null;
  bat_buoc: boolean;
  da_cong_khai: boolean;
  hinh_thuc: string | null;
  ngay_cong_khai: string | null;
  nguoi_thuc_hien: string | null;
  ghi_chu: string | null;
  dinh_ky_thang: number | null;
  qua_han: boolean;
  han_lam_lai: string | null;
}

interface BangKiem {
  tong_so: number;
  so_bat_buoc: number;
  so_da_lam: number;
  so_qua_han: number;
  ty_le: number;
  items: Muc[];
}

const NHOM: Record<string, string> = {
  ke_hoach: 'Kế hoạch',
  ngan_sach: 'Ngân sách, quỹ',
  quy_hoach: 'Quy hoạch, đất đai',
  chinh_sach: 'Chính sách xã hội',
  dan_chu: 'Dân chủ, hương ước',
  to_chuc: 'Tổ chức, cán bộ',
  giam_sat: 'Thanh tra, giám sát',
};

const HINH_THUC = [
  'Niêm yết tại nhà văn hoá',
  'Niêm yết tại bảng tin khu phố',
  'Công bố tại hội nghị nhân dân',
  'Loa truyền thanh',
  'Nhóm Zalo khu phố',
  'Gửi tới từng hộ',
];

export function CongKhai() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);

  const [sua, setSua] = useState<Muc | null>(null);
  const [them, setThem] = useState(false);
  const [hoiXoa, setHoiXoa] = useState<Muc | null>(null);
  const [chiConThieu, setChiConThieu] = useState(false);

  useEffect(() => {
    datManHinh({ tieu_de: '📋 Nội dung công khai' });
  }, [datManHinh]);

  const { data } = useQuery({
    queryKey: ['cong-khai'],
    queryFn: () => get<BangKiem>('/cong-khai'),
    enabled: can('meeting:read'),
  });

  const lamMoi = () => void qc.invalidateQueries({ queryKey: ['cong-khai'] });

  const danhDau = useMutation({
    mutationFn: (m: Muc) =>
      patch(`/cong-khai/${m.id}`, { da_cong_khai: !m.da_cong_khai || m.qua_han }),
    onSuccess: lamMoi,
  });

  const xoa = useMutation({
    mutationFn: (m: Muc) => del(`/cong-khai/${m.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      lamMoi();
    },
  });

  if (!can('meeting:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem mục này." />;
  }

  const suaDuoc = can('meeting:write');
  const ds = (data?.items ?? []).filter(
    (m) => !chiConThieu || !m.da_cong_khai || m.qua_han,
  );

  return (
    <>
      <ThanhTieuDe
        tieu_de="Nội dung phải công khai"
        mo_ta="Theo Luật Thực hiện dân chủ ở cơ sở 10/2022 — đoàn kiểm tra sẽ hỏi đúng bảng này"
      >
        {suaDuoc && (
          <Button icon={Plus} onClick={() => setThem(true)}>
            THÊM NỘI DUNG
          </Button>
        )}
      </ThanhTieuDe>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ONumber
            nhan="Đã công khai"
            gia_tri={`${data.so_da_lam}/${data.so_bat_buoc}`}
            phu={`${data.ty_le}% nội dung bắt buộc`}
            phu_mau={data.ty_le >= 100 ? 'text-emerald-700' : 'text-amber-700'}
            icon={ClipboardCheck}
            mau={data.ty_le >= 100 ? 'emerald' : 'amber'}
          />
          <ONumber
            nhan="Còn phải làm"
            gia_tri={data.so_bat_buoc - data.so_da_lam}
            phu={data.so_bat_buoc - data.so_da_lam ? 'Chưa công khai' : 'Đã đủ'}
            icon={ClipboardCheck}
            mau={data.so_bat_buoc - data.so_da_lam ? 'rose' : 'emerald'}
          />
          <ONumber
            nhan="Quá hạn làm lại"
            gia_tri={data.so_qua_han}
            phu={data.so_qua_han ? 'Đã công khai nhưng quá kỳ' : 'Không có mục nào trễ'}
            phu_mau={data.so_qua_han ? 'text-rose-700' : 'text-emerald-700'}
            icon={ClipboardCheck}
            mau={data.so_qua_han ? 'rose' : 'emerald'}
          />
          <ONumber nhan="Tổng nội dung" gia_tri={data.tong_so} icon={ClipboardCheck} mau="slate" />
        </div>
      )}

      <Card className="p-3">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={chiConThieu}
            onChange={(e) => setChiConThieu(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
          />
          <span className="text-xs font-bold text-slate-600">
            Chỉ hiện nội dung còn phải làm
          </span>
        </label>
      </Card>

      {!data ? (
        <Card>
          <Spinner label="Đang tải bảng kiểm…" />
        </Card>
      ) : ds.length === 0 ? (
        <Rong
          emoji="🎉"
          loi_nhan={
            chiConThieu
              ? 'Đã công khai đủ mọi nội dung bắt buộc, không mục nào quá hạn.'
              : 'Chưa có nội dung nào trong bảng kiểm.'
          }
        />
      ) : (
        <div className="space-y-2">
          {ds.map((m) => {
            const xong = m.da_cong_khai && !m.qua_han;
            return (
              <Card
                key={m.id}
                className={cx(
                  'p-3.5',
                  m.qua_han && 'border-rose-200 bg-rose-50/40',
                  xong && 'bg-emerald-50/30',
                )}
              >
                <div className="flex items-start gap-3">
                  {suaDuoc ? (
                    <button
                      onClick={() => danhDau.mutate(m)}
                      title={xong ? 'Bỏ đánh dấu' : 'Đánh dấu đã công khai hôm nay'}
                      className={cx(
                        'mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors',
                        xong
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white hover:border-blue-500',
                      )}
                    >
                      {xong && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span
                      className={cx(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                        xong ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300',
                      )}
                    >
                      {xong && <Check className="h-3.5 w-3.5" />}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-bold text-slate-900">{m.title}</span>
                      {!m.bat_buoc && (
                        <Chip mau="slate" nho>
                          Không bắt buộc
                        </Chip>
                      )}
                      {m.nhom && (
                        <Chip mau="blue" nho>
                          {NHOM[m.nhom] ?? m.nhom}
                        </Chip>
                      )}
                      {m.qua_han && (
                        <Chip mau="rose" nho>
                          ⏰ Quá hạn công khai lại
                        </Chip>
                      )}
                    </div>

                    {m.mo_ta && (
                      <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">{m.mo_ta}</p>
                    )}

                    <p className="mt-1 text-[10.5px] text-slate-600">
                      {m.da_cong_khai ? (
                        <>
                          <span className="font-semibold">{m.hinh_thuc || 'chưa ghi hình thức'}</span>
                          {m.ngay_cong_khai && (
                            <span className="font-mono"> · {ngay(m.ngay_cong_khai)}</span>
                          )}
                          {m.nguoi_thuc_hien && <span> · {m.nguoi_thuc_hien}</span>}
                        </>
                      ) : (
                        <span className="font-semibold text-amber-700">Chưa công khai</span>
                      )}
                      {m.dinh_ky_thang && (
                        <span className="text-slate-400">
                          {' '}
                          · làm lại mỗi {m.dinh_ky_thang} tháng
                          {m.han_lam_lai && ` (hạn ${ngay(m.han_lam_lai)})`}
                        </span>
                      )}
                    </p>
                  </div>

                  {suaDuoc && (
                    <div className="flex shrink-0 gap-1">
                      <Button mau="trang" onClick={() => setSua(m)}>
                        GHI NHẬN
                      </Button>
                      <NutIcon
                        icon={Trash2}
                        mau="text-red-500"
                        title="Bỏ nội dung này khỏi bảng kiểm"
                        onClick={() => setHoiXoa(m)}
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] font-medium text-slate-400">
        Mục đã công khai nhưng quá kỳ phải làm lại được tính là <b>chưa làm</b> — nếu tính là
        xong thì bảng kiểm lúc nào cũng xanh và mất tác dụng nhắc việc.
      </p>

      {sua && <FormGhiNhan m={sua} onClose={() => setSua(null)} onXong={lamMoi} />}
      {them && <FormThem onClose={() => setThem(false)} onXong={lamMoi} />}

      <XacNhan
        nhan_nut="XOÁ NỘI DUNG"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá khỏi bảng kiểm"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Bỏ <b>{hoiXoa?.title}</b> khỏi bảng kiểm?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Chỉ nên xoá nội dung không thuộc trách nhiệm của khu phố mình. Nội dung bắt buộc
              theo luật mà xoá đi thì đoàn kiểm tra vẫn hỏi.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ────────────────────────────────────────────────── Ghi nhận công khai ── */

function FormGhiNhan({
  m,
  onClose,
  onXong,
}: {
  m: Muc;
  onClose: () => void;
  onXong: () => void;
}) {
  const [f, setF] = useState({
    da_cong_khai: m.da_cong_khai,
    hinh_thuc: m.hinh_thuc ?? '',
    ngay_cong_khai: m.ngay_cong_khai ?? new Date().toISOString().slice(0, 10),
    nguoi_thuc_hien: m.nguoi_thuc_hien ?? '',
    ghi_chu: m.ghi_chu ?? '',
    dinh_ky_thang: String(m.dinh_ky_thang ?? ''),
  });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () =>
      patch(`/cong-khai/${m.id}`, {
        da_cong_khai: f.da_cong_khai,
        hinh_thuc: f.hinh_thuc,
        ngay_cong_khai: f.ngay_cong_khai || null,
        nguoi_thuc_hien: f.nguoi_thuc_hien,
        ghi_chu: f.ghi_chu,
        dinh_ky_thang: f.dinh_ky_thang ? Number(f.dinh_ky_thang) : null,
      }),
    onSuccess: () => {
      onXong();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  return (
    <HopThoai
      mo
      dong={onClose}
      tieu_de={m.title}
      emoji="📋"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button onClick={() => luu.mutate()} disabled={luu.isPending}>
            {luu.isPending ? 'ĐANG LƯU…' : 'LƯU'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        {m.qua_han && (
          <CanhBao loai="canh" emoji="⏰">
            Nội dung này đã công khai ngày <b>{ngay(m.ngay_cong_khai)}</b> nhưng quá kỳ{' '}
            {m.dinh_ky_thang} tháng. Ghi lại ngày công khai mới để tính lại kỳ sau.
          </CanhBao>
        )}

        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 select-none">
          <input
            type="checkbox"
            checked={f.da_cong_khai}
            onChange={(e) => dat('da_cong_khai', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
          />
          <span className="text-xs font-bold text-slate-700">Đã công khai nội dung này</span>
        </label>

        {f.da_cong_khai && (
          <>
            <Truong nhan="Hình thức công khai" bat_buoc>
              <Select value={f.hinh_thuc} onChange={(e) => dat('hinh_thuc', e.target.value)}>
                <option value="">Chọn hình thức…</option>
                {HINH_THUC.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
                {f.hinh_thuc && !HINH_THUC.includes(f.hinh_thuc) && (
                  <option value={f.hinh_thuc}>{f.hinh_thuc}</option>
                )}
              </Select>
            </Truong>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Truong nhan="Ngày công khai">
                <Input
                  type="date"
                  value={f.ngay_cong_khai}
                  onChange={(e) => dat('ngay_cong_khai', e.target.value)}
                />
              </Truong>
              <Truong nhan="Người thực hiện">
                <Input
                  value={f.nguoi_thuc_hien}
                  onChange={(e) => dat('nguoi_thuc_hien', e.target.value)}
                  placeholder="Trưởng khu phố"
                />
              </Truong>
            </div>
          </>
        )}

        <Truong
          nhan="Định kỳ làm lại (tháng)"
          ghi_chu="Để trống nghĩa là công khai một lần là xong"
        >
          <Input
            value={f.dinh_ky_thang}
            onChange={(e) => dat('dinh_ky_thang', e.target.value.replace(/\D/g, ''))}
            placeholder="6"
            inputMode="numeric"
            className="font-mono"
          />
        </Truong>

        <Truong nhan="Ghi chú">
          <Textarea
            value={f.ghi_chu}
            onChange={(e) => dat('ghi_chu', e.target.value)}
            placeholder="Số văn bản, vị trí niêm yết…"
          />
        </Truong>
      </div>
    </HopThoai>
  );
}

/* ──────────────────────────────────────────────────── Thêm nội dung ── */

function FormThem({ onClose, onXong }: { onClose: () => void; onXong: () => void }) {
  const [f, setF] = useState({ title: '', mo_ta: '', nhom: '', dinh_ky_thang: '', bat_buoc: true });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () =>
      post('/cong-khai', {
        title: f.title.trim(),
        mo_ta: f.mo_ta,
        nhom: f.nhom || null,
        bat_buoc: f.bat_buoc,
        dinh_ky_thang: f.dinh_ky_thang ? Number(f.dinh_ky_thang) : null,
        sort_order: 99,
      }),
    onSuccess: () => {
      onXong();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  return (
    <HopThoai
      mo
      dong={onClose}
      tieu_de="Thêm nội dung phải công khai"
      emoji="📋"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (f.title.trim().length < 3) return setLoi('Chưa nhập tên nội dung.');
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG LƯU…' : 'THÊM'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <Truong nhan="Tên nội dung" bat_buoc>
          <Input
            value={f.title}
            onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))}
            placeholder="Kết quả vận động Quỹ Vì người nghèo 2027"
            autoFocus
          />
        </Truong>

        <Truong nhan="Mô tả">
          <Textarea
            value={f.mo_ta}
            onChange={(e) => setF((s) => ({ ...s, mo_ta: e.target.value }))}
            placeholder="Công khai cái gì cụ thể…"
          />
        </Truong>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Truong nhan="Nhóm">
            <Select value={f.nhom} onChange={(e) => setF((s) => ({ ...s, nhom: e.target.value }))}>
              <option value="">Chưa phân nhóm</option>
              {Object.entries(NHOM).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Truong>
          <Truong nhan="Định kỳ (tháng)" ghi_chu="Trống = một lần">
            <Input
              value={f.dinh_ky_thang}
              onChange={(e) =>
                setF((s) => ({ ...s, dinh_ky_thang: e.target.value.replace(/\D/g, '') }))
              }
              placeholder="6"
              inputMode="numeric"
              className="font-mono"
            />
          </Truong>
        </div>

        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={f.bat_buoc}
            onChange={(e) => setF((s) => ({ ...s, bat_buoc: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
          />
          <span className="text-xs font-bold text-slate-700">
            Bắt buộc theo luật (tính vào tỉ lệ hoàn thành)
          </span>
        </label>

        <p className="text-[10px] font-medium text-slate-400">
          Bỏ dấu này cho nội dung khu phố tự nguyện công khai — nó vẫn hiện trong bảng nhưng
          không kéo tỉ lệ xuống.
        </p>
      </div>
    </HopThoai>
  );
}
