/**
 * Màn hình KÍCH HOẠT — hiện khi phần mềm chưa có giấy phép hợp lệ.
 *
 * Việc chặn thật nằm ở máy chủ (middleware trong `main.py`); màn hình này chỉ để
 * hướng dẫn người cài lấy key. Mỗi bản cài phải đăng ký với tác giả để nhận key.
 */

import { KeyRound, Mail, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export interface GiayPhepTrangThai {
  kich_hoat: boolean;
  ly_do?: 'chua_co_key' | 'het_han' | 'key_khong_hop_le' | 'sai_khu_pho';
  ten?: string | null;
  cap_cho?: string | null;
  het_han?: string | null;
  slug?: string | null;
  ten_khu_pho?: string | null;
  email_dang_ky: string;
  link_dang_ky: string;
}

const LY_DO: Record<string, { tieu_de: string; mo_ta: string }> = {
  chua_co_key: {
    tieu_de: 'Phần mềm chưa được kích hoạt',
    mo_ta: 'Bản cài này chưa có key kích hoạt. Hãy đăng ký để nhận key rồi mới sử dụng được.',
  },
  het_han: {
    tieu_de: 'Giấy phép đã hết hạn',
    mo_ta: 'Key kích hoạt đã quá hạn. Liên hệ để gia hạn — dữ liệu của khu phố vẫn còn nguyên.',
  },
  key_khong_hop_le: {
    tieu_de: 'Key kích hoạt không hợp lệ',
    mo_ta: 'Chuỗi key không đúng hoặc đã bị sửa. Kiểm tra lại giá trị LICENSE_KEY trong tệp .env.',
  },
  sai_khu_pho: {
    tieu_de: 'Key không dành cho khu phố này',
    mo_ta: 'Key được cấp cho một khu phố khác. Mỗi khu phố cần một key riêng khớp đúng mã.',
  },
};

export function GiayPhep({ tt }: { tt: GiayPhepTrangThai }) {
  const [daChep, setDaChep] = useState(false);
  const ly = LY_DO[tt.ly_do ?? 'chua_co_key'] ?? LY_DO.chua_co_key;

  const chep = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 1500);
    } catch {
      /* trình duyệt chặn clipboard thì thôi */
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-950 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      <main className="relative z-10 w-full max-w-[520px]">
        <div className="bg-white/95 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl p-6 md:p-8 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-tr from-blue-700 to-sky-400 shadow-lg flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-900">{ly.tieu_de}</h1>
              <p className="text-sm text-slate-600 mt-0.5">{ly.mo_ta}</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200">
            {tt.ten_khu_pho && (
              <Dong nhan="Khu phố" giatri={tt.ten_khu_pho} />
            )}
            {tt.slug && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Mã khu phố
                </span>
                <button
                  onClick={() => chep(tt.slug!)}
                  className="flex items-center gap-1.5 text-sm font-mono font-semibold text-blue-800 hover:text-blue-600 cursor-pointer"
                  title="Chép mã"
                >
                  {tt.slug}
                  {daChep ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            {tt.het_han && <Dong nhan="Hết hạn" giatri={tt.het_han} />}
          </div>

          <ol className="text-sm text-slate-700 space-y-2.5 list-decimal pl-5 marker:text-blue-700 marker:font-bold">
            <li>
              Đăng ký bản cài tại trang dưới, điền đầy đủ thông tin khu phố (kèm{' '}
              <b>mã khu phố</b> ở trên).
            </li>
            <li>Tác giả cấp cho bạn một <b>key kích hoạt</b> qua email đã đăng ký.</li>
            <li>
              Mở tệp <code className="px-1 py-0.5 bg-slate-100 rounded text-[13px]">apps/api/.env</code>,
              đặt <code className="px-1 py-0.5 bg-slate-100 rounded text-[13px]">LICENSE_KEY=…</code>{' '}
              rồi khởi động lại API.
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={tt.link_dang_ky}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-lg hover:scale-[1.01]"
            >
              <ExternalLink className="w-4 h-4" /> Đăng ký nhận key
            </a>
            <a
              href={`mailto:${tt.email_dang_ky}?subject=${encodeURIComponent(
                'Đăng ký key Khu Phố Số' + (tt.slug ? ` — ${tt.slug}` : ''),
              )}`}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-blue-400 text-slate-700 py-3 rounded-xl font-bold text-sm transition-all"
            >
              <Mail className="w-4 h-4" /> Gửi email
            </a>
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            Hỗ trợ: {tt.email_dang_ky}
          </p>
        </div>
      </main>
    </div>
  );
}

function Dong({ nhan, giatri }: { nhan: string; giatri: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{nhan}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{giatri}</span>
    </div>
  );
}
