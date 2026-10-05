/**
 * Địa chỉ số — bản đồ toàn khu phố.
 *
 * Ba chi tiết lấy từ app cũ, đều có lý do thực tế:
 *   nền bản đồ giảm sáng còn 80%   -> ghim màu nổi lên, xem ngoài nắng vẫn thấy
 *   ghim tròn 32px viền trắng 2px  -> phân biệt được khi nhiều hộ sát nhau trong hẻm
 *   phóng to khi rê chuột          -> biết chắc mình đang trỏ vào hộ nào trước khi bấm
 *
 * Ghim sai sửa được bằng ba cách, tuỳ mức sai:
 *   lệch vài mét   -> KÉO thẳng ghim trên bản đồ
 *   sai hẳn nhà    -> nút "Đặt lại", rồi bấm chỗ đúng
 *   không chắc     -> nút "Gỡ ghim", hộ quay về danh sách chưa định vị
 * Toạ độ sai mà không gỡ được thì cán bộ đi theo chỉ đường sẽ tới nhầm nhà.
 *
 * Leaflet tự host trên máy chủ, nạp theo yêu cầu (không đóng vào gói) — trang không
 * dùng bản đồ thì khỏi tải thêm 150KB, và lúc dùng cũng không gọi ra CDN ngoài.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Crosshair,
  History,
  MapPin,
  Maximize2,
  Move,
  Navigation,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  ChuaCapNhat,
  cx,
  Input,
  ONumber,
  Rong,
  Select,
  Spinner,
  ThanhTieuDe,
  Truong,
  XacNhan,
} from '@/components/ui';
import { get, patch, qs } from '@/lib/api';
import { gio, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { DanhSach, Ho, HoChiTiet } from '@/lib/types';
import { TRANG_THAI_DINH_VI } from '@/lib/types';

import { XacMinhViTri } from './XacMinhViTri';

interface TongQuanDinhVi {
  nha_cung_cap: 'openstreetmap' | 'google';
  tong: number;
  chua_do: number;
  can_xac_minh: number;
  da_xac_minh: number;
  ghim_tay: number;
  khong_do_duoc: number;
  thieu_dia_chi: number;
  do_tu_dong_san_sang: boolean;
}

// Leaflet TỰ HOST, không lấy từ CDN ngoài. Ba lý do: (1) chính sách chống chèn
// mã (CSP) chỉ cho tải tài nguyên từ máy mình; (2) đúng tinh thần "máy chủ tại
// Việt Nam, không gọi ra ngoài lúc bà con dùng"; (3) CDN chết thì bản đồ vẫn chạy.
const CDN_CSS = '/lib/leaflet/leaflet.css';
const CDN_JS = '/lib/leaflet/leaflet.js';

/** Trung tâm phường An Phú — dùng khi chưa hộ nào có toạ độ. */
const MAC_DINH: [number, number] = [10.7955, 106.7415];

/**
 * Nền bản đồ.
 *
 * Trước đây lấy tile từ `mt1.google.com/vt`. Đó là máy chủ nội bộ của Google Maps,
 * không phải API có giấy phép — dùng là sai điều khoản, và nền nó trả về xám xịt
 * nên nhìn mãi cũng mỏi mắt. Hai lớp dưới đây đều là nguồn mở, dùng hợp lệ khi ghi
 * nguồn, và sáng rõ hơn hẳn.
 *
 * ── Ba con số zoom, đừng lẫn ────────────────────────────────────────────────
 *
 *   `zoom_nguon`  mức sâu nhất mà nhà cung cấp CÓ ảnh (maxNativeZoom).
 *   `zoom_toi_da` mức sâu nhất người dùng phóng được (maxZoom). Lớn hơn
 *                 `zoom_nguon` thì Leaflet phóng to ảnh sẵn có — mờ nhưng vẫn
 *                 thấy nhà, còn hơn ô trống.
 *   `zoom_xem`    mức bay tới khi chọn một hộ: nét nhất mà vẫn còn ảnh thật.
 *
 * Đo thật ở An Phú: Esri có ảnh tới z19; z20 và z21 vẫn trả HTTP 200 nhưng là
 * ô xám "không có dữ liệu" nặng 2,5KB. Đặt `zoom_nguon` sai một mức là màn hình
 * trắng trơn khi phóng hết cỡ.
 *
 * `retina` chỉ bật cho nguồn CÓ ảnh @2x. Bật cho Esri là hỏng: Leaflet sẽ xin ảnh
 * sâu hơn một mức để bù độ nét, mà sâu hơn một mức thì hết ảnh — đó chính là lý do
 * bản đồ vệ tinh trống trơn trên điện thoại màn hình nét.
 */
const LOP_BAN_DO = {
  // Ảnh vệ tinh THUẦN, không có lớp nhãn đường phủ lên trên. Nền cũ dùng lớp
  // "hybrid" của Google: ảnh vệ tinh cộng một lớp chữ và đường viền đen đè lên,
  // nhìn tối và rối. Muốn tên đường thì chuyển sang nền "Đường phố".
  ve_tinh: {
    nhan: 'Vệ tinh',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    nguon: 'Nguồn ảnh: Esri, Maxar, Earthstar Geographics',
    sub: '',
    retina: false,
    zoom_nguon: 19,
    zoom_toi_da: 21,
    zoom_xem: 19,
  },
  duong_pho: {
    nhan: 'Đường phố',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    nguon: '&copy; OpenStreetMap &middot; &copy; CARTO',
    sub: 'abcd',
    retina: true,
    zoom_nguon: 19,
    zoom_toi_da: 21,
    zoom_xem: 19,
  },
} as const;

const chiDuong = (h: { toa_do: { lat: number; lng: number } | null; address: string | null }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${
    h.toa_do ? `${h.toa_do.lat},${h.toa_do.lng}` : encodeURIComponent(h.address ?? '')
  }`;

function useLeaflet() {
  const [san, setSan] = useState(
    () => typeof window !== 'undefined' && !!(window as never as { L?: unknown }).L,
  );
  useEffect(() => {
    if (san) return;
    if (!document.querySelector(`link[href="${CDN_CSS}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = CDN_CSS;
      document.head.appendChild(l);
    }
    let s = document.querySelector<HTMLScriptElement>(`script[src="${CDN_JS}"]`);
    if (!s) {
      s = document.createElement('script');
      s.src = CDN_JS;
      s.async = true;
      document.head.appendChild(s);
    }
    const xong = () => setSan(true);
    s.addEventListener('load', xong);
    return () => s?.removeEventListener('load', xong);
  }, [san]);
  return san;
}

export function BanDo() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);
  const suaDuoc = can('household:write');

  // Ảnh vệ tinh làm mặc định: cán bộ nhận ra mái nhà, sân, hẻm ngay, chứ tên
  // đường trên bản đồ nét thì ở hẻm nhỏ gần như không có.
  const [lop, setLop] = useState<keyof typeof LOP_BAN_DO>('ve_tinh');
  const [chon, setChon] = useState<Ho | null>(null);
  const [dangGhim, setDangGhim] = useState<Ho | null>(null);
  const [hoiGoGhim, setHoiGoGhim] = useState<Ho | null>(null);
  const [thongBao, setThongBao] = useState<{ ok: boolean; chu: string } | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [xacMinh, setXacMinh] = useState<Ho | null>(null);
  const [locTrangThai, setLocTrangThai] = useState('');
  /** Ô tìm trong danh sách bên phải — hỏi thẳng máy chủ, tìm cả tên chủ hộ. */
  const [timBenPhai, setTimBenPhai] = useState('');

  const san = useLeaflet();
  const khung = useRef<HTMLDivElement>(null);
  const banDo = useRef<any>(null);
  const lopNen = useRef<any>(null);
  const ghim = useRef<Record<string, any>>({});
  /** Khoá của lần canh khung gần nhất — xem chú thích ở effect vẽ ghim. */
  const daCanhKhung = useRef<string>('');
  /** Ghim cam tạm, hiện khi bấm xem một vị trí trong lịch sử. */
  const ghimLichSu = useRef<any>(null);

  /** Xoá ghim cam tạm — gọi khi đóng panel hoặc chọn hộ khác. */
  const xoaGhimLichSu = useCallback(() => {
    if (ghimLichSu.current && banDo.current) {
      banDo.current.removeLayer(ghimLichSu.current);
      ghimLichSu.current = null;
    }
  }, []);

  /**
   * Bấm một dòng lịch sử → bay tới đúng toạ độ lần đó, đặt ghim cam để phân biệt
   * với ghim xanh (vị trí hiện tại). Nhờ vậy thấy được lần ghim cũ nằm ở đâu so
   * với chỗ đúng bây giờ.
   */
  const bayToiLichSu = useCallback(
    (lat: number, lng: number) => {
      const map = banDo.current;
      if (!map) return;
      const L = (window as never as { L: any }).L;
      xoaGhimLichSu();
      ghimLichSu.current = L.circleMarker([lat, lng], {
        radius: 10,
        color: '#ea580c',
        weight: 3,
        fillColor: '#fb923c',
        fillOpacity: 0.55,
      }).addTo(map);
      map.flyTo([lat, lng], LOP_BAN_DO[lop].zoom_xem, { duration: 0.8 });
    },
    [lop, xoaGhimLichSu],
  );

  useEffect(() => {
    datManHinh({
      tieu_de: '🗺️ Địa chỉ số',
      goi_y_tim: 'Tìm hộ theo mã hoặc địa chỉ để ghim…',
      // Có nhanTim thì thanh trên mới dựng ô tìm kiếm
      nhanTim: () => setChon(null),
    });
  }, [datManHinh]);

  // Ô tìm bên phải hỏi thẳng máy chủ (tìm cả TÊN CHỦ HỘ trong toàn bộ 8.000+ hộ),
  // không lọc tại chỗ trên 300 hộ đã tải — trước đây gõ tên chủ hộ ngoài 300 hộ
  // đầu là "không có hộ nào khớp", dù người đó có thật trong sổ.
  const timHo = timBenPhai.trim() || tim;
  const { data } = useQuery({
    queryKey: ['ho-khau-ban-do', timHo, locTrangThai],
    queryFn: () =>
      get<DanhSach<Ho>>('/ho-khau' + qs({ q: timHo, geo_status: locTrangThai, limit: 20000 })),
    enabled: can('household:read'),
  });

  const { data: tq } = useQuery({
    queryKey: ['dinh-vi-tong-quan'],
    queryFn: () => get<TongQuanDinhVi>('/ho-khau/dinh-vi/tong-quan'),
    enabled: can('household:read'),
  });

  // useMemo ở đây KHÔNG phải để tối ưu tốc độ mà để giữ nguyên danh tính mảng.
  // Trước đây `items`/`coToaDo` là mảng mới sau mỗi lần render, nên effect vẽ ghim
  // chạy lại liên tục và gọi `fitBounds` — bấm vào một ghim là bản đồ tự thu về
  // toàn cảnh, mất đúng chỗ người dùng đang xem.
  const items = useMemo(() => data?.items ?? [], [data]);
  const coToaDo = useMemo(() => items.filter((h) => h.toa_do), [items]);

  /** Lưu toạ độ mới, hoặc gỡ ghim khi `viTri` là null. */
  const luuViTri = useCallback(
    async (h: Ho, viTri: { lat: number; lng: number } | null) => {
      setDangLuu(true);
      try {
        await patch(
          `/ho-khau/${h.id}`,
          viTri
            ? { lat: viTri.lat, lng: viTri.lng, geo_status: 'manual', geo_source: 'ghim_tay' }
            : { xoa_ghim: true },
        );
        setThongBao({
          ok: true,
          chu: viTri
            ? `Đã cập nhật vị trí hộ #${h.code}.`
            : `Đã gỡ ghim hộ #${h.code}. Hộ quay lại danh sách chưa định vị.`,
        });
        setChon(null);
        for (const k of ['ho-khau-ban-do', 'ho-khau', 'thong-bao', 'thong-ke']) {
          void qc.invalidateQueries({ queryKey: [k] });
        }
      } catch (err) {
        setThongBao({ ok: false, chu: err instanceof Error ? err.message : 'Không lưu được' });
      } finally {
        setDangLuu(false);
      }
    },
    [qc],
  );

  /** Áp dụng vị trí lịch sử: xoá ghim cam tạm rồi lưu làm vị trí hộ. */
  const apDungLichSu = useCallback(
    (lat: number, lng: number) => {
      if (!chon) return;
      xoaGhimLichSu();
      void luuViTri(chon, { lat, lng });
    },
    [chon, luuViTri, xoaGhimLichSu],
  );

  /* ── Dựng bản đồ ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!san || !khung.current) return;
    const L = (window as never as { L: any }).L;

    banDo.current ??= L.map(khung.current, { zoomControl: true }).setView(MAC_DINH, 16);
    const map = banDo.current;

    if (lopNen.current) map.removeLayer(lopNen.current);
    const nen = LOP_BAN_DO[lop];
    lopNen.current = L.tileLayer(nen.url, {
      attribution: nen.nguon,
      maxZoom: nen.zoom_toi_da,
      // Phóng quá mức nguồn có ảnh thì Leaflet phóng to ảnh sẵn có, thay vì đi xin
      // ô không tồn tại rồi hiện ra một mảng xám
      maxNativeZoom: nen.zoom_nguon,
      detectRetina: nen.retina,
      ...(nen.sub ? { subdomains: nen.sub } : {}),
    }).addTo(map);
  }, [san, lop]);

  /* ── Vẽ ghim. Kéo được để chỉnh lệch nhỏ, khỏi phải bấm nút gì. ─────── */
  useEffect(() => {
    if (!san || !banDo.current) return;
    const L = (window as never as { L: any }).L;
    const map = banDo.current;

    Object.values(ghim.current).forEach((m) => map.removeLayer(m));
    ghim.current = {};

    coToaDo.forEach((h) => {
      const mau =
        h.geo_status === 'verified' ? '#059669' : h.geo_status === 'manual' ? '#1e40af' : '#d97706';
      const icon = L.divIcon({
        html:
          `<div style="background:${mau}" class="w-8 h-8 rounded-full text-white shadow-lg ` +
          `border-2 border-white flex items-center justify-center cursor-pointer ` +
          `hover:scale-125 transition-transform text-[9px] font-bold leading-none">${h.code}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const m = L.marker([h.toa_do!.lat, h.toa_do!.lng], {
        icon,
        draggable: suaDuoc,
        autoPan: true,
        title: suaDuoc ? `${h.code} — kéo để chỉnh vị trí` : h.code,
      }).addTo(map);

      // Chỉ mở bảng thông tin bên phải. KHÔNG đụng tới tầm nhìn: người dùng vừa
      // phóng tới đúng con hẻm cần xem, kéo họ đi chỗ khác là mất công phóng lại.
      m.on('click', () => setChon(h));
      if (suaDuoc) {
        m.on('dragend', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          void luuViTri(h, { lat, lng });
        });
      }
      ghim.current[h.id] = m;
    });

    // Chỉ canh khung khi NGƯỜI DÙNG đổi thứ đang xem (tìm kiếm, lọc trạng thái).
    // Ghim xong một hộ thì dữ liệu tải lại — lúc đó canh khung lại là hất người
    // dùng ra khỏi chỗ họ vừa làm việc.
    const khoa = `${tim}|${locTrangThai}`;
    if (coToaDo.length > 0 && daCanhKhung.current !== khoa) {
      daCanhKhung.current = khoa;
      map.fitBounds(L.latLngBounds(coToaDo.map((h) => [h.toa_do!.lat, h.toa_do!.lng])), {
        padding: [60, 60],
        maxZoom: 18,
      });
    }
  }, [san, coToaDo, suaDuoc, luuViTri, tim, locTrangThai]);

  /* ── Đặt vị trí: bấm lên bản đồ để ghim hộ đang chọn ─────────────────── */
  useEffect(() => {
    if (!san || !banDo.current || !dangGhim) return;
    const map = banDo.current;
    map.getContainer().style.cursor = 'crosshair';

    const dat = (e: any) => {
      const h = dangGhim;
      setDangGhim(null);
      void luuViTri(h, { lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', dat);
    return () => {
      map.off('click', dat);
      map.getContainer().style.cursor = '';
    };
  }, [san, dangGhim, luuViTri]);

  /* ── ẤN GIỮ để ghim thẳng ───────────────────────────────────────────────
   *
   * Cán bộ mở một hộ rồi ấn giữ (điện thoại) hoặc bấm chuột phải (máy tính) đúng
   * mái nhà trên ảnh vệ tinh là ghim luôn — không phải bấm "Đặt lại" trước. Ghim
   * tay theo mái nhà chính xác hơn hẳn dò tự động từ địa chỉ, vốn hay lệch cả dãy.
   *
   * Chỉ bật khi ĐANG mở một hộ và KHÔNG ở chế độ đặt lại (click), để hai cách
   * không giẫm nhau. `contextmenu` của Leaflet gom cả long-press lẫn chuột phải.
   */
  useEffect(() => {
    if (!san || !banDo.current || !suaDuoc || !chon || dangGhim) return;
    const map = banDo.current;
    const h = chon;
    const anGiu = (e: any) => {
      void luuViTri(h, { lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('contextmenu', anGiu);
    return () => map.off('contextmenu', anGiu);
  }, [san, suaDuoc, chon, dangGhim, luuViTri]);

  if (!can('household:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem bản đồ hộ khẩu." />;
  }

  /**
   * Lọc tại chỗ theo mã hộ, chủ hộ hoặc địa chỉ. Bỏ dấu hai bên để gõ "nguyen"
   * vẫn ra "Nguyễn" — cán bộ tra nhanh thường gõ không dấu.
   *
   * Ô tìm này hỏi thẳng máy chủ (xem `timHo`), nên tìm được cả tên chủ hộ nằm
   * ngoài 300 hộ tải sẵn — chỉ cần sắp xếp lại: hộ chưa ghim lên trước vì đó là
   * việc còn phải làm.
   */
  const daSapXep = [...items].sort((a, b) =>
    !!a.toa_do === !!b.toa_do ? a.code.localeCompare(b.code) : a.toa_do ? 1 : -1,
  );
  // Render tối đa 500 dòng: 8.000 dòng DOM thì cuộn giật. Marker trên bản đồ vẫn
  // vẽ đủ (dùng `items`); còn dư thì nhắc cán bộ gõ ô tìm để lọc.
  const GIOI_HAN_HIEN = 500;
  const dsBenPhai = daSapXep.slice(0, GIOI_HAN_HIEN);
  const conNua = daSapXep.length - dsBenPhai.length;

  return (
    <>
      <ThanhTieuDe
        tieu_de="Địa chỉ số khu phố"
        mo_ta="Vị trí lấy bằng GPS tại chỗ — cán bộ đi tới nhà nào ghim nhà đó"
        so_loc_dang_bat={locTrangThai ? 1 : 0}
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Truong nhan="Trạng thái định vị">
              <Select
                value={locTrangThai}
                onChange={(e) => {
                  setLocTrangThai(e.target.value);
                  setChon(null);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(TRANG_THAI_DINH_VI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Nền bản đồ">
              <Select value={lop} onChange={(e) => setLop(e.target.value as typeof lop)}>
                {Object.entries(LOP_BAN_DO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <div className="flex items-end sm:col-span-1">
              <p className="text-[10.5px] text-slate-400 font-medium leading-relaxed">
                Ghim <b className="text-emerald-700">xanh lá</b> lấy GPS tại chỗ,{' '}
                <b className="text-blue-800">xanh dương</b> ghim tay trên bản đồ.
                {suaDuoc && ' Kéo thẳng ghim để chỉnh lệch nhỏ.'}
              </p>
            </div>
          </div>
        }
      ></ThanhTieuDe>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ONumber nhan="Tổng số hộ" gia_tri={tq?.tong ?? items.length} icon={MapPin} mau="blue" />
        <ONumber
          nhan="Đã định vị"
          gia_tri={(tq?.da_xac_minh ?? 0) + (tq?.ghim_tay ?? 0)}
          phu={
            tq?.tong
              ? `ghim rồi là xong · ${Math.round((((tq.da_xac_minh ?? 0) + (tq.ghim_tay ?? 0)) / tq.tong) * 100)}%`
              : undefined
          }
          phu_mau="text-emerald-700"
          icon={ShieldCheck}
          mau="emerald"
        />
        <ONumber
          nhan="Ghim tay"
          gia_tri={tq?.ghim_tay ?? 0}
          phu={`${so(tq?.da_xac_minh ?? 0)} đo bằng GPS tại chỗ`}
          phu_mau="text-slate-500"
          icon={MapPin}
          mau="blue"
        />
        <ONumber
          nhan="Chưa có toạ độ"
          gia_tri={(tq?.chua_do ?? 0) + (tq?.khong_do_duoc ?? 0)}
          phu={
            tq?.thieu_dia_chi ? `${tq.thieu_dia_chi} hộ chưa có địa chỉ` : 'Chưa ghim trên bản đồ'
          }
          phu_mau={(tq?.chua_do ?? 0) > 0 ? 'text-rose-700' : 'text-emerald-700'}
          icon={MapPin}
          mau={(tq?.chua_do ?? 0) > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {thongBao && (
        <CanhBao loai={thongBao.ok ? 'ok' : 'loi'} emoji={thongBao.ok ? '✅' : '⚠️'}>
          {thongBao.chu}
        </CanhBao>
      )}

      {dangGhim && (
        <CanhBao loai="canh" emoji="📍">
          {dangGhim.toa_do ? 'Đang ĐẶT LẠI vị trí hộ ' : 'Đang ghim hộ '}
          <b>#{dangGhim.code}</b>
          {dangGhim.address ? ` — ${dangGhim.address}` : ''}. Bấm đúng vị trí nhà trên bản đồ.{' '}
          <button onClick={() => setDangGhim(null)} className="underline font-bold cursor-pointer">
            Huỷ
          </button>
        </CanhBao>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 overflow-hidden order-1">
          {!san ? (
            <Spinner label="Đang nạp bản đồ…" />
          ) : (
            <div className="relative">
              <div
                ref={khung}
                className="h-[380px] w-full sm:h-[480px] lg:h-[calc(100vh-15rem)] lg:min-h-[520px]"
              />
              {/* Bản đồ không còn tự thu về toàn cảnh, nên phải có nút gọi lại */}
              {coToaDo.length > 1 && (
                <button
                  onClick={() => {
                    const L = (window as never as { L: any }).L;
                    banDo.current?.fitBounds(
                      L.latLngBounds(coToaDo.map((h) => [h.toa_do!.lat, h.toa_do!.lng])),
                      { padding: [60, 60], maxZoom: 18 },
                    );
                  }}
                  title="Thu về xem toàn bộ ghim"
                  className="absolute top-3 right-3 z-[500] flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[10.5px] font-bold text-slate-600 shadow-lg backdrop-blur transition-colors hover:bg-white hover:text-blue-800"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  TOÀN CẢNH
                </button>
              )}
            </div>
          )}
        </Card>

        <Card className="order-2 flex flex-col p-3.5 lg:max-h-[calc(100vh-15rem)] lg:min-h-[520px]">
          {chon ? (
            <ChiTietHo
              h={chon}
              suaDuoc={suaDuoc}
              dangLuu={dangLuu}
              onBayToi={bayToiLichSu}
              onApDung={apDungLichSu}
              dong={() => {
                xoaGhimLichSu();
                setChon(null);
              }}
              onDatLai={() => {
                setThongBao(null);
                setDangGhim(chon);
                setChon(null);
              }}
              onGoGhim={() => setHoiGoGhim(chon)}
              onXacMinh={() => setXacMinh(chon)}
            />
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase">Danh sách hộ</h4>
                <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">
                  {data
                    ? data.tong_so > items.length
                      ? `${items.length}/${data.tong_so}`
                      : so(items.length)
                    : ''}
                </span>
              </div>

              <div className="relative mb-2">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={timBenPhai}
                  onChange={(e) => setTimBenPhai(e.target.value)}
                  placeholder="Tìm mã hộ, chủ hộ hoặc địa chỉ…"
                  className="pr-8 pl-8"
                  autoComplete="off"
                />
                {timBenPhai && (
                  <button
                    type="button"
                    onClick={() => setTimBenPhai('')}
                    aria-label="Xoá ô tìm"
                    className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <p className="mb-3 text-[11px] font-medium text-slate-500">
                {suaDuoc
                  ? 'Bấm một hộ để phóng sát tới nhà đó. Đang đứng trước nhà thì bấm “Lấy GPS tại chỗ” — nhanh và chính xác nhất.'
                  : 'Bấm một hộ để phóng sát tới vị trí của hộ đó trên bản đồ.'}
              </p>
              <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 max-h-[340px] lg:max-h-none">
                {dsBenPhai.length === 0 ? (
                  <p className="py-8 text-center text-xs font-medium text-slate-400">
                    {timBenPhai
                      ? `Không có hộ nào khớp “${timBenPhai}”.`
                      : 'Chưa có hộ nào khớp tìm kiếm.'}
                  </p>
                ) : (
                  dsBenPhai.map((h) => {
                    const daGhim = !!h.toa_do;
                    return (
                      <button
                        key={h.id}
                        onClick={() => {
                          setThongBao(null);
                          setChon(h);
                          // Chọn từ danh sách nghĩa là "cho tôi xem cái nhà này":
                          // phóng sát hết mức nền bản đồ cho phép. Khác với bấm
                          // thẳng lên ghim — lúc đó người dùng đã ở đúng chỗ rồi
                          // nên giữ nguyên tầm nhìn.
                          if (h.toa_do && banDo.current) {
                            // Bay tới mức NÉT NHẤT CÒN ẢNH THẬT, không phải mức
                            // phóng tối đa — mức đó chỉ là ảnh z19 kéo giãn ra
                            banDo.current.flyTo(
                              [h.toa_do.lat, h.toa_do.lng],
                              LOP_BAN_DO[lop].zoom_xem,
                              { duration: 0.8 },
                            );
                          }
                        }}
                        className={cx(
                          'w-full text-left border rounded-xl px-3 py-3 transition-all cursor-pointer',
                          'border-slate-200 hover:border-blue-800 hover:bg-blue-50/40',
                          dangGhim?.id === h.id && 'border-blue-800 bg-blue-50',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11.5px] font-bold text-slate-900 truncate">
                            <span className="font-mono text-slate-400">#{h.code}</span>{' '}
                            {h.chu_ho || 'Chưa có chủ hộ'}
                          </p>
                          <Chip mau={daGhim ? 'emerald' : 'amber'} nho>
                            {daGhim ? 'Đã ghim' : 'Chưa ghim'}
                          </Chip>
                        </div>
                        <p className="text-[10.5px] text-slate-500 font-medium truncate mt-0.5">
                          {h.address || 'Chưa có địa chỉ'}
                        </p>
                      </button>
                    );
                  })
                )}

                {conNua > 0 && (
                  <p className="py-3 text-center text-[10.5px] font-medium text-slate-400">
                    Còn <b className="text-slate-600">{so(conNua)}</b> hộ nữa. Gõ ô tìm ở trên để
                    lọc nhanh theo tên chủ hộ, số nhà hoặc mã hộ.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      <XacMinhViTri ho={xacMinh} dong={() => setXacMinh(null)} />

      <XacNhan
        nhan_nut="GỠ GHIM"
        nhan_dang_lam="ĐANG GỠ…"
        muc_do="thuong"
        mo={!!hoiGoGhim}
        dong={() => setHoiGoGhim(null)}
        tieu_de="Gỡ ghim vị trí"
        dang_lam={dangLuu}
        loi_nhan={
          <>
            <p>
              Gỡ toạ độ đã ghim của hộ <b className="font-mono">#{hoiGoGhim?.code}</b>
              {hoiGoGhim?.address ? ` — ${hoiGoGhim.address}` : ''}?
            </p>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Hộ quay lại danh sách chưa định vị. Ghim lại lúc nào cũng được. Có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => {
          const h = hoiGoGhim!;
          setHoiGoGhim(null);
          setThongBao(null);
          void luuViTri(h, null);
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────── Chi tiết hộ khi bấm ghim ─ */

function ChiTietHo({
  h,
  suaDuoc,
  dangLuu,
  dong,
  onDatLai,
  onGoGhim,
  onXacMinh,
  onBayToi,
  onApDung,
}: {
  h: Ho;
  suaDuoc: boolean;
  dangLuu: boolean;
  dong: () => void;
  onDatLai: () => void;
  onGoGhim: () => void;
  onXacMinh: () => void;
  onBayToi: (lat: number, lng: number) => void;
  onApDung: (lat: number, lng: number) => void;
}) {
  const tt = TRANG_THAI_DINH_VI[h.geo_status] ?? TRANG_THAI_DINH_VI.pending!;
  /** Danh sách người trong hộ, chỉ tải khi bấm vào chip — đa số lượt xem không cần. */
  const [moDanhSach, setMoDanhSach] = useState(false);
  const { data: chiTiet, isFetching: dangTaiTV } = useQuery({
    queryKey: ['ho-khau', h.id],
    queryFn: () => get<HoChiTiet>(`/ho-khau/${h.id}`),
    enabled: moDanhSach,
  });

  // Đổi sang hộ khác thì gấp danh sách lại, đỡ hiểu nhầm là người của hộ mới
  useEffect(() => setMoDanhSach(false), [h.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">
            HỘ #{h.code}
          </p>
          <h4 className="font-bold text-slate-900 text-sm truncate">
            {h.chu_ho || 'Chưa có chủ hộ'}
          </h4>
        </div>
        <button
          onClick={dong}
          className="text-slate-400 hover:text-slate-700 text-[10px] font-bold cursor-pointer shrink-0"
        >
          Đóng
        </button>
      </div>

      <div className="space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
        {(
          [
            ['Địa chỉ', h.address],
            ['Tổ dân phố', h.to_dan_pho],
            ['Điện thoại', h.phone ?? h.dt_chu_ho],
          ] as [string, string | null][]
        ).map(([nhan, gt]) => (
          <div key={nhan}>
            <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
              {nhan}
            </p>
            <p className="text-[11.5px] font-semibold text-slate-800 mt-0.5">
              {gt || <ChuaCapNhat />}
            </p>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Bấm để xem ai đang ở trong hộ — cán bộ đi rà cần biết trước khi gõ cửa */}
          <button
            type="button"
            onClick={() => setMoDanhSach((v) => !v)}
            disabled={!h.so_nhan_khau}
            className={cx(
              'rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors',
              h.so_nhan_khau
                ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                : 'cursor-default border-slate-200 bg-slate-50 text-slate-400',
            )}
          >
            {h.so_nhan_khau} nhân khẩu
            {!!h.so_nhan_khau && (
              <ChevronDown
                className={cx(
                  'ml-1 inline h-3 w-3 transition-transform',
                  moDanhSach && 'rotate-180',
                )}
              />
            )}
          </button>
          <Chip mau={tt.mau as 'slate'}>{tt.nhan}</Chip>
        </div>

        {moDanhSach && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            {dangTaiTV && !chiTiet ? (
              <Spinner label="Đang mở danh sách…" />
            ) : !chiTiet?.thanh_vien.length ? (
              <p className="py-2 text-center text-[10.5px] font-medium text-slate-400">
                Hộ chưa gán nhân khẩu nào.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {[...chiTiet.thanh_vien]
                  // Chủ hộ lên đầu, còn lại giữ thứ tự máy chủ trả về
                  .sort((a, b) => Number(b.is_head) - Number(a.is_head))
                  .map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-2 py-1.5">
                      <span className="min-w-0">
                        <span className="text-[11px] font-bold text-slate-800">{m.full_name}</span>
                        <span className="ml-1 text-[9.5px] font-semibold text-slate-400">
                          {m.is_head
                            ? '· chủ hộ'
                            : m.relation_to_head
                              ? `· ${m.relation_to_head}`
                              : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-slate-400">
                        {m.dob ? new Date(m.dob).toLocaleDateString('vi-VN') : '—'}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {h.toa_do && (
          <div className="pt-1">
            <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
              Toạ độ đã ghim
            </p>
            <p className="text-[10.5px] font-mono text-slate-500 mt-0.5">
              {h.toa_do.lat.toFixed(6)}, {h.toa_do.lng.toFixed(6)}
            </p>
          </div>
        )}

        {suaDuoc && (
          <p className="pt-1 text-[10px] font-medium leading-relaxed text-slate-400">
            <b className="text-blue-700">Ấn giữ</b> (điện thoại) hoặc{' '}
            <b className="text-blue-700">bấm chuột phải</b> (máy tính) lên đúng nhà trên bản đồ là
            ghim ngay.
            {h.toa_do && ' Lệch vài mét thì kéo thẳng ghim; sai hẳn nhà thì bấm Đặt lại.'}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {/* Chưa có toạ độ: lấy GPS là đường nhanh nhất và chính xác nhất */}
        {suaDuoc && !h.toa_do && (
          <Button
            icon={Crosshair}
            onClick={onXacMinh}
            disabled={dangLuu}
            className="w-full !py-2.5"
          >
            LẤY GPS TẠI CHỖ
          </Button>
        )}

        {h.toa_do && (
          <a
            href={chiDuong(h)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow transition-all cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            CHỈ ĐƯỜNG TỚI NHÀ
          </a>
        )}

        {suaDuoc && h.toa_do && (
          <Button
            icon={ShieldCheck}
            onClick={onXacMinh}
            disabled={dangLuu}
            className={cx(
              'w-full !py-2.5',
              h.geo_status === 'verified' && '!bg-emerald-600 hover:!bg-emerald-700',
            )}
          >
            {h.geo_status === 'verified' ? 'XÁC MINH LẠI' : 'XÁC MINH TẠI CHỖ'}
          </Button>
        )}

        {suaDuoc && (
          <div className="grid grid-cols-2 gap-2">
            <Button mau="trang" icon={Move} onClick={onDatLai} disabled={dangLuu}>
              {h.toa_do ? 'ĐẶT LẠI' : 'GHIM TRÊN BẢN ĐỒ'}
            </Button>
            <Button
              mau="trang"
              icon={Trash2}
              onClick={onGoGhim}
              disabled={dangLuu || !h.toa_do}
              className="!text-rose-700 !border-rose-200 hover:!bg-rose-50"
            >
              GỠ GHIM
            </Button>
          </div>
        )}
      </div>

      <LichSuViTriBanDo hid={h.id} onBayToi={onBayToi} onApDung={onApDung} />
    </div>
  );
}

/**
 * Lịch sử đổi vị trí, hiện ngay trong ô chi tiết hộ trên bản đồ.
 *
 * Bấm một dòng thì bay tới đúng chỗ lần đó (ghim cam), rồi có nút Áp dụng để đặt
 * lại vị trí hộ về đúng chỗ đó — dùng khi ai đó ghim nhầm và muốn quay về bản cũ.
 *
 * Danh sách cuộn TRONG khung riêng, không đẩy panel dài mãi: hộ đổi vị trí chục
 * lần thì vẫn gọn.
 */
function LichSuViTriBanDo({
  hid,
  onBayToi,
  onApDung,
}: {
  hid: string;
  onBayToi: (lat: number, lng: number) => void;
  onApDung: (lat: number, lng: number) => void;
}) {
  const [mo, setMo] = useState(false);
  const [chonDong, setChonDong] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ['lich-su-vi-tri', hid],
    queryFn: () =>
      get<
        {
          luc: string;
          hanh_dong: string;
          nguoi: string;
          qua_ho_tro: boolean;
          lat: number | null;
          lng: number | null;
          xac_nhan: boolean | null;
          lech_lan_truoc_m: number | null;
        }[]
      >(`/ho-khau/${hid}/lich-su-vi-tri`),
    enabled: mo,
  });

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setMo((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700"
      >
        <History className="h-3.5 w-3.5" />
        Lịch sử thay đổi vị trí
        <ChevronDown
          className={cx('ml-auto h-3.5 w-3.5 transition-transform', mo && 'rotate-180')}
        />
      </button>

      {mo && (
        <div className="mt-2">
          {!data ? (
            <p className="py-2 text-center text-[11px] text-slate-400">Đang tải…</p>
          ) : data.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-slate-400">
              Chưa có lần đổi vị trí nào được ghi lại.
            </p>
          ) : (
            <>
              <ol className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-1.5">
                {data.map((d, i) => {
                  const dangChon = chonDong === i;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={d.lat == null}
                        onClick={() => {
                          if (d.lat == null) return;
                          onBayToi(d.lat, d.lng!);
                          setChonDong(i);
                        }}
                        className={cx(
                          'w-full rounded-lg border p-2 text-left transition-all',
                          dangChon
                            ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300'
                            : i === 0
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-slate-200 bg-white',
                          d.lat != null
                            ? 'cursor-pointer hover:border-orange-300'
                            : 'cursor-default',
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-800">
                            {d.hanh_dong}
                          </span>
                          {i === 0 && (
                            <span className="rounded bg-emerald-600 px-1.5 text-[9px] font-black text-white">
                              HIỆN TẠI
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          <b className="text-slate-700">{d.nguoi}</b>
                          {d.qua_ho_tro && (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                              quản trị nền tảng
                            </span>
                          )}
                          <span className="font-mono"> · {gio(d.luc)}</span>
                        </p>
                        {d.lat != null ? (
                          <p className="mt-0.5 font-mono text-[9.5px] text-slate-400">
                            {d.lat.toFixed(6)}, {d.lng!.toFixed(6)}
                            {d.lech_lan_truoc_m != null && d.lech_lan_truoc_m > 0 && (
                              <span className="ml-1 font-sans font-bold text-amber-600">
                                dịch {d.lech_lan_truoc_m}m
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[9.5px] text-slate-400">
                            Xác nhận vị trí đang có là đúng — không đổi toạ độ
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>

              {/* Chọn một dòng KHÔNG phải hiện tại → cho áp dụng lại vị trí đó */}
              {chonDong != null && chonDong !== 0 && data[chonDong]?.lat != null && (
                <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-2.5">
                  <p className="text-[10.5px] font-medium text-orange-800">
                    Đang xem ghim <b>cam</b> — vị trí lúc <b>{gio(data[chonDong]!.luc)}</b>. Áp dụng
                    thì hộ quay về đúng chỗ này.
                  </p>
                  <Button
                    icon={Check}
                    onClick={() => onApDung(data[chonDong]!.lat!, data[chonDong]!.lng!)}
                    className="mt-2 w-full !bg-orange-600 !py-2 hover:!bg-orange-700"
                  >
                    ÁP DỤNG VỊ TRÍ NÀY
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
