/**
 * Cơ sở trọ — nhà trọ, nhà cho thuê, kiot.
 *
 * Gom các hộ (thường trú lẫn tạm trú) ở cùng một địa chỉ về một cơ sở có chủ và
 * địa chỉ. Bấm vào cơ sở thấy ngay danh sách hộ và toàn bộ người đang ở, kèm hạn
 * tạm trú để nhắc gia hạn. Gán hộ bằng gợi ý theo địa chỉ trùng, hoặc tìm tay.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  DoorOpen,
  Globe,
  Link2,
  Pencil,
  Plus,
  Search,
  Unlink,
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
} from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { ngay, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import { SoHoKhau } from '@/features/households/SoHoKhau';

const LOAI: Record<string, string> = {
  nha_tro: 'Nhà trọ',
  nha_cho_thue: 'Nhà cho thuê',
  kiot: 'Kiot',
  khach_san: 'Khách sạn',
  khac: 'Khác',
};

const LOAI_MAU: Record<string, 'blue' | 'violet' | 'amber' | 'teal' | 'slate'> = {
  nha_tro: 'blue',
  nha_cho_thue: 'violet',
  kiot: 'amber',
  khach_san: 'teal',
  khac: 'slate',
};

interface CoSo {
  id: string;
  code: string | null;
  name: string;
  owner_name: string | null;
  owner_phone: string | null;
  address: string | null;
  loai: string;
  has_foreigner: boolean;
  total_rooms: number | null;
  so_ho: number;
  so_nguoi: number;
  so_qua_han: number;
}

interface HoTrongCoSo {
  id: string;
  code: string;
  address: string | null;
  room_no: string | null;
  household_type: string;
  chu_ho: string | null;
  dt_chu_ho: string | null;
  so_nhan_khau: number;
  han_tam_tru: string | null;
}

interface NguoiTrongCoSo {
  id: string;
  full_name: string;
  id_card_last4: string | null;
  phone: string | null;
  gender: string | null;
  residence_status: string;
  tam_tru_den_ngay: string | null;
  room_no: string | null;
  ma_ho: string;
  tuoi: number | null;
}

interface ChiTiet extends CoSo {
  note: string | null;
  ho: HoTrongCoSo[];
  nguoi: NguoiTrongCoSo[];
  thong_ke: {
    so_ho: number;
    so_nguoi: number;
    tong_phong: number | null;
    phong_trong: number | null;
    so_qua_han: number;
  };
}

const quaHan = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10);

export function CoSoTro() {
  const { can } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);
  const suaDuoc = can('household:write');

  const [q, setQ] = useState('');
  const [loai, setLoai] = useState('');
  const [moId, setMoId] = useState<string | null>(null);
  const [sua, setSua] = useState<CoSo | 'moi' | null>(null);

  useEffect(() => {
    datManHinh({ tieu_de: 'Cơ sở trọ' });
  }, [datManHinh]);

  const { data, isLoading } = useQuery({
    queryKey: ['co-so-tro', q, loai],
    queryFn: () =>
      get<{ tong_so: number; items: CoSo[] }>(
        `/co-so-tro?${new URLSearchParams({
          ...(q ? { q } : {}),
          ...(loai ? { loai } : {}),
          limit: '2000',
        }).toString()}`,
      ),
  });

  const items = data?.items ?? [];

  return (
    <>
      <ThanhTieuDe tieu_de="Cơ sở trọ" mo_ta={`${so(data?.tong_so ?? 0)} cơ sở`}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, chủ, địa chỉ…"
            className="w-44 pl-9 sm:w-56"
          />
        </div>
        <Select value={loai} onChange={(e) => setLoai(e.target.value)} className="w-auto">
          <option value="">Tất cả loại</option>
          {Object.entries(LOAI).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {suaDuoc && (
          <Button icon={Plus} onClick={() => setSua('moi')}>
            Thêm cơ sở
          </Button>
        )}
      </ThanhTieuDe>

      {isLoading ? (
        <Card>
          <Spinner label="Đang tải cơ sở trọ…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="🏨"
          loi_nhan="Chưa có cơ sở trọ nào. Thêm nhà trọ / nhà cho thuê để gom các hộ cùng địa chỉ."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <Card
              key={c.id}
              onClick={() => setMoId(c.id)}
              className="group cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-bold text-slate-900">{c.name}</h3>
                    {c.has_foreigner && (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Có người nước ngoài" />
                    )}
                  </div>
                  <p className="truncate text-[11px] font-medium text-slate-500">
                    {c.owner_name || 'Chưa có chủ cơ sở'}
                    {c.owner_phone ? ` · ${c.owner_phone}` : ''}
                  </p>
                </div>
                <Chip mau={LOAI_MAU[c.loai]} nho>
                  {LOAI[c.loai]}
                </Chip>
              </div>
              <p className="mt-2 line-clamp-1 text-[11px] text-slate-500">
                📍 {c.address || <ChuaCapNhat />}
              </p>
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" /> {so(c.so_ho)} hộ
                </span>
                <span>· {so(c.so_nguoi)} người</span>
                {c.total_rooms ? <span>· {so(c.total_rooms)} phòng</span> : null}
                {c.so_qua_han > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {c.so_qua_han} quá hạn
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {moId && <ChiTietDrawer id={moId} onClose={() => setMoId(null)} onSua={(c) => setSua(c)} />}
      {sua && <FormDrawer cs={sua} onClose={() => setSua(null)} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════ Chi tiết cơ sở ══ */

function ChiTietDrawer({
  id,
  onClose,
  onSua,
}: {
  id: string;
  onClose: () => void;
  onSua: (c: CoSo) => void;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const suaDuoc = can('household:write');
  const [moGan, setMoGan] = useState(false);
  const [soHoId, setSoHoId] = useState<string | null>(null);

  const { data: cs } = useQuery({
    queryKey: ['co-so-tro', id],
    queryFn: () => get<ChiTiet>(`/co-so-tro/${id}`),
  });

  const goHo = useMutation({
    mutationFn: (hid: string) => post(`/co-so-tro/${id}/go-ho`, { household_ids: [hid] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['co-so-tro'] });
    },
  });

  if (!cs) {
    return (
      <NganKeo mo dong={onClose} tieu_de="Cơ sở trọ" rong="max-w-3xl">
        <Spinner label="Đang tải…" />
      </NganKeo>
    );
  }

  const tk = cs.thong_ke;

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={cs.name}
        mo_ta={`${LOAI[cs.loai]}${cs.code ? ` · ${cs.code}` : ''}`}
        rong="max-w-3xl"
        chan={
          suaDuoc && (
            <>
              <Button mau="trang" icon={Link2} onClick={() => setMoGan(true)}>
                Gán hộ vào cơ sở
              </Button>
              <Button mau="trang" icon={Pencil} onClick={() => onSua(cs)}>
                Sửa thông tin
              </Button>
            </>
          )
        }
      >
        {/* Thông tin cơ sở */}
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs sm:grid-cols-3">
          <Info nhan="Chủ cơ sở" gt={cs.owner_name} />
          <Info nhan="Điện thoại" gt={cs.owner_phone} />
          <Info nhan="Loại hình" gt={LOAI[cs.loai]} />
          <Info nhan="Địa chỉ" gt={cs.address} span />
          {cs.has_foreigner && (
            <div className="col-span-2 sm:col-span-1">
              <Chip mau="rose" nho>
                Có người nước ngoài
              </Chip>
            </div>
          )}
          {cs.note && <Info nhan="Ghi chú" gt={cs.note} span />}
        </div>

        {/* Thống kê */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <OTile nhan="Số hộ" gt={so(tk.so_ho)} icon={Users} mau="blue" />
          <OTile nhan="Số người" gt={so(tk.so_nguoi)} icon={Users} mau="indigo" />
          <OTile
            nhan="Phòng trống"
            gt={tk.phong_trong != null ? `${so(tk.phong_trong)}/${so(tk.tong_phong ?? 0)}` : '—'}
            icon={DoorOpen}
            mau="emerald"
          />
          <OTile
            nhan="Tạm trú quá hạn"
            gt={so(tk.so_qua_han)}
            icon={AlertTriangle}
            mau={tk.so_qua_han > 0 ? 'rose' : 'slate'}
          />
        </div>

        {/* Danh sách hộ */}
        <h4 className="mb-2 text-xs font-bold text-slate-700 uppercase">Danh sách hộ ({cs.ho.length})</h4>
        {cs.ho.length === 0 ? (
          <Card className="mb-4 p-6 text-center text-xs font-medium text-slate-400">
            Chưa có hộ nào thuộc cơ sở này. Bấm “Gán hộ vào cơ sở”.
          </Card>
        ) : (
          <KhungBang>
            <Bang className="min-w-[640px]">
              <Thead>
                <tr>
                  <Th>Mã hộ</Th>
                  <Th>Chủ hộ</Th>
                  <Th>Phòng</Th>
                  <Th className="text-center">Nhân khẩu</Th>
                  <Th>Hạn tạm trú</Th>
                  {suaDuoc && <Th />}
                </tr>
              </Thead>
              <Tbody>
                {cs.ho.map((h) => (
                  <Tr
                    key={h.id}
                    onClick={() => setSoHoId(h.id)}
                    className="cursor-pointer"
                    title="Bấm để xem sổ hộ tạm trú"
                  >
                    <Td className="font-mono font-bold text-slate-700">{h.code}</Td>
                    <Td className="font-semibold text-slate-900">
                      {h.chu_ho || <ChuaCapNhat />}
                      <span className="ml-1.5">
                        <Chip mau={h.household_type === 'tam_tru' ? 'amber' : 'blue'} nho>
                          {h.household_type === 'tam_tru' ? 'Tạm trú' : 'Thường trú'}
                        </Chip>
                      </span>
                    </Td>
                    <Td className="text-slate-700">{h.room_no || <ChuaCapNhat />}</Td>
                    <Td className="text-center">
                      <Chip mau="slate" nho>
                        {so(h.so_nhan_khau)}
                      </Chip>
                    </Td>
                    <Td className={cx('font-medium', quaHan(h.han_tam_tru) && 'text-rose-600')}>
                      {h.han_tam_tru ? (
                        <span className="flex items-center gap-1">
                          {ngay(h.han_tam_tru)}
                          {quaHan(h.han_tam_tru) && <AlertTriangle className="h-3 w-3" />}
                        </span>
                      ) : (
                        <ChuaCapNhat />
                      )}
                    </Td>
                    {suaDuoc && (
                      <Td className="text-right">
                        <NutIcon
                          icon={Unlink}
                          title="Gỡ hộ khỏi cơ sở"
                          mau="text-slate-400 hover:text-rose-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            goHo.mutate(h.id);
                          }}
                        />
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Bang>
          </KhungBang>
        )}

        {/* Toàn bộ người đang ở */}
        {cs.nguoi.length > 0 && (
          <>
            <h4 className="mt-5 mb-2 text-xs font-bold text-slate-700 uppercase">
              Toàn bộ người đang ở ({cs.nguoi.length})
            </h4>
            <KhungBang>
              <Bang className="min-w-[640px]">
                <Thead>
                  <tr>
                    <Th>Phòng</Th>
                    <Th>Họ tên</Th>
                    <Th>Tuổi</Th>
                    <Th>CCCD</Th>
                    <Th>Điện thoại</Th>
                    <Th>Diện</Th>
                    <Th>Hết hạn</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {cs.nguoi.map((n) => (
                    <Tr key={n.id}>
                      <Td className="text-slate-700">{n.room_no || <ChuaCapNhat />}</Td>
                      <Td className="font-semibold text-slate-900">{n.full_name}</Td>
                      <Td className="text-slate-700">{n.tuoi ?? <ChuaCapNhat />}</Td>
                      <Td className="font-mono text-slate-600">
                        {n.id_card_last4 ? `…${n.id_card_last4}` : <ChuaCapNhat />}
                      </Td>
                      <Td className="font-mono text-slate-700">{n.phone || <ChuaCapNhat />}</Td>
                      <Td>
                        <Chip mau={n.residence_status === 'tam_tru' ? 'amber' : 'blue'} nho>
                          {n.residence_status === 'tam_tru' ? 'Tạm trú' : 'Thường trú'}
                        </Chip>
                      </Td>
                      <Td className={cx('font-medium', quaHan(n.tam_tru_den_ngay) && 'text-rose-600')}>
                        {n.tam_tru_den_ngay ? ngay(n.tam_tru_den_ngay) : <ChuaCapNhat />}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Bang>
            </KhungBang>
          </>
        )}
      </NganKeo>

      {moGan && <GanHoDrawer id={id} tenCoSo={cs.name} onClose={() => setMoGan(false)} />}

      {soHoId && (
        <SoHoKhau
          id={soHoId}
          dong={() => setSoHoId(null)}
          ds_id={cs.ho.map((h) => h.id)}
          onDoi={setSoHoId}
        />
      )}
    </>
  );
}

function Info({ nhan, gt, span }: { nhan: string; gt: string | null; span?: boolean }) {
  return (
    <div className={cx('min-w-0', span && 'col-span-2 sm:col-span-3')}>
      <span className="block text-[9.5px] font-bold tracking-wide text-slate-400 uppercase">
        {nhan}
      </span>
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
  mau: 'blue' | 'indigo' | 'emerald' | 'rose' | 'slate';
}) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-500',
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3">
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg[mau])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[9px] font-bold tracking-wide text-slate-400 uppercase">
          {nhan}
        </span>
        <strong className="text-base text-slate-900 tabular-nums">{gt}</strong>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ Gán hộ ══ */

interface HoGoiY {
  id: string;
  code: string;
  address: string | null;
  household_type: string;
  chu_ho: string | null;
  so_nhan_khau: number;
  do_giong?: number;
}

function GanHoDrawer({
  id,
  tenCoSo,
  onClose,
}: {
  id: string;
  tenCoSo: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tim, setTim] = useState('');

  const { data: goiY } = useQuery({
    queryKey: ['co-so-tro-goi-y', id],
    queryFn: () => get<{ items: HoGoiY[] }>(`/co-so-tro/${id}/goi-y`),
  });

  const { data: ketQua } = useQuery({
    queryKey: ['ho-tim-gan', tim],
    queryFn: () =>
      get<{ items: HoGoiY[] }>(`/ho-khau?${new URLSearchParams({ q: tim, limit: '30' }).toString()}`),
    enabled: tim.trim().length >= 2,
  });

  const gan = useMutation({
    mutationFn: (hid: string) => post(`/co-so-tro/${id}/gan-ho`, { household_ids: [hid] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['co-so-tro'] });
      void qc.invalidateQueries({ queryKey: ['co-so-tro-goi-y', id] });
    },
  });

  const DongHo = ({ h }: { h: HoGoiY }) => (
    <div className="flex items-center gap-2 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-900">
          <span className="mr-1.5 font-mono text-slate-400">{h.code}</span>
          {h.chu_ho || 'Chưa có chủ hộ'}
          <Chip mau={h.household_type === 'tam_tru' ? 'amber' : 'blue'} nho className="ml-1.5">
            {h.household_type === 'tam_tru' ? 'Tạm trú' : 'Thường trú'}
          </Chip>
        </p>
        <p className="truncate text-[11px] text-slate-500">📍 {h.address || 'Chưa có địa chỉ'}</p>
      </div>
      <Button mau="trang" icon={Link2} onClick={() => gan.mutate(h.id)}>
        Gán
      </Button>
    </div>
  );

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de="Gán hộ vào cơ sở"
      mo_ta={tenCoSo}
      rong="max-w-xl"
    >
      <h4 className="mb-1.5 text-xs font-bold text-slate-700 uppercase">
        Gợi ý theo địa chỉ trùng
      </h4>
      {!goiY ? (
        <Spinner />
      ) : goiY.items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-medium text-slate-500">
          Không tìm thấy hộ nào có địa chỉ giống. Dùng ô tìm bên dưới để gán tay.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 px-3">
          {goiY.items.map((h) => (
            <DongHo key={h.id} h={h} />
          ))}
        </div>
      )}

      <h4 className="mt-5 mb-1.5 text-xs font-bold text-slate-700 uppercase">Tìm hộ để gán</h4>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={tim}
          onChange={(e) => setTim(e.target.value)}
          placeholder="Mã hộ, địa chỉ, tên chủ hộ…"
          className="pl-9"
        />
      </div>
      {tim.trim().length >= 2 && ketQua && (
        <div className="rounded-xl border border-slate-200 px-3">
          {ketQua.items.length === 0 ? (
            <p className="py-3 text-[11px] font-medium text-slate-400">Không tìm thấy hộ khớp.</p>
          ) : (
            ketQua.items.map((h) => <DongHo key={h.id} h={h} />)
          )}
        </div>
      )}
    </NganKeo>
  );
}

/* ═══════════════════════════════════════════════════════════ Form ══ */

function FormDrawer({ cs, onClose }: { cs: CoSo | 'moi'; onClose: () => void }) {
  const qc = useQueryClient();
  const moi = cs === 'moi';
  const g = moi ? null : cs;

  const [f, setF] = useState({
    name: g?.name ?? '',
    owner_name: g?.owner_name ?? '',
    owner_phone: g?.owner_phone ?? '',
    address: g?.address ?? '',
    loai: g?.loai ?? 'nha_tro',
    has_foreigner: g?.has_foreigner ?? false,
    total_rooms: g?.total_rooms != null ? String(g.total_rooms) : '',
    note: '',
  });
  const [loi, setLoi] = useState('');

  // Khi TẠO: gõ địa chỉ là hiện ngay các hộ trùng để tick gom vào cơ sở.
  const [dcTim, setDcTim] = useState('');
  const [chon, setChon] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setTimeout(() => setDcTim(f.address.trim()), 350);
    return () => clearTimeout(t);
  }, [f.address]);
  const { data: matches } = useQuery({
    queryKey: ['goi-y-dia-chi', dcTim],
    queryFn: () =>
      get<{ items: HoGoiY[] }>(`/co-so-tro/goi-y-dia-chi?address=${encodeURIComponent(dcTim)}`),
    enabled: moi && dcTim.length >= 3,
  });
  useEffect(() => {
    if (matches) setChon(new Set(matches.items.map((h) => h.id)));
  }, [matches]);
  const doChon = (id: string) =>
    setChon((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const luu = useMutation({
    mutationFn: async () => {
      const body = {
        name: f.name.trim(),
        owner_name: f.owner_name.trim() || null,
        owner_phone: f.owner_phone.trim() || null,
        address: f.address.trim() || null,
        loai: f.loai,
        has_foreigner: f.has_foreigner,
        total_rooms: f.total_rooms ? Number(f.total_rooms) : null,
        note: f.note.trim() || null,
      };
      if (!moi) return patch(`/co-so-tro/${g!.id}`, body);
      const res = await post<{ id: string }>('/co-so-tro', body);
      const ids = [...chon];
      if (ids.length) await post(`/co-so-tro/${res.id}/gan-ho`, { household_ids: ids });
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['co-so-tro'] });
      onClose();
    },
    onError: (e: unknown) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={moi ? 'Thêm cơ sở trọ' : 'Sửa cơ sở trọ'}
      rong="max-w-lg"
      chan={
        <>
          <Button mau="trang" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (!f.name.trim()) {
                setLoi('Cần nhập tên cơ sở');
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
        <Truong nhan="Tên cơ sở" bat_buoc>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="vd Nhà trọ Bà Tư"
            autoFocus
          />
        </Truong>
        <div className="grid grid-cols-2 gap-3">
          <Truong nhan="Chủ cơ sở">
            <Input
              value={f.owner_name}
              onChange={(e) => setF({ ...f, owner_name: e.target.value })}
            />
          </Truong>
          <Truong nhan="Điện thoại">
            <Input
              value={f.owner_phone}
              onChange={(e) => setF({ ...f, owner_phone: e.target.value })}
              inputMode="tel"
            />
          </Truong>
        </div>
        <Truong nhan="Địa chỉ" ghi_chu="Gom hộ theo địa chỉ này — nhập càng đúng càng gợi ý trúng">
          <Input
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
            placeholder="Số nhà, hẻm, đường…"
          />
        </Truong>

        {/* Hộ trùng địa chỉ — tick để gom vào cơ sở khi tạo */}
        {moi && dcTim.length >= 3 && matches && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            {matches.items.length === 0 ? (
              <p className="text-[11px] font-medium text-slate-500">
                Chưa thấy hộ nào trùng địa chỉ này (hoặc đã thuộc cơ sở khác).
              </p>
            ) : (
              <>
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-700"
                    checked={chon.size === matches.items.length}
                    onChange={(e) =>
                      setChon(e.target.checked ? new Set(matches.items.map((h) => h.id)) : new Set())
                    }
                  />
                  {matches.items.length} hộ trùng địa chỉ — chọn để gom vào cơ sở ({chon.size})
                </label>
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {matches.items.map((h) => (
                    <label
                      key={h.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-blue-700"
                        checked={chon.has(h.id)}
                        onChange={() => doChon(h.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        <span className="mr-1 font-mono font-bold text-slate-400">{h.code}</span>
                        <span className="font-semibold text-slate-800">{h.chu_ho || 'Chưa có chủ hộ'}</span>
                        <span className="text-slate-500"> · {h.address}</span>
                      </span>
                      <Chip mau={h.household_type === 'tam_tru' ? 'amber' : 'blue'} nho>
                        {h.household_type === 'tam_tru' ? 'TT' : 'TrT'}
                      </Chip>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Truong nhan="Loại hình">
            <Select value={f.loai} onChange={(e) => setF({ ...f, loai: e.target.value })}>
              {Object.entries(LOAI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Truong>
          <Truong nhan="Tổng số phòng">
            <Input
              value={f.total_rooms}
              onChange={(e) => setF({ ...f, total_rooms: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              placeholder="vd 20"
            />
          </Truong>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={f.has_foreigner}
            onChange={(e) => setF({ ...f, has_foreigner: e.target.checked })}
            className="h-4 w-4 accent-blue-700"
          />
          <span className="text-xs font-semibold text-slate-700">
            Cơ sở có người nước ngoài lưu trú
          </span>
        </label>
        <Truong nhan="Ghi chú">
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Truong>
      </div>
    </NganKeo>
  );
}
