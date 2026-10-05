/**
 * Xem trước và in một văn bản đi theo đúng thể thức.
 *
 * Bố cục bám Nghị định 30/2020/NĐ-CP về công tác văn thư:
 *
 *   ┌────────────────────────┬───────────────────────────────┐
 *   │ TÊN CƠ QUAN BAN HÀNH   │ CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VN  │  ← quốc hiệu
 *   │ ────                   │ Độc lập - Tự do - Hạnh phúc   │  ← tiêu ngữ
 *   │ Số: 12/TB-KP3          │ ─────────────                 │
 *   │                        │ An Phú, ngày … tháng … năm …  │  ← địa danh, ngày
 *   └────────────────────────┴───────────────────────────────┘
 *                        THÔNG BÁO                              ← tên loại
 *                   V/v họp tổ dân phố                          ← trích yếu
 *
 *   …nội dung…
 *
 *   Nơi nhận:                              TM. BAN ĐIỀU HÀNH
 *   - …;                                     TRƯỞNG KHU PHỐ
 *   - Lưu: VT.                                (chữ ký)
 *                                            Nguyễn Văn A
 *
 * Chữ dùng font có chân (Times) vì văn bản hành chính Việt Nam quy định
 * Times New Roman cỡ 13–14. Đưa lên màn hình font không chân thì lúc in ra
 * lệch hẳn so với bản xem trước.
 *
 * Chỉ phần trong `.in-duoc` được in — quy tắc nằm ở `index.css`.
 */

import { Printer, X } from 'lucide-react';

import { Button } from '@/components/ui';

import type { VBChiTiet } from './VanBan';

/** "2026-08-25" → "ngày 25 tháng 8 năm 2026". Số một chữ số thêm 0 theo lối văn bản. */
function ngayThangNam(iso: string | null): string {
  if (!iso) return 'ngày … tháng … năm …';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ngày … tháng … năm …';
  const hai = (n: number) => String(n).padStart(2, '0');
  return `ngày ${hai(d.getDate())} tháng ${hai(d.getMonth() + 1)} năm ${d.getFullYear()}`;
}

/**
 * Tách "TÊN LOẠI" khỏi trích yếu.
 *
 * Cán bộ quen gõ cả cụm vào ô trích yếu: "Thông báo V/v họp tổ dân phố". Thể thức
 * thì tên loại nằm riêng một dòng in hoa, trích yếu nằm dòng dưới bắt đầu bằng
 * "V/v". Tách được thì in đúng; không tách được thì để nguyên cả cụm làm tên loại
 * chứ không đoán bừa.
 */
const TEN_LOAI = [
  'Thông báo',
  'Báo cáo',
  'Kế hoạch',
  'Quyết định',
  'Giấy mời',
  'Tờ trình',
  'Công văn',
  'Biên bản',
  'Đề nghị',
  'Hướng dẫn',
];

function tachTieuDe(title: string): { loai: string; trich_yeu: string } {
  const t = title.trim();
  for (const l of TEN_LOAI) {
    if (t.toLowerCase().startsWith(l.toLowerCase())) {
      return { loai: l.toUpperCase(), trich_yeu: t.slice(l.length).trim() };
    }
  }
  // Bắt đầu thẳng bằng "V/v" thì coi như công văn không tên loại
  if (/^v\/v/i.test(t)) return { loai: '', trich_yeu: t };
  return { loai: t.toUpperCase(), trich_yeu: '' };
}

export function InVanBan({ vb, dong }: { vb: VBChiTiet; dong: () => void }) {
  const { loai, trich_yeu } = tachTieuDe(vb.title);
  const noiNhan = (vb.noi_nhan ?? '')
    .split(/[\n;]+/)
    .map((x) => x.trim().replace(/[.;]$/, ''))
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/60 backdrop-blur-sm">
      {/* Thanh công cụ — không in ra giấy */}
      <div className="khong-in flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-3 shadow-lg">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">Xem trước bản in</p>
          <p className="truncate text-[10.5px] font-medium text-slate-400">
            Khổ A4, lề 15mm — đúng như khi in ra giấy
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button mau="trang" onClick={dong} type="button">
            <X className="h-3.5 w-3.5" />
            ĐÓNG
          </Button>
          <Button icon={Printer} onClick={() => window.print()}>
            IN VĂN BẢN
          </Button>
        </div>
      </div>

      {/* Vùng cuộn chứa tờ A4 */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-8">
        <div
          className="in-duoc mx-auto max-w-[210mm] bg-white p-[14mm] font-serif text-[13.5px] leading-[1.5] text-black shadow-2xl"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {/* ── Quốc hiệu, tiêu ngữ, số ký hiệu ─────────────────────────── */}
          <div className="flex items-start gap-4">
            <div className="w-[38%] text-center">
              <p className="text-[12.5px] font-bold uppercase">
                {vb.don_vi || 'BAN ĐIỀU HÀNH KHU PHỐ'}
              </p>
              <div className="mx-auto mt-1 w-16 border-t border-black" />
              <p className="mt-2 text-[12.5px]">
                Số: <b>{vb.so_ky_hieu || '……/……'}</b>
              </p>
            </div>

            <div className="flex-1 text-center">
              <p className="text-[12.5px] font-bold uppercase">
                Cộng hoà xã hội chủ nghĩa Việt Nam
              </p>
              <p className="text-[13.5px] font-bold">Độc lập - Tự do - Hạnh phúc</p>
              <div className="mx-auto mt-1 w-48 border-t border-black" />
              <p className="mt-2 text-[12.5px] italic">
                {(vb.don_vi?.match(/(?:Phường|Xã|Khu phố)\s+[^,]+/i)?.[0] ?? 'An Phú').trim()},{' '}
                {ngayThangNam(vb.ngay_van_ban)}
              </p>
            </div>
          </div>

          {/* ── Tên loại và trích yếu ───────────────────────────────────── */}
          <div className="mt-8 text-center">
            {loai && <p className="text-[15px] font-bold uppercase">{loai}</p>}
            {trich_yeu && <p className="mt-1 text-[13.5px] font-bold">{trich_yeu}</p>}
            <div className="mx-auto mt-2 w-24 border-t border-black" />
          </div>

          {/* ── Nội dung ────────────────────────────────────────────────── */}
          <div className="mt-6 min-h-[60mm] space-y-3 text-justify">
            {(vb.noi_dung ?? '').trim() ? (
              vb.noi_dung!.split(/\n{1,}/).map((doan, i) =>
                doan.trim() ? (
                  <p key={i} className="indent-8">
                    {doan.trim()}
                  </p>
                ) : (
                  <div key={i} className="h-2" />
                ),
              )
            ) : (
              <p className="indent-8 text-slate-400 italic">
                (Chưa soạn nội dung — quay lại ô “Nội dung văn bản” để nhập.)
              </p>
            )}
          </div>

          {/* ── Nơi nhận và chữ ký ──────────────────────────────────────── */}
          <div className="mt-10 flex items-start gap-6">
            <div className="w-[52%] text-[12px]">
              <p className="font-bold italic">Nơi nhận:</p>
              {noiNhan.length ? (
                noiNhan.map((n, i) => (
                  <p key={i} className="leading-snug">
                    - {n};
                  </p>
                ))
              ) : (
                <p className="leading-snug text-slate-400">- Lưu: VT.</p>
              )}
            </div>

            <div className="flex-1 text-center">
              <p className="text-[12.5px] font-bold uppercase">
                {vb.chuc_vu_ky || 'Trưởng khu phố'}
              </p>
              {/* Khoảng trống để ký tươi và đóng dấu */}
              <div className="h-[24mm]" />
              <p className="text-[13.5px] font-bold">{vb.nguoi_ky || '……………………'}</p>
            </div>
          </div>
        </div>

        {/* Nhắc nhở dưới tờ giấy, không in */}
        <p className="khong-in mx-auto mt-3 max-w-[210mm] text-center text-[10.5px] font-medium text-white/70">
          Nội dung, nơi nhận và người ký sửa ở ngăn kéo văn bản. Bản in lấy đúng những gì
          đang thấy ở đây.
        </p>
      </div>
    </div>
  );
}
