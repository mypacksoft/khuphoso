/**
 * Ô chọn một hộ khẩu có sẵn — gõ mã hộ hoặc địa chỉ, hiện gợi ý, chọn.
 *
 * Gán nhân khẩu vào hộ bằng cách chọn từ danh sách thì ra đúng một `household_id`,
 * và nhân khẩu lấy luôn địa chỉ, tổ dân phố của hộ. Gõ tay địa chỉ thì mỗi người
 * viết một kiểu và về sau phải chạy gom hộ mới nối lại được.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Chip, cx, Input, Spinner } from '@/components/ui';
import { get, qs } from '@/lib/api';
import type { DanhSach, Ho } from '@/lib/types';

export interface HoDaChon {
  id: string;
  code: string;
  address: string | null;
  chu_ho?: string | null;
  to_dan_pho?: string | null;
  so_nhan_khau?: number;
}

export function ChonHo({
  gia_tri,
  onChon,
  /** Chỉ tìm hộ thường trú hoặc hộ tạm trú. */
  dien_ho,
  disabled,
}: {
  gia_tri: HoDaChon | null;
  onChon: (h: HoDaChon | null) => void;
  dien_ho?: string;
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
    queryKey: ['chon-ho', tu, dien_ho],
    queryFn: () =>
      get<DanhSach<Ho>>('/ho-khau' + qs({ q: tu, household_type: dien_ho ?? '', limit: 20 })),
    enabled: mo,
    placeholderData: keepPreviousData,
  });

  if (gia_tri) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">
            <span className="font-mono text-slate-500">#{gia_tri.code}</span>{' '}
            {gia_tri.chu_ho || 'chưa có chủ hộ'}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {gia_tri.address || 'Chưa có địa chỉ'}
            {gia_tri.to_dan_pho ? ` · ${gia_tri.to_dan_pho}` : ''}
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChon(null);
              setTu('');
            }}
            aria-label="Bỏ chọn hộ"
            title="Gỡ khỏi hộ này"
            className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  const ds = data?.items ?? [];

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
        placeholder="Gõ mã hộ hoặc địa chỉ để tìm…"
        className="pl-8"
        disabled={disabled}
        autoComplete="off"
      />

      {mo && (
        <div className="custom-scrollbar absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {isFetching && !data ? (
            <Spinner />
          ) : ds.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] font-medium text-slate-400">
              {tu
                ? 'Không tìm thấy hộ nào khớp.'
                : 'Chưa có hộ nào. Khai sinh hộ ở màn hình sổ hộ khẩu trước.'}
            </p>
          ) : (
            ds.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onChon({
                    id: h.id,
                    code: h.code,
                    address: h.address,
                    chu_ho: h.chu_ho,
                    to_dan_pho: h.to_dan_pho,
                    so_nhan_khau: h.so_nhan_khau,
                  });
                  setMo(false);
                  setTu('');
                }}
                className={cx(
                  'flex w-full items-start justify-between gap-2 px-3 py-2 text-left',
                  'cursor-pointer transition-colors hover:bg-blue-50',
                )}
              >
                <div className="min-w-0">
                  <p className="text-[11.5px] font-bold text-slate-900">
                    <span className="font-mono text-slate-400">#{h.code}</span>{' '}
                    {h.chu_ho || 'chưa có chủ hộ'}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                    {h.address || 'Chưa có địa chỉ'}
                  </p>
                </div>
                <Chip mau="blue" nho>
                  {h.so_nhan_khau} người
                </Chip>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
