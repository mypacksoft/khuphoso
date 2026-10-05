/**
 * Cấu trúc điều hướng — dựng lại theo app cũ `khu-phố-smart_1/src/components/Sidebar.tsx`.
 *
 * Hai điều lấy nguyên từ bản cũ, đều đi ngược trực giác thiết kế thông thường
 * nhưng đúng với cách cán bộ khu phố làm việc:
 *
 * 1. **Cư dân không phải một danh sách phẳng có bộ lọc.** Cán bộ làm theo diện
 *    cư trú (thường trú / tạm trú / tạm vắng / vãng lai) và theo đơn vị (hộ hay
 *    nhân khẩu). Sáu tổ hợp đó là sáu màn hình riêng trong đầu họ.
 *
 * 2. **Emoji ở nhãn mục con.** Nhìn thì "không chuyên nghiệp", nhưng cán bộ quét
 *    mắt tìm mục nhanh hơn hẳn so với danh sách chữ thuần.
 */

import {
  ArrowLeftRight,
  Award,
  Briefcase,
  Calendar,
  FileText,
  Gift,
  Globe,
  Landmark,
  Grid,
  Key,
  Navigation,
  PiggyBank,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface MucCon {
  nhan: string;
  to: string;
  quyen?: string;
}

export interface Muc {
  id: string;
  nhan: string;
  to?: string;
  icon: LucideIcon;
  quyen?: string;
  con?: MucCon[];
}

export const DIEU_HUONG: Muc[] = [
  { id: 'tong-quan', nhan: 'Tổng quan', to: '/', icon: Grid },

  {
    id: 'dan-cu',
    nhan: 'Dân cư & Hộ khẩu',
    icon: Users,
    quyen: 'resident:read',
    con: [
      { nhan: '👤 Nhân khẩu thường trú', to: '/nhan-khau/thuong-tru' },
      { nhan: '🏡 Hộ khẩu', to: '/ho/thuong-tru', quyen: 'household:read' },
      { nhan: '⏳ Nhân khẩu tạm trú', to: '/nhan-khau/tam-tru' },
      { nhan: '🏠 Hộ tạm trú', to: '/ho/tam-tru', quyen: 'household:read' },
      { nhan: '🏨 Cơ sở trọ', to: '/co-so-tro', quyen: 'household:read' },
      { nhan: '🚶 Tạm vắng', to: '/nhan-khau/tam-vang' },
      { nhan: '👣 Vãng lai', to: '/nhan-khau/vang-lai' },
      { nhan: '🏘️ Tổ dân phố', to: '/to-dan-pho' },
      { nhan: '📥 Nhập từ Excel', to: '/nhap-excel' },
    ],
  },

  {
    id: 'doan-the',
    nhan: 'Đoàn thể & Chính sách',
    icon: Award,
    quyen: 'resident:read',
    con: [
      { nhan: '🚩 Chi Bộ', to: '/doan-the/chi-bo' },
      { nhan: '🛡️ Chính Quyền', to: '/doan-the/chinh-quyen' },
      { nhan: '💚 Đoàn Thể', to: '/doan-the/doan-the' },
      { nhan: '📘 Chính sách', to: '/doan-the/chinh-sach' },
      { nhan: '👥 Nhóm Khác', to: '/doan-the/nhom-khac' },
    ],
  },

  {
    id: 'kinh-doanh',
    nhan: 'Cơ sở kinh doanh',
    to: '/kinh-doanh',
    icon: Briefcase,
    quyen: 'business:read',
  },
  { id: 'lich-hop', nhan: 'Lịch họp', to: '/lich-hop', icon: Calendar, quyen: 'meeting:read' },
  { id: 'su-kien', nhan: 'Sự kiện & khách mời', to: '/su-kien', icon: Gift, quyen: 'resident:read' },

  {
    id: 'chuyen-khu-pho',
    nhan: 'Chuyển & tiếp nhận',
    to: '/chuyen-khu-pho',
    icon: ArrowLeftRight,
    quyen: 'resident:read',
  },

  {
    id: 'dan-chu',
    nhan: 'Dân chủ cơ sở',
    icon: Landmark,
    quyen: 'meeting:read',
    con: [
      { nhan: '🗳️ Hội nghị nhân dân', to: '/dan-chu/hoi-nghi' },
      { nhan: '📋 Nội dung công khai', to: '/dan-chu/cong-khai' },
    ],
  },

  {
    id: 'van-ban',
    nhan: 'Văn bản',
    icon: FileText,
    quyen: 'document:read',
    con: [
      { nhan: '📥 Văn bản đến', to: '/van-ban/den' },
      { nhan: '📤 Văn bản đi', to: '/van-ban/di' },
    ],
  },

  {
    id: 'dia-chi-so',
    nhan: 'Địa chỉ số',
    icon: Navigation,
    quyen: 'household:read',
    con: [
      { nhan: '🗺️ Bản đồ khu phố', to: '/ban-do' },
      {
        nhan: '📍 Xác minh theo tuyến',
        to: '/xac-minh-tuyen',
        quyen: 'household:write',
      },
      { nhan: '📣 Phản ánh hiện trường', to: '/phan-anh', quyen: 'resident:read' },
    ],
  },
  { id: 'quy', nhan: 'Quỹ khu phố', to: '/quy', icon: PiggyBank, quyen: 'fund:read' },
  {
    id: 'cong-thong-tin',
    nhan: 'Cổng thông tin & Biểu mẫu',
    to: '/he-thong/cong-thong-tin',
    icon: Globe,
    quyen: 'settings:write',
  },

  {
    id: 'he-thong',
    nhan: 'Phân quyền & Nhật ký',
    icon: Key,
    // Nhóm hiện khi có ÍT NHẤT một mục con; từng mục lại tự kiểm quyền của nó
    con: [
      { nhan: '👤 Quản lý tài khoản', to: '/he-thong/tai-khoan', quyen: 'user:read' },
      { nhan: '📝 Nhật ký hệ thống', to: '/he-thong/nhat-ky', quyen: 'audit:read' },
    ],
  },
];

/** Màu viền và màu chữ cho nhóm con của từng khối đoàn thể — theo app cũ. */
export const MAU_KHOI: Record<string, { vien: string; chon: string; thuong: string }> = {
  chi_bo: {
    vien: 'border-red-200/80',
    chon: 'text-red-700 bg-red-50/70',
    thuong: 'text-slate-400 hover:text-red-600 hover:bg-red-50/30',
  },
  chinh_quyen: {
    vien: 'border-blue-200/80',
    chon: 'text-blue-700 bg-blue-50/70',
    thuong: 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/30',
  },
  doan_the: {
    vien: 'border-green-200/80',
    chon: 'text-green-700 bg-green-50/70',
    thuong: 'text-slate-400 hover:text-green-600 hover:bg-green-50/30',
  },
  chinh_sach: {
    vien: 'border-teal-200/80',
    chon: 'text-teal-700 bg-teal-50/70',
    thuong: 'text-slate-400 hover:text-teal-600 hover:bg-teal-50/30',
  },
  nhom_khac: {
    vien: 'border-purple-200/80',
    chon: 'text-purple-700 bg-purple-50/70',
    thuong: 'text-slate-400 hover:text-purple-600 hover:bg-purple-50/30',
  },
};

/** Năm khối đoàn thể và nhóm mặc định của từng khối. */
export const KHOI_DOAN_THE: Record<
  string,
  { nhan: string; emoji: string; khoi: string; mac_dinh: string }
> = {
  'chi-bo': { nhan: 'Chi Bộ', emoji: '🚩', khoi: 'chi_bo', mac_dinh: 'dang_vien' },
  'chinh-quyen': {
    nhan: 'Chính Quyền',
    emoji: '🛡️',
    khoi: 'chinh_quyen',
    mac_dinh: 'ban_dieu_hanh',
  },
  'doan-the': { nhan: 'Đoàn Thể', emoji: '💚', khoi: 'doan_the', mac_dinh: 'ban_cong_tac' },
  'chinh-sach': {
    nhan: 'Chính sách',
    emoji: '📘',
    khoi: 'chinh_sach',
    mac_dinh: 'nguoi_co_cong',
  },
  'nhom-khac': { nhan: 'Nhóm Khác', emoji: '👥', khoi: 'nhom_khac', mac_dinh: 'to_lien_gia_pccc' },
};

/** Diện cư trú của NHÂN KHẨU: đường dẫn ↔ giá trị API ↔ nhãn hiển thị. */
export const DIEN_NHAN_KHAU: Record<
  string,
  { api: string; nhan: string; emoji: string; mo_ta: string }
> = {
  'thuong-tru': {
    api: 'thuong_tru',
    nhan: 'Nhân khẩu thường trú',
    emoji: '👤',
    mo_ta: 'Danh sách nhân khẩu đăng ký thường trú tại khu phố',
  },
  'tam-tru': {
    api: 'tam_tru',
    nhan: 'Nhân khẩu tạm trú',
    emoji: '⏳',
    mo_ta: 'Người đăng ký tạm trú có thời hạn trên địa bàn',
  },
  'tam-vang': {
    api: 'tam_vang',
    nhan: 'Tạm vắng',
    emoji: '🚶',
    mo_ta: 'Nhân khẩu thường trú đang khai báo tạm vắng',
  },
  'vang-lai': {
    api: 'vang_lai',
    nhan: 'Vãng lai',
    emoji: '👣',
    mo_ta: 'Người lưu trú ngắn ngày, chưa đăng ký cư trú',
  },
};

/** Diện cư trú của HỘ. */
export const DIEN_HO: Record<string, { api: string; nhan: string; emoji: string; mo_ta: string }> =
  {
    'thuong-tru': {
      api: 'thuong_tru',
      nhan: 'Sổ hộ khẩu thường trú',
      emoji: '🏡',
      mo_ta: 'Quản lý hộ gia đình đăng ký thường trú, tách nhập hộ theo số nhà',
    },
    'tam-tru': {
      api: 'tam_tru',
      nhan: 'Hộ tạm trú',
      emoji: '🏠',
      mo_ta: 'Hộ thuê trọ, ở nhờ, đăng ký tạm trú trên địa bàn khu phố',
    },
  };
