/**
 * Xác minh địa chỉ theo tuyến đường — màn hình cho người ĐANG ĐI BỘ ngoài đường.
 *
 * Luồng: chọn tổ → chọn tuyến → hệ thống hiện lần lượt từng nhà theo số nhà tăng
 * dần (hoặc giảm, nếu đi ngược chiều). Tới nhà nào bấm một nút to, máy tự lấy GPS,
 * lưu, gạch nhà đó khỏi danh sách và nhảy sang nhà kế tiếp.
 *
 * ── Vì sao giao diện trông "thô" như vậy ───────────────────────────────────
 *
 * Người dùng màn hình này đang đứng ngoài nắng, cầm điện thoại một tay, tay kia
 * cầm sổ. Nên:
 *
 *   · Mỗi lúc chỉ hiện MỘT nhà. Danh sách cuộn thì vừa đi vừa dò mất tập trung.
 *   · Nút bấm cao 64px, chiếm gần hết bề ngang, nằm ở nửa dưới màn hình — vùng
 *     ngón cái với tới được khi cầm một tay.
 *   · Sau khi lưu, tự nhảy nhà kế tiếp, KHÔNG hỏi lại. Mỗi lần hỏi "bạn có chắc"
 *     là một lần phải nhìn xuống màn hình giữa đường.
 *   · Lưu hụt thì báo ngay tại chỗ và giữ nguyên nhà đó, không lặng lẽ bỏ qua.
 *
 * Toạ độ ghi ở đây là `verified` — người thật đứng trước cửa nhà thật. Khác hẳn
 * `auto` do máy dò từ địa chỉ, vốn có thể lệch cả trăm mét.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Crosshair,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  Rong,
  Select,
  Spinner,
  ThanhTieuDe,
  Truong,
} from '@/components/ui';
import { get, patch, qs } from '@/lib/api';
import { so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { ToDanPho } from '@/lib/types';

interface Tuyen {
  ten_duong: string;
  so_ho: number;
  da_xac_minh: number;
  chua_xac_minh: number;
  so_nha_dau: number;
  so_nha_cuoi: number;
}

interface HoTrenTuyen {
  id: string;
  code: string;
  address: string;
  so_nha: number;
  so_hem: number;
  geo_status: string;
  ten_trang_thai: string;
  chu_ho: string | null;
  so_nhan_khau: number;
  toa_do: { lat: number; lng: number } | null;
}

/** Lấy GPS một lần, độ chính xác cao. Trả về lỗi bằng tiếng Việt dễ hiểu. */
function layGps(): Promise<GeolocationPosition> {
  return new Promise((ok, hong) => {
    if (!navigator.geolocation) {
      return hong(new Error('Máy này không hỗ trợ định vị.'));
    }
    navigator.geolocation.getCurrentPosition(
      ok,
      (e) => {
        const chu: Record<number, string> = {
          1: 'Trình duyệt chưa được cấp quyền vị trí. Vào Cài đặt → Quyền riêng tư để bật.',
          2: 'Chưa bắt được tín hiệu. Ra chỗ thoáng, tránh trong nhà hoặc dưới mái tôn.',
          3: 'Chờ định vị quá lâu. Bấm lại lần nữa.',
        };
        hong(new Error(chu[e.code] ?? 'Không lấy được vị trí.'));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

export function XacMinhTuyen() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);

  const [to, setTo] = useState('');
  const [duong, setDuong] = useState('');
  const [thuTu, setThuTu] = useState<'tang' | 'giam'>('tang');
  const [viTri, setViTri] = useState(0);
  const [timSo, setTimSo] = useState('');
  const [loi, setLoi] = useState('');
  const [vuaXong, setVuaXong] = useState<{ ten: string; sai_so: number } | null>(null);
  const [daLam, setDaLam] = useState(0);

  useEffect(() => {
    datManHinh({ tieu_de: '📍 Xác minh theo tuyến' });
  }, [datManHinh]);

  const { data: dsTo } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
    enabled: can('household:read'),
  });

  const { data: tuyen } = useQuery({
    queryKey: ['tuyen-duong', to],
    queryFn: () => get<Tuyen[]>('/ho-khau/tuyen-duong' + qs({ group_id: to })),
    enabled: can('household:read'),
  });

  const { data: ho, isFetching } = useQuery({
    queryKey: ['ho-tren-tuyen', duong, to, thuTu],
    queryFn: () =>
      get<HoTrenTuyen[]>(
        '/ho-khau/tuyen-duong/ho' +
          qs({ duong, group_id: to, thu_tu: thuTu, chi_chua_xac_minh: 'true' }),
      ),
    enabled: !!duong,
  });

  const luu = useMutation({
    mutationFn: async (h: HoTrenTuyen) => {
      const v = await layGps();
      await patch(`/ho-khau/${h.id}`, {
        lat: v.coords.latitude,
        lng: v.coords.longitude,
        geo_status: 'verified',
        geo_source: 'gps_thuc_dia',
        geo_accuracy_m: Math.round(v.coords.accuracy),
      });
      return { ten: h.address, sai_so: Math.round(v.coords.accuracy) };
    },
    onSuccess: (r) => {
      setLoi('');
      setVuaXong(r);
      setDaLam((n) => n + 1);
      // Đi tiếp ngay, không hỏi lại: giữa đường mà phải xác nhận là mất nhịp
      setViTri((i) => i + 1);
      for (const k of ['ho-khau', 'ho-khau-ban-do', 'dinh-vi-tong-quan', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được vị trí'),
  });

  if (!can('household:write')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được cập nhật vị trí hộ." />;
  }

  const ds = ho ?? [];
  const hienTai = ds[viTri] ?? null;

  /**
   * Nhảy thẳng tới một số nhà.
   *
   * Số nhà ngoài đời không chạy đều: 38, 38A, 38/2, rồi 40. Đi bộ theo thứ tự
   * mà gặp nhà lệch số là phải bấm tiếp mấy chục lần mới tới đúng chỗ. Gõ số
   * vào đây thì nhảy thẳng tới nhà gần nhất khớp.
   */
  const nhayToiSoNha = (v: string) => {
    setTimSo(v);
    const q = v.trim().toLowerCase();
    if (!q) return;
    const i = ds.findIndex((h) => String(h.so_nha).toLowerCase().startsWith(q));
    const j = i >= 0 ? i : ds.findIndex((h) => (h.address ?? '').toLowerCase().includes(q));
    if (j >= 0) {
      setViTri(j);
      setLoi('');
      setVuaXong(null);
    }
  };
  const timHong =
    timSo.trim().length > 0 &&
    !ds.some(
      (h) =>
        String(h.so_nha).toLowerCase().startsWith(timSo.trim().toLowerCase()) ||
        (h.address ?? '').toLowerCase().includes(timSo.trim().toLowerCase()),
    );
  const tuyenDangChon = tuyen?.find((t) => t.ten_duong === duong);

  const doiTuyen = (v: string) => {
    setDuong(v);
    setViTri(0);
    setDaLam(0);
    setLoi('');
    setVuaXong(null);
  };

  return (
    <>
      <ThanhTieuDe
        tieu_de="Xác minh địa chỉ theo tuyến"
        mo_ta="Đi dọc một con đường, tới nhà nào bấm lấy toạ độ nhà đó"
        duoi={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Truong nhan="Tổ dân phố">
              <Select
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  doiTuyen('');
                }}
              >
                <option value="">Cả khu phố</option>
                {dsTo?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.leader_name ? ` — ${t.leader_name}` : ''}
                  </option>
                ))}
              </Select>
            </Truong>

            <Truong nhan="Tuyến đường" bat_buoc>
              <Select value={duong} onChange={(e) => doiTuyen(e.target.value)}>
                <option value="">Chọn tuyến để bắt đầu…</option>
                {tuyen?.map((t) => (
                  <option key={t.ten_duong} value={t.ten_duong}>
                    {t.ten_duong} — còn {t.chua_xac_minh}/{t.so_ho}
                  </option>
                ))}
              </Select>
            </Truong>

            <Truong nhan="Chiều đi" ghi_chu="Theo số nhà, chọn đúng chiều bạn đang đi">
              <Select
                value={thuTu}
                onChange={(e) => {
                  setThuTu(e.target.value as 'tang' | 'giam');
                  setViTri(0);
                }}
              >
                <option value="tang">Số nhỏ → số lớn (đầu đường vào)</option>
                <option value="giam">Số lớn → số nhỏ (cuối đường ra)</option>
              </Select>
            </Truong>
          </div>
        }
      />

      {!duong ? (
        <TuyenGoiY tuyen={tuyen} onChon={doiTuyen} />
      ) : isFetching && !ho ? (
        <Card>
          <Spinner label="Đang xếp nhà theo thứ tự đi bộ…" />
        </Card>
      ) : ds.length === 0 ? (
        <Rong
          emoji="🎉"
          loi_nhan={`Tuyến ${duong} đã xác minh xong hết. ${
            daLam ? `Lượt này bạn làm được ${daLam} nhà.` : ''
          }`}
        >
          <Button mau="trang" icon={RotateCcw} onClick={() => doiTuyen('')}>
            CHỌN TUYẾN KHÁC
          </Button>
        </Rong>
      ) : (
        <>
          {/* Thanh tiến độ của tuyến */}
          <Card className="p-3.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="truncate text-[12.5px] font-bold text-slate-900">{duong}</p>
              <p className="shrink-0 font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                {Math.min(viTri + 1, ds.length)}/{ds.length}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${(viTri / Math.max(1, ds.length)) * 100}%` }}
              />
            </div>
            {/* Nhảy thẳng tới số nhà — số nhà ngoài đời không chạy đều */}
            {duong && ds.length > 0 && (
              <div className="mt-2">
                <div
                  className={cx(
                    'flex items-center gap-2 rounded-xl border bg-white px-3',
                    timHong ? 'border-rose-300' : 'border-slate-200',
                  )}
                >
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    value={timSo}
                    onChange={(e) => nhayToiSoNha(e.target.value)}
                    placeholder="Nhảy tới số nhà… (vd 38 hoặc 38A)"
                    inputMode="text"
                    autoComplete="off"
                    className="w-full border-0 bg-transparent py-2.5 font-mono text-[14px] font-bold outline-none placeholder:font-sans placeholder:text-[12px] placeholder:font-medium placeholder:text-slate-400"
                  />
                  {timSo && (
                    <button
                      onClick={() => setTimSo('')}
                      title="Xoá ô tìm"
                      className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {timHong && (
                  <p className="mt-1 text-[10.5px] font-bold text-rose-600">
                    Không có số nhà nào bắt đầu bằng “{timSo.trim()}” trên tuyến này.
                  </p>
                )}
              </div>
            )}

            {tuyenDangChon && (
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                Số nhà {tuyenDangChon.so_nha_dau}–{tuyenDangChon.so_nha_cuoi} ·{' '}
                {so(tuyenDangChon.da_xac_minh)} nhà đã xác minh trước đó
                {daLam > 0 && ` · lượt này +${daLam}`}
              </p>
            )}
          </Card>

          {vuaXong && (
            <CanhBao loai="ok" emoji="✅">
              Đã lưu <b>{vuaXong.ten}</b> — sai số khoảng {vuaXong.sai_so}m. Đi tới nhà tiếp theo.
            </CanhBao>
          )}

          {loi && (
            <CanhBao loai="loi" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          {hienTai ? (
            <>
              {/* MỘT nhà, chữ to, đọc được khi cầm một tay ngoài nắng */}
              <Card className="border-2 border-blue-200 p-5 text-center">
                <p className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Nhà tiếp theo · hộ {hienTai.code}
                </p>
                <p className="mt-2 text-2xl leading-tight font-black text-slate-900">
                  {hienTai.address}
                </p>
                <p className="mt-2 text-[13px] font-semibold text-slate-600">
                  {hienTai.chu_ho || 'Chưa có chủ hộ'} · {hienTai.so_nhan_khau} nhân khẩu
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <Chip mau={hienTai.geo_status === 'pending' ? 'amber' : 'blue'} nho>
                    {hienTai.ten_trang_thai}
                  </Chip>
                  {hienTai.toa_do && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${hienTai.toa_do.lat},${hienTai.toa_do.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"
                    >
                      <Navigation className="h-3 w-3" />
                      Vị trí sơ bộ
                    </a>
                  )}
                </div>
              </Card>

              {/* Nút chính: to, nằm trong tầm ngón cái */}
              <button
                type="button"
                onClick={() => luu.mutate(hienTai)}
                disabled={luu.isPending}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl py-5 text-base font-black tracking-wide text-white shadow-lg transition-all active:scale-[0.98]',
                  luu.isPending
                    ? 'bg-slate-400'
                    : 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700',
                )}
              >
                <Crosshair className={cx('h-6 w-6', luu.isPending && 'animate-spin')} />
                {luu.isPending ? 'ĐANG BẮT TÍN HIỆU…' : 'TÔI ĐANG ĐỨNG TRƯỚC NHÀ NÀY'}
              </button>

              <div className="flex gap-2">
                <Button
                  mau="trang"
                  icon={ChevronRight}
                  onClick={() => {
                    setVuaXong(null);
                    setLoi('');
                    setViTri((i) => i + 1);
                  }}
                  className="flex-1 justify-center"
                >
                  BỎ QUA NHÀ NÀY
                </Button>
                {viTri > 0 && (
                  <Button
                    mau="trang"
                    onClick={() => {
                      setVuaXong(null);
                      setLoi('');
                      setViTri((i) => Math.max(0, i - 1));
                    }}
                    className="flex-1 justify-center"
                  >
                    QUAY LẠI NHÀ TRƯỚC
                  </Button>
                )}
              </div>

              <p className="text-center text-[10px] font-medium text-slate-400">
                “Bỏ qua” không xoá gì cả — nhà đó vẫn nằm trong danh sách chưa xác minh, lần sau đi
                lại vẫn hiện ra.
              </p>

              {/* Vài nhà kế tiếp, để biết trước sắp tới nhà nào */}
              {ds.length > viTri + 1 && (
                <Card className="p-3.5">
                  <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                    Sắp tới
                  </p>
                  <div className="space-y-1">
                    {ds.slice(viTri + 1, viTri + 5).map((h) => (
                      <p key={h.id} className="flex items-baseline gap-2 text-[11px]">
                        <MapPin className="h-3 w-3 shrink-0 text-slate-300" />
                        <span className="truncate font-semibold text-slate-700">{h.address}</span>
                        <span className="ml-auto shrink-0 text-[9.5px] text-slate-400">
                          {h.chu_ho || '—'}
                        </span>
                      </p>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Rong
              emoji="🏁"
              loi_nhan={`Hết tuyến ${duong}. Lượt này bạn xác minh được ${daLam} nhà.`}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button mau="luc" icon={Check} onClick={() => doiTuyen('')}>
                  CHỌN TUYẾN KHÁC
                </Button>
                <Button
                  mau="trang"
                  icon={RotateCcw}
                  onClick={() => {
                    setViTri(0);
                    void qc.invalidateQueries({ queryKey: ['ho-tren-tuyen'] });
                  }}
                >
                  ĐI LẠI TUYẾN NÀY
                </Button>
              </div>
            </Rong>
          )}
        </>
      )}
    </>
  );
}

/* ────────────────────────────────────────────── Gợi ý tuyến nên đi ──── */

function TuyenGoiY({ tuyen, onChon }: { tuyen?: Tuyen[]; onChon: (v: string) => void }) {
  if (!tuyen) {
    return (
      <Card>
        <Spinner label="Đang tổng hợp các tuyến đường…" />
      </Card>
    );
  }
  const conViec = tuyen.filter((t) => t.chua_xac_minh > 0);
  if (conViec.length === 0) {
    return (
      <Rong
        emoji="🎉"
        loi_nhan="Mọi tuyến đường trong phạm vi này đều đã xác minh xong. Không còn nhà nào phải đi."
      />
    );
  }

  return (
    <Card className="p-3.5">
      <p className="mb-2.5 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
        Chọn tuyến để bắt đầu ({conViec.length} tuyến còn việc)
      </p>
      <div className="space-y-1.5">
        {conViec.map((t) => {
          const pct = Math.round((t.da_xac_minh / Math.max(1, t.so_ho)) * 100);
          return (
            <button
              key={t.ten_duong}
              type="button"
              onClick={() => onChon(t.ten_duong)}
              className="w-full cursor-pointer rounded-xl border border-slate-200 p-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-bold text-slate-900">
                  {t.ten_duong}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-amber-700 tabular-nums">
                  còn {t.chua_xac_minh}
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">
                {so(t.so_ho)} hộ · số nhà {t.so_nha_dau}–{t.so_nha_cuoi} · đã xong {pct}%
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[10px] font-medium text-slate-400">
        Xếp theo số nhà còn phải xác minh, nhiều nhất lên đầu. Bấm một tuyến là bắt đầu đi.
      </p>
    </Card>
  );
}
