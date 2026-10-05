/**
 * Tổng quan — màn hình đầu tiên cán bộ nhìn thấy mỗi sáng.
 *
 * Ưu tiên trả lời hai câu hỏi: khu phố mình có bao nhiêu người, và hôm nay còn
 * việc gì phải làm. Kèm biểu đồ nhanh để nhìn ra cơ cấu dân cư trong một cái liếc.
 */

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Award,
  Briefcase,
  Clock,
  Home,
  Map,
  MapPin,
  Megaphone,
  PiggyBank,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useManHinh } from '@/components/Layout';
import {
  Bang,
  Card,
  Chip,
  ChipMau,
  ChuaCapNhat,
  cx,
  KhungBang,
  ONumber,
  Spinner,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { get } from '@/lib/api';
import { useGioVN } from '@/lib/gio';
import { so, vnd } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { QuyTongQuan, ThongBao, ThongKe, ToDanPho } from '@/lib/types';

/** Một quỹ trong danh sách `/quy` — khác với số liệu tổng ở `/quy/tong-quan`. */
interface MotQuy {
  id: string;
  name: string;
  so_du: number;
}

const MUC_MAU = {
  gap: 'border-l-4 border-rose-500 bg-rose-50/40',
  canh: 'border-l-4 border-amber-500 bg-amber-50/40',
  tin: 'border-l-4 border-blue-500 bg-blue-50/30',
} as const;

/** Khung tooltip tối cho recharts — đồng bộ với tông thẻ số liệu. */
const TOOLTIP = {
  backgroundColor: '#0f172a',
  borderRadius: '10px',
  color: '#fff',
  border: 'none',
  fontSize: '11px',
  padding: '6px 10px',
} as const;

export function TongQuan() {
  const { user, khuPho, can } = useAuth();
  const navigate = useNavigate();
  const datManHinh = useManHinh((s) => s.dat);

  useEffect(() => {
    datManHinh({ tieu_de: 'Tổng quan điều hành' });
  }, [datManHinh]);

  const { data: tk } = useQuery({
    queryKey: ['thong-ke'],
    queryFn: () => get<ThongKe>('/cu-dan/thong-ke'),
    enabled: can('resident:read'),
  });
  const { data: tb } = useQuery({
    queryKey: ['thong-bao'],
    queryFn: () => get<ThongBao[]>('/thong-bao'),
    enabled: can('resident:read'),
  });
  const { data: quyTong } = useQuery({
    queryKey: ['quy-tong-quan-chung'],
    queryFn: () => get<QuyTongQuan>('/quy/tong-quan'),
    enabled: can('fund:read'),
  });
  const { data: quy } = useQuery({
    queryKey: ['quy'],
    queryFn: () => get<MotQuy[]>('/quy'),
    enabled: can('fund:read'),
  });
  const { data: toDanPho } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
    enabled: can('resident:read'),
  });
  const { data: kd } = useQuery({
    queryKey: ['kinh-doanh-tong-quan'],
    queryFn: () =>
      get<{ tong: number; dang_hoat_dong: number; attp_het_han: number }>('/kinh-doanh/tong-quan'),
    enabled: can('business:read'),
  });
  const { data: pa } = useQuery({
    queryKey: ['phan-anh-tong-quan'],
    queryFn: () =>
      get<{
        tong: number;
        con_mo: number;
        moi: number;
        qua_han: number;
        theo_loai: { loai: string; n: number; ten_loai: string }[];
      }>('/phan-anh/tong-quan'),
    enabled: can('resident:read'),
  });

  const { loi_chao, gio, ngay } = useGioVN();

  const cuTru = tk
    ? [
        { name: 'Thường trú', 'Số người': tk.cu_dan.thuong_tru, color: '#2563eb' },
        { name: 'Tạm trú', 'Số người': tk.cu_dan.tam_tru, color: '#f59e0b' },
      ]
    : [];
  const gioiTinh = tk
    ? [
        { name: 'Nam', value: tk.cu_dan.nam },
        { name: 'Nữ', value: tk.cu_dan.nu },
      ]
    : [];
  const MAU_GT = ['#2563eb', '#ec4899'];
  const paLoai = (pa?.theo_loai ?? []).map((x) => ({ name: x.ten_loai, value: x.n }));
  const MAU_PA = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#0891b2', '#ec4899', '#64748b'];
  const paDonut = can('resident:read') && paLoai.length > 0;

  return (
    <>
      {/* ── Hero: lời chào + đồng hồ máy chủ chạy thật ─────────────────── */}
      <Card className="overflow-hidden border-0 p-0 shadow-md">
        <div className="flex flex-col justify-between gap-4 bg-gradient-to-r from-blue-800 to-slate-900 p-5 text-white sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">
              {loi_chao}, {user?.full_name ?? 'cán bộ khu phố'}
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-300">
              {khuPho
                ? `${khuPho.name}${khuPho.ward ? ` · ${khuPho.ward}` : ''} — số liệu cập nhật theo thời gian thực`
                : 'Số liệu cập nhật theo thời gian thực'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 self-start rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold backdrop-blur-sm sm:self-auto">
            <Clock className="h-4 w-4 text-sky-300" />
            <span className="tabular-nums">{gio}</span>
            <span className="text-slate-300">· {ngay}</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          </div>
        </div>
      </Card>

      {/* ── Số liệu chính ─────────────────────────────────────────────── */}
      {can('resident:read') &&
        (!tk ? (
          <Card>
            <Spinner label="Đang tổng hợp số liệu…" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ONumber
              nhan="Tổng nhân khẩu"
              gia_tri={so(tk.cu_dan.tong)}
              phu={`${so(tk.cu_dan.thuong_tru)} thường trú · ${so(tk.cu_dan.tam_tru)} tạm trú`}
              icon={Users}
              mau="blue"
              onClick={() => navigate({ to: '/nhan-khau/$dien', params: { dien: 'thuong-tru' } })}
            />
            <ONumber
              nhan="Hộ gia đình"
              gia_tri={so(tk.ho_khau.tong_ho)}
              phu={`Bình quân ${
                tk.ho_khau.tong_ho ? (tk.cu_dan.tong / tk.ho_khau.tong_ho).toFixed(1) : '0'
              } người / hộ`}
              icon={Home}
              mau="emerald"
              onClick={() => navigate({ to: '/ho/$dien', params: { dien: 'thuong-tru' } })}
            />
            <ONumber
              nhan="Nam / Nữ"
              gia_tri={`${so(tk.cu_dan.nam)} / ${so(tk.cu_dan.nu)}`}
              phu={
                tk.cu_dan.tong
                  ? `Nam ${Math.round((tk.cu_dan.nam / tk.cu_dan.tong) * 100)}% · Nữ ${Math.round(
                      (tk.cu_dan.nu / tk.cu_dan.tong) * 100,
                    )}%`
                  : 'Chưa có dữ liệu'
              }
              icon={UserCheck}
              mau="indigo"
            />
            <ONumber
              nhan="Đã ghim bản đồ"
              gia_tri={`${so(tk.ho_khau.da_kiem_chung + tk.ho_khau.so_bo)} / ${so(tk.ho_khau.tong_ho)}`}
              phu={
                tk.ho_khau.chua_dinh_vi
                  ? `Còn ${so(tk.ho_khau.chua_dinh_vi)} hộ chưa ghim`
                  : 'Đã ghim đủ toàn khu phố'
              }
              phu_mau={tk.ho_khau.chua_dinh_vi ? 'text-amber-700' : 'text-emerald-700'}
              icon={MapPin}
              mau={tk.ho_khau.chua_dinh_vi ? 'amber' : 'emerald'}
              onClick={() => navigate({ to: '/ban-do' })}
            />
            {can('business:read') && kd && (
              <ONumber
                nhan="Cơ sở kinh doanh"
                gia_tri={so(kd.tong)}
                phu={
                  kd.attp_het_han
                    ? `${so(kd.dang_hoat_dong)} đang hoạt động · ${so(kd.attp_het_han)} ATTP hết hạn`
                    : `${so(kd.dang_hoat_dong)} đang hoạt động`
                }
                phu_mau={kd.attp_het_han ? 'text-amber-700' : 'text-slate-500'}
                icon={Briefcase}
                mau="amber"
                onClick={() => navigate({ to: '/kinh-doanh' })}
              />
            )}
            {pa && (
              <ONumber
                nhan="Phản ánh chưa xử lý"
                gia_tri={so(pa.con_mo)}
                phu={
                  pa.qua_han
                    ? `${so(pa.moi)} mới · ${so(pa.qua_han)} quá hạn`
                    : `${so(pa.moi)} mới tiếp nhận`
                }
                phu_mau={pa.qua_han ? 'text-rose-700' : 'text-slate-500'}
                icon={Megaphone}
                mau="rose"
                onClick={() => navigate({ to: '/phan-anh' })}
              />
            )}
          </div>
        ))}

      {/* ── Biểu đồ nhanh: cơ cấu cư trú + giới tính ───────────────────── */}
      {tk && tk.cu_dan.tong > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className={cx('space-y-3 p-5', !paDonut && 'lg:col-span-2')}>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase">Cơ cấu cư trú</h4>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                Nhân khẩu phân theo tình trạng khai báo cư trú
              </p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cuTru} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={TOOLTIP} />
                  <Bar dataKey="Số người" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {cuTru.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase">Giới tính</h4>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Tỷ lệ nam / nữ</p>
            </div>
            <div className="flex h-40 items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gioiTinh}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {gioiTinh.map((e, i) => (
                      <Cell key={e.name} fill={MAU_GT[i % MAU_GT.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-[11px]">
              {gioiTinh.map((e, i) => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MAU_GT[i % MAU_GT.length] }}
                  />
                  <span className="font-medium text-slate-600">
                    {e.name} · <span className="font-bold text-slate-900">{so(e.value)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {paDonut && (
            <Card className="space-y-3 p-5">
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase">Danh mục phản ánh</h4>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Tỷ lệ phản ánh hiện trường theo loại
                </p>
              </div>
              <div className="flex h-40 items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paLoai}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {paLoai.map((e, i) => (
                        <Cell key={e.name} fill={MAU_PA[i % MAU_PA.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {paLoai.map((e, i) => (
                  <div key={e.name} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: MAU_PA[i % MAU_PA.length] }}
                    />
                    <span className="truncate font-medium text-slate-600">
                      {e.name} ({so(e.value)})
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Liên kết nhanh ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4">
          <h4 className="text-sm font-bold text-slate-800 uppercase">Liên kết nhanh</h4>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Chức năng thường dùng, mở nhanh trong một chạm
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            to="/nhan-khau/$dien"
            params={{ dien: 'thuong-tru' }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
          >
            <UserPlus className="h-6 w-6 text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Quản lý cư dân</span>
          </Link>
          <Link
            to="/phan-anh"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
          >
            <Megaphone className="h-6 w-6 text-rose-600" />
            <span className="text-xs font-bold text-slate-700">Phản ánh hiện trường</span>
          </Link>
          <Link
            to="/ban-do"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
          >
            <Map className="h-6 w-6 text-emerald-600" />
            <span className="text-xs font-bold text-slate-700">Bản đồ GIS</span>
          </Link>
          <div
            title="Giám sát camera an ninh — đang phát triển"
            className="relative flex cursor-default flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center opacity-75"
          >
            <Video className="h-6 w-6 text-slate-500" />
            <span className="text-xs font-bold text-slate-600">Camera giám sát</span>
            <span className="absolute right-1.5 top-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-amber-700">
              Sắp có
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* ── Việc cần làm ────────────────────────────────────────────── */}
        <Card className="flex flex-col p-5 lg:col-span-2">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-800 uppercase">Việc cần làm</h4>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Tổng hợp từ hồ sơ hộ khẩu, nhân khẩu và các đợt thu đang mở
            </p>
          </div>

          {!tb ? (
            <Spinner />
          ) : tb.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <span className="mb-2 text-3xl">✅</span>
              <p className="text-xs font-bold text-slate-600">Không còn việc nào tồn</p>
              <p className="mt-0.5 max-w-xs text-[10.5px] text-slate-400">
                Hồ sơ hộ khẩu đầy đủ, các hộ đã ghim bản đồ, không có đợt thu nào quá hạn.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {tb.map((n) => (
                <div key={n.id} className={cx('rounded-xl p-3', MUC_MAU[n.muc])}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="text-[8.5px] font-extrabold tracking-wider text-slate-500 uppercase">
                      {n.nhom}
                    </span>
                    <Chip
                      mau={n.muc === 'gap' ? 'rose' : n.muc === 'canh' ? 'amber' : 'indigo'}
                      nho
                    >
                      {n.nhan}
                    </Chip>
                  </div>
                  <p className="text-[11.5px] font-bold text-slate-900">{n.tieu_de}</p>
                  <p className="mt-0.5 text-[10px] font-medium leading-normal text-slate-500">
                    {n.mo_ta}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Quỹ khu phố ─────────────────────────────────────────────── */}
        {can('fund:read') && (
          <Card className="flex flex-col p-5">
            <div className="mb-4">
              <h4 className="text-sm font-bold text-slate-800 uppercase">Quỹ khu phố</h4>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                Số dư hiện tại của các quỹ
              </p>
            </div>

            {!quy || !quyTong ? (
              <Spinner />
            ) : (
              <>
                <div className="mb-3 rounded-2xl bg-gradient-to-tr from-blue-800 to-sky-600 p-4 text-center text-white">
                  <p className="text-[10px] font-extrabold tracking-wider text-sky-100 uppercase">
                    Tổng số dư
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{vnd(quyTong?.so_du ?? 0)}</p>
                </div>
                <div className="flex-1 space-y-2">
                  {quy.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0"
                    >
                      <span className="truncate text-[11px] font-semibold text-slate-700">
                        {q.name}
                      </span>
                      <span className="shrink-0 text-[11.5px] font-bold text-slate-900 tabular-nums">
                        {vnd(q.so_du)}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/quy"
                  className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200"
                >
                  <PiggyBank className="h-3.5 w-3.5" />
                  MỞ SỔ QUỸ
                </Link>
              </>
            )}
          </Card>
        )}
      </div>

      {/* ── Tổ dân phố ─────────────────────────────────────────────────── */}
      {can('resident:read') && toDanPho && toDanPho.length > 0 && (
        <KhungBang>
          <Bang className="min-w-[600px]">
            <Thead>
              <tr>
                <Th>Tổ dân phố</Th>
                <Th>Tổ trưởng</Th>
                <Th>Điện thoại</Th>
                <Th className="text-center">Số hộ</Th>
                <Th className="text-center">Nhân khẩu</Th>
              </tr>
            </Thead>
            <Tbody>
              {toDanPho.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-semibold text-slate-900">
                    <span className="mr-1.5 font-mono font-bold text-slate-400">#{t.code}</span>
                    {t.name}
                  </Td>
                  <Td className="text-slate-700">{t.leader_name || <ChuaCapNhat />}</Td>
                  <Td className="font-mono text-slate-800">{t.phone || <ChuaCapNhat />}</Td>
                  <Td className="text-center">
                    <Chip mau="emerald">{so(t.so_ho)}</Chip>
                  </Td>
                  <Td className="text-center">
                    <Chip mau="blue">{so(t.so_nhan_khau)}</Chip>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Bang>
        </KhungBang>
      )}

      {/* ── Đoàn thể & chính sách ──────────────────────────────────────── */}
      {tk && tk.theo_phan_loai.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-slate-400" />
            <h4 className="text-sm font-bold text-slate-800 uppercase">Đoàn thể & diện chính sách</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {tk.theo_phan_loai.map((c) => (
              <div
                key={c.code}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <ChipMau color={c.color}>{c.name}</ChipMau>
                <span className="text-xs font-bold text-slate-900 tabular-nums">{so(c.so_nguoi)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
