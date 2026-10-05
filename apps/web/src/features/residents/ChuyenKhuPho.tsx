/**
 * Chuyển và tiếp nhận nhân khẩu, hộ khẩu giữa các khu phố.
 *
 * Bà con chuyển từ khu phố này sang khu phố kia thì bên nhận không phải gõ lại
 * từ đầu — bên gửi gửi hồ sơ đi, bên nhận bấm "Tiếp nhận" là xong.
 *
 * HAI HỘP RIÊNG: "Chờ mình tiếp nhận" và "Mình đã gửi đi". Gộp một chỗ thì cán
 * bộ phải đọc từng dòng xem cái nào cần mình làm gì.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Check, Inbox, Send, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  NganKeo,
  ONumber,
  Rong,
  Spinner,
  Textarea,
  ThanhTieuDe,
  Truong,
} from '@/components/ui';
import { get, post } from '@/lib/api';
import { gio, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

const TRANG_THAI: Record<string, { nhan: string; mau: 'amber' | 'emerald' | 'rose' | 'slate' }> = {
  cho_tiep_nhan: { nhan: 'Chờ tiếp nhận', mau: 'amber' },
  da_tiep_nhan: { nhan: 'Đã tiếp nhận', mau: 'emerald' },
  tu_choi: { nhan: 'Bên nhận từ chối', mau: 'rose' },
  da_huy: { nhan: 'Đã rút lại', mau: 'slate' },
  qua_han: { nhan: 'Quá hạn, tự huỷ', mau: 'slate' },
};

interface Chuyen {
  id: string;
  loai: 'nhan_khau' | 'ho_khau';
  tom_tat: string;
  so_nguoi: number;
  trang_thai: string;
  ten_trang_thai: string;
  ly_do: string | null;
  nguoi_gui: string | null;
  nguoi_nhan: string | null;
  created_at: string;
  xu_ly_luc: string | null;
  het_han_luc: string;
  ten_khu_pho: string;
  slug_khu_pho: string;
  kp_day_du: string | null;
}

export function ChuyenKhuPho() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const suaDuoc = can('resident:write');

  const [hop, setHop] = useState<'den' | 'di'>('den');
  const [tuChoi, setTuChoi] = useState<Chuyen | null>(null);
  const [tin, setTin] = useState('');
  const [loi, setLoi] = useState('');

  useEffect(() => {
    datManHinh({ tieu_de: '🔄 Chuyển & tiếp nhận' });
  }, [datManHinh]);

  const { data: den } = useQuery({
    queryKey: ['chuyen-den'],
    queryFn: () => get<{ dang_cho: number; items: Chuyen[] }>('/chuyen-khu-pho/den'),
    enabled: can('resident:read'),
  });
  const { data: di } = useQuery({
    queryKey: ['chuyen-di'],
    queryFn: () => get<{ dang_cho: number; items: Chuyen[] }>('/chuyen-khu-pho/di'),
    enabled: can('resident:read'),
  });

  const lamMoi = () => {
    for (const k of ['chuyen-den', 'chuyen-di', 'cu-dan', 'ho-khau', 'thong-bao']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const nhan = useMutation({
    mutationFn: (c: Chuyen) => post<{ loi_nhan: string }>(`/chuyen-khu-pho/${c.id}/tiep-nhan`, {}),
    onSuccess: (kq) => {
      setLoi('');
      setTin(kq.loi_nhan);
      lamMoi();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không tiếp nhận được'),
  });

  const rutLai = useMutation({
    mutationFn: (c: Chuyen) => post<{ loi_nhan: string }>(`/chuyen-khu-pho/${c.id}/huy`, {}),
    onSuccess: (kq) => {
      setLoi('');
      setTin(kq.loi_nhan);
      lamMoi();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không rút lại được'),
  });

  if (!can('resident:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không xem được mục này." />;
  }

  const ds = (hop === 'den' ? den : di)?.items ?? [];

  return (
    <>
      <ThanhTieuDe
        tieu_de="Chuyển & tiếp nhận"
        mo_ta="Bà con chuyển khu phố thì bên nhận không phải nhập lại hồ sơ"
      />

      <div className="grid grid-cols-2 gap-3">
        <ONumber
          nhan="Chờ mình tiếp nhận"
          gia_tri={so(den?.dang_cho ?? 0)}
          phu={den?.dang_cho ? 'cần xem và bấm nhận' : 'không có hồ sơ nào chờ'}
          phu_mau={den?.dang_cho ? 'text-amber-700' : 'text-emerald-700'}
          icon={Inbox}
          mau={den?.dang_cho ? 'amber' : 'emerald'}
        />
        <ONumber
          nhan="Mình gửi, đang chờ bên kia"
          gia_tri={so(di?.dang_cho ?? 0)}
          phu={di?.dang_cho ? 'hồ sơ vẫn ở sổ mình' : 'không có hồ sơ nào đang gửi'}
          icon={Send}
          mau="blue"
        />
      </div>

      {tin && (
        <CanhBao loai="ok" emoji="✅">
          {tin}
        </CanhBao>
      )}
      {loi && (
        <CanhBao loai="loi" emoji="⚠️">
          {loi}
        </CanhBao>
      )}

      <Card className="p-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['den', 'Chờ mình tiếp nhận', Inbox, den?.dang_cho ?? 0],
              ['di', 'Mình đã gửi đi', Send, di?.dang_cho ?? 0],
            ] as const
          ).map(([k, nhan_, Icon, n]) => (
            <button
              key={k}
              onClick={() => setHop(k)}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                hop === k
                  ? 'bg-blue-50 text-blue-800 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {nhan_}
              {n > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
                  {n}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {!den || !di ? (
        <Card>
          <Spinner label="Đang tải…" />
        </Card>
      ) : ds.length === 0 ? (
        <Rong
          emoji="🔄"
          loi_nhan={
            hop === 'den'
              ? 'Chưa có khu phố nào chuyển hồ sơ tới.'
              : 'Chưa chuyển hồ sơ nào đi. Mở một nhân khẩu hoặc hộ khẩu rồi bấm “Chuyển khu phố”.'
          }
        />
      ) : (
        <div className="space-y-2">
          {ds.map((c) => {
            const tt = TRANG_THAI[c.trang_thai] ?? TRANG_THAI.cho_tiep_nhan!;
            const dangCho = c.trang_thai === 'cho_tiep_nhan';
            return (
              <Card
                key={c.id}
                className={cx(
                  'p-3.5',
                  dangCho && hop === 'den' && 'border-amber-200 bg-amber-50/30',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-slate-900">{c.tom_tat}</span>
                      <Chip mau={tt.mau} nho>
                        {tt.nhan}
                      </Chip>
                      <Chip mau="slate" nho>
                        {c.loai === 'ho_khau' ? `Cả hộ · ${c.so_nguoi} người` : 'Một nhân khẩu'}
                      </Chip>
                    </div>
                    <p className="mt-1 text-[11.5px] font-medium text-slate-600">
                      {hop === 'den' ? 'Từ ' : 'Gửi sang '}
                      <b className="text-slate-800">{c.kp_day_du || c.ten_khu_pho}</b>
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      <span className="font-mono">{gio(c.created_at)}</span>
                      {c.nguoi_gui && ` · người gửi ${c.nguoi_gui}`}
                      {c.nguoi_nhan && ` · người nhận ${c.nguoi_nhan}`}
                    </p>
                    {c.ly_do && (
                      <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                        {c.ly_do}
                      </p>
                    )}
                  </div>

                  {suaDuoc && dangCho && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {hop === 'den' ? (
                        <>
                          <Button
                            mau="luc"
                            icon={Check}
                            onClick={() => {
                              setTin('');
                              nhan.mutate(c);
                            }}
                            disabled={nhan.isPending}
                          >
                            {nhan.isPending ? 'ĐANG NHẬN…' : 'TIẾP NHẬN'}
                          </Button>
                          <Button mau="trang" icon={X} onClick={() => setTuChoi(c)}>
                            TỪ CHỐI
                          </Button>
                        </>
                      ) : (
                        <Button
                          mau="trang"
                          icon={Undo2}
                          onClick={() => {
                            setTin('');
                            rutLai.mutate(c);
                          }}
                          disabled={rutLai.isPending}
                        >
                          RÚT LẠI
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {hop === 'den' && (den?.dang_cho ?? 0) > 0 && (
        <p className="text-[10.5px] leading-snug font-medium text-slate-400">
          Bấm <b>Tiếp nhận</b> là hồ sơ vào sổ của khu phố mình, và bên gửi tự gỡ khỏi sổ của họ.
          Bấm <b>Từ chối</b> thì hồ sơ vẫn nguyên ở bên gửi, không mất gì.
        </p>
      )}

      <FormTuChoi
        c={tuChoi}
        onClose={() => setTuChoi(null)}
        onXong={(m) => {
          setTin(m);
          lamMoi();
        }}
      />
    </>
  );
}

function FormTuChoi({
  c,
  onClose,
  onXong,
}: {
  c: Chuyen | null;
  onClose: () => void;
  onXong: (m: string) => void;
}) {
  const [lyDo, setLyDo] = useState('');
  const [loi, setLoi] = useState('');

  const gui = useMutation({
    mutationFn: () =>
      post<{ loi_nhan: string }>(`/chuyen-khu-pho/${c!.id}/tu-choi`, { ly_do: lyDo.trim() }),
    onSuccess: (kq) => {
      onXong(kq.loi_nhan);
      setLyDo('');
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không từ chối được'),
  });

  if (!c) return null;

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de="Từ chối tiếp nhận"
      mo_ta={c.tom_tat}
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            mau="do"
            onClick={() => {
              setLoi('');
              if (lyDo.trim().length < 3) return setLoi('Ghi lý do giúp nhé — bên kia cần biết.');
              gui.mutate();
            }}
            disabled={gui.isPending}
          >
            {gui.isPending ? 'ĐANG GỬI…' : 'TỪ CHỐI'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loi && (
          <CanhBao loai="canh" emoji="⚠️">
            {loi}
          </CanhBao>
        )}
        <CanhBao loai="tin" emoji="📁">
          Từ chối thì hồ sơ <b>vẫn nguyên ở {c.ten_khu_pho}</b>, không ai mất gì. Bên đó đọc được lý
          do và gửi lại khi cần.
        </CanhBao>
        <Truong nhan="Vì sao không nhận" bat_buoc>
          <Textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Không thuộc địa bàn khu phố mình, hộ này đã có trong sổ rồi…"
            autoFocus
          />
        </Truong>
      </div>
    </NganKeo>
  );
}

/* ═══════════════════════════════════ Nút chuyển, gắn ở màn hình khác ══ */

/**
 * Gửi một nhân khẩu hoặc cả hộ sang khu phố khác.
 *
 * Đặt ngay trong form nhân khẩu / hộ khẩu chứ không bắt qua màn hình riêng —
 * cán bộ đang mở hồ sơ người ta thì lúc đó mới biết cần chuyển.
 */
export function NutChuyenKhuPho({
  loai,
  nguon_id,
  ten,
}: {
  loai: 'nhan_khau' | 'ho_khau';
  nguon_id: string;
  ten: string;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [mo, setMo] = useState(false);
  const [den, setDen] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  const { data: dsKp } = useQuery({
    queryKey: ['khu-pho-nhan'],
    queryFn: () =>
      get<{ slug: string; name: string; full_name: string | null }[]>(
        '/chuyen-khu-pho/khu-pho-nhan',
      ),
    enabled: mo,
  });

  const gui = useMutation({
    mutationFn: () =>
      post<{ loi_nhan: string }>('/chuyen-khu-pho', {
        loai,
        nguon_id,
        den_slug: den,
        ly_do: lyDo.trim() || null,
      }),
    onSuccess: (kq) => {
      setXong(kq.loi_nhan);
      void qc.invalidateQueries({ queryKey: ['chuyen-di'] });
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không gửi được'),
  });

  if (!can('resident:write')) return null;

  return (
    <>
      <Button mau="trang" icon={ArrowLeftRight} onClick={() => setMo(true)} type="button">
        CHUYỂN KHU PHỐ
      </Button>

      {mo && (
        <NganKeo
          mo
          dong={() => {
            setMo(false);
            setXong('');
            setLoi('');
          }}
          tieu_de="Chuyển sang khu phố khác"
          mo_ta={ten}
          rong="max-w-md"
          chan={
            <>
              <Button
                mau="trang"
                onClick={() => {
                  setMo(false);
                  setXong('');
                }}
                type="button"
              >
                {xong ? 'Đóng' : 'Huỷ bỏ'}
              </Button>
              {!xong && (
                <Button
                  onClick={() => {
                    setLoi('');
                    if (!den) return setLoi('Chưa chọn khu phố nhận.');
                    gui.mutate();
                  }}
                  disabled={gui.isPending}
                >
                  {gui.isPending ? 'ĐANG GỬI…' : 'GỬI HỒ SƠ'}
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-4">
            {xong ? (
              <CanhBao loai="ok" emoji="✅">
                {xong}
              </CanhBao>
            ) : (
              <>
                {loi && (
                  <CanhBao loai="canh" emoji="⚠️">
                    {loi}
                  </CanhBao>
                )}

                <CanhBao loai="tin" emoji="📋">
                  Hồ sơ <b>vẫn ở sổ khu phố mình</b> cho tới khi bên kia bấm tiếp nhận. Bên đó từ
                  chối thì cũng không mất gì.
                </CanhBao>

                <Truong nhan="Chuyển tới khu phố nào" bat_buoc>
                  {!dsKp ? (
                    <Spinner label="Đang tải danh sách khu phố…" />
                  ) : dsKp.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11.5px] font-medium text-slate-400">
                      Chưa có khu phố nào khác đang dùng KhuPhoSo để chuyển tới.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {dsKp.map((k) => (
                        <label
                          key={k.slug}
                          className={cx(
                            'flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all',
                            den === k.slug
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-slate-200 hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="radio"
                            name="den"
                            checked={den === k.slug}
                            onChange={() => setDen(k.slug)}
                            className="h-4 w-4 text-blue-700 focus:ring-blue-400"
                          />
                          <span className="min-w-0">
                            <span className="block text-[12.5px] font-bold text-slate-900">
                              {k.full_name || k.name}
                            </span>
                            <span className="block font-mono text-[10px] text-slate-400">
                              {k.slug}.khuphoso.vn
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </Truong>

                <Truong nhan="Lý do chuyển" ghi_chu="Bên nhận đọc được dòng này">
                  <Textarea
                    value={lyDo}
                    onChange={(e) => setLyDo(e.target.value)}
                    placeholder="Chuyển hộ khẩu theo gia đình, mua nhà mới…"
                  />
                </Truong>
              </>
            )}
          </div>
        </NganKeo>
      )}
    </>
  );
}
