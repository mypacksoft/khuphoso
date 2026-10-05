/** Tài khoản của tôi: thông tin, quyền được cấp, đổi mật khẩu. */

import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  ChuaCapNhat,
  Input,
  Spinner,
  ThanhTieuDe,
  Truong,
} from '@/components/ui';
import { post } from '@/lib/api';
import { gio } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

const TEN_MODULE: Record<string, string> = {
  resident: 'Nhân khẩu',
  household: 'Hộ khẩu',
  fund: 'Quỹ khu phố',
  settings: 'Cấu hình & nhật ký',
  report: 'Báo cáo',
  document: 'Văn bản',
};

const TEN_HANH_DONG: Record<string, string> = {
  read: 'Xem',
  write: 'Thêm / sửa',
  delete: 'Xoá',
  export: 'Xuất file',
  approve: 'Duyệt',
};

export function TaiKhoan() {
  const { user, role, permissions, khuPho } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);

  const [cu, setCu] = useState('');
  const [moi, setMoi] = useState('');
  const [lai, setLai] = useState('');
  const [kq, setKq] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dangGui, setDangGui] = useState(false);

  useEffect(() => {
    datManHinh({ tieu_de: '👤 Tài khoản của tôi' });
  }, [datManHinh]);

  if (!user) return <Spinner />;

  async function doiMatKhau(e: React.FormEvent) {
    e.preventDefault();
    setKq(null);
    if (moi.length < 10) {
      setKq({ ok: false, msg: 'Mật khẩu mới phải dài ít nhất 10 ký tự.' });
      return;
    }
    if (moi !== lai) {
      setKq({ ok: false, msg: 'Hai ô mật khẩu mới không khớp nhau.' });
      return;
    }
    setDangGui(true);
    try {
      const d = await post<{ message: string }>('/auth/change-password', {
        old_password: cu,
        new_password: moi,
      });
      setKq({ ok: true, msg: d.message });
      setCu('');
      setMoi('');
      setLai('');
    } catch (err) {
      setKq({ ok: false, msg: err instanceof Error ? err.message : 'Không đổi được mật khẩu' });
    } finally {
      setDangGui(false);
    }
  }

  const nhom = [...permissions].reduce<Record<string, string[]>>((acc, p) => {
    const [m] = p.split(':');
    (acc[m!] ??= []).push(p);
    return acc;
  }, {});

  return (
    <>
      <ThanhTieuDe
        tieu_de="Tài khoản của tôi"
        mo_ta={
          khuPho ? `Đang làm việc tại ${khuPho.name}` : 'Thông tin tài khoản và quyền được cấp'
        }
      />

      {user.must_change_password && (
        <CanhBao loai="canh" emoji="🔑">
          Tài khoản này đang dùng mật khẩu tạm do quản trị cấp. Hãy đổi mật khẩu ngay bên dưới.
        </CanhBao>
      )}

      {user.ho_tro && (
        <CanhBao loai="canh" emoji="🛟">
          Bạn đang ở <b>chế độ hỗ trợ nền tảng</b>, không phải thành viên của khu phố này. Mọi
          thao tác đều ghi vào nhật ký của khu phố kèm dấu “hỗ trợ” để Ban điều hành tra được.
        </CanhBao>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-5">
          <h4 className="font-bold text-sm text-slate-800 uppercase mb-4">Thông tin tài khoản</h4>
          <div className="space-y-3">
            {(
              [
                ['Họ và tên', user.full_name],
                ['Tên đăng nhập', user.username],
                ['Vai trò', role],
                ['Số điện thoại', user.phone],
                ['Email', user.email],
                ['Lần đăng nhập trước', user.last_login_at ? gio(user.last_login_at) : null],
              ] as [string, string | null][]
            ).map(([nhan, gt]) => (
              <div
                key={nhan}
                className="flex justify-between gap-3 py-2 border-b border-slate-100 last:border-0"
              >
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  {nhan}
                </span>
                <span className="text-xs font-semibold text-slate-800 text-right truncate">
                  {gt || <ChuaCapNhat />}
                </span>
              </div>
            ))}
            {user.is_platform_admin && (
              <Chip mau="amber">QUẢN TRỊ NỀN TẢNG</Chip>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h4 className="font-bold text-sm text-slate-800 uppercase mb-1">Đổi mật khẩu</h4>
          <p className="text-[11px] text-slate-500 font-medium mb-4">
            Đổi mật khẩu sẽ kết thúc mọi phiên đăng nhập khác của tài khoản này.
          </p>

          <form onSubmit={doiMatKhau} className="space-y-3">
            {kq && (
              <CanhBao loai={kq.ok ? 'ok' : 'loi'} emoji={kq.ok ? '✅' : '⚠️'}>
                {kq.msg}
              </CanhBao>
            )}
            <Truong nhan="Mật khẩu hiện tại" bat_buoc>
              <Input
                type="password"
                value={cu}
                onChange={(e) => setCu(e.target.value)}
                autoComplete="current-password"
              />
            </Truong>
            <Truong
              nhan="Mật khẩu mới"
              bat_buoc
              ghi_chu="Ít nhất 10 ký tự. Nên dùng một cụm từ dễ nhớ với bạn, khó đoán với người khác."
            >
              <Input
                type="password"
                value={moi}
                onChange={(e) => setMoi(e.target.value)}
                autoComplete="new-password"
              />
            </Truong>
            <Truong nhan="Nhập lại mật khẩu mới" bat_buoc>
              <Input
                type="password"
                value={lai}
                onChange={(e) => setLai(e.target.value)}
                autoComplete="new-password"
              />
            </Truong>
            <Button type="submit" disabled={dangGui || !cu || !moi} className="w-full">
              {dangGui ? 'ĐANG ĐỔI…' : 'ĐỔI MẬT KHẨU'}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <h4 className="font-bold text-sm text-slate-800 uppercase mb-1">Quyền được cấp</h4>
        <p className="text-[11px] text-slate-500 font-medium mb-4">
          Quyền do quản trị khu phố cấp theo vai trò. Cần thêm quyền thì liên hệ Ban điều hành.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(nhom).map(([m, ds]) => (
            <div key={m} className="border border-slate-200 rounded-xl p-3.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                {TEN_MODULE[m] ?? m}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ds.map((p) => (
                  <Chip key={p} mau="blue" nho>
                    {TEN_HANH_DONG[p.split(':')[1] ?? ''] ?? p}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(nhom).length === 0 && (
            <p className="text-xs text-slate-400 font-medium">Chưa được cấp quyền nào.</p>
          )}
        </div>
      </Card>
    </>
  );
}
