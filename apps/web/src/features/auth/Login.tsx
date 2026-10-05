/**
 * Màn hình đăng nhập.
 *
 * Trên tên miền riêng của khu phố (`kp3-anphu.khuphoso.vn`) thì khu phố đã xác định
 * theo tên miền — không hỏi lại, chỉ hiện tên để cán bộ biết mình vào đúng chỗ.
 * Trên `app.` / `admin.` dùng chung thì mới phải nhập mã khu phố.
 *
 * ── Để trình duyệt và PWA nhớ được tài khoản ────────────────────────────────
 *
 * Ba thứ phải có đủ, thiếu một là trình quản lý mật khẩu im lặng không hỏi gì:
 *
 *   1. `name` trên ô nhập. Chrome, Safari và các trình quản lý mật khẩu dò form
 *      theo `name` chứ không theo `id` — đây là chỗ trước đây còn thiếu.
 *   2. `<form>` thật, submit thật. Đã có.
 *   3. Gọi thẳng `navigator.credentials.store()`. Ứng dụng một trang không đổi
 *      trang sau khi đăng nhập, mà trình duyệt lại dựa vào việc ĐỔI TRANG để
 *      đoán "đăng nhập xong rồi" — không gọi tay thì nó không bao giờ hỏi lưu.
 *      Chạy trong PWA (chế độ standalone) thì càng cần vì không có thanh địa chỉ.
 *
 * Tên đăng nhập lần trước lưu ở `localStorage` để điền sẵn. KHÔNG lưu mật khẩu ở
 * đó — mật khẩu để trình quản lý mật khẩu của hệ điều hành giữ, nơi có khoá vân
 * tay và mã hoá; `localStorage` thì bất kỳ đoạn mã nào chạy trên trang cũng đọc được.
 */

import { Eye, EyeOff, Lock, ShieldAlert, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui';
import { auth, laNenTang, tenantCoDinh } from '@/lib/api';
import { useAuth } from '@/lib/store';

const KHOA_TEN = 'kp_ten_dang_nhap';

/**
 * Nhờ trình duyệt lưu tài khoản.
 *
 * Chỉ Chrome, Edge và một số trình duyệt Android có `PasswordCredential`. Safari
 * và Firefox thì không — ở đó việc lưu do chính trình duyệt tự quyết dựa vào form
 * (đã đủ `name` và `autocomplete` nên vẫn hỏi lưu bình thường). Vì vậy hàm này
 * hỏng cũng không sao, nuốt lỗi và đi tiếp.
 */
async function nhoTaiKhoan(id: string, mat_khau: string, ten_hien: string) {
  const w = window as unknown as {
    PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential;
  };
  if (!w.PasswordCredential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(
      new w.PasswordCredential({ id, password: mat_khau, name: ten_hien }),
    );
  } catch {
    // Người dùng bấm "Không lưu", hoặc trình duyệt chặn — không phải lỗi đăng nhập
  }
}

export function Login() {
  const { dangNhap, khuPho, napKhuPho } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem(KHOA_TEN) ?? '');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState(tenantCoDinh ?? auth.tenant);
  // Ở admin.khuphoso.vn thì đăng nhập KHÔNG kèm khu phố nào cả
  const [hienMk, setHienMk] = useState(false);
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  useEffect(() => {
    // Trang nền tảng không thuộc khu phố nào nên không có tên khu phố để hiện
    if (!laNenTang) void napKhuPho();
  }, [napKhuPho]);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoi('');
    setDangGui(true);
    try {
      const ten = username.trim();
      await dangNhap(ten, password, laNenTang ? '' : tenant.trim());
      localStorage.setItem(KHOA_TEN, ten);
      // Hỏi lưu TRƯỚC khi nạp lại: nạp lại là huỷ luôn hộp thoại đang hiện
      await nhoTaiKhoan(ten, password, khuPho?.name ?? 'KhuPhoSo');
      location.reload(); // nạp lại để lấy hồ sơ và quyền
    } catch (err) {
      setLoi(err instanceof Error ? err.message : 'Không đăng nhập được');
      setDangGui(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-950 overflow-hidden">
      {/* Nền: dải màu đậm dần, không dùng ảnh ngoài để trang vẫn lên khi mạng yếu */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

      <main className="relative z-10 w-full max-w-[460px]">
        <div className="bg-white/95 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl p-6 md:p-8 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-700 to-sky-400 shadow-lg shadow-blue-900/20 flex items-center justify-center">
              <span className="text-4xl">{laNenTang ? '🛡️' : '🏠'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="font-bold text-2xl tracking-tight text-slate-900 uppercase">
                {laNenTang ? 'Quản trị nền tảng' : (khuPho?.name ?? 'Khu Phố Số')}
              </h1>
              <p className="font-extrabold text-xs text-blue-800 tracking-wider uppercase">
                {laNenTang
                  ? 'KhuPhoSo · không thuộc khu phố nào'
                  : (khuPho?.ward ?? 'Hệ thống quản lý dân cư')}
              </p>
            </div>
          </div>

          <form onSubmit={gui} className="w-full flex flex-col gap-4">
            {loi && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex gap-2 items-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{loi}</span>
              </div>
            )}

            {!tenantCoDinh && !laNenTang && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700 ml-1">Mã khu phố</label>
                <Input
                  name="tenant"
                  value={tenant}
                  onChange={(e) => setTenant(e.target.value)}
                  placeholder="vd kp3-anphu"
                  className="py-3 text-sm font-mono"
                  autoComplete="organization"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-semibold text-slate-700 ml-1">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <Input
                  id="username"
                  name="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setLoi('');
                  }}
                  placeholder="Nhập tài khoản"
                  className="pl-11 py-3 text-sm"
                  autoComplete="username"
                  autoFocus={!username}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-slate-700 ml-1">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <Input
                  id="password"
                  name="password"
                  type={hienMk ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoi('');
                  }}
                  placeholder="Nhập mật khẩu"
                  className="pl-11 pr-11 py-3 text-sm"
                  autoComplete="current-password"
                  autoFocus={!!username}
                />
                <button
                  type="button"
                  onClick={() => setHienMk((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={hienMk ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {hienMk ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={dangGui}
              className="w-full bg-blue-800 hover:bg-blue-700 active:bg-blue-900 disabled:opacity-60 text-white py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg shadow-blue-800/10 hover:scale-[1.01] active:scale-[0.99] cursor-pointer mt-2"
            >
              {dangGui ? 'ĐANG ĐĂNG NHẬP…' : 'ĐĂNG NHẬP'}
            </button>
          </form>

          <div className="w-full pt-4 border-t border-slate-200 flex flex-col items-center gap-2">
            <p className="text-[11px] text-slate-500 text-center leading-relaxed font-medium">
              Hệ thống chỉ dành cho Ban điều hành và cán bộ được phân quyền.
              <br />
              Mọi lượt truy cập đều được ghi nhật ký.
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
              Quên mật khẩu? Liên hệ quản trị khu phố để cấp lại.
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-300/70 mt-5">
          KhuPhoSo · dự án phi lợi nhuận · chuyển đổi số vì cộng đồng
        </p>
      </main>
    </div>
  );
}
