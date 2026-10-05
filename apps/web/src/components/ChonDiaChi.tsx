/**
 * Ô nhập địa chỉ có gợi ý từ những địa chỉ đã có trong khu phố.
 *
 * Vẫn gõ tự do được (nhà mới thì chưa có trong danh sách), nhưng gõ tới đâu gợi ý
 * tới đó và chọn được bằng một cú bấm. Lý do: gom nhân khẩu thành hộ so khớp theo
 * địa chỉ, mà mỗi người gõ một kiểu — "123/45 Nguyễn Duy Trinh" với "123/45 Ng.
 * Duy Trinh" — thì không gom đúng. Chọn từ gợi ý là cách viết thống nhất.
 *
 * Gợi ý hiện kèm mã hộ và tên chủ hộ đang ở địa chỉ đó, để cán bộ biết mình đang
 * gõ trùng nhà của ai.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Chip, cx, Input, Spinner } from '@/components/ui';
import { get, qs } from '@/lib/api';

export interface DiaChiGoiY {
  dia_chi: string;
  ma_ho: string | null;
  chu_ho: string | null;
  household_type: string | null;
  so_nguoi: number;
}

export function ChonDiaChi({
  gia_tri,
  onDoi,
  /** Gọi khi người dùng CHỌN một gợi ý (khác với gõ tay). */
  onChonGoiY,
  goi_y = '123/45 Nguyễn Duy Trinh',
  disabled,
}: {
  gia_tri: string;
  onDoi: (v: string) => void;
  onChonGoiY?: (g: DiaChiGoiY) => void;
  goi_y?: string;
  disabled?: boolean;
}) {
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
    queryKey: ['dia-chi-goi-y', gia_tri],
    queryFn: () => get<DiaChiGoiY[]>('/ho-khau/dia-chi-goi-y' + qs({ q: gia_tri, limit: 15 })),
    enabled: mo,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Gõ trùng khít một địa chỉ đã có thì không cần bày gợi ý nữa
  const ds = (data ?? []).filter(
    (g) => g.dia_chi.trim().toLowerCase() !== gia_tri.trim().toLowerCase(),
  );

  return (
    <div className="relative" ref={hop}>
      <MapPin className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={gia_tri}
        onChange={(e) => {
          onDoi(e.target.value);
          setMo(true);
        }}
        onFocus={() => setMo(true)}
        placeholder={goi_y}
        className="pl-8"
        disabled={disabled}
        autoComplete="off"
      />

      {mo && (
        <div className="custom-scrollbar absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {isFetching && !data ? (
            <Spinner />
          ) : ds.length === 0 ? (
            <p className="px-3 py-3 text-center text-[10.5px] font-medium text-slate-400">
              {gia_tri
                ? 'Không có địa chỉ nào giống — đây là nhà mới, cứ gõ tiếp.'
                : 'Chưa có địa chỉ nào trong khu phố.'}
            </p>
          ) : (
            <>
              <p className="border-b border-slate-100 px-3 py-1.5 text-[9.5px] font-extrabold tracking-wider text-slate-400 uppercase">
                Địa chỉ đã có trong khu phố
              </p>
              {ds.map((g, i) => (
                <button
                  key={`${g.dia_chi}-${i}`}
                  type="button"
                  onClick={() => {
                    onDoi(g.dia_chi);
                    onChonGoiY?.(g);
                    setMo(false);
                  }}
                  className={cx(
                    'flex w-full items-start justify-between gap-2 px-3 py-2 text-left',
                    'cursor-pointer transition-colors hover:bg-blue-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-semibold text-slate-900">
                      {g.dia_chi}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {g.ma_ho ? (
                        <>
                          <span className="font-mono">#{g.ma_ho}</span>
                          {g.chu_ho ? ` · ${g.chu_ho}` : ' · chưa có chủ hộ'}
                        </>
                      ) : (
                        'nhân khẩu đã khai, chưa lập hộ'
                      )}
                    </p>
                  </div>
                  {g.so_nguoi > 0 && (
                    <Chip mau={g.ma_ho ? 'blue' : 'amber'} nho>
                      {g.so_nguoi} người
                    </Chip>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
