/**
 * Thanh bên 280px — nền tối slate-900, nhấn xanh dương.
 */

import { Link, useRouterState } from '@tanstack/react-router';
import { LogOut, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Accordion } from '@/components/Accordion';
import { cx, XacNhan } from '@/components/ui';
import { DIEU_HUONG, type Muc } from '@/lib/dieuhuong';

import { useAuth, useUi } from '@/lib/store';

function MucCon({ to, nhan, chon }: { to: string; nhan: string; chon: boolean }) {
  const { dongSidebar } = useUi();
  return (
    <Link
      to={to}
      onClick={dongSidebar}
      className={cx(
        'block w-full text-left py-1.5 px-3 text-xs rounded-lg font-medium transition-all duration-150 cursor-pointer',
        chon
          ? 'text-sky-300 bg-sky-500/15 font-semibold'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
      )}
    >
      {nhan}
    </Link>
  );
}

function MotMuc({ m, duong }: { m: Muc; duong: string }) {
  const { can } = useAuth();
  const { dongSidebar } = useUi();

  const con = (m.con ?? []).filter((c) => !c.quyen || can(c.quyen));
  const trongNhom = con.some((c) => duong === c.to);
  const [mo, setMo] = useState(trongNhom);
  useEffect(() => {
    if (trongNhom) setMo(true);
  }, [trongNhom]);

  if (m.quyen && !can(m.quyen)) return null;
  if (m.con && con.length === 0) return null;

  if (!m.con) {
    const chon = duong === m.to;
    return (
      <Link
        to={m.to!}
        onClick={dongSidebar}
        className={cx(
          'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide uppercase',
          'transition-all duration-200 text-left cursor-pointer border-l-[3px]',
          chon
            ? 'text-white bg-sky-500/15 border-sky-400'
            : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60',
        )}
      >
        <m.icon className={cx('w-4.5 h-4.5 shrink-0', chon ? 'text-sky-400' : 'text-slate-500')} />
        <span>{m.nhan}</span>
      </Link>
    );
  }

  return (
    <Accordion mo={mo} onToggle={() => setMo((v) => !v)} tieu_de={m.nhan} icon={m.icon} dang_chon={trongNhom}>
      {con.map((c) => (
        <MucCon key={c.to} to={c.to} nhan={c.nhan} chon={duong === c.to} />
      ))}
    </Accordion>
  );
}

export function Sidebar() {
  const duong = useRouterState({ select: (s) => s.location.pathname });
  const { user, khuPho, dangXuat } = useAuth();
  const { sidebarMo, dongSidebar } = useUi();
  const [hoiDangXuat, setHoiDangXuat] = useState(false);

  return (
    <>
      {sidebarMo && (
        <button
          aria-label="Đóng menu"
          onClick={dongSidebar}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] z-45 lg:hidden transition-all cursor-default"
        />
      )}

      <aside
        className={cx(
          'fixed left-0 top-0 h-full w-[280px] bg-slate-900 text-slate-100 border-r border-slate-800',
          'shadow-2xl lg:shadow-sm flex flex-col p-4 space-y-4 z-50 overflow-y-auto',
          'transition-transform duration-300 lg:translate-x-0',
          sidebarMo ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-900/40 bg-gradient-to-tr from-blue-700 to-sky-400">
              <span className="text-xl">🏠</span>
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight uppercase truncate">
                {khuPho?.name ?? 'KHU PHỐ SỐ'}
              </h1>
              <p className="text-[10px] text-sky-400 font-semibold tracking-widest uppercase truncate">
                {khuPho?.ward ?? 'Nền tảng quản trị khu phố'}
              </p>
            </div>
          </div>
          <button
            onClick={dongSidebar}
            aria-label="Đóng menu"
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {DIEU_HUONG.map((m) => (
            <MotMuc key={m.id} m={m} duong={duong} />
          ))}
        </nav>

        <div className="pt-4 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-3 px-1">
            <Link
              to="/tai-khoan"
              onClick={dongSidebar}
              className="w-9 h-9 rounded-full ring-2 ring-sky-400/20 bg-sky-500/15 text-sky-300 shrink-0 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors hover:bg-sky-500/25"
              title="Tài khoản của tôi"
            >
              {(user?.full_name ?? '?').trim().charAt(0).toUpperCase()}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate" title={user?.full_name}>
                {user?.full_name ?? 'Ban điều hành'}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider truncate">
                {user?.role ?? 'Cán bộ khu phố'}
              </p>
            </div>
            <button
              onClick={() => setHoiDangXuat(true)}
              className="text-slate-400 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

      <XacNhan
        nhan_nut="ĐĂNG XUẤT"
        nhan_dang_lam="ĐANG ĐĂNG XUẤT…"
        muc_do="thuong"
        mo={hoiDangXuat}
        dong={() => setHoiDangXuat(false)}
        tieu_de="Xác nhận đăng xuất"
        loi_nhan={
          <>
            <p>Bạn có chắc muốn đăng xuất khỏi hệ thống quản trị khu phố?</p>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Phiên làm việc hiện tại sẽ được kết thúc an toàn.
            </p>
          </>
        }
        onXacNhan={() => {
          setHoiDangXuat(false);
          void dangXuat();
        }}
      />
    </>
  );
}
