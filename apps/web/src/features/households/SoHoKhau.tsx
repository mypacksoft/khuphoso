/**
 * Sổ hộ khẩu số — bám theo bìa sổ của app cũ: gáy đỏ sẫm, viền nâu, bốn góc trang
 * trí, quốc hiệu chữ đỏ, tên sổ chân phương, con dấu tròn nghiêng ở góc dưới.
 *
 * Hình thức không phải trang trí thừa. Cán bộ đối chiếu với cuốn sổ giấy trên tay,
 * nên phiếu trên máy nhìn giống cuốn sổ thì dò thông tin nhanh hơn hẳn một bảng
 * dữ liệu phẳng.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Navigation, Pencil, Printer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { TrongDong } from '@/components/TrongDong';
import { Button, ChuaCapNhat, cx, Spinner, XacNhan } from '@/components/ui';
import { get, post } from '@/lib/api';
import { useGioVN } from '@/lib/gio';
import { useAuth } from '@/lib/store';
import type { HoChiTiet } from '@/lib/types';
import { GIOI_TINH } from '@/lib/types';

import { FormCuDan } from '../residents/FormCuDan';

const MAU_DIEN: Record<string, string> = {
  thuong_tru: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  tam_tru: 'bg-blue-50 text-blue-800 border-blue-100',
  tam_vang: 'bg-red-50 text-red-700 border-red-100',
  vang_lai: 'bg-slate-100 text-slate-600 border-slate-200',
};

const TEN_DIEN: Record<string, string> = {
  thuong_tru: 'Thường trú',
  tam_tru: 'Tạm trú',
  tam_vang: 'Tạm vắng',
  vang_lai: 'Vãng lai',
};

const chiDuong = (h: { toa_do: { lat: number; lng: number } | null; address: string | null }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${
    h.toa_do ? `${h.toa_do.lat},${h.toa_do.lng}` : encodeURIComponent(h.address ?? '')
  }`;

const ngayVN = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

export function SoHoKhau({
  id,
  dong,
  ds_id,
  onDoi,
  onSangTrang,
  vi_tri,
  tong_so,
}: {
  id: string | null;
  dong: () => void;
  /** Các hộ của TRANG hiện tại, theo đúng thứ tự đang thấy. */
  ds_id?: string[];
  onDoi?: (id: string) => void;
  /**
   * Chạm biên trang thì gọi hàm này để màn hình cha đổi trang rồi mở giúp hộ đầu
   * (`1`) hoặc hộ cuối (`-1`) của trang mới.
   *
   * Bản đầu chỉ lật trong 20 hộ của một trang, hết trang là nút tắt — cán bộ rà
   * cả tổ 100 hộ vẫn phải đóng sổ ra bấm chuyển trang năm lần.
   */
  onSangTrang?: (huong: 1 | -1) => void;
  /** Vị trí toàn cục (1-based) và tổng số hộ, để nhãn đếm theo cả danh sách. */
  vi_tri?: number;
  tong_so?: number;
}) {
  const { user, khuPho, can } = useAuth();
  const { thoi_diem } = useGioVN();
  const qc = useQueryClient();
  const [doiChuHo, setDoiChuHo] = useState<{ id: string; ten: string } | null>(null);
  const [themDongCu, setThemDongCu] = useState(false);
  // Mặc định chỉ xem. Nút sửa chỉ hiện khi bật, để không bấm nhầm lúc đối chiếu.
  const [dangSua, setDangSua] = useState(false);

  // ── Lật sang hộ trước / sau ─────────────────────────────────────────────
  const vt = id && ds_id ? ds_id.indexOf(id) : -1;
  const coLat = vt >= 0 && !!onDoi && ((ds_id!.length > 1) || !!onSangTrang);
  const trongTrangTruoc = vt > 0 ? ds_id![vt - 1]! : null;
  const trongTrangSau = vt >= 0 && vt < ds_id!.length - 1 ? ds_id![vt + 1]! : null;
  // Còn hộ ở trang khác thì nút vẫn bấm được, chỉ là phải nạp trang trước
  const conTruoc = !!trongTrangTruoc || (!!onSangTrang && (vi_tri ?? 1) > 1);
  const conSau =
    !!trongTrangSau || (!!onSangTrang && (vi_tri ?? 0) < (tong_so ?? 0));

  const lat = useCallback(
    (huong: 1 | -1) => {
      if (!onDoi) return;
      // Tắt chế độ sửa khi đổi hộ: đang bật mà lật sang hộ khác thì rất dễ bấm
      // “Đổi chủ hộ” của nhà người ta trong khi tưởng vẫn đang ở hộ cũ.
      const di = (f: () => void) => {
        setDangSua(false);
        setDoiChuHo(null);
        f();
      };
      const trong = huong === 1 ? trongTrangSau : trongTrangTruoc;
      if (trong) return di(() => onDoi(trong));
      // Hết hộ trong trang: nhờ màn hình cha đổi trang rồi mở hộ đầu/cuối
      if (onSangTrang && (huong === 1 ? conSau : conTruoc)) {
        di(() => onSangTrang(huong));
      }
    },
    [onDoi, onSangTrang, trongTrangSau, trongTrangTruoc, conSau, conTruoc],
  );

  // Mũi tên trái/phải cho nhanh — cán bộ rà cả tổ thì bấm chuột mỏi tay.
  // Bỏ qua khi con trỏ đang ở trong ô nhập, không thì không gõ được chữ nào.
  useEffect(() => {
    if (!coLat) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) {
        return;
      }
      lat(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [coLat, lat]);

  const { data } = useQuery({
    queryKey: ['ho-khau', id],
    queryFn: () => get<HoChiTiet>(`/ho-khau/${id}`),
    enabled: !!id,
  });

  const datChuHo = useMutation({
    mutationFn: (rid: string) =>
      post('/ho-khau/chuyen-ho', {
        resident_id: rid,
        household_id: id,
        relation_to_head: 'Chủ hộ',
        is_head: true,
      }),
    onSuccess: () => {
      setDoiChuHo(null);
      for (const k of ['ho-khau', 'cu-dan', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  if (!id) return null;

  const chuHo = data?.thanh_vien.find((t) => t.is_head);
  const suaDuoc = can('household:write');
  const hienNutSua = suaDuoc && dangSua;
  const tv = [...(data?.thanh_vien ?? [])].sort((a, b) => Number(b.is_head) - Number(a.is_head));

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4">
        <button
          aria-label="Đóng"
          onClick={() => {
            setDangSua(false);
            dong();
          }}
          className="fixed inset-0 cursor-default"
        />

        <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Gáy sổ */}
          <div className="khong-in flex shrink-0 items-center justify-between bg-gradient-to-r from-red-800 to-rose-900 px-5 py-3 font-bold text-white shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-xs">📖</span>
              <h3 className="text-[10px] font-black tracking-wider uppercase">
                Xem trước sổ hộ khẩu thu nhỏ
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {coLat && (
                <div className="mr-1 flex items-center gap-0.5">
                  <button
                    onClick={() => lat(-1)}
                    disabled={!conTruoc}
                    title="Hộ trước (phím ←)"
                    aria-label="Hộ trước"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-0.5 font-mono text-[9px] font-bold text-white/70 tabular-nums">
                    {vi_tri ?? vt + 1}/{tong_so ?? ds_id!.length}
                  </span>
                  <button
                    onClick={() => lat(1)}
                    disabled={!conSau}
                    title="Hộ sau (phím →)"
                    aria-label="Hộ sau"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <button
                onClick={dong}
                aria-label="Đóng"
                className="cursor-pointer text-base leading-none font-bold text-white select-none hover:text-white/80"
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4">
            {!data ? (
              <Spinner label="Đang mở sổ hộ khẩu…" />
            ) : (
              /* ── Bìa sổ ─────────────────────────────────────────────────── */
              <div className="in-duoc relative flex min-h-[300px] flex-col justify-between rounded-xl border-2 border-amber-800 bg-gradient-to-br from-amber-50/75 via-stone-50 to-amber-50/50 p-4 shadow-inner">
                {/* Bốn góc trang trí */}
                <span className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-amber-800 opacity-45" />
                <span className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-amber-800 opacity-45" />
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-amber-800 opacity-45" />
                <span className="pointer-events-none absolute right-1.5 bottom-1.5 h-3 w-3 border-r border-b border-amber-800 opacity-45" />

                {/*
                  Hoa văn mặt trống đồng Đông Sơn chìm giữa trang, như hình chìm trên
                  giấy tờ hành chính. Để rất mờ: cán bộ đọc số liệu ngay trên trang
                  này, hoa văn đậm là chữ khó đọc.
                */}
                <TrongDong
                  net={2.4}
                  className="pointer-events-none absolute top-1/2 left-1/2 h-[80%] max-h-[430px] w-[80%] max-w-[430px] -translate-x-1/2 -translate-y-1/2 text-amber-800 opacity-[0.13] select-none"
                />

                <div className="relative z-10 space-y-3">
                  {hienNutSua && (
                    <div className="khong-in rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-1.5 text-[9.5px] font-bold text-amber-900">
                      ✏️ Đang ở chế độ sửa — bấm “XONG SỬA” khi làm xong.
                    </div>
                  )}

                  {/* Quốc hiệu · tiêu ngữ */}
                  <div className="space-y-0.5 text-center">
                    <p className="text-[10px] font-black tracking-wide text-rose-800 uppercase">
                      {khuPho?.settings?.quoc_hieu ?? 'Cộng hoà xã hội chủ nghĩa Việt Nam'}
                    </p>
                    <p className="pb-0.5 text-[8.5px] font-bold text-slate-800">
                      {khuPho?.settings?.tieu_ngu ?? 'Độc lập - Tự do - Hạnh phúc'}
                    </p>
                    <div className="mx-auto mt-0.5 h-px w-12 bg-amber-800 opacity-30" />
                  </div>

                  {/* Tên sổ */}
                  <div className="space-y-1 py-2 text-center">
                    <span className="inline-block rounded-sm border border-amber-800/40 px-1.5 py-0.5 text-[7.5px] font-black tracking-widest text-amber-900 uppercase">
                      Hồ sơ địa bàn số
                    </span>
                    <h4 className="block font-serif text-sm font-black tracking-widest text-amber-950 uppercase">
                      {data.household_type === 'tam_tru'
                        ? 'Sổ hộ tạm trú'
                        : 'Sổ hộ khẩu gia đình'}
                    </h4>
                  </div>

                  {/* Thông tin đăng ký */}
                  <div className="space-y-2.5 rounded-lg border border-amber-800/15 bg-white/85 p-3.5 text-xs font-semibold shadow-xs">
                    <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-1.5">
                      <span className="text-[8.5px] font-bold tracking-wider text-slate-400 uppercase">
                        Mã số sổ:
                      </span>
                      <strong className="font-mono text-xs font-black text-amber-900">
                        #{data.code}
                      </strong>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-b border-dashed border-slate-200 pb-2">
                      <O nhan="Chủ hộ gia đình:">
                        <strong className="line-clamp-1 text-[11px] font-extrabold text-slate-900 uppercase">
                          {chuHo?.full_name ?? <ChuaCapNhat />}
                        </strong>
                      </O>
                      <O nhan="Số điện thoại:">
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {data.phone ?? chuHo?.phone ?? <ChuaCapNhat />}
                        </span>
                      </O>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-b border-dashed border-slate-200 pb-2">
                      <O nhan="Căn cước chủ hộ:">
                        <span className="font-mono text-[11px] font-bold tracking-wider text-slate-800">
                          {chuHo?.id_card_last4 ? (
                            <>
                              <span className="text-slate-300">••••••••</span>
                              {chuHo.id_card_last4}
                            </>
                          ) : (
                            <ChuaCapNhat />
                          )}
                        </span>
                      </O>
                      <O nhan="Tổ dân phố:">
                        <strong className="block truncate text-[11px] font-bold text-slate-900">
                          {data.to_dan_pho ?? <ChuaCapNhat />}
                        </strong>
                      </O>
                    </div>

                    <div className="flex items-start justify-between gap-2 pt-0.5">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase">
                          Địa chỉ đăng ký cư trú:
                        </span>
                        <p className="text-[10.5px] leading-relaxed font-semibold text-slate-700">
                          {data.address ?? <ChuaCapNhat />}
                        </p>
                      </div>
                      <a
                        href={chiDuong(data)}
                        target="_blank"
                        rel="noreferrer"
                        title="Chỉ đường trên Google Maps bằng GPS"
                        className="khong-in mt-1 flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 shadow-sm transition-all hover:scale-105 hover:bg-emerald-100 active:scale-95"
                      >
                        <Navigation className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Dẫn đường GPS</span>
                      </a>
                    </div>
                  </div>

                  {/* Nhân khẩu trong hộ */}
                  <div className="mt-3 space-y-1.5 text-xs font-semibold">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[8.5px] font-extrabold tracking-wider text-slate-500 uppercase">
                        Nhân khẩu có cùng địa dư cư trú ({tv.length})
                      </span>
                      {hienNutSua && (
                        <button
                          type="button"
                          onClick={() => setThemDongCu(true)}
                          className="khong-in flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-blue-800 px-2.5 py-1.5 text-[9.5px] font-bold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 sm:py-0.5 sm:text-[8.5px]"
                        >
                          <span>➕ Thêm đồng cư</span>
                        </button>
                      )}
                    </div>

                    {tv.length === 0 ? (
                      <div className="rounded-xl border border-slate-200/50 bg-white/70 p-3 text-center text-[10px] leading-relaxed font-medium text-slate-400 italic">
                        Chưa có nhân khẩu nào đăng ký tại địa bàn số này.
                        <div className="mt-1 text-[9px] font-semibold text-slate-400 not-italic">
                          Dùng “Thêm đồng cư” để gắn cư dân với địa chỉ nhà này, hoặc “Gom
                          nhân khẩu vào hộ” ở màn hình sổ hộ khẩu.
                        </div>
                      </div>
                    ) : (
                      <div className="hidden overflow-hidden rounded-xl border border-amber-800/15 bg-white/85 shadow-xs lg:block print:block">
                        <table className="w-full text-left text-[10px]">
                          <thead className="bg-[#fcf8f0]">
                            <tr>
                              <th className="px-2.5 py-1.5 text-[8px] font-extrabold text-slate-500 uppercase">
                                Họ và tên
                              </th>
                              <th className="px-2.5 py-1.5 text-[8px] font-extrabold text-slate-500 uppercase">
                                Sinh nhật
                              </th>
                              <th className="px-2.5 py-1.5 text-[8px] font-extrabold text-slate-500 uppercase">
                                Giới tính
                              </th>
                              <th className="px-2.5 py-1.5 text-right text-[8px] font-extrabold text-slate-500 uppercase">
                                {hienNutSua ? 'Trạng thái / Đổi chủ hộ' : 'Diện cư trú'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {tv.map((m) => (
                              <tr key={m.id} className="hover:bg-slate-50/50">
                                <td className="px-2.5 py-1.5 font-bold text-slate-900">
                                  {m.full_name}
                                  {m.is_head ? (
                                    <span className="ml-1 rounded-sm border border-amber-200 bg-amber-100 px-1 text-[7.5px] text-amber-800">
                                      Chủ hộ
                                    </span>
                                  ) : m.relation_to_head ? (
                                    // Sổ hộ khẩu giấy ghi quan hệ với chủ hộ ở từng
                                    // dòng; thiếu nó thì không biết ai là con, ai là
                                    // người ở nhờ — đúng thứ cán bộ cần khi đi rà.
                                    <span className="ml-1 rounded-sm border border-slate-200 bg-slate-100 px-1 text-[7.5px] font-semibold text-slate-600">
                                      {m.relation_to_head}
                                    </span>
                                  ) : (
                                    <span className="ml-1 text-[7.5px] font-medium text-slate-300 italic">
                                      chưa rõ quan hệ
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 py-1.5 font-mono text-[9px]">
                                  {ngayVN(m.dob) ?? '—'}
                                </td>
                                <td className="px-2.5 py-1.5 text-[9.5px]">
                                  {m.gender ? GIOI_TINH[m.gender] : '—'}
                                </td>
                                <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span
                                      className={cx(
                                        'rounded border px-1.5 py-0.5 text-[7.5px] font-black',
                                        MAU_DIEN[m.residence_status] ?? MAU_DIEN.vang_lai,
                                      )}
                                    >
                                      {TEN_DIEN[m.residence_status] ?? m.residence_status}
                                    </span>
                                    {hienNutSua &&
                                      (m.is_head ? (
                                        <span className="shrink-0 rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[7.5px] font-extrabold tracking-wide text-amber-800 uppercase">
                                          Đang là chủ hộ
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDoiChuHo({ id: m.id, ten: m.full_name })
                                          }
                                          title="Đặt cư dân này làm chủ hộ"
                                          className="khong-in inline-flex cursor-pointer items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[7.5px] font-black text-white uppercase shadow-sm transition-all select-none hover:bg-red-700 active:scale-95"
                                        >
                                          👑 Đổi chủ hộ
                                        </button>
                                      ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Điện thoại: mỗi thành viên một khối, không kéo ngang */}
                    {tv.length > 0 && (
                      <div className="space-y-1.5 lg:hidden print:hidden">
                        {tv.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-amber-800/15 bg-white/85 px-3 py-2.5 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11.5px] font-bold text-slate-900">
                                  {m.full_name}
                                </p>
                                <p className="mt-0.5 text-[9.5px] text-slate-500">
                                  <span className="font-mono">{ngayVN(m.dob) ?? '—'}</span>
                                  {m.gender ? ` · ${GIOI_TINH[m.gender]}` : ''}
                                  {m.relation_to_head ? ` · ${m.relation_to_head}` : ''}
                                </p>
                              </div>
                              <span
                                className={cx(
                                  'shrink-0 rounded border px-1.5 py-0.5 text-[7.5px] font-black',
                                  MAU_DIEN[m.residence_status] ?? MAU_DIEN.vang_lai,
                                )}
                              >
                                {TEN_DIEN[m.residence_status] ?? m.residence_status}
                              </span>
                            </div>

                            {hienNutSua && (
                              <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                                {m.is_head ? (
                                  <span className="inline-block rounded border border-amber-200 bg-amber-100 px-2 py-1 text-[8.5px] font-extrabold tracking-wide text-amber-800 uppercase">
                                    👑 Đang là chủ hộ
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDoiChuHo({ id: m.id, ten: m.full_name })}
                                    className="khong-in w-full cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black text-white uppercase shadow-sm transition-all select-none hover:bg-red-700 active:scale-[0.98]"
                                  >
                                    👑 Đặt làm chủ hộ
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Đoàn thể của từng người */}
                    {tv.some((t) => t.phan_loai.length > 0) && (
                      <div className="mt-2 space-y-0.5 px-1">
                        <span className="text-[8px] font-extrabold tracking-wider text-slate-400 uppercase">
                          Đoàn thể & diện chính sách
                        </span>
                        {tv
                          .filter((t) => t.phan_loai.length > 0)
                          .map((t) => (
                            <p key={t.id} className="text-[9.5px] text-slate-600">
                              <b className="text-slate-800">{t.full_name}</b>:{' '}
                              {t.phan_loai.map((c) => c.name).join(' · ')}
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chân sổ: dòng bản in và con dấu đỏ */}
                <div className="relative z-10 mt-4 flex items-center justify-between px-1">
                  <span className="font-mono text-[8px] tracking-wider text-slate-400">
                    Hồ sơ địa chỉ số ·{' '}
                    {thoi_diem.toLocaleTimeString('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    {thoi_diem.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    {user?.full_name && ` · ${user.full_name}`}
                  </span>

                  <div className="flex h-9 w-9 shrink-0 rotate-[15deg] items-center justify-center rounded-full border border-rose-500 p-0.5 text-center opacity-85 select-none">
                    <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-rose-500 text-[4.5px] leading-none font-black text-rose-500 uppercase">
                      {(khuPho?.name ?? 'KP').slice(0, 12)}
                      <br />
                      XÁC MINH
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Thanh nút */}
          <div className="khong-in flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <Button mau="trang" icon={Printer} onClick={() => window.print()} disabled={!data}>
              <span className="hidden sm:inline">In sao kê hộ khẩu</span>
              <span className="sm:hidden">In sổ</span>
            </Button>
            <div className="flex gap-2">
              {coLat && (
                <div className="flex gap-1 sm:hidden">
                  <Button mau="trang" onClick={() => lat(-1)} disabled={!conTruoc}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button mau="trang" onClick={() => lat(1)} disabled={!conSau}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {suaDuoc && (
                <Button
                  mau={dangSua ? 'chinh' : 'trang'}
                  icon={dangSua ? Check : Pencil}
                  onClick={() => setDangSua((v) => !v)}
                  disabled={!data}
                >
                  {dangSua ? 'XONG SỬA' : 'SỬA'}
                </Button>
              )}
              <Button mau="trang" onClick={dong}>
                Đóng lại
              </Button>
            </div>
          </div>
        </div>
      </div>

      {themDongCu && (
        <FormCuDan
          householdId={id}
          onClose={() => {
            setThemDongCu(false);
            void qc.invalidateQueries({ queryKey: ['ho-khau'] });
          }}
        />
      )}

      <XacNhan
        nhan_nut="ĐỔI CHỦ HỘ"
        nhan_dang_lam="ĐANG ĐỔI…"
        muc_do="thuong"
        mo={!!doiChuHo}
        dong={() => setDoiChuHo(null)}
        tieu_de="Đổi chủ hộ"
        dang_lam={datChuHo.isPending}
        loi_nhan={
          <>
            <p>
              Đặt <b>{doiChuHo?.ten}</b> làm chủ hộ của hộ{' '}
              <b className="font-mono">#{data?.code}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Chủ hộ hiện tại {chuHo ? <b>{chuHo.full_name}</b> : ''} sẽ thành thành viên
              thường. Đổi lại lúc nào cũng được. Thao tác có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => datChuHo.mutate(doiChuHo!.id)}
      />
    </>
  );
}

/** Cặp nhãn nhỏ – giá trị trong khối thông tin đăng ký. */
function O({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase">
        {nhan}
      </span>
      {children}
    </div>
  );
}
