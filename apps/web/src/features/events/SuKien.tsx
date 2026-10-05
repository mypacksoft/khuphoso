/**
 * Sự kiện & danh sách khách mời.
 *
 * Gom khách mời bằng BỘ LỌC cư dân (tuổi từ–đến, giới tính, đoàn thể/chính sách,
 * tổ dân phố, diện cư trú) — ví dụ "tặng quà người cao tuổi từ 60 tuổi". Điểm danh
 * và đánh dấu đã nhận quà ngay trên danh sách; xuất Excel để in phát quà.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Filter,
  Gift,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
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
  NutIcon,
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
  XacNhan,
} from '@/components/ui';
import { get, patch, post, del } from '@/lib/api';
import { gio, ngay, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { ToDanPho } from '@/lib/types';

const LOAI: Record<string, string> = {
  tang_qua: 'Tặng quà',
  hop_mat: 'Họp mặt',
  van_nghe: 'Văn nghệ',
  tuyen_truyen: 'Tuyên truyền',
  khac: 'Khác',
};
const LOAI_MAU: Record<string, 'rose' | 'blue' | 'violet' | 'teal' | 'slate'> = {
  tang_qua: 'rose',
  hop_mat: 'blue',
  van_nghe: 'violet',
  tuyen_truyen: 'teal',
  khac: 'slate',
};
const TT: Record<string, string> = {
  sap_dien_ra: 'Sắp diễn ra',
  da_dien_ra: 'Đã diễn ra',
  da_huy: 'Đã huỷ',
};
const TT_MAU: Record<string, 'amber' | 'emerald' | 'slate'> = {
  sap_dien_ra: 'amber',
  da_dien_ra: 'emerald',
  da_huy: 'slate',
};
const GT: Record<string, string> = { nam: 'Nam', nu: 'Nữ', khac: 'Khác' };

interface SuKienItem {
  id: string;
  code: string | null;
  name: string;
  event_type: string;
  starts_at: string | null;
  location: string | null;
  gift_desc: string | null;
  status: string;
  so_khach: number;
  so_diem_danh: number;
  so_nhan_qua: number;
}

interface Khach {
  gid: string;
  attended: boolean;
  gift_received: boolean;
  note: string | null;
  resident_id: string;
  full_name: string;
  gender: string | null;
  phone: string | null;
  id_card_last4: string | null;
  tuoi: number | null;
  residence_status: string;
  to_dan_pho: string | null;
}

interface ChiTietSK extends SuKienItem {
  description: string | null;
  khach: Khach[];
  thong_ke: { so_khach: number; so_diem_danh: number; so_nhan_qua: number };
}

export function SuKien() {
  const { can } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);
  const suaDuoc = can('resident:write');

  const [q, setQ] = useState('');
  const [tt, setTt] = useState('');
  const [moId, setMoId] = useState<string | null>(null);
  const [sua, setSua] = useState<SuKienItem | 'moi' | null>(null);

  useEffect(() => {
    datManHinh({ tieu_de: 'Sự kiện khu phố' });
  }, [datManHinh]);

  const { data, isLoading } = useQuery({
    queryKey: ['su-kien', q, tt],
    queryFn: () =>
      get<{ items: SuKienItem[] }>(
        `/su-kien?${new URLSearchParams({ ...(q ? { q } : {}), ...(tt ? { status: tt } : {}) }).toString()}`,
      ),
  });
  const items = data?.items ?? [];

  return (
    <>
      <ThanhTieuDe tieu_de="Sự kiện khu phố" mo_ta={`${so(items.length)} sự kiện`}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm sự kiện…"
            className="w-40 pl-9 sm:w-52"
          />
        </div>
        <Select value={tt} onChange={(e) => setTt(e.target.value)} className="w-auto">
          <option value="">Tất cả</option>
          {Object.entries(TT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {suaDuoc && (
          <Button icon={Plus} onClick={() => setSua('moi')}>
            Thêm sự kiện
          </Button>
        )}
      </ThanhTieuDe>

      {isLoading ? (
        <Card>
          <Spinner label="Đang tải sự kiện…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong emoji="🎉" loi_nhan="Chưa có sự kiện nào. Tạo sự kiện để lập danh sách khách mời." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => (
            <Card
              key={e.id}
              onClick={() => setMoId(e.id)}
              className="group cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-600 group-hover:text-white">
                  <Gift className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900">{e.name}</h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Chip mau={LOAI_MAU[e.event_type]} nho>
                      {LOAI[e.event_type]}
                    </Chip>
                    <Chip mau={TT_MAU[e.status]} nho>
                      {TT[e.status]}
                    </Chip>
                  </p>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  {e.starts_at ? `${ngay(e.starts_at)} · ${gio(e.starts_at)}` : 'Chưa định ngày'}
                </p>
                {e.location && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> {e.location}
                  </p>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" /> {so(e.so_khach)} khách
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {so(e.so_diem_danh)}
                </span>
                <span className="flex items-center gap-1 text-rose-600">
                  <Gift className="h-3.5 w-3.5" /> {so(e.so_nhan_qua)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {moId && <ChiTietDrawer id={moId} onClose={() => setMoId(null)} onSua={setSua} />}
      {sua && <FormDrawer sk={sua} onClose={() => setSua(null)} />}
    </>
  );
}

/* ═══════════════════════════════════════════════════════ Chi tiết SK ══ */

function ChiTietDrawer({
  id,
  onClose,
  onSua,
}: {
  id: string;
  onClose: () => void;
  onSua: (s: SuKienItem) => void;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const suaDuoc = can('resident:write');
  const [moLoc, setMoLoc] = useState(false);
  const [goiXoa, setGoiXoa] = useState<Khach | null>(null);

  const { data: sk } = useQuery({
    queryKey: ['su-kien', id],
    queryFn: () => get<ChiTietSK>(`/su-kien/${id}`),
  });

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ['su-kien'] });
  };

  // Tick điểm danh / nhận quà: đổi màu TỨC THÌ (optimistic), không chờ server và
  // không refetch cả danh sách — nếu lỗi thì hoàn lại. Nhờ vậy bấm liên tục vẫn mượt.
  const doiKhach = useMutation({
    mutationFn: (v: { gid: string; attended?: boolean; gift_received?: boolean }) =>
      patch(`/su-kien/${id}/khach/${v.gid}`, {
        attended: v.attended,
        gift_received: v.gift_received,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['su-kien', id] });
      const prev = qc.getQueryData<ChiTietSK>(['su-kien', id]);
      if (prev) {
        qc.setQueryData<ChiTietSK>(['su-kien', id], {
          ...prev,
          khach: prev.khach.map((k) =>
            k.gid === v.gid
              ? {
                  ...k,
                  attended: v.attended ?? k.attended,
                  gift_received: v.gift_received ?? k.gift_received,
                }
              : k,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['su-kien', id], ctx.prev);
    },
  });
  const goKhach = useMutation({
    mutationFn: (gid: string) => post(`/su-kien/${id}/go-khach`, { guest_ids: [gid] }),
    onSuccess: () => {
      setGoiXoa(null);
      lamMoi();
    },
  });

  const xuatExcel = () => {
    if (!sk) return;
    const rows = [
      ['STT', 'Họ tên', 'Tuổi', 'Giới tính', 'Tổ', 'SĐT', 'Điểm danh', 'Nhận quà'],
      ...sk.khach.map((k, i) => [
        String(i + 1),
        k.full_name,
        k.tuoi != null ? String(k.tuoi) : '',
        GT[k.gender ?? ''] ?? '',
        k.to_dan_pho ?? '',
        k.phone ?? '',
        k.attended ? 'x' : '',
        k.gift_received ? 'x' : '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    // BOM để Excel đọc đúng tiếng Việt
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `khach-moi-${sk.code ?? sk.name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!sk) {
    return (
      <NganKeo mo dong={onClose} tieu_de="Sự kiện" rong="max-w-4xl">
        <Spinner label="Đang tải…" />
      </NganKeo>
    );
  }
  // Tính ngay trên client để khớp với optimistic update của nút tick.
  const soKhach = sk.khach.length;
  const soDiemDanh = sk.khach.filter((k) => k.attended).length;
  const soNhanQua = sk.khach.filter((k) => k.gift_received).length;

  // Đóng ngăn kéo mới làm mới danh sách (cập nhật số đếm trên thẻ ngoài).
  const dongVaLamMoi = () => {
    void qc.invalidateQueries({ queryKey: ['su-kien'] });
    onClose();
  };

  return (
    <>
      <NganKeo
        mo
        dong={dongVaLamMoi}
        tieu_de={sk.name}
        mo_ta={`${LOAI[sk.event_type]}${sk.starts_at ? ` · ${ngay(sk.starts_at)} ${gio(sk.starts_at)}` : ''}`}
        rong="max-w-4xl"
        chan={
          suaDuoc && (
            <>
              <Button mau="trang" icon={Filter} onClick={() => setMoLoc(true)}>
                Gom khách theo bộ lọc
              </Button>
              <Button mau="trang" icon={Download} onClick={xuatExcel}>
                Xuất Excel
              </Button>
              <Button mau="trang" icon={Pencil} onClick={() => onSua(sk)}>
                Sửa
              </Button>
            </>
          )
        }
      >
        {(sk.location || sk.gift_desc || sk.description) && (
          <div className="mb-4 grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs sm:grid-cols-2">
            {sk.location && <Info nhan="Địa điểm" gt={sk.location} />}
            {sk.gift_desc && <Info nhan="Quà / suất quà" gt={sk.gift_desc} />}
            {sk.description && <Info nhan="Nội dung" gt={sk.description} span />}
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2">
          <OTile nhan="Khách mời" gt={so(soKhach)} icon={Users} mau="blue" />
          <OTile nhan="Đã điểm danh" gt={so(soDiemDanh)} icon={CheckCircle2} mau="emerald" />
          <OTile nhan="Đã nhận quà" gt={so(soNhanQua)} icon={Gift} mau="rose" />
        </div>

        {sk.khach.length === 0 ? (
          <Card className="p-8 text-center text-xs font-medium text-slate-400">
            Chưa có khách mời. Bấm “Gom khách theo bộ lọc” để lập danh sách theo độ tuổi, đoàn thể…
          </Card>
        ) : (
          <KhungBang>
            <Bang className="min-w-[720px]">
              <Thead>
                <tr>
                  <Th>Họ tên</Th>
                  <Th>Tuổi</Th>
                  <Th>Giới tính</Th>
                  <Th>Tổ</Th>
                  <Th>SĐT</Th>
                  <Th className="text-center">Điểm danh</Th>
                  <Th className="text-center">Nhận quà</Th>
                  {suaDuoc && <Th />}
                </tr>
              </Thead>
              <Tbody>
                {sk.khach.map((k) => (
                  <Tr key={k.gid}>
                    <Td className="font-semibold text-slate-900">{k.full_name}</Td>
                    <Td className="text-slate-700">{k.tuoi ?? <ChuaCapNhat />}</Td>
                    <Td className="text-slate-700">{GT[k.gender ?? ''] ?? <ChuaCapNhat />}</Td>
                    <Td className="text-slate-700">{k.to_dan_pho || <ChuaCapNhat />}</Td>
                    <Td className="font-mono text-slate-700">{k.phone || <ChuaCapNhat />}</Td>
                    <Td className="text-center">
                      <TichNut
                        bat={k.attended}
                        onBam={() => doiKhach.mutate({ gid: k.gid, attended: !k.attended })}
                        disabled={!suaDuoc}
                        mau="emerald"
                      />
                    </Td>
                    <Td className="text-center">
                      <TichNut
                        bat={k.gift_received}
                        onBam={() => doiKhach.mutate({ gid: k.gid, gift_received: !k.gift_received })}
                        disabled={!suaDuoc}
                        mau="rose"
                      />
                    </Td>
                    {suaDuoc && (
                      <Td className="text-right">
                        <NutIcon
                          icon={Trash2}
                          title="Gỡ khỏi danh sách"
                          mau="text-slate-400 hover:text-rose-600"
                          onClick={() => setGoiXoa(k)}
                        />
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Bang>
          </KhungBang>
        )}
      </NganKeo>

      {moLoc && <LocKhachDrawer id={id} onClose={() => setMoLoc(false)} onXong={lamMoi} />}

      <XacNhan
        mo={!!goiXoa}
        dong={() => setGoiXoa(null)}
        tieu_de="Gỡ khách mời"
        nhan_nut="GỠ KHỎI DANH SÁCH"
        muc_do="thuong"
        dang_lam={goKhach.isPending}
        loi_nhan={<p>Gỡ <b>{goiXoa?.full_name}</b> khỏi danh sách khách mời của sự kiện này?</p>}
        onXacNhan={() => goiXoa && goKhach.mutate(goiXoa.gid)}
      />
    </>
  );
}

function TichNut({
  bat,
  onBam,
  disabled,
  mau,
}: {
  bat: boolean;
  onBam: () => void;
  disabled?: boolean;
  mau: 'emerald' | 'rose';
}) {
  const on = mau === 'emerald' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-rose-600 border-rose-600 text-white';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBam}
      className={cx(
        'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-all',
        disabled ? 'cursor-default' : 'cursor-pointer',
        bat ? on : 'border-slate-300 text-transparent hover:border-slate-400',
      )}
    >
      <CheckCircle2 className="h-4 w-4" />
    </button>
  );
}

function Info({ nhan, gt, span }: { nhan: string; gt: string | null; span?: boolean }) {
  return (
    <div className={cx('min-w-0', span && 'sm:col-span-2')}>
      <span className="block text-[9.5px] font-bold tracking-wide text-slate-400 uppercase">{nhan}</span>
      <span className="text-xs font-semibold text-slate-800">{gt || <ChuaCapNhat />}</span>
    </div>
  );
}

function OTile({
  nhan,
  gt,
  icon: Icon,
  mau,
}: {
  nhan: string;
  gt: string;
  icon: typeof Users;
  mau: 'blue' | 'emerald' | 'rose';
}) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3">
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg[mau])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[9px] font-bold tracking-wide text-slate-400 uppercase">{nhan}</span>
        <strong className="text-base text-slate-900 tabular-nums">{gt}</strong>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ Lọc gom khách ══ */

interface PhanLoai {
  code: string;
  name: string;
}

function LocKhachDrawer({
  id,
  onClose,
  onXong,
}: {
  id: string;
  onClose: () => void;
  onXong: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    tuoi_tu: '',
    tuoi_den: '',
    gender: '',
    phan_loai: '',
    group_id: '',
    dien_cu_tru: '',
  });

  const { data: phanLoai } = useQuery({
    queryKey: ['phan-loai'],
    queryFn: () => get<PhanLoai[]>('/cu-dan/danh-muc/phan-loai'),
  });
  const { data: toDanPho } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
  });

  const params = () => {
    const p: Record<string, string> = {};
    if (f.tuoi_tu) p.tuoi_tu = f.tuoi_tu;
    if (f.tuoi_den) p.tuoi_den = f.tuoi_den;
    if (f.gender) p.gender = f.gender;
    if (f.phan_loai) p.phan_loai = f.phan_loai;
    if (f.group_id) p.group_id = f.group_id;
    if (f.dien_cu_tru) p.dien_cu_tru = f.dien_cu_tru;
    return p;
  };

  const { data: xem, isFetching } = useQuery({
    queryKey: ['loc-cu-dan', f],
    queryFn: () =>
      get<{ tong: number; items: { full_name: string; tuoi: number | null; to_dan_pho: string | null }[] }>(
        `/su-kien/loc-cu-dan?${new URLSearchParams(params()).toString()}`,
      ),
  });

  const gom = useMutation({
    mutationFn: () =>
      post<{ da_them: number }>(`/su-kien/${id}/them-khach-loc`, {
        tuoi_tu: f.tuoi_tu ? Number(f.tuoi_tu) : null,
        tuoi_den: f.tuoi_den ? Number(f.tuoi_den) : null,
        gender: f.gender || null,
        phan_loai: f.phan_loai || null,
        group_id: f.group_id || null,
        dien_cu_tru: f.dien_cu_tru || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['su-kien', id] });
      onXong();
      onClose();
    },
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de="Gom khách theo bộ lọc"
      mo_ta="Lọc cư dân rồi thêm hàng loạt vào danh sách khách mời"
      rong="max-w-lg"
      chan={
        <>
          <Button mau="trang" onClick={onClose}>
            Đóng
          </Button>
          <Button
            icon={UserPlus}
            onClick={() => gom.mutate()}
            disabled={gom.isPending || (xem?.tong ?? 0) === 0}
          >
            {gom.isPending ? 'ĐANG GOM…' : `Gom ${so(xem?.tong ?? 0)} người`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Truong nhan="Tuổi từ">
            <Input
              value={f.tuoi_tu}
              onChange={(e) => setF({ ...f, tuoi_tu: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              placeholder="vd 60"
            />
          </Truong>
          <Truong nhan="Tuổi đến">
            <Input
              value={f.tuoi_den}
              onChange={(e) => setF({ ...f, tuoi_den: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              placeholder="để trống = không giới hạn"
            />
          </Truong>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Truong nhan="Giới tính">
            <Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">Tất cả</option>
              <option value="nam">Nam</option>
              <option value="nu">Nữ</option>
            </Select>
          </Truong>
          <Truong nhan="Diện cư trú">
            <Select value={f.dien_cu_tru} onChange={(e) => setF({ ...f, dien_cu_tru: e.target.value })}>
              <option value="">Tất cả</option>
              <option value="thuong_tru">Thường trú</option>
              <option value="tam_tru">Tạm trú</option>
            </Select>
          </Truong>
        </div>
        <Truong nhan="Đoàn thể / diện chính sách">
          <Select value={f.phan_loai} onChange={(e) => setF({ ...f, phan_loai: e.target.value })}>
            <option value="">Tất cả</option>
            {(phanLoai ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Truong>
        <Truong nhan="Tổ dân phố">
          <Select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}>
            <option value="">Tất cả</option>
            {(toDanPho ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Truong>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
          <p className="text-xs font-bold text-blue-800">
            {isFetching ? 'Đang đếm…' : `Khớp ${so(xem?.tong ?? 0)} cư dân`}
          </p>
          {xem && xem.items.length > 0 && (
            <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-slate-600">
              {xem.items.map((r, i) => (
                <p key={i} className="truncate">
                  {r.full_name}
                  {r.tuoi != null ? ` · ${r.tuoi} tuổi` : ''}
                  {r.to_dan_pho ? ` · ${r.to_dan_pho}` : ''}
                </p>
              ))}
              {xem.tong > xem.items.length && (
                <p className="text-slate-400">… và {so(xem.tong - xem.items.length)} người nữa</p>
              )}
            </div>
          )}
        </div>
      </div>
    </NganKeo>
  );
}

/* ═══════════════════════════════════════════════════════════ Form ══ */

function FormDrawer({ sk, onClose }: { sk: SuKienItem | 'moi'; onClose: () => void }) {
  const qc = useQueryClient();
  const moi = sk === 'moi';
  const g = moi ? null : sk;
  const [f, setF] = useState({
    name: g?.name ?? '',
    event_type: g?.event_type ?? 'tang_qua',
    starts_at: g?.starts_at ? g.starts_at.slice(0, 16) : '',
    location: g?.location ?? '',
    gift_desc: g?.gift_desc ?? '',
    description: '',
    status: g?.status ?? 'sap_dien_ra',
  });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        event_type: f.event_type,
        starts_at: f.starts_at || null,
        location: f.location.trim() || null,
        gift_desc: f.gift_desc.trim() || null,
        description: f.description.trim() || null,
        status: f.status,
      };
      return moi ? post('/su-kien', body) : patch(`/su-kien/${g!.id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['su-kien'] });
      onClose();
    },
    onError: (e: unknown) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const xoa = useMutation({
    mutationFn: () => del(`/su-kien/${g!.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['su-kien'] });
      onClose();
    },
  });
  const [hoiXoa, setHoiXoa] = useState(false);

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={moi ? 'Thêm sự kiện' : 'Sửa sự kiện'}
        rong="max-w-lg"
        chan={
          <>
            {!moi && (
              <Button mau="do" icon={Trash2} onClick={() => setHoiXoa(true)} className="mr-auto">
                Xoá
              </Button>
            )}
            <Button mau="trang" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              onClick={() => {
                setLoi('');
                if (!f.name.trim()) {
                  setLoi('Cần nhập tên sự kiện');
                  return;
                }
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : 'LƯU'}
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
          <Truong nhan="Tên sự kiện" bat_buoc>
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="vd Tặng quà người cao tuổi dịp Tết"
              autoFocus
            />
          </Truong>
          <div className="grid grid-cols-2 gap-3">
            <Truong nhan="Loại">
              <Select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>
                {Object.entries(LOAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Trạng thái">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(TT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Truong nhan="Thời gian">
              <Input
                type="datetime-local"
                value={f.starts_at}
                onChange={(e) => setF({ ...f, starts_at: e.target.value })}
              />
            </Truong>
            <Truong nhan="Địa điểm">
              <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            </Truong>
          </div>
          <Truong nhan="Quà / suất quà" ghi_chu="vd 300 phần quà, mỗi phần 200.000đ">
            <Input value={f.gift_desc} onChange={(e) => setF({ ...f, gift_desc: e.target.value })} />
          </Truong>
          <Truong nhan="Nội dung">
            <Input
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Truong>
        </div>
      </NganKeo>

      <XacNhan
        mo={hoiXoa}
        dong={() => setHoiXoa(false)}
        tieu_de="Xoá sự kiện"
        nhan_nut="XOÁ SỰ KIỆN"
        dang_lam={xoa.isPending}
        loi_nhan={<p>Xoá sự kiện này và toàn bộ danh sách khách mời kèm theo?</p>}
        onXacNhan={() => xoa.mutate()}
      />
    </>
  );
}
