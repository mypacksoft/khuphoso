import { create } from 'zustand';

import { auth, get, post } from './api';
import type { DangNhapKetQua, KhuPhoHienTai, NguoiDung } from './types';

interface AuthState {
  user: NguoiDung | null;
  /** Khu phố ứng với tên miền đang truy cập — dùng cho tên trên thanh bên. */
  khuPho: KhuPhoHienTai | null;
  role: string | null;
  permissions: Set<string>;
  tenant: string;
  ready: boolean;
  dangNhap: (username: string, password: string, tenant: string) => Promise<DangNhapKetQua>;
  dangXuat: () => Promise<void>;
  khoiPhuc: () => Promise<void>;
  napKhuPho: () => Promise<void>;
  nap: (u: NguoiDung) => void;
  can: (perm: string) => boolean;
}

export const useAuth = create<AuthState>((set, get_) => ({
  user: null,
  khuPho: null,
  role: null,
  permissions: new Set(),
  tenant: auth.tenant,
  ready: false,

  can: (perm) => get_().permissions.has(perm),

  nap: (u) => set({ user: u, role: u.role, permissions: new Set(u.permissions), ready: true }),

  /** Tên khu phố lấy được kể cả khi chưa đăng nhập, để trang đăng nhập hiện đúng. */
  napKhuPho: async () => {
    try {
      set({ khuPho: await get<KhuPhoHienTai>('/khu-pho/hien-tai') });
    } catch {
      set({ khuPho: null });
    }
  },

  dangNhap: async (username, password, tenant) => {
    auth.tenant = tenant;
    const d = await post<DangNhapKetQua>('/auth/login', { username, password });
    auth.token = d.access_token;
    set({ role: d.role, permissions: new Set(d.permissions), tenant, ready: true });
    return d;
  },

  dangXuat: async () => {
    try {
      await post('/auth/logout');
    } catch {
      /* kệ, vẫn xoá phía client */
    }
    auth.token = null;
    set({ user: null, role: null, permissions: new Set(), ready: true });
  },

  /** Thử lấy lại phiên từ cookie refresh khi mới mở trang. */
  khoiPhuc: async () => {
    try {
      const d = await post<DangNhapKetQua>('/auth/refresh');
      auth.token = d.access_token;
      set({ role: d.role, permissions: new Set(d.permissions), tenant: auth.tenant });
    } catch {
      auth.token = null;
    } finally {
      set({ ready: true });
    }
  },
}));

interface UiState {
  sidebarMo: boolean;
  dangHien: 'the' | 'bang';
  toggleSidebar: () => void;
  dongSidebar: () => void;
  doiDangHien: (d: 'the' | 'bang') => void;
}

export const useUi = create<UiState>((set) => ({
  sidebarMo: false,
  // Cán bộ chọn dạng hiển thị một lần rồi giữ nguyên qua các màn hình
  dangHien: (localStorage.getItem('kp_dang_hien') as 'the' | 'bang') ?? 'bang',
  toggleSidebar: () => set((s) => ({ sidebarMo: !s.sidebarMo })),
  dongSidebar: () => set({ sidebarMo: false }),
  doiDangHien: (d) => {
    localStorage.setItem('kp_dang_hien', d);
    set({ dangHien: d });
  },
}));
