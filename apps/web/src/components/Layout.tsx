/**
 * Khung ứng dụng: thanh bên 280px cố định + thanh trên cao 48px cố định.
 *
 * Vùng làm việc chạy hết bề ngang, KHÔNG bó vào `max-w-7xl` như bố cục trang web
 * thông thường. Đây là công cụ nhập liệu: bảng nhân khẩu 10 cột, bản đồ, sổ hộ
 * khẩu — thứ gì cũng thèm chỗ. Bó lại thì màn 24 inch của cán bộ bỏ phí hai bên.
 *
 * Lề trong cũng để nhỏ (12–16px) thay vì 32px vì lý do tương tự.
 *
 * Tiêu đề và ô tìm kiếm trên thanh trên do TỪNG màn hình quyết định, nên màn hình
 * đăng ký chúng qua `useManHinh()` thay vì Layout tự đoán từ đường dẫn.
 */

import type { ReactNode } from 'react';
import { create } from 'zustand';

import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CanhBao } from '@/components/ui';
import { useAuth } from '@/lib/store';

interface ManHinhState {
  tieu_de: string;
  goi_y_tim: string;
  tim: string;
  nhanTim: ((v: string) => void) | null;
  dat: (v: { tieu_de: string; goi_y_tim?: string; nhanTim?: (v: string) => void }) => void;
  datTim: (v: string) => void;
}

/** Cầu nối giữa màn hình đang mở và thanh trên. */
export const useManHinh = create<ManHinhState>((set) => ({
  tieu_de: 'Tổng quan',
  goi_y_tim: 'Tìm kiếm…',
  tim: '',
  nhanTim: null,
  dat: ({ tieu_de, goi_y_tim, nhanTim }) =>
    set({
      tieu_de,
      goi_y_tim: goi_y_tim ?? 'Tìm kiếm…',
      nhanTim: nhanTim ?? null,
      tim: '',
    }),
  datTim: (v) => set({ tim: v }),
}));

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tieu_de, goi_y_tim, tim, nhanTim, datTim } = useManHinh();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />

      <Topbar
        tieu_de={tieu_de}
        goi_y_tim={goi_y_tim}
        tim={tim}
        onTim={
          nhanTim
            ? (v) => {
                datTim(v);
                nhanTim(v);
              }
            : undefined
        }
      />

      <div className="pt-12 lg:pl-[280px]">
        <main className="space-y-4 p-3 sm:p-4">
          {user?.ho_tro && (
            <CanhBao loai="canh" emoji="🔑" className="khong-in">
              Bạn đang vào bằng tài khoản nền tảng để hỗ trợ, không phải thành viên của khu phố
              này. Mọi thao tác đều được ghi vào nhật ký của khu phố với dấu “hỗ trợ”.
            </CanhBao>
          )}
          {children}
        </main>

        <footer className="khong-in px-3 pb-4 text-center text-[10.5px] font-medium text-slate-400 sm:px-4">
          KhuPhoSo · dự án phi lợi nhuận · toàn bộ thu chi công khai tại{' '}
          <a
            href="https://minhbach.khuphoso.vn"
            className="font-bold text-slate-500 hover:text-blue-800 transition-colors"
          >
            minhbach.khuphoso.vn
          </a>
        </footer>
      </div>
    </div>
  );
}
