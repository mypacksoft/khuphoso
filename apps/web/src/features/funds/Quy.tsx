/**
 * Sổ quỹ khu phố — thu, chi, đợt vận động.
 *
 * Sổ quỹ của mỗi khu phố nằm ở database riêng của khu phố đó. Trang minh bạch của
 * nền tảng (`minhbach.khuphoso.vn`) là quỹ phát triển nền tảng, hoàn toàn khác —
 * hai thứ này từng bị lẫn vào nhau nên ghi rõ ngay trên màn hình.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Globe, Landmark, Lock, Plus, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Bang,
  Button,
  Card,
  Chip,
  ChuaCapNhat,
  cx,
  Input,
  KhungBang,
  NganKeo,
  ONumber,
  Rong,
  Select,
  Spinner,
  Tbody,
  Td,
  Th,
  Thead,
  ThanhTieuDe,
  Tr,
  Truong,
} from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { gio, khongDau, so, vnd } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

import { PhieuThuChi } from './PhieuThuChi';

interface MotQuy {
  id: string;
  code: string;
  name: string;
  fund_type: string;
  description: string | null;
  tong_thu: number;
  tong_chi: number;
  so_du: number;
  so_phieu_thu: number;
  so_phieu_chi: number;
  is_public: boolean;
}

interface TongQuanQuy {
  tong_thu: number;
  tong_chi: number;
  so_du: number;
  dau_ky: number;
  so_quy: number;
  thu_thang_nay: number;
  chi_thang_nay: number;
}

interface DotThu {
  id: string;
  ten_quy: string;
  name: string;
  period: string | null;
  per_household_amount: number | null;
  status: string;
  da_thu: number;
  so_ho_dong: number;
  tong_so_ho: number;
}

interface DongSoCai {
  id: string;
  loai: 'thu' | 'chi';
  amount: number;
  ten_quy: string;
  doi_tac: string;
  noi_dung: string;
  hinh_thuc: string | null;
  thoi_gian: string | null;
}

const TRANG_THAI: Record<string, { nhan: string; mau: 'slate' | 'emerald' | 'blue' | 'amber' }> = {
  nhap: { nhan: 'Nháp', mau: 'slate' },
  dang_thu: { nhan: 'Đang thu', mau: 'emerald' },
  da_dong: { nhan: 'Đã đóng đợt', mau: 'slate' },
  quyet_toan: { nhan: 'Đã quyết toán', mau: 'blue' },
};

const TAB = [
  { id: 'so-cai', nhan: 'Sổ cái thu chi' },
  { id: 'dot-thu', nhan: 'Đợt vận động' },
  { id: 'can-doi', nhan: 'Cân đối theo quỹ' },
] as const;

export function Quy() {
  const { can } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);
  const [tab, setTab] = useState<(typeof TAB)[number]['id']>('so-cai');
  /** Ngăn kéo ghi thu/chi: `loai` là chiều tiền, `quy_id` là quỹ ghi sẵn (nếu mở từ thẻ quỹ). */
  const [phieu, setPhieu] = useState<{ loai: 'thu' | 'chi'; quy_id?: string } | null>(null);

  useEffect(() => {
    datManHinh({ tieu_de: '💰 Quỹ khu phố' });
  }, [datManHinh]);

  const { data: tq } = useQuery({
    queryKey: ['quy-tong-quan-chung'],
    queryFn: () => get<TongQuanQuy>('/quy/tong-quan'),
    enabled: can('fund:read'),
  });
  const { data: ds } = useQuery({
    queryKey: ['quy'],
    queryFn: () => get<MotQuy[]>('/quy'),
    enabled: can('fund:read'),
  });
  const { data: soCai } = useQuery({
    queryKey: ['so-cai'],
    queryFn: () => get<DongSoCai[]>('/quy/so-cai'),
    enabled: can('fund:read') && tab === 'so-cai',
  });
  const { data: dotThu } = useQuery({
    queryKey: ['dot-thu'],
    queryFn: () => get<DotThu[]>('/quy/dot-thu'),
    enabled: can('fund:read') && tab === 'dot-thu',
  });

  if (!can('fund:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem sổ quỹ khu phố." />;
  }

  const ghiDuoc = can('fund:write');
  const qc = useQueryClient();
  const doiCongKhai = useMutation({
    mutationFn: (v: { id: string; is_public: boolean }) =>
      patch(`/quy/${v.id}`, { is_public: v.is_public }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quy'] }),
  });

  const [themQuy, setThemQuy] = useState(false);

  return (
    <>
      <ThanhTieuDe
        tieu_de="Sổ quỹ khu phố"
        mo_ta="Thu chi của chính khu phố này — tách biệt hoàn toàn với quỹ phát triển nền tảng"
      >
        {ghiDuoc && (
          <>
            <Button mau="trang" icon={Plus} onClick={() => setThemQuy(true)}>
              THÊM QUỸ
            </Button>
            <Button mau="luc" icon={ArrowDownLeft} onClick={() => setPhieu({ loai: 'thu' })}>
              GHI THU
            </Button>
            <Button mau="do" icon={ArrowUpRight} onClick={() => setPhieu({ loai: 'chi' })}>
              GHI CHI
            </Button>
          </>
        )}
      </ThanhTieuDe>

      {!tq ? (
        <Card>
          <Spinner label="Đang tổng hợp sổ quỹ…" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ONumber
            nhan="Số dư hiện tại"
            gia_tri={vnd(tq.so_du)}
            phu={`Trên ${so(tq.so_quy)} quỹ`}
            icon={Wallet}
            mau="blue"
          />
          <ONumber
            nhan="Tổng thu"
            gia_tri={vnd(tq.tong_thu)}
            phu={`Tháng này: ${vnd(tq.thu_thang_nay)}`}
            phu_mau="text-emerald-700"
            icon={ArrowDownLeft}
            mau="emerald"
          />
          <ONumber
            nhan="Tổng chi"
            gia_tri={vnd(tq.tong_chi)}
            phu={`Tháng này: ${vnd(tq.chi_thang_nay)}`}
            phu_mau="text-rose-700"
            icon={ArrowUpRight}
            mau="rose"
          />
          <ONumber
            nhan="Số dư đầu kỳ"
            gia_tri={vnd(tq.dau_ky)}
            phu="Chuyển sang từ kỳ trước"
            icon={Landmark}
            mau="slate"
          />
        </div>
      )}

      {/* Từng quỹ */}
      {ds && ds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {ds.map((q) => (
            <Card key={q.id} className="p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-slate-900 text-xs leading-tight">{q.name}</h4>
                <span className="text-[9.5px] font-mono font-bold text-slate-300 uppercase shrink-0">
                  {q.code}
                </span>
              </div>
              <p className="text-lg font-bold text-slate-900 mt-2 tabular-nums">{vnd(q.so_du)}</p>
              <div className="flex gap-3 mt-2 text-[10px] font-semibold">
                <span className="text-emerald-700">↓ {vnd(q.tong_thu)}</span>
                <span className="text-rose-700">↑ {vnd(q.tong_chi)}</span>
              </div>
              {q.description && (
                <p className="text-[10px] text-slate-400 font-medium mt-2 leading-normal line-clamp-2">
                  {q.description}
                </p>
              )}
              {ghiDuoc && (
                <button
                  onClick={() => doiCongKhai.mutate({ id: q.id, is_public: !q.is_public })}
                  disabled={doiCongKhai.isPending}
                  title="Bật thì quỹ này (số dư, thu chi) hiện công khai cho cư dân xem trên cổng thông tin khu phố"
                  className={cx(
                    'mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10.5px] font-bold transition-colors',
                    q.is_public
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  {q.is_public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {q.is_public ? 'Đang công khai cho dân' : 'Chưa công khai'}
                </button>
              )}
              {ghiDuoc && (
                <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setPhieu({ loai: 'thu', quy_id: q.id })}
                    className="flex-1 cursor-pointer rounded-lg bg-emerald-50 py-1.5 text-[10.5px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    ↓ Ghi thu
                  </button>
                  <button
                    onClick={() => setPhieu({ loai: 'chi', quy_id: q.id })}
                    className="flex-1 cursor-pointer rounded-lg bg-rose-50 py-1.5 text-[10.5px] font-bold text-rose-700 transition-colors hover:bg-rose-100"
                  >
                    ↑ Ghi chi
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Tab */}
      <Card className="p-2">
        <div className="flex gap-1.5">
          {TAB.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                tab === t.id
                  ? 'bg-blue-800 text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              {t.nhan}
            </button>
          ))}
        </div>
      </Card>

      {tab !== 'can-doi' && (tab === 'so-cai' ? (
        !soCai ? (
          <Card>
            <Spinner label="Đang mở sổ cái…" />
          </Card>
        ) : soCai.length === 0 ? (
          <Rong emoji="📒" loi_nhan="Sổ cái chưa có khoản thu chi nào.">
            {ghiDuoc && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button mau="luc" icon={ArrowDownLeft} onClick={() => setPhieu({ loai: 'thu' })}>
                  GHI KHOẢN THU ĐẦU TIÊN
                </Button>
                <Button mau="trang" icon={ArrowUpRight} onClick={() => setPhieu({ loai: 'chi' })}>
                  GHI KHOẢN CHI
                </Button>
              </div>
            )}
          </Rong>
        ) : (
          <KhungBang>
            <Bang>
              <Thead>
                <tr>
                  <Th>Thời gian</Th>
                  <Th>Loại</Th>
                  <Th>Quỹ</Th>
                  <Th>Người nộp / Đơn vị nhận</Th>
                  <Th>Nội dung</Th>
                  <Th>Hình thức</Th>
                  <Th className="text-right">Số tiền</Th>
                </tr>
              </Thead>
              <Tbody>
                {soCai.map((d) => (
                  <Tr key={`${d.loai}-${d.id}`}>
                    <Td className="text-slate-500 font-mono whitespace-nowrap">
                      {d.thoi_gian ? gio(d.thoi_gian) : <ChuaCapNhat />}
                    </Td>
                    <Td>
                      <Chip mau={d.loai === 'thu' ? 'emerald' : 'rose'} nho>
                        {d.loai === 'thu' ? 'THU' : 'CHI'}
                      </Chip>
                    </Td>
                    <Td className="text-slate-600">{d.ten_quy}</Td>
                    <Td className="text-slate-900 font-semibold">
                      {d.doi_tac || <ChuaCapNhat />}
                    </Td>
                    <Td className="text-slate-600 truncate max-w-xs" title={d.noi_dung}>
                      {d.noi_dung || <ChuaCapNhat />}
                    </Td>
                    <Td className="text-slate-500">{d.hinh_thuc || <ChuaCapNhat />}</Td>
                    <Td
                      className={cx(
                        'text-right font-bold tabular-nums whitespace-nowrap',
                        d.loai === 'thu' ? 'text-emerald-700' : 'text-rose-700',
                      )}
                    >
                      {d.loai === 'thu' ? '+' : '−'}
                      {vnd(d.amount)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Bang>
          </KhungBang>
        )
      ) : !dotThu ? (
        <Card>
          <Spinner label="Đang tải đợt vận động…" />
        </Card>
      ) : dotThu.length === 0 ? (
        <Rong emoji="📣" loi_nhan="Chưa mở đợt vận động nào." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dotThu.map((d) => {
            const tt = TRANG_THAI[d.status] ?? TRANG_THAI.nhap!;
            const pct = d.tong_so_ho ? Math.round((d.so_ho_dong / d.tong_so_ho) * 100) : 0;
            return (
              <Card key={d.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-xs">{d.name}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      {d.ten_quy}
                      {d.period && ` · ${d.period}`}
                    </p>
                  </div>
                  <Chip mau={tt.mau} nho>
                    {tt.nhan}
                  </Chip>
                </div>

                <p className="text-lg font-bold text-slate-900 mt-3 tabular-nums">
                  {vnd(d.da_thu)}
                </p>
                {d.per_household_amount && (
                  <p className="text-[10px] text-slate-400 font-medium">
                    Mức vận động: {vnd(d.per_household_amount)}/hộ
                  </p>
                )}

                <div className="mt-3">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                    <span>
                      {so(d.so_ho_dong)} / {so(d.tong_so_ho)} hộ đã đóng
                    </span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-800 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {tab === 'can-doi' && <CanDoiTheoQuy ds={ds} />}

      {themQuy && <QuyForm onClose={() => setThemQuy(false)} />}

      {phieu && (
        <PhieuThuChi
          loai={phieu.loai}
          quy_id={phieu.quy_id ?? null}
          onClose={() => setPhieu(null)}
        />
      )}
    </>
  );
}

const LOAI_QUY: Record<string, string> = {
  hoat_dong: 'Quỹ hoạt động',
  doan_the: 'Quỹ đoàn thể',
  vi_nguoi_ngheo: 'Vì người nghèo',
  den_on_dap_nghia: 'Đền ơn đáp nghĩa',
  phong_chong_thien_tai: 'Phòng chống thiên tai',
  khac: 'Khác',
};

/** Thêm quỹ mới — vd mỗi đoàn thể một quỹ riêng (Quỹ Hội Phụ nữ, Quỹ Đoàn TN…). */
function QuyForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', fund_type: 'hoat_dong', description: '' });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () => {
      const slug =
        khongDau(f.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 28) || 'quy';
      const code = `${slug}_${Math.random().toString(36).slice(2, 6)}`;
      return post('/quy', {
        code,
        name: f.name.trim(),
        fund_type: f.fund_type,
        description: f.description.trim() || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quy'] });
      void qc.invalidateQueries({ queryKey: ['quy-tong-quan-chung'] });
      onClose();
    },
    onError: (e: unknown) => setLoi(e instanceof Error ? e.message : 'Không tạo được quỹ'),
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de="Thêm quỹ mới"
      mo_ta="Mỗi đoàn thể có thể có một quỹ riêng để tách bạch thu chi"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (f.name.trim().length < 2) {
                setLoi('Cần nhập tên quỹ');
                return;
              }
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG TẠO…' : 'TẠO QUỸ'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {loi && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {loi}
          </p>
        )}
        <Truong nhan="Tên quỹ" bat_buoc>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="vd Quỹ Hội Phụ nữ, Quỹ Đoàn Thanh niên…"
            autoFocus
          />
        </Truong>
        <Truong nhan="Loại quỹ">
          <Select value={f.fund_type} onChange={(e) => setF({ ...f, fund_type: e.target.value })}>
            {Object.entries(LOAI_QUY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Truong>
        <Truong nhan="Mô tả" ghi_chu="Quỹ này do đoàn thể nào phụ trách, dùng vào việc gì…">
          <Input
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Truong>
      </div>
    </NganKeo>
  );
}

/** Báo cáo cân đối thu – chi – còn tồn của từng quỹ, kèm tỉ lệ giải ngân (Chi/Thu). */
function CanDoiTheoQuy({ ds }: { ds: MotQuy[] | undefined }) {
  if (!ds) {
    return (
      <Card>
        <Spinner label="Đang tính cân đối…" />
      </Card>
    );
  }
  if (ds.length === 0) {
    return <Rong emoji="📊" loi_nhan="Chưa có quỹ nào để cân đối." />;
  }
  const nam = new Date().getFullYear();
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800 uppercase">
          Bảng cân đối tài chính từng loại quỹ (Năm {nam})
        </h4>
        <Chip mau="emerald" nho>
          Thu chi công khai
        </Chip>
      </div>
      <div className="divide-y divide-slate-100">
        {ds.map((q) => {
          const pct = q.tong_thu > 0 ? Math.round((q.tong_chi / q.tong_thu) * 100) : 0;
          return (
            <div key={q.id} className="py-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h5 className="text-sm font-bold text-slate-900">{q.name}</h5>
                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <span className="text-right">
                    <span className="block text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                      Tổng thu
                    </span>
                    <span className="font-bold text-emerald-700">+{vnd(q.tong_thu)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                      Tổng chi
                    </span>
                    <span className="font-bold text-rose-700">−{vnd(q.tong_chi)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                      Còn tồn
                    </span>
                    <span className="font-extrabold text-slate-900">{vnd(q.so_du)}</span>
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500">
                  <span>Tỉ lệ giải ngân (Chi / Thu)</span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-800 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
