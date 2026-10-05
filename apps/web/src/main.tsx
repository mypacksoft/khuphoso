import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/ui';
import { Login } from '@/features/auth/Login';
import { TaiKhoan } from '@/features/auth/TaiKhoan';
import { CongKhai } from '@/features/danchu/CongKhai';
import { PhanAnh } from '@/features/phananh/PhanAnh';
import { HoiNghi } from '@/features/danchu/HoiNghi';
import { DoanThe } from '@/features/doanthe/DoanThe';
import { Quy } from '@/features/funds/Quy';
import { KeHoach } from '@/features/hoatdong/KeHoach';
import { KinhDoanh } from '@/features/hoatdong/KinhDoanh';
import { LichHop } from '@/features/hoatdong/LichHop';
import { Ho } from '@/features/households/Ho';
import { CoSoTro } from '@/features/lodging/CoSoTro';
import { SuKien } from '@/features/events/SuKien';
import { BanDo } from '@/features/map/BanDo';
import { XacMinhTuyen } from '@/features/map/XacMinhTuyen';
import { NhanKhau } from '@/features/residents/NhanKhau';
import { NhapExcel } from '@/features/residents/NhapExcel';
import { ToDanPho } from '@/features/residents/ToDanPho';
import { CongThongTin } from '@/features/system/CongThongTin';
import { NhatKy } from '@/features/system/NhatKy';
import { TaiKhoanKhuPho } from '@/features/system/TaiKhoanKhuPho';
import { ChuyenKhuPho } from '@/features/residents/ChuyenKhuPho';
import { TongQuan } from '@/features/TongQuan';
import { GiayPhep, type GiayPhepTrangThai } from '@/features/GiayPhep';
import { VanBan } from '@/features/vanban/VanBan';
import { get, ghiLuotXem, tenantCoDinh } from '@/lib/api';
import { PortalApp } from '@/portal/PortalApp';
import { useAuth } from '@/lib/store';
import type { NguoiDung } from '@/lib/types';

import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => n < 2 && !(e instanceof Error && /401|403/.test(e.message)),
      refetchOnWindowFocus: false,
    },
  },
});

/** Chặn cửa: chưa đăng nhập thì hiện màn hình đăng nhập, không dựng gì khác. */
function Cong() {
  const { user, ready, khoiPhuc, nap, napKhuPho } = useAuth();
  const duong = useRouterState({ select: (s) => s.location.pathname });

  // Ghi lượt mở trang mỗi khi đổi màn hình. Chỉ đường dẫn, không kèm ai.
  useEffect(() => {
    if (ready) ghiLuotXem(duong);
  }, [duong, ready]);

  useEffect(() => {
    void (async () => {
      // Tên khu phố lấy được kể cả khi chưa đăng nhập, để trang đăng nhập hiện đúng.
      // Trang nền tảng không thuộc khu phố nào nên bỏ qua — hỏi cũng chỉ nhận 400.
      void napKhuPho();
      await khoiPhuc();
      try {
        nap(await get<NguoiDung>('/auth/me'));
      } catch {
        /* chưa đăng nhập */
      }
    })();
  }, [khoiPhuc, nap, napKhuPho]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Spinner label="Đang khôi phục phiên làm việc…" />
      </div>
    );
  }
  if (!user) return <Login />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/**
 * Cổng kích hoạt — bọc NGOÀI cả trang quản trị lẫn cổng cư dân.
 *
 * Hỏi máy chủ phần mềm đã kích hoạt chưa. Chưa thì hiện màn hình hướng dẫn lấy key
 * thay cho toàn bộ ứng dụng. Việc chặn THẬT nằm ở máy chủ; đây chỉ là giao diện —
 * nên khi không hỏi được (mạng/CSDL trục trặc) thì vẫn cho dựng ứng dụng, các API
 * nghiệp vụ sẽ tự trả 403 nếu chưa kích hoạt.
 */
function CongKichHoat({ children }: { children: React.ReactNode }) {
  const [tt, setTt] = useState<GiayPhepTrangThai | null>(null);
  const [xong, setXong] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setTt(await get<GiayPhepTrangThai>('/giay-phep/trang-thai'));
      } catch {
        setTt(null);
      } finally {
        setXong(true);
      }
    })();
  }, []);

  if (!xong) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Spinner label="Đang kiểm tra kích hoạt…" />
      </div>
    );
  }
  if (tt && !tt.kich_hoat) return <GiayPhep tt={tt} />;
  return <>{children}</>;
}

const rootRoute = createRootRoute({ component: Cong });

/**
 * Khai báo từng route một cách tường minh (không dùng hàm bọc) để TanStack Router
 * suy được kiểu đường dẫn — nhờ vậy `<Link to="/quy">` sai chính tả là báo lỗi
 * ngay khi biên dịch, chứ không đợi tới lúc bấm mới ra trang trắng.
 */
const routes = [
  // Trên admin.khuphoso.vn không có khu phố nào, nên trang gốc là danh sách khu phố
  // chứ không phải tổng quan — tổng quan sẽ hỏi máy chủ về một khu phố không tồn tại.
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: TongQuan }),

  // Bốn diện cư trú của nhân khẩu — bốn màn hình riêng, không phải một bộ lọc
  createRoute({ getParentRoute: () => rootRoute, path: '/nhan-khau/$dien', component: NhanKhau }),
  // Hộ khẩu thường trú và hộ tạm trú
  createRoute({ getParentRoute: () => rootRoute, path: '/ho/$dien', component: Ho }),
  // Năm khối đoàn thể & chính sách
  createRoute({ getParentRoute: () => rootRoute, path: '/doan-the/$khoi', component: DoanThe }),

  createRoute({ getParentRoute: () => rootRoute, path: '/kinh-doanh', component: KinhDoanh }),
  createRoute({ getParentRoute: () => rootRoute, path: '/co-so-tro', component: CoSoTro }),
  createRoute({ getParentRoute: () => rootRoute, path: '/lich-hop', component: LichHop }),
  createRoute({ getParentRoute: () => rootRoute, path: '/su-kien', component: SuKien }),
  createRoute({ getParentRoute: () => rootRoute, path: '/dan-chu/hoi-nghi', component: HoiNghi }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/dan-chu/cong-khai',
    component: CongKhai,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/ke-hoach', component: KeHoach }),
  // Một màn hình cho cả hai chiều; `$chieu` là 'den' hoặc 'di'
  createRoute({ getParentRoute: () => rootRoute, path: '/van-ban/$chieu', component: VanBan }),

  createRoute({
    getParentRoute: () => rootRoute,
    path: '/chuyen-khu-pho',
    component: ChuyenKhuPho,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/ban-do', component: BanDo }),
  createRoute({ getParentRoute: () => rootRoute, path: '/phan-anh', component: PhanAnh }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/xac-minh-tuyen',
    component: XacMinhTuyen,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/to-dan-pho', component: ToDanPho }),
  createRoute({ getParentRoute: () => rootRoute, path: '/nhap-excel', component: NhapExcel }),
  createRoute({ getParentRoute: () => rootRoute, path: '/quy', component: Quy }),

  createRoute({
    getParentRoute: () => rootRoute,
    path: '/he-thong/tai-khoan',
    component: TaiKhoanKhuPho,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/he-thong/nhat-ky', component: NhatKy }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/he-thong/cong-thong-tin',
    component: CongThongTin,
  }),

  createRoute({ getParentRoute: () => rootRoute, path: '/tai-khoan', component: TaiKhoan }),
];

// Subdomain khu phố: GỐC là Cổng cư dân công khai, /quanly là trang quản trị.
// admin.khuphoso.vn (nền tảng) không có cổng công khai — vào thẳng quản trị ở gốc.
const coPortal = !!tenantCoDinh;
const laQuanLy =
  typeof location !== 'undefined' &&
  (location.pathname === '/quanly' || location.pathname.startsWith('/quanly/'));

const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  basepath: coPortal ? '/quanly' : undefined,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/**
 * Đăng ký service worker để cài được lên màn hình chính điện thoại.
 *
 * Chạy sau khi trang đã tải xong để không tranh băng thông với lần mở đầu tiên.
 * Chỉ ở bản dựng thật — lúc phát triển, service worker giữ lại tệp cũ gây khó hiểu.
 */
/**
 * Tự chữa khi kẹt bản cũ.
 *
 * Cloudflare đứng trước máy chủ và đệm tệp tĩnh, nên sau một lần triển khai có thể
 * còn máy chạy gói JS cũ vài tiếng. Mỗi lần mở, đối chiếu mã lần dựng đang chạy với
 * mã trên máy chủ; lệch thì xoá bộ đệm, gỡ service worker rồi nạp lại đúng MỘT lần
 * (đánh dấu bằng sessionStorage để không rơi vào vòng lặp nạp lại).
 */
async function kiemTraBanMoi() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { ma } = (await r.json()) as { ma: string };
    if (!ma || ma === __MA_BAN_DUNG__) return;
    if (sessionStorage.getItem('kp_da_nap_lai') === ma) return;
    sessionStorage.setItem('kp_da_nap_lai', ma);

    const dk = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((dk ?? []).map((x) => x.unregister()));
    const ten = await caches.keys();
    await Promise.all(ten.map((t) => caches.delete(t)));
    location.reload();
  } catch {
    /* không kiểm được thì thôi, ứng dụng vẫn chạy */
  }
}

if (import.meta.env.PROD) {
  window.addEventListener('load', () => void kiemTraBanMoi());
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // `?v=` để Cloudflare không trả bản cũ; `updateViaCache: 'none'` để trình duyệt
    // cũng không dùng bộ đệm HTTP cho chính tệp service worker.
    void navigator.serviceWorker
      .register(`/sw.js?v=${__MA_BAN_DUNG__}`, { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        /* không cài được cũng không sao, ứng dụng vẫn chạy bình thường */
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <CongKichHoat>
        {coPortal && !laQuanLy ? <PortalApp /> : <RouterProvider router={router} />}
      </CongKichHoat>
    </QueryClientProvider>
  </StrictMode>,
);
