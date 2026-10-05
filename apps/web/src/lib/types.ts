/** Kiểu dữ liệu khớp với API. Sẽ thay bằng bản sinh tự động từ OpenAPI ở Phase 5. */

export type VaiTro = 'quan_tri' | 'ban_dieu_hanh' | 'to_truong' | 'can_bo' | 'chi_xem';

export interface DangNhapKetQua {
  access_token: string;
  full_name: string;
  role: VaiTro | null;
  tenant: string | null;
  permissions: string[];
  must_change_password: boolean;
  ho_tro?: boolean;
}

export interface NguoiDung {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  full_name: string;
  role: string | null;
  permissions: string[];
  is_platform_admin: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  ho_tro?: boolean;
}

export interface ToDanPho {
  id: string;
  code: string;
  name: string;
  leader_name: string | null;
  phone: string | null;
  sort_order: number;
  so_nhan_khau: number;
  so_ho: number;
}

export interface PhanLoai {
  code: string;
  name: string;
  color: string | null;
  /** Khối đoàn thể: chi_bo | chinh_quyen | doan_the | chinh_sach | nhom_khac */
  khoi?: string | null;
  is_sensitive?: boolean;
}

export interface CuDan {
  id: string;
  full_name: string;
  dob: string | null;
  tuoi: number | null;
  gender: 'nam' | 'nu' | 'khac' | null;
  residence_status: 'thuong_tru' | 'tam_tru' | 'tam_vang' | 'vang_lai';
  phone: string | null;
  occupation: string | null;
  is_head: boolean;
  relation_to_head: string | null;
  id_card_last4: string | null;
  to_dan_pho: string | null;
  ma_ho: string | null;
  dia_chi: string | null;
  /** Ghi chú. Bắt đầu bằng ⚠ nghĩa là hồ sơ cần cán bộ rà lại. */
  note?: string | null;
  /** Ngày hết hạn đăng ký tạm trú. Chỉ có với diện tạm trú. */
  tam_tru_den_ngay?: string | null;
  /** Số ngày còn lại; số âm là đã quá hạn ngần ấy ngày. Máy chủ tính. */
  con_ngay_tam_tru?: number | null;
  phan_loai: PhanLoai[];
}

export interface CuDanChiTiet extends Omit<CuDan, 'phan_loai' | 'tuoi'> {
  email: string | null;
  /** Địa chỉ và tên chủ hộ KHAI lúc nhập liệu, dùng để gom thành hộ về sau. */
  dia_chi_khai: string | null;
  ten_chu_ho_khai: string | null;
  tam_tru_tu_ngay?: string | null;
  tam_tru_den_ngay?: string | null;
  con_ngay_tam_tru?: number | null;
  education_level: string | null;
  note: string | null;
  household_id: string | null;
  group_id: string | null;
  id_card?: string | null;
  created_at: string;
  updated_at: string;
  phan_loai: (PhanLoai & { valid_from: string | null; note: string | null })[];
  thanh_vien_ho?: {
    id: string;
    full_name: string;
    relation_to_head: string | null;
    dob: string | null;
    gender: string | null;
    is_head: boolean;
  }[];
}

export interface DanhSach<T> {
  tong_so: number;
  limit: number;
  offset: number;
  items: T[];
}

export interface ThongKe {
  cu_dan: {
    tong: number;
    nam: number;
    nu: number;
    thuong_tru: number;
    tam_tru: number;
    tre_em: number;
    nct: number;
    co_dien_thoai: number;
  };
  ho_khau: {
    tong_ho: number;
    da_kiem_chung: number;
    so_bo: number;
    chua_dinh_vi: number;
  };
  theo_to: { name: string; so_nguoi: number }[];
  theo_phan_loai: { code: string; name: string; color: string | null; so_nguoi: number }[];
}

/** Số liệu TỔNG của toàn bộ quỹ khu phố — `/quy/tong-quan` trả về một đối tượng. */
export interface QuyTongQuan {
  tong_thu: number;
  tong_chi: number;
  so_du: number;
  dau_ky: number;
  so_quy: number;
  thu_thang_nay: number;
  chi_thang_nay: number;
}

export interface Ho {
  id: string;
  code: string;
  address: string | null;
  phone: string | null;
  geo_status: string;
  household_type: 'thuong_tru' | 'tam_tru';
  group_id: string | null;
  to_dan_pho: string | null;
  chu_ho: string | null;
  dt_chu_ho: string | null;
  so_nhan_khau: number;
  toa_do: { lat: number; lng: number } | null;  /** Hạn tạm trú của hộ = hạn XA NHẤT trong các thành viên. */
  han_tam_tru?: string | null;
  con_ngay_tam_tru?: number | null;
}

export interface HoChiTiet extends Omit<Ho, 'chu_ho' | 'dt_chu_ho' | 'so_nhan_khau'> {
  residence_type: string | null;
  note: string | null;
  head_resident_id: string | null;
  geo_source: string | null;
  geo_accuracy_m: number | null;
  geo_updated_at: string | null;
  created_at: string;
  updated_at: string;
  thanh_vien: {
    id: string;
    full_name: string;
    dob: string | null;
    gender: string | null;
    relation_to_head: string | null;
    is_head: boolean;
    phone: string | null;
    occupation: string | null;
    residence_status: string;
    id_card_last4: string | null;
    tuoi: number | null;
    phan_loai: PhanLoai[];
  }[];
}

export const TRANG_THAI_DINH_VI: Record<string, { nhan: string; mau: string }> = {
  pending: { nhan: 'Chưa định vị', mau: 'slate' },
  auto: { nhan: 'Sơ bộ tự động', mau: 'amber' },
  verified: { nhan: 'Đã kiểm chứng', mau: 'emerald' },
  manual: { nhan: 'Ghim thủ công', mau: 'blue' },
  failed: { nhan: 'Không tìm được', mau: 'rose' },
};

export interface KhuPhoHienTai {
  slug: string;
  name: string;
  ward?: string | null;
  status: string;
  settings: { quoc_hieu?: string; tieu_ngu?: string; logo_url?: string; mau_chu_dao?: string };
}

/** Một dòng trong chuông thông báo — việc còn tồn của khu phố. */
export interface ThongBao {
  id: string;
  nhom: string;
  nhan: string;
  muc: 'gap' | 'canh' | 'tin';
  tieu_de: string;
  mo_ta: string;
}

export interface KhuPho {
  slug: string;
  name: string;
  ward: string | null;
  status: string;
  muc_dong_gop: string | null;
  so_tai_khoan: number;
  created_at: string;
}

export const DIEN_CU_TRU: Record<string, string> = {
  thuong_tru: 'Thường trú',
  tam_tru: 'Tạm trú',
  tam_vang: 'Tạm vắng',
  vang_lai: 'Vãng lai',
};

export const GIOI_TINH: Record<string, string> = {
  nam: 'Nam',
  nu: 'Nữ',
  khac: 'Khác',
};

export const QUAN_HE: Record<string, string> = {
  chu_ho: 'Chủ hộ',
  vo_chong: 'Vợ/chồng',
  con: 'Con',
  cha_me: 'Cha/mẹ',
  khac: 'Khác',
};
