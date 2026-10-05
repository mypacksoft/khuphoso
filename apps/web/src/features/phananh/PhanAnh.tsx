/**
 * Phản ánh hiện trường.
 *
 * Người dùng chính đang ĐỨNG NGOÀI ĐƯỜNG, một tay cầm điện thoại. Nên nút "Chụp
 * và báo ngay" là nút to nhất màn hình, và nó làm ba việc trong một lần bấm: mở
 * máy ảnh, lấy toạ độ, mở form đã điền sẵn vị trí.
 *
 * TOẠ ĐỘ LẤY TỰ ĐỘNG, KHÔNG BẮT GÕ. "Cống vỡ ở đường An Phú 13" thì đội sửa chữa
 * vẫn phải dò cả con đường. Toạ độ lấy tại chỗ đưa họ tới đúng cái nắp cống.
 *
 * Sai số GPS được hiện ra chứ không giấu: trong hẻm sâu có thể lệch 50m, người
 * đi sửa biết mà liệu, còn hơn tin một cái ghim sai rồi tìm nhầm chỗ.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  Crosshair,
  Flame,
  Image as ImageIcon,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  Input,
  NganKeo,
  NutIcon,
  ONumber,
  PhanTrang,
  Rong,
  Select,
  Spinner,
  Textarea,
  ThanhTieuDe,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post, postForm, qs } from '@/lib/api';
import { ngay, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { ToDanPho } from '@/lib/types';

const MOI_TRANG_MAC_DINH = 20;

const LOAI: Record<string, string> = {
  ha_tang: 'Hạ tầng, đường sá',
  ve_sinh: 'Vệ sinh môi trường',
  an_ninh: 'An ninh trật tự',
  trat_tu: 'Trật tự đô thị',
  cay_xanh: 'Cây xanh',
  chieu_sang: 'Chiếu sáng',
  ngap_nuoc: 'Ngập nước',
  khac: 'Khác',
};

const MUC_DO: Record<string, { nhan: string; mau: 'slate' | 'amber' | 'rose' }> = {
  binh_thuong: { nhan: 'Bình thường', mau: 'slate' },
  can_som: { nhan: 'Cần sớm', mau: 'amber' },
  khan_cap: { nhan: 'Khẩn cấp', mau: 'rose' },
};

const TRANG_THAI: Record<
  string,
  { nhan: string; mau: 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' }
> = {
  moi: { nhan: 'Mới tiếp nhận', mau: 'amber' },
  dang_xu_ly: { nhan: 'Đang xử lý', mau: 'blue' },
  da_chuyen_phuong: { nhan: 'Đã chuyển phường', mau: 'blue' },
  da_xong: { nhan: 'Đã xử lý xong', mau: 'emerald' },
  khong_xu_ly: { nhan: 'Không xử lý', mau: 'slate' },
};

interface PA {
  id: string;
  title: string;
  mo_ta: string | null;
  loai: string;
  ten_loai: string;
  muc_do: string;
  ten_muc_do: string;
  dia_chi: string | null;
  trang_thai: string;
  ten_trang_thai: string;
  nguoi_bao: string | null;
  dien_thoai: string | null;
  nguoi_xu_ly: string | null;
  han_xu_ly: string | null;
  ngay_xong: string | null;
  ket_qua: string | null;
  ly_do: string | null;
  do_chinh_xac_m: number | null;
  toa_do: { lat: number; lng: number } | null;
  to_dan_pho: string | null;
  ma_ho: string | null;
  group_id: string | null;
  so_anh: number;
  con_ngay: number | null;
  da_qua_han: boolean;
  created_at: string;
}

interface PAChiTiet extends PA {
  anh: {
    id: string;
    ten_goc: string;
    kich_thuoc: number;
    la_sau_xu_ly: boolean;
  }[];
}

/** Lấy GPS một lần, độ chính xác cao. Lỗi trả về bằng tiếng Việt dễ hiểu. */
function layGps(): Promise<GeolocationPosition> {
  return new Promise((ok, hong) => {
    if (!navigator.geolocation) return hong(new Error('Máy này không hỗ trợ định vị.'));
    navigator.geolocation.getCurrentPosition(
      ok,
      (e) => {
        const chu: Record<number, string> = {
          1: 'Chưa cấp quyền vị trí cho trình duyệt. Vẫn gửi được nhưng không có toạ độ.',
          2: 'Chưa bắt được tín hiệu. Ra chỗ thoáng rồi thử lại.',
          3: 'Chờ định vị quá lâu.',
        };
        hong(new Error(chu[e.code] ?? 'Không lấy được vị trí.'));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export function PhanAnh() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);
  const oAnh = useRef<HTMLInputElement>(null);

  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [loai, setLoai] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [conMo, setConMo] = useState(true);
  const [mo, setMo] = useState<string | null>(null);
  const [anhDau, setAnhDau] = useState<File | null>(null);
  const [viTriDau, setViTriDau] = useState<GeolocationCoordinates | null>(null);
  const [dangLay, setDangLay] = useState(false);
  const [loi, setLoi] = useState('');
  const [hoiXoa, setHoiXoa] = useState<PA | null>(null);
  const [xemNong, setXemNong] = useState(false);

  useEffect(() => {
    datManHinh({
      tieu_de: '📣 Phản ánh hiện trường',
      goi_y_tim: 'Tìm phản ánh theo nội dung…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh]);

  const thamSo = {
    q: tim,
    loai,
    trang_thai: trangThai,
    con_mo: conMo ? 'true' : '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['phan-anh', thamSo],
    queryFn: () => get<{ tong_so: number; items: PA[] }>('/phan-anh' + qs(thamSo)),
    enabled: can('resident:read'),
    placeholderData: keepPreviousData,
  });
  const { data: tq } = useQuery({
    queryKey: ['phan-anh-tong-quan'],
    queryFn: () =>
      get<{
        tong: number;
        moi: number;
        con_mo: number;
        da_xong: number;
        khan_cap: number;
        qua_han: number;
        theo_loai: { loai: string; ten_loai: string; n: number }[];
      }>('/phan-anh/tong-quan'),
    enabled: can('resident:read'),
  });

  const xoa = useMutation({
    mutationFn: (p: PA) => del(`/phan-anh/${p.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      lamMoi();
    },
  });

  const lamMoi = () => {
    for (const k of ['phan-anh', 'phan-anh-tong-quan', 'phan-anh-diem-nong', 'thong-bao']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  /** Chụp ảnh + lấy GPS + mở form, tất cả trong một lần bấm. */
  const chupVaBao = async (tep: File) => {
    setAnhDau(tep);
    setLoi('');
    setDangLay(true);
    try {
      const v = await layGps();
      setViTriDau(v.coords);
    } catch (e) {
      // Không có GPS thì vẫn báo được, chỉ là thiếu toạ độ — đừng chặn người ta
      setViTriDau(null);
      setLoi(e instanceof Error ? e.message : 'Không lấy được vị trí');
    } finally {
      setDangLay(false);
      setMo('');
    }
  };

  if (!can('resident:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem phản ánh." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const suaDuoc = can('resident:write');

  return (
    <>
      <ThanhTieuDe
        tieu_de="Phản ánh hiện trường"
        mo_ta="Chụp một tấm, máy tự gắn toạ độ — đội sửa chữa tới đúng chỗ"
        so_loc_dang_bat={[loai, trangThai].filter(Boolean).length + (conMo ? 0 : 1)}
        duoi={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Truong nhan="Loại việc">
              <Select
                value={loai}
                onChange={(e) => {
                  setLoai(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả loại</option>
                {Object.entries(LOAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Trạng thái">
              <Select
                value={trangThai}
                onChange={(e) => {
                  setTrangThai(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(TRANG_THAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={conMo}
                  onChange={(e) => {
                    setConMo(e.target.checked);
                    setTrang(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
                />
                <span className="text-xs font-bold text-slate-600">Chỉ việc chưa xong</span>
              </label>
            </div>
          </div>
        }
      >
        {suaDuoc && (
          <Button mau="trang" icon={Plus} onClick={() => setMo('')}>
            NHẬP TAY
          </Button>
        )}
      </ThanhTieuDe>

      {loi && (
        <CanhBao loai="canh" emoji="📍">
          {loi}
        </CanhBao>
      )}

      {/* Nút chính: to nhất màn hình, đặt trên cùng vì đó là việc hay làm nhất */}
      {suaDuoc && (
        <>
          <input
            ref={oAnh}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const t = e.target.files?.[0];
              if (t) void chupVaBao(t);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => oAnh.current?.click()}
            disabled={dangLay}
            className={cx(
              'flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl py-5 text-base font-black tracking-wide text-white shadow-lg transition-all active:scale-[0.98]',
              dangLay ? 'bg-slate-400' : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700',
            )}
          >
            <Camera className={cx('h-6 w-6', dangLay && 'animate-pulse')} />
            {dangLay ? 'ĐANG LẤY VỊ TRÍ…' : 'CHỤP VÀ BÁO NGAY'}
          </button>
          <p className="text-center text-[10px] font-medium text-slate-400">
            Một lần bấm: mở máy ảnh, lấy toạ độ, mở sẵn phiếu. Không có GPS vẫn báo được.
          </p>
        </>
      )}

      {tq && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ONumber
            nhan="Chưa xử lý xong"
            gia_tri={so(tq.con_mo)}
            phu={`${so(tq.moi)} chưa ai nhận`}
            icon={AlertTriangle}
            mau={tq.con_mo ? 'amber' : 'emerald'}
          />
          <ONumber
            nhan="Khẩn cấp"
            gia_tri={so(tq.khan_cap)}
            phu={tq.khan_cap ? 'Xử lý trong ngày' : 'Không có việc khẩn'}
            phu_mau={tq.khan_cap ? 'text-rose-700' : 'text-emerald-700'}
            icon={AlertTriangle}
            mau={tq.khan_cap ? 'rose' : 'emerald'}
          />
          <ONumber
            nhan="Quá hạn"
            gia_tri={so(tq.qua_han)}
            phu={tq.qua_han ? 'Đã trễ hạn xử lý' : 'Không việc nào trễ'}
            phu_mau={tq.qua_han ? 'text-rose-700' : 'text-emerald-700'}
            icon={AlertTriangle}
            mau={tq.qua_han ? 'rose' : 'emerald'}
          />
          <ONumber
            nhan="Đã xử lý xong"
            gia_tri={so(tq.da_xong)}
            icon={AlertTriangle}
            mau="emerald"
          />
        </div>
      )}

      <Card className="p-2">
        <button
          onClick={() => setXemNong((v) => !v)}
          className={cx(
            'cursor-pointer rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
            xemNong ? 'bg-orange-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50',
          )}
        >
          🔥 Điểm nóng — chỗ hỏng đi hỏng lại
        </button>
      </Card>

      {xemNong && <DiemNong />}

      {!data ? (
        <Card>
          <Spinner label="Đang tải phản ánh…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="📣"
          loi_nhan={
            tim || loai || trangThai
              ? 'Không có phản ánh nào khớp bộ lọc.'
              : conMo
                ? 'Không còn phản ánh nào chưa xử lý. '
                : 'Chưa có phản ánh nào.'
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const md = MUC_DO[p.muc_do] ?? MUC_DO.binh_thuong!;
            const tt = TRANG_THAI[p.trang_thai] ?? TRANG_THAI.moi!;
            return (
              <div key={p.id} className="relative">
                <button
                  onClick={() => setMo(p.id)}
                  className={cx(
                    'w-full cursor-pointer rounded-2xl border bg-white p-3.5 pr-11 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.995]',
                    p.da_qua_han ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-bold text-slate-900">
                      {p.title}
                    </span>
                    <Chip mau={tt.mau} nho>
                      {tt.nhan}
                    </Chip>
                  </div>

                  <p className="mt-0.5 truncate text-[10.5px] font-medium text-slate-500">
                    {p.dia_chi || 'chưa ghi địa chỉ'}
                    {p.to_dan_pho && ` · ${p.to_dan_pho}`}
                    <span className="font-mono"> · {ngay(p.created_at)}</span>
                  </p>

                  {p.da_qua_han && (
                    <p className="mt-1 text-[10.5px] font-bold text-rose-700">
                      ⏰ Quá hạn {Math.abs(p.con_ngay ?? 0)} ngày
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {p.muc_do !== 'binh_thuong' && (
                      <Chip mau={md.mau} nho>
                        {md.nhan}
                      </Chip>
                    )}
                    <Chip mau="slate" nho>
                      {p.ten_loai}
                    </Chip>
                    {p.so_anh > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500">
                        <ImageIcon className="h-3 w-3" />
                        {p.so_anh}
                      </span>
                    )}
                    {p.toa_do && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                        <MapPin className="h-3 w-3" />
                        có toạ độ
                      </span>
                    )}
                  </div>
                </button>

                {suaDuoc && (
                  <div className="absolute top-3 right-3">
                    <NutIcon
                      icon={Trash2}
                      mau="text-red-500"
                      title="Xoá phản ánh"
                      onClick={() => setHoiXoa(p)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="phản ánh"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {mo !== null && (
        <FormPhanAnh
          id={mo || null}
          anhDau={anhDau}
          viTriDau={viTriDau}
          onClose={() => {
            setMo(null);
            setAnhDau(null);
            setViTriDau(null);
          }}
        />
      )}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá phản ánh"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá phản ánh <b>{hoiXoa?.title}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Ảnh hiện trường cũng bị xoá khỏi máy chủ. Việc không xử lý được thì nên đổi trạng thái
              sang “Không xử lý” kèm lý do, thay vì xoá.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────── Điểm nóng ── */

function DiemNong() {
  const { data } = useQuery({
    queryKey: ['phan-anh-diem-nong'],
    queryFn: () =>
      get<
        {
          cum: number;
          so_phan_anh: number;
          con_mo: number;
          lat: number;
          lng: number;
          dia_chi: string | null;
          moi_nhat: string;
          lan_gan_nhat: string;
        }[]
      >('/phan-anh/diem-nong'),
  });

  if (!data) {
    return (
      <Card>
        <Spinner label="Đang gom điểm nóng…" />
      </Card>
    );
  }
  if (data.length === 0) {
    return (
      <Card className="p-4 text-center">
        <p className="text-[11.5px] font-medium text-slate-500">
          Chưa có chỗ nào bị phản ánh từ hai lần trở lên.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3.5">
      <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
        Điểm nóng ({data.length}) — nơi bị phản ánh nhiều lần
      </p>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div
            key={d.cum}
            className="flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-bold text-slate-900">
                {d.dia_chi || `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">gần nhất: {d.moi_nhat}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2 py-1 text-[10px] font-black text-white">
                <Flame className="h-3 w-3" />
                {d.so_phan_anh} lần
              </span>
              {d.con_mo > 0 && (
                <Chip mau="rose" nho>
                  {d.con_mo} chưa xong
                </Chip>
              )}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`}
                target="_blank"
                rel="noreferrer"
                title="Chỉ đường tới đây"
                className="rounded-lg border border-emerald-200 bg-white p-1.5 text-emerald-700 hover:bg-emerald-50"
              >
                <MapPin className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] font-medium text-slate-400">
        Ba nắp cống vỡ cách nhau 20m là <b>một chỗ hỏng</b>, không phải ba. Chỗ hỏng đi hỏng lại nên
        sửa tận gốc thay vì vá mãi.
      </p>
    </Card>
  );
}

/* ────────────────────────────────────────────────── Thêm / sửa phản ánh ── */

function FormPhanAnh({
  id,
  anhDau,
  viTriDau,
  onClose,
}: {
  id: string | null;
  anhDau: File | null;
  viTriDau: GeolocationCoordinates | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const { can } = useAuth();
  const suaDuoc = can('resident:write');
  const oAnh = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    title: '',
    mo_ta: '',
    loai: 'khac',
    muc_do: 'binh_thuong',
    dia_chi: '',
    group_id: '',
    nguoi_bao: '',
    dien_thoai: '',
    trang_thai: 'moi',
    nguoi_xu_ly: '',
    han_xu_ly: '',
    ngay_xong: '',
    ket_qua: '',
    ly_do: '',
  });
  const [viTri, setViTri] = useState<{ lat: number; lng: number; acc: number } | null>(
    viTriDau ? { lat: viTriDau.latitude, lng: viTriDau.longitude, acc: viTriDau.accuracy } : null,
  );
  const [xepHang, setXepHang] = useState<File[]>(anhDau ? [anhDau] : []);
  const [dangTai, setDangTai] = useState(0);
  const [loi, setLoi] = useState('');

  const { data: to } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
  });
  const { data: cu, isLoading } = useQuery({
    queryKey: ['phan-anh', id],
    queryFn: () => get<PAChiTiet>(`/phan-anh/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      title: cu.title,
      mo_ta: cu.mo_ta ?? '',
      loai: cu.loai,
      muc_do: cu.muc_do,
      dia_chi: cu.dia_chi ?? '',
      group_id: cu.group_id ?? '',
      nguoi_bao: cu.nguoi_bao ?? '',
      dien_thoai: cu.dien_thoai ?? '',
      trang_thai: cu.trang_thai,
      nguoi_xu_ly: cu.nguoi_xu_ly ?? '',
      han_xu_ly: cu.han_xu_ly ?? '',
      ngay_xong: cu.ngay_xong ?? '',
      ket_qua: cu.ket_qua ?? '',
      ly_do: cu.ly_do ?? '',
    });
    if (cu.toa_do) {
      setViTri({ lat: cu.toa_do.lat, lng: cu.toa_do.lng, acc: Number(cu.do_chinh_xac_m ?? 0) });
    }
  }, [cu]);

  const lamMoi = () => {
    for (const k of ['phan-anh', 'phan-anh-tong-quan', 'phan-anh-diem-nong', 'thong-bao']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const guiAnh = useMutation({
    mutationFn: async ({ pid, ds }: { pid: string; ds: File[] }) => {
      const hong: string[] = [];
      for (let i = 0; i < ds.length; i++) {
        setDangTai(i + 1);
        const fd = new FormData();
        fd.append('tep', ds[i]!);
        try {
          await postForm(`/phan-anh/${pid}/anh`, fd);
        } catch (e) {
          hong.push(`${ds[i]!.name}: ${e instanceof Error ? e.message : 'lỗi'}`);
        }
      }
      setDangTai(0);
      return hong;
    },
    onSuccess: (hong) => {
      setXepHang([]);
      setLoi(hong.length ? `Không tải lên được ${hong.length} ảnh — ${hong.join('; ')}` : '');
      void qc.invalidateQueries({ queryKey: ['phan-anh', id] });
      lamMoi();
    },
  });

  const xoaAnh = useMutation({
    mutationFn: (aid: string) => del(`/phan-anh/anh/${aid}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phan-anh', id] });
      lamMoi();
    },
  });

  const luu = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        title: f.title.trim(),
        mo_ta: f.mo_ta,
        loai: f.loai,
        muc_do: f.muc_do,
        dia_chi: f.dia_chi,
        group_id: f.group_id,
        nguoi_bao: f.nguoi_bao,
        dien_thoai: f.dien_thoai,
        han_xu_ly: f.han_xu_ly || null,
        ...(viTri ? { lat: viTri.lat, lng: viTri.lng, do_chinh_xac_m: viTri.acc } : {}),
        ...(suaDoi
          ? {
              trang_thai: f.trang_thai,
              nguoi_xu_ly: f.nguoi_xu_ly,
              ngay_xong: f.ngay_xong || null,
              ket_qua: f.ket_qua,
              ly_do: f.ly_do,
            }
          : {}),
      };
      if (suaDoi) {
        await patch(`/phan-anh/${id}`, body);
        return id!;
      }
      return (await post<{ id: string }>('/phan-anh', body)).id;
    },
    onSuccess: async (pid) => {
      // Tải ảnh TRƯỚC khi đóng: đóng sớm thì cán bộ tưởng ảnh đã gửi
      if (xepHang.length) await guiAnh.mutateAsync({ pid, ds: xepHang });
      lamMoi();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const layLaiViTri = async () => {
    setLoi('');
    try {
      const v = await layGps();
      setViTri({ lat: v.coords.latitude, lng: v.coords.longitude, acc: v.coords.accuracy });
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không lấy được vị trí');
    }
  };

  const dat = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));
  const daXong = f.trang_thai === 'da_xong' || f.trang_thai === 'khong_xu_ly';

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Phản ánh hiện trường' : 'Báo phản ánh mới'}
      mo_ta={
        suaDoi
          ? 'Theo dõi tới khi xử lý xong — chuông tự nhắc khi quá hạn'
          : 'Ghi ngắn gọn cũng được, ảnh và toạ độ nói thay phần còn lại'
      }
      rong="max-w-2xl"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            {suaDuoc ? 'Huỷ bỏ' : 'Đóng'}
          </Button>
          {suaDuoc && (
            <Button
              onClick={() => {
                setLoi('');
                if (f.title.trim().length < 3) return setLoi('Chưa ghi phản ánh về việc gì.');
                luu.mutate();
              }}
              disabled={luu.isPending || dangTai > 0}
            >
              {dangTai > 0
                ? `ĐANG GỬI ẢNH ${dangTai}/${xepHang.length}…`
                : luu.isPending
                  ? 'ĐANG LƯU…'
                  : suaDoi
                    ? 'LƯU THAY ĐỔI'
                    : 'GỬI PHẢN ÁNH'}
            </Button>
          )}
        </>
      }
    >
      {suaDoi && isLoading ? (
        <Spinner label="Đang mở phản ánh…" />
      ) : (
        <div className="space-y-4">
          {loi && (
            <CanhBao loai="canh" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          {cu?.da_qua_han && (
            <CanhBao loai="loi" emoji="⏰">
              Phản ánh này <b>quá hạn {Math.abs(cu.con_ngay ?? 0)} ngày</b>. Chuyển sang “Đã xử lý
              xong” hoặc dời hạn để thôi hiện trong chuông nhắc.
            </CanhBao>
          )}

          <Truong nhan="Phản ánh về việc gì" bat_buoc>
            <Input
              value={f.title}
              onChange={(e) => dat('title', e.target.value)}
              placeholder="Nắp cống vỡ trước nhà số 12"
              disabled={!suaDuoc}
              autoFocus={!suaDoi}
            />
          </Truong>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Truong nhan="Loại việc">
              <Select
                value={f.loai}
                onChange={(e) => dat('loai', e.target.value)}
                disabled={!suaDuoc}
              >
                {Object.entries(LOAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong
              nhan="Mức độ"
              ghi_chu="Khẩn cấp: hạn ngày mai · Cần sớm: 3 ngày · Bình thường: 7 ngày"
            >
              <Select
                value={f.muc_do}
                onChange={(e) => dat('muc_do', e.target.value)}
                disabled={!suaDuoc}
              >
                {Object.entries(MUC_DO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
          </div>

          {/* ── Vị trí ───────────────────────────────────────────────── */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
              Vị trí
            </h4>

            {viTri ? (
              <div className="rounded-xl bg-white p-3">
                <p className="font-mono text-[11px] font-bold text-slate-800">
                  {viTri.lat.toFixed(6)}, {viTri.lng.toFixed(6)}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                  Sai số khoảng <b>{Math.round(viTri.acc)}m</b>
                  {viTri.acc > 30 &&
                    ' — hơi lớn, có thể do đang trong nhà hoặc hẻm sâu. Ra chỗ thoáng bấm lấy lại cho chính xác hơn.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suaDuoc && (
                    <Button mau="trang" icon={Crosshair} onClick={layLaiViTri}>
                      LẤY LẠI VỊ TRÍ
                    </Button>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${viTri.lat},${viTri.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    XEM TRÊN BẢN ĐỒ
                  </a>
                </div>
              </div>
            ) : (
              suaDuoc && (
                <Button
                  mau="trang"
                  icon={Crosshair}
                  onClick={layLaiViTri}
                  className="w-full justify-center"
                >
                  LẤY VỊ TRÍ HIỆN TẠI
                </Button>
              )
            )}

            <Truong nhan="Địa chỉ" ghi_chu="Ghi thêm cho dễ đọc — toạ độ mới là thứ dẫn đường">
              <Input
                value={f.dia_chi}
                onChange={(e) => dat('dia_chi', e.target.value)}
                placeholder="12 Đường An Phú 13"
                disabled={!suaDuoc}
              />
            </Truong>

            <Truong nhan="Tổ dân phố">
              <Select
                value={f.group_id}
                onChange={(e) => dat('group_id', e.target.value)}
                disabled={!suaDuoc}
              >
                <option value="">Chưa xác định tổ</option>
                {to?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.leader_name ? ` — ${t.leader_name}` : ''}
                  </option>
                ))}
              </Select>
            </Truong>
          </section>

          <Truong nhan="Mô tả thêm">
            <Textarea
              value={f.mo_ta}
              onChange={(e) => dat('mo_ta', e.target.value)}
              placeholder="Nắp bê tông nứt đôi, trẻ em đi học qua đây…"
              disabled={!suaDuoc}
            />
          </Truong>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Truong nhan="Người báo">
              <Input
                value={f.nguoi_bao}
                onChange={(e) => dat('nguoi_bao', e.target.value)}
                placeholder="Bà Bảy tổ 3"
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Điện thoại người báo">
              <Input
                value={f.dien_thoai}
                onChange={(e) => dat('dien_thoai', e.target.value)}
                placeholder="09xxxxxxxx"
                inputMode="tel"
                className="font-mono"
                disabled={!suaDuoc}
              />
            </Truong>
          </div>

          {/* ── Theo dõi xử lý ───────────────────────────────────────── */}
          {suaDoi && (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Theo dõi xử lý
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Truong nhan="Trạng thái">
                  <Select
                    value={f.trang_thai}
                    onChange={(e) => dat('trang_thai', e.target.value)}
                    disabled={!suaDuoc}
                  >
                    {Object.entries(TRANG_THAI).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.nhan}
                      </option>
                    ))}
                  </Select>
                </Truong>
                <Truong nhan="Người xử lý">
                  <Input
                    value={f.nguoi_xu_ly}
                    onChange={(e) => dat('nguoi_xu_ly', e.target.value)}
                    placeholder="Tổ trưởng tổ 3"
                    disabled={!suaDuoc}
                  />
                </Truong>
                <Truong nhan="Hạn xử lý">
                  <Input
                    type="date"
                    value={f.han_xu_ly}
                    onChange={(e) => dat('han_xu_ly', e.target.value)}
                    disabled={!suaDuoc}
                  />
                </Truong>
                {daXong && (
                  <Truong nhan="Ngày xong">
                    <Input
                      type="date"
                      value={f.ngay_xong}
                      onChange={(e) => dat('ngay_xong', e.target.value)}
                      disabled={!suaDuoc}
                    />
                  </Truong>
                )}
              </div>

              {f.trang_thai === 'da_chuyen_phuong' && (
                <Truong nhan="Phường trả lời thế nào">
                  <Textarea
                    value={f.ly_do}
                    onChange={(e) => dat('ly_do', e.target.value)}
                    placeholder="Số văn bản chuyển, ngày chuyển, phường hẹn khi nào…"
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}
              {f.trang_thai === 'khong_xu_ly' && (
                <Truong nhan="Vì sao không xử lý" bat_buoc>
                  <Textarea
                    value={f.ly_do}
                    onChange={(e) => dat('ly_do', e.target.value)}
                    placeholder="Ngoài phạm vi khu phố, đã có đơn vị khác làm…"
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}
              {daXong && (
                <Truong nhan="Kết quả xử lý">
                  <Textarea
                    value={f.ket_qua}
                    onChange={(e) => dat('ket_qua', e.target.value)}
                    placeholder="Đã thay nắp cống mới ngày…"
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}
            </section>
          )}

          {/* ── Ảnh ──────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Ảnh hiện trường ({(cu?.anh.length ?? 0) + xepHang.length})
              </h4>
              {suaDuoc && (
                <>
                  <input
                    ref={oAnh}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const fl = e.target.files;
                      if (fl?.length) setXepHang((s) => [...s, ...fl]);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    mau="trang"
                    icon={Camera}
                    onClick={() => oAnh.current?.click()}
                    disabled={dangTai > 0}
                  >
                    CHỤP THÊM
                  </Button>
                </>
              )}
            </div>

            {xepHang.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wider text-blue-800 uppercase">
                  {dangTai > 0
                    ? `Đang gửi ${dangTai}/${xepHang.length}…`
                    : `${xepHang.length} ảnh sẽ gửi khi bấm ${suaDoi ? 'lưu' : 'gửi phản ánh'}`}
                </p>
                {xepHang.map((t, i) => (
                  <div
                    key={`${t.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5"
                  >
                    <span className="truncate text-[11px] font-semibold text-slate-700">
                      {t.name}
                    </span>
                    {dangTai === 0 && (
                      <NutIcon
                        icon={X}
                        mau="text-slate-400"
                        title="Bỏ ảnh này"
                        onClick={() => setXepHang((s) => s.filter((_, j) => j !== i))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {cu?.anh.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {cu.anh.map((a) => (
                  <div key={a.id} className="relative">
                    <img
                      src={`${import.meta.env.DEV ? '/api' : 'https://api.khuphoso.vn'}/phan-anh/anh/${a.id}`}
                      alt={a.ten_goc}
                      className="h-28 w-full rounded-xl border border-slate-200 object-cover"
                    />
                    <span
                      className={cx(
                        'absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-black text-white',
                        a.la_sau_xu_ly ? 'bg-emerald-600' : 'bg-slate-700/80',
                      )}
                    >
                      {a.la_sau_xu_ly ? 'SAU XỬ LÝ' : 'HIỆN TRƯỜNG'}
                    </span>
                    {suaDuoc && (
                      <button
                        onClick={() => xoaAnh.mutate(a.id)}
                        title="Xoá ảnh"
                        className="absolute top-1 right-1 cursor-pointer rounded-lg bg-white/90 p-1 text-red-500 hover:bg-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : xepHang.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
                Chưa có ảnh nào. Ảnh nói thay được nhiều hơn cả trang mô tả.
              </p>
            ) : null}

            <p className="text-[10px] font-medium text-slate-400">
              Ảnh nằm sau lớp đăng nhập, chỉ người của khu phố này xem được — ảnh chụp ngoài đường
              hay lọt vào nhà dân, biển số xe, mặt người.
            </p>
          </section>

          {suaDoi && cu && (
            <p className="text-[10px] font-medium text-slate-400">
              Tiếp nhận {ngay(cu.created_at)}
              {cu.ma_ho && ` · gắn với hộ #${cu.ma_ho}`}
              {cu.so_anh === 0 && ' · chưa có ảnh'}
            </p>
          )}
        </div>
      )}
    </NganKeo>
  );
}
