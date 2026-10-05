/**
 * Ô chọn một nhân khẩu có sẵn — gõ tên, hiện gợi ý, chọn.
 *
 * Dùng khi cần trỏ tới đúng MỘT người: chọn chủ hộ khi khai sinh hộ, gán thành viên
 * vào hộ. Gõ tay tên chủ hộ thì mỗi người viết một kiểu ("Nguyễn Văn A", "Nguyen Van
 * A", "N.V.A") và về sau không nối được với hồ sơ nhân khẩu nào cả — chọn từ danh
 * sách thì luôn ra đúng một `resident_id`.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ChuaCapNhat, cx, Input, Spinner } from '@/components/ui';
import { get, qs } from '@/lib/api';
import type { CuDan, DanhSach } from '@/lib/types';
import { GIOI_TINH } from '@/lib/types';

export interface NhanKhauDaChon {
  id: string;
  full_name: string;
  dob?: string | null;
  ma_ho?: string | null;
  /** Địa chỉ của người này — nơi gọi dùng để tự điền khi chọn làm chủ hộ. */
  dia_chi?: string | null;
  /** Số điện thoại trong hồ sơ — nơi gọi dùng để tự điền khi chọn tổ trưởng. */
  phone?: string | null;
}

export function ChonNhanKhau({
  gia_tri,
  onChon,
  /** Chỉ tìm trong một diện cư trú, vd `thuong_tru` cho hộ thường trú. */
  dien_cu_tru,
  /** Bỏ qua người đã thuộc hộ khác — dùng khi chọn chủ hộ cho hộ mới. */
  chi_chua_co_ho,
  goi_y = 'Gõ tên để tìm nhân khẩu…',
  disabled,
}: {
  gia_tri: NhanKhauDaChon | null;
  onChon: (nk: NhanKhauDaChon | null) => void;
  dien_cu_tru?: string;
  chi_chua_co_ho?: boolean;
  goi_y?: string;
  disabled?: boolean;
}) {
  const [tu, setTu] = useState('');
  const [mo, setMo] = useState(false);
  const hop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mo) return;
    const h = (e: MouseEvent) => {
      if (hop.current && !hop.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mo]);

  const { data, isFetching } = useQuery({
    queryKey: ['chon-nhan-khau', tu, dien_cu_tru],
    queryFn: () =>
      get<DanhSach<CuDan>>(
        '/cu-dan' + qs({ q: tu, residence_status: dien_cu_tru ?? '', limit: 20 }),
      ),
    enabled: mo && tu.trim().length >= 1,
    placeholderData: keepPreviousData,
  });

  const ds = (data?.items ?? []).filter((r) => !chi_chua_co_ho || !r.ma_ho);

  if (gia_tri) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">{gia_tri.full_name}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            <span className="font-mono">
              {gia_tri.dob ? new Date(gia_tri.dob).toLocaleDateString('vi-VN') : 'chưa rõ ngày sinh'}
            </span>
            {gia_tri.ma_ho ? ` · hộ #${gia_tri.ma_ho}` : ''}
            {gia_tri.dia_chi ? ` · ${gia_tri.dia_chi}` : ''}
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChon(null);
              setTu('');
            }}
            aria-label="Bỏ chọn"
            className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={hop}>
      <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={tu}
        onChange={(e) => {
          setTu(e.target.value);
          setMo(true);
        }}
        onFocus={() => setMo(true)}
        placeholder={goi_y}
        className="pl-8"
        disabled={disabled}
        autoComplete="off"
      />

      {mo && tu.trim().length >= 1 && (
        <div className="custom-scrollbar absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {isFetching && !data ? (
            <Spinner />
          ) : ds.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] font-medium text-slate-400">
              {chi_chua_co_ho
                ? 'Không có nhân khẩu nào chưa thuộc hộ khớp tên này.'
                : 'Không tìm thấy nhân khẩu nào.'}
            </p>
          ) : (
            ds.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChon({
                    id: r.id,
                    full_name: r.full_name,
                    dob: r.dob,
                    ma_ho: r.ma_ho,
                    dia_chi: r.dia_chi,
                    phone: r.phone,
                  });
                  setMo(false);
                  setTu('');
                }}
                className={cx(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left',
                  'cursor-pointer transition-colors hover:bg-blue-50',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-bold text-slate-900">{r.full_name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <span className="font-mono">
                      {r.dob ? new Date(r.dob).toLocaleDateString('vi-VN') : '—'}
                    </span>
                    {r.gender ? ` · ${GIOI_TINH[r.gender]}` : ''}
                    {r.to_dan_pho ? ` · ${r.to_dan_pho}` : ''}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">
                  {r.ma_ho ? `#${r.ma_ho}` : <ChuaCapNhat />}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
