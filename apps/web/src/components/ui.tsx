/**
 * Thành phần dùng chung — dựng lại đúng mẫu của app cũ `khu-phố-smart_1`.
 *
 * Các con số ở đây không tuỳ tiện, chúng lấy từ mã nguồn cũ:
 *   thẻ        bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
 *   nút chính  px-4 py-2 bg-blue-800 rounded-xl font-bold text-xs shadow, nhãn IN HOA
 *   bảng       thead bg-[#f8f9ff]/80 · th px-6 py-4 font-bold text-slate-500
 *              tbody divide-y divide-slate-150 · tr hover:bg-slate-50/50
 *   ô trống    ghi "Chưa cập nhật", không dùng dấu gạch ngang
 */

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ══════════════════════════════════════════════════════════════════ Nút ══ */

type NutMau = 'chinh' | 'xam' | 'luc' | 'do' | 'trang';

const NUT: Record<NutMau, string> = {
  chinh: 'bg-blue-800 hover:bg-blue-700 text-white shadow',
  xam: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  luc: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow',
  do: 'bg-rose-600 hover:bg-rose-700 text-white shadow shadow-rose-600/10',
  trang: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm',
};

export function Button({
  mau = 'chinh',
  icon: Icon,
  className,
  children,
  ...p
}: ComponentProps<'button'> & { mau?: NutMau; icon?: LucideIcon }) {
  return (
    <button
      {...p}
      className={cx(
        'px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 justify-center',
        'transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none',
        'active:scale-[.98]',
        NUT[mau],
        className,
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </button>
  );
}

/** Nút biểu tượng trên từng dòng bảng: xem, chỉ đường, sửa, xoá. */
export function NutIcon({
  icon: Icon,
  mau = 'text-slate-500',
  className,
  ...p
}: ComponentProps<'button'> & { icon: LucideIcon; mau?: string }) {
  return (
    <button
      {...p}
      className={cx(
        'w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg',
        'cursor-pointer transition-colors shrink-0',
        mau,
        className,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════ Nhập liệu ══ */

const O =
  'w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 ' +
  'placeholder:text-slate-400 transition-all font-medium ' +
  'focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ' +
  'disabled:bg-slate-50 disabled:text-slate-400';

export const Input = ({ className, ...p }: ComponentProps<'input'>) => (
  <input {...p} className={cx(O, className)} />
);

export const Textarea = ({ className, ...p }: ComponentProps<'textarea'>) => (
  <textarea {...p} className={cx(O, 'resize-y min-h-20 leading-relaxed', className)} />
);

/** Ô chọn: app cũ dùng nền xám nhạt + chữ đậm để phân biệt với ô gõ. */
export const Select = ({ className, ...p }: ComponentProps<'select'>) => (
  <select
    {...p}
    className={cx(
      'w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold',
      'text-slate-700 cursor-pointer transition-all',
      'focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100',
      className,
    )}
  />
);

export function Truong({
  nhan,
  bat_buoc,
  loi,
  ghi_chu,
  children,
}: {
  nhan: string;
  bat_buoc?: boolean;
  loi?: string | null;
  ghi_chu?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-500">
        {nhan}
        {bat_buoc && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      {children}
      {ghi_chu && !loi && <p className="text-[10px] text-slate-400 font-medium">{ghi_chu}</p>}
      {loi && <p className="text-[10.5px] text-rose-600 font-semibold">{loi}</p>}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ Thẻ ══ */

export const Card = ({ className, ...p }: ComponentProps<'div'>) => (
  <div {...p} className={cx('bg-white border border-slate-200 rounded-2xl shadow-sm', className)} />
);

/**
 * Thanh tiêu đề đầu mỗi màn hình: tên phân hệ bên trái, nút thao tác bên phải.
 * App cũ đặt nó trong một thẻ riêng chứ không để trần trên nền trang.
 */
/**
 * Thanh tiêu đề của mọi màn hình, kèm khối bộ lọc GẤP LẠI ĐƯỢC.
 *
 * Trên điện thoại, ba ô lọc xếp dọc chiếm gần hết màn hình — cán bộ phải cuộn
 * qua chúng mỗi lần vào, dù chín trên mười lần không đổi bộ lọc nào. Nên mặc
 * định gấp lại, bấm mới mở.
 *
 * ĐANG LỌC THÌ PHẢI THẤY. Gấp bộ lọc mà không báo gì thì người ta nhìn danh
 * sách thiếu, tưởng mất dữ liệu. Nút hiện luôn số bộ lọc đang bật.
 */
export function ThanhTieuDe({
  tieu_de,
  mo_ta,
  children,
  duoi,
  so_loc_dang_bat = 0,
}: {
  tieu_de: string;
  mo_ta?: string;
  children?: ReactNode;
  duoi?: ReactNode;
  /** Số bộ lọc đang khác mặc định — hiện trên nút để không ai lọc nhầm mà không biết */
  so_loc_dang_bat?: number;
}) {
  // Đang lọc thì mở sẵn: người ta vừa đặt bộ lọc, giấu đi là khó hiểu
  const [mo, setMo] = useState(so_loc_dang_bat > 0);

  return (
    <Card className="p-3.5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        {/* Tên và mô tả nằm chung một dòng trên màn rộng: xếp chồng làm khối
            tiêu đề cao gấp đôi trên MỌI màn hình, mà thanh trên đã nói tên rồi. */}
        <div className="flex min-w-0 flex-col gap-x-2.5 sm:flex-row sm:items-baseline">
          <h3 className="text-[13px] font-bold tracking-tight text-slate-800 uppercase">
            {tieu_de}
          </h3>
          {mo_ta && <p className="truncate text-[11px] font-medium text-slate-500">{mo_ta}</p>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {duoi && (
            <button
              onClick={() => setMo((v) => !v)}
              title={mo ? 'Thu gọn bộ lọc' : 'Mở bộ lọc'}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-[11.5px] font-bold transition-all',
                so_loc_dang_bat > 0
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
              {so_loc_dang_bat > 0 && (
                <span className="rounded-full bg-blue-700 px-1.5 text-[10px] font-black text-white">
                  {so_loc_dang_bat}
                </span>
              )}
              <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', mo && 'rotate-180')} />
            </button>
          )}
          {children}
        </div>
      </div>
      {duoi && mo && <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">{duoi}</div>}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════ Thẻ số liệu ══ */

/**
 * Màu ô icon của thẻ số liệu. Khi rê chuột, ô đặc lại và chữ trắng — cùng một
 * chuyển động với bản tham khảo, giúp thẻ "sống" chứ không phẳng lì.
 */
const O_ICON: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white',
  indigo: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white',
  pink: 'bg-pink-50 text-pink-700 group-hover:bg-pink-600 group-hover:text-white',
  amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-500 group-hover:text-white',
  emerald: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white',
  rose: 'bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white',
  violet: 'bg-violet-50 text-violet-700 group-hover:bg-violet-600 group-hover:text-white',
  slate: 'bg-slate-100 text-slate-500 group-hover:bg-slate-600 group-hover:text-white',
};

export function ONumber({
  nhan,
  gia_tri,
  phu,
  phu_mau = 'text-slate-500',
  xu_huong,
  xu_huong_mau = 'text-emerald-600',
  icon: Icon,
  mau = 'blue',
  onClick,
}: {
  nhan: string;
  gia_tri: ReactNode;
  phu?: ReactNode;
  phu_mau?: string;
  /** Pill nhỏ cạnh con số: "+1.2%", "3 mới", "cần xử lý"… */
  xu_huong?: ReactNode;
  xu_huong_mau?: string;
  icon: LucideIcon;
  mau?: keyof typeof O_ICON;
  /** Có hàm này thì cả thẻ bấm được (nhảy sang màn hình liên quan). */
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cx(
        'group flex flex-col gap-3 p-4 transition-all duration-300',
        'hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5',
        onClick && 'cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="pt-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          {nhan}
        </span>
        <div
          className={cx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-300',
            O_ICON[mau],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <strong className="text-2xl leading-none font-bold text-slate-900 tabular-nums">
          {gia_tri}
        </strong>
        {xu_huong && (
          <span className={cx('text-[11px] font-bold', xu_huong_mau)}>{xu_huong}</span>
        )}
      </div>

      {phu && (
        <div className={cx('border-t border-slate-100 pt-2.5 text-[10.5px] font-medium', phu_mau)}>
          {phu}
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════ Nhãn ══ */

type ChipMau = 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate' | 'violet' | 'teal';

const CHIP: Record<ChipMau, string> = {
  blue: 'bg-blue-50 text-blue-800',
  emerald: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-800',
  rose: 'bg-rose-50 text-rose-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  violet: 'bg-violet-50 text-violet-700',
  teal: 'bg-teal-50 text-teal-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function Chip({
  children,
  mau = 'slate',
  nho,
  className,
}: {
  children: ReactNode;
  mau?: ChipMau;
  nho?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'font-bold rounded-lg whitespace-nowrap inline-block',
        nho ? 'px-2 py-0.5 text-[9.5px]' : 'px-2.5 py-1 text-[10.5px]',
        CHIP[mau],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Nhãn dùng màu lấy từ CSDL (bảng phân loại có cột `color`). */
export function ChipMau({ children, color }: { children: ReactNode; color?: string | null }) {
  const c = color || '#64748b';
  return (
    <span
      className="px-2 py-0.5 text-[9.5px] font-bold rounded-lg whitespace-nowrap inline-block"
      style={{ backgroundColor: `${c}16`, color: c }}
    >
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════ Bảng ══ */

/** Khung bảng: thẻ bo góc, cuộn ngang bên trong, không tràn ra ngoài. */
export const KhungBang = ({ children }: { children: ReactNode }) => (
  <Card className="overflow-hidden animate-fadeIn">
    <div className="overflow-x-auto w-full">{children}</div>
  </Card>
);

export const Bang = ({ className, ...p }: ComponentProps<'table'>) => (
  <table
    {...p}
    className={cx('w-full min-w-[750px] text-left border-collapse text-xs', className)}
  />
);

export const Thead = ({ className, ...p }: ComponentProps<'thead'>) => (
  <thead {...p} className={cx('bg-[#f8f9ff]/80', className)} />
);

export const Tbody = ({ className, ...p }: ComponentProps<'tbody'>) => (
  <tbody {...p} className={cx('divide-y divide-slate-100', className)} />
);

export const Th = ({ className, ...p }: ComponentProps<'th'>) => (
  <th
    {...p}
    className={cx(
      'px-6 py-4 font-bold text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 whitespace-nowrap',
      className,
    )}
  />
);

export const Td = ({ className, ...p }: ComponentProps<'td'>) => (
  <td {...p} className={cx('px-6 py-4 align-middle', className)} />
);

export const Tr = ({ className, ...p }: ComponentProps<'tr'>) => (
  <tr {...p} className={cx('hover:bg-slate-50/50 transition-colors', className)} />
);

/**
 * Ô trống ghi "Chưa cập nhật" chứ không để gạch ngang.
 * Với cán bộ, "chưa cập nhật" là việc còn phải làm; "—" là không có gì cả.
 */
export const ChuaCapNhat = () => <span className="text-slate-400 font-medium">Chưa cập nhật</span>;

/** Bọc giá trị có thể rỗng. */
export function Gia({ children }: { children: ReactNode }) {
  const rong =
    children === null ||
    children === undefined ||
    (typeof children === 'string' && children.trim() === '');
  return rong ? <ChuaCapNhat /> : <>{children}</>;
}

/* ═════════════════════════════════════════════════════════════ Rỗng ══ */

export function Rong({
  emoji = '📭',
  loi_nhan = 'Không tìm thấy dữ liệu khớp bộ lọc.',
  children,
}: {
  emoji?: string;
  loi_nhan?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="p-10 text-center text-slate-400 font-semibold select-none flex flex-col items-center justify-center gap-2">
      <span className="text-3xl">{emoji}</span>
      <p className="text-xs">{loi_nhan}</p>
      {children && <div className="mt-2">{children}</div>}
    </Card>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-slate-400">
      <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-800 animate-spin" />
      {label && <span className="text-xs font-semibold">{label}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ Cảnh báo ══ */

const BANG_MAU = {
  loi: 'bg-rose-50 border-rose-200 text-rose-800',
  canh: 'bg-amber-50 border-amber-200 text-amber-800',
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  tin: 'bg-blue-50 border-blue-200 text-blue-800',
} as const;

export function CanhBao({
  loai = 'tin',
  emoji,
  children,
  className,
}: {
  loai?: keyof typeof BANG_MAU;
  emoji?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'border rounded-2xl px-4 py-3 text-[11px] font-semibold leading-relaxed',
        'flex items-start gap-2.5',
        BANG_MAU[loai],
        className,
      )}
    >
      {emoji && <span className="text-base leading-none select-none shrink-0">{emoji}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ Phân trang ══ */

function cacTrangHien(hienTai: number, tong: number): number[] {
  if (tong <= 7) return Array.from({ length: tong }, (_, i) => i + 1);
  const dau = Math.max(1, Math.min(hienTai - 2, tong - 4));
  return Array.from({ length: 5 }, (_, i) => dau + i);
}

/** Các mức số bản ghi mỗi trang. 500 là trần: hơn nữa thì bảng tự nó chậm. */
export const MUC_MOI_TRANG = [20, 50, 100, 200, 500] as const;

export function PhanTrang({
  trang,
  tong_trang,
  tong_ban_ghi,
  moi_trang,
  don_vi = 'bản ghi',
  onDoi,
  onDoiMoiTrang,
}: {
  trang: number;
  tong_trang: number;
  tong_ban_ghi: number;
  moi_trang: number;
  don_vi?: string;
  onDoi: (t: number) => void;
  /** Có hàm này thì hiện ô chọn số bản ghi mỗi trang. */
  onDoiMoiTrang?: (n: number) => void;
}) {
  // Vẫn hiện khi chỉ có một trang nếu đổi được số bản ghi — không thì cán bộ có
  // 40 hộ sẽ không bao giờ tìm thấy chỗ nâng lên 100 dòng
  if (tong_trang <= 1 && !onDoiMoiTrang) return null;
  const tu = tong_ban_ghi === 0 ? 0 : (trang - 1) * moi_trang + 1;
  const den = Math.min(tong_ban_ghi, trang * moi_trang);

  return (
    <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border border-slate-200 bg-[#f8f9ff]/35 rounded-2xl shadow-sm">
      <p className="text-slate-500 font-medium text-center sm:text-left text-xs">
        Đang hiển thị{' '}
        <span className="font-bold text-slate-900">
          {tu} - {den}
        </span>{' '}
        trên <span className="font-bold text-slate-900">{tong_ban_ghi}</span> {don_vi}
      </p>

      <div className="flex gap-2 flex-wrap items-center justify-center">
        {onDoiMoiTrang && (
          <label className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="hidden sm:inline">Mỗi trang</span>
            <select
              value={moi_trang}
              onChange={(e) => onDoiMoiTrang(Number(e.target.value))}
              className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              {MUC_MOI_TRANG.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => onDoi(Math.max(trang - 1, 1))}
          disabled={trang === 1}
          className="px-3 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 cursor-pointer shadow-sm transition-all"
        >
          ◀ Lùi lại
        </button>
        {tong_trang > 1 &&
          cacTrangHien(trang, tong_trang).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onDoi(n)}
              className={cx(
                'w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold cursor-pointer transition-all',
                n === trang
                  ? 'bg-blue-800 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200',
              )}
            >
              {n}
            </button>
          ))}
        <button
          type="button"
          onClick={() => onDoi(Math.min(trang + 1, tong_trang))}
          disabled={trang === tong_trang}
          className="px-3 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 cursor-pointer shadow-sm transition-all"
        >
          Tiếp theo ▶
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ Chuyển dạng thẻ / bảng ══ */

export function ChonDangHien({
  dang,
  onDoi,
}: {
  dang: 'the' | 'bang';
  onDoi: (d: 'the' | 'bang') => void;
}) {
  return (
    <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 select-none border border-slate-200/50">
      {(
        [
          ['the', 'Dạng thẻ', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
          ['bang', 'Dạng danh sách', 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
        ] as const
      ).map(([k, nhan, d]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            onDoi(k);
            localStorage.setItem('kp_dang_hien', k);
          }}
          title={nhan}
          className={cx(
            'px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer',
            dang === k
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-slate-400 hover:text-slate-700 hover:bg-white/40',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d={d} />
          </svg>
          <span>{nhan}</span>
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ Hộp thoại ══ */

export function HopThoai({
  mo,
  dong,
  tieu_de,
  emoji,
  rong = 'max-w-md',
  children,
  chan,
}: {
  mo: boolean;
  dong: () => void;
  tieu_de: string;
  emoji?: string;
  rong?: string;
  children: ReactNode;
  chan?: ReactNode;
}) {
  if (!mo) return null;
  return (
    <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <button aria-label="Đóng" onClick={dong} className="absolute inset-0 cursor-default" />
      <div
        className={cx(
          'relative bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden',
          'shadow-2xl border border-slate-100 animate-fadeIn',
          rong,
        )}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2.5 shrink-0">
          <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            {emoji && <span className="text-base leading-none">{emoji}</span>}
            {tieu_de}
          </h3>
          <button
            onClick={dong}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
            aria-label="Đóng"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4.5 h-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">{children}</div>
        {chan && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
            {chan}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Xác nhận xoá — hai lớp: cảnh báo ghi rõ MẤT NHỮNG GÌ, rồi mới cho bấm.
 * App cũ làm vậy và đó là lựa chọn đúng: hồ sơ hộ tịch xoá nhầm thì không có
 * thao tác nào trên giao diện lấy lại được.
 */
/**
 * Hộp thoại "bạn có chắc không" dùng chung.
 *
 * `nhan_nut` là BẮT BUỘC, không có giá trị mặc định. Trước đây nút bị viết cứng
 * là "XOÁ VĨNH VIỄN", nên hộp thoại đăng xuất, đổi chủ hộ, gỡ ghim và thu hồi
 * quyền đều hiện nút "XOÁ VĨNH VIỄN" — bốn chỗ chẳng xoá gì cả. Bắt buộc khai
 * động từ thì kiểu dữ liệu chặn ngay lúc biên dịch, không tái diễn được.
 *
 * `muc_do` phân biệt việc KHÔNG hoàn tác được (đỏ, có tam giác cảnh báo) với việc
 * làm lại được (xanh, không doạ người dùng). Doạ ở mọi chỗ thì đến lúc doạ thật
 * chẳng ai đọc nữa.
 */
export function XacNhan({
  mo,
  dong,
  tieu_de,
  loi_nhan,
  nhan_nut,
  nhan_dang_lam = 'ĐANG XỬ LÝ…',
  muc_do = 'nguy_hiem',
  dang_lam,
  onXacNhan,
}: {
  mo: boolean;
  dong: () => void;
  tieu_de: string;
  loi_nhan: ReactNode;
  /** Động từ trên nút, vd 'XOÁ VĨNH VIỄN', 'ĐĂNG XUẤT', 'GỠ GHIM'. */
  nhan_nut: string;
  nhan_dang_lam?: string;
  /** `nguy_hiem` cho việc không hoàn tác được; `thuong` cho việc làm lại được. */
  muc_do?: 'nguy_hiem' | 'thuong';
  dang_lam?: boolean;
  onXacNhan: () => void;
}) {
  if (!mo) return null;
  const nguy = muc_do === 'nguy_hiem';
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <button aria-label="Đóng" onClick={dong} className="absolute inset-0 cursor-default" />
      <div className="animate-fadeIn relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
        <div
          className={cx(
            'flex items-center gap-2.5 border-b px-6 py-4 font-bold',
            nguy
              ? 'border-rose-100 bg-rose-50 text-rose-800'
              : 'border-blue-100 bg-blue-50 text-blue-900',
          )}
        >
          {nguy ? (
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 text-rose-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 text-blue-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" />
            </svg>
          )}
          <h3 className="text-[12px] font-extrabold tracking-wider uppercase">{tieu_de}</h3>
        </div>
        <div className="space-y-3 p-6 text-xs leading-relaxed font-semibold text-slate-700">
          {loi_nhan}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <Button mau="trang" onClick={dong} type="button">
            Huỷ bỏ
          </Button>
          <Button mau={nguy ? 'do' : 'chinh'} onClick={onXacNhan} disabled={dang_lam} type="button">
            {dang_lam ? nhan_dang_lam : nhan_nut}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ Ngăn kéo ══ */

export function NganKeo({
  mo,
  dong,
  tieu_de,
  mo_ta,
  rong = 'max-w-2xl',
  children,
  chan,
}: {
  mo: boolean;
  dong: () => void;
  tieu_de: string;
  mo_ta?: string;
  rong?: string;
  children: ReactNode;
  chan?: ReactNode;
}) {
  if (!mo) return null;
  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        aria-label="Đóng"
        onClick={dong}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm cursor-default"
      />
      <div
        className={cx(
          'relative h-full w-full bg-white shadow-2xl flex flex-col animate-slideIn',
          rong,
        )}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-slate-800">
              {tieu_de}
            </h3>
            {mo_ta && <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{mo_ta}</p>}
          </div>
          <button
            onClick={dong}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
            aria-label="Đóng"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4.5 h-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">{children}</div>
        {chan && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
            {chan}
          </div>
        )}
      </div>
    </div>
  );
}
