/**
 * Thanh trên cùng cố định.
 *
 * Cao 48px chứ không phải 64px như bản đầu. Thanh trên chỉ mang tên màn hình, ô
 * tìm, đồng hồ và chuông — không có nội dung công việc nào — nên mỗi pixel nó ăn
 * là một pixel bảng dữ liệu hay bản đồ mất đi. Đồng hồ gộp về một dòng vì thế.
 *
 * Đồng hồ lấy giờ từ MÁY CHỦ (`useGioVN`), không tin đồng hồ máy người dùng: máy ở
 * khu phố hay sai giờ hoặc để múi giờ mặc định của Windows, mà cán bộ ghi biên bản,
 * giấy mời, phiếu thu đều phải ghi giờ. Ghi rõ "(Giờ VN)" để không ai phải đoán.
 */

import { useQuery } from '@tanstack/react-query';
import { Bell, Menu, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Chip, cx } from '@/components/ui';
import { get } from '@/lib/api';
import { useGioVN } from '@/lib/gio';
import { useAuth, useUi } from '@/lib/store';
import type { ThongBao } from '@/lib/types';

export function Topbar({
  tieu_de,
  tim,
  onTim,
  goi_y_tim = 'Tìm kiếm trong khu phố…',
}: {
  tieu_de: string;
  tim?: string;
  onTim?: (v: string) => void;
  goi_y_tim?: string;
}) {
  const { gio, ngay, theo_may_chu } = useGioVN();
  const { toggleSidebar } = useUi();
  const { user, can } = useAuth();
  const [moTB, setMoTB] = useState(false);
  const hopTB = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài thì đóng popup
  useEffect(() => {
    if (!moTB) return;
    const h = (e: MouseEvent) => {
      if (hopTB.current && !hopTB.current.contains(e.target as Node)) setMoTB(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moTB]);

  const { data: tb } = useQuery({
    queryKey: ['thong-bao'],
    queryFn: () => get<ThongBao[]>('/thong-bao'),
    enabled: can('resident:read'),
    staleTime: 60_000,
    retry: false,
  });
  const soTB = tb?.length ?? 0;

  return (
    <header className="khong-in fixed top-0 right-0 left-0 z-30 flex h-12 items-center justify-between border-b border-slate-200 bg-white/85 px-3 backdrop-blur-md sm:px-4 lg:left-[280px]">
      {/* Tên màn hình đang mở */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <Menu
          onClick={toggleSidebar}
          className="w-5 h-5 text-slate-500 cursor-pointer lg:hidden hover:text-blue-800 transition-colors"
        />
        <h2 className="max-w-[125px] truncate text-xs font-bold tracking-tight text-slate-900 sm:max-w-xs sm:text-sm">
          {tieu_de}
        </h2>
      </div>

      {/* Ô tìm kiếm ở giữa — đổi gợi ý theo từng màn hình */}
      <div className="mx-2 max-w-sm flex-1 sm:mx-6 sm:max-w-lg">
        {onTim && (
          <div className="relative group">
            <input
              type="text"
              placeholder={goi_y_tim}
              value={tim ?? ''}
              onChange={(e) => onTim(e.target.value)}
              className="w-full rounded-full border-none bg-slate-100 py-1.5 pr-3 pl-8 text-[10px] text-slate-800 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 sm:pl-10 sm:text-xs"
            />
            <Search className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-700 transition-colors" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {user?.ho_tro && (
          <Chip mau="amber" className="hidden md:inline-block">
            CHẾ ĐỘ HỖ TRỢ NỀN TẢNG
          </Chip>
        )}

        {/* Đồng hồ Việt Nam chạy thật */}
        <div
          className="mr-1 hidden items-baseline gap-1.5 select-none xl:flex"
          title={
            theo_may_chu
              ? 'Giờ lấy từ máy chủ đặt tại Việt Nam, không phụ thuộc đồng hồ máy này'
              : 'Chưa lấy được giờ máy chủ — đang tạm dùng đồng hồ máy này'
          }
        >
          <span className="text-[11.5px] font-bold text-slate-800 tabular-nums">
            {gio}
            {!theo_may_chu && <span className="ml-1 text-amber-600">⚠</span>}
          </span>
          <span className="text-[9.5px] font-semibold text-slate-400 uppercase">
            {ngay} · Giờ VN
          </span>
        </div>

        {/* Chuông thông báo */}
        <div className="relative" ref={hopTB}>
          <button
            onClick={() => setMoTB((v) => !v)}
            title="Thông báo hệ thống"
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-all hover:bg-slate-100 active:scale-95"
          >
            <Bell className="h-4 w-4" />
            {soTB > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 animate-pulse rounded-full bg-red-600" />
            )}
          </button>

          {moTB && (
            <div className="absolute top-10 right-[-45px] w-72 sm:right-0 sm:w-[360px] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 text-left text-slate-800 animate-fadeIn">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔔</span>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                    Thông báo đồng bộ ({String(soTB).padStart(2, '0')})
                  </h3>
                </div>
                <button
                  onClick={() => setMoTB(false)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                {soTB > 0 ? (
                  tb!.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 bg-slate-50/70 hover:bg-indigo-50/30 border border-slate-100 rounded-xl transition-all"
                    >
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <span className="font-extrabold text-[8.5px] text-slate-500 uppercase tracking-wider truncate">
                          {n.nhom}
                        </span>
                        <span
                          className={cx(
                            'px-1 rounded text-[8px] font-extrabold shrink-0',
                            n.muc === 'gap'
                              ? 'bg-rose-50 text-rose-700'
                              : n.muc === 'canh'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-indigo-50 text-indigo-700',
                          )}
                        >
                          {n.nhan}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 line-clamp-1 mb-0.5 text-[10.5px]">
                        {n.tieu_de}
                      </p>
                      <p className="text-[9.5px] text-slate-500 font-medium leading-normal line-clamp-2">
                        {n.mo_ta}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-xs font-bold text-slate-500">Chưa có việc nào cần nhắc</p>
                    <p className="text-[9.5px] text-slate-400 mt-0.5 leading-normal max-w-[220px] mx-auto">
                      Hộ chưa định vị, hộ thiếu chủ hộ và đợt thu đang mở sẽ tự hiện ở đây.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 mt-2.5 text-[10px] select-none">
                <span className="text-slate-400 font-semibold">Đồng bộ theo giờ Việt Nam (GMT+7)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
