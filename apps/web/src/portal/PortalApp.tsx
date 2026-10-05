/**
 * Cổng thông tin cư dân — trang CÔNG KHAI của mỗi khu phố.
 *
 * Mở ở gốc tên miền khu phố (vd kp3-anphu.khuphoso.vn). Trang quản trị chuyển sang
 * /quanly. Không cần đăng nhập; gửi phản ánh chặn spam bằng số điện thoại + honeypot.
 *
 * Tuyệt đối không hiện dữ liệu cư dân / CCCD / hộ khẩu — chỉ thông tin công khai.
 * Dùng điều hướng theo tab (state) cho nhẹ; cư dân chủ yếu mở trên điện thoại.
 */

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Gift,
  Landmark,
  LogIn,
  MapPin,
  Megaphone,
  Phone,
  Search,
  Send,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { get, post, taiTep } from '@/lib/api';
import { vnd } from '@/lib/fmt';

const DO = '#DA251D';
const VANG = '#FFCD00';

type Tab = 'home' | 'su-kien' | 'co-so' | 'quy' | 'bieu-mau' | 'phan-anh' | 'tra-cuu';

const LOAI_SK: Record<string, string> = {
  tang_qua: 'Tặng quà',
  hop_mat: 'Họp mặt',
  van_nghe: 'Văn nghệ',
  tuyen_truyen: 'Tuyên truyền',
  khac: 'Sự kiện',
};
const LOAI_PA: Record<string, string> = {
  ha_tang: 'Hạ tầng',
  ve_sinh: 'Vệ sinh môi trường',
  an_ninh: 'An ninh',
  trat_tu: 'Trật tự đô thị',
  cay_xanh: 'Cây xanh',
  chieu_sang: 'Chiếu sáng',
  ngap_nuoc: 'Ngập nước',
  khac: 'Khác',
};
const TT_PA: Record<string, string> = {
  moi: 'Mới tiếp nhận',
  dang_xu_ly: 'Đang xử lý',
  da_chuyen_phuong: 'Đã chuyển phường',
  da_xong: 'Đã xử lý xong',
  khong_xu_ly: 'Không xử lý',
};

interface LienHe {
  chuc_vu?: string;
  ho_ten?: string;
  sdt?: string;
}
interface ThongTin {
  name: string;
  ward: string | null;
  gioi_thieu: string | null;
  lien_he: LienHe[] | null;
}
interface SuKienCK {
  id: string;
  name: string;
  event_type: string;
  starts_at: string | null;
  location: string | null;
  gift_desc: string | null;
}
interface CoSoCK {
  id: string;
  name: string;
  nganh_nghe: string | null;
  address: string | null;
  phone: string | null;
}

const dinhDangNgay = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export function PortalApp() {
  const [tab, setTab] = useState<Tab>('home');
  const { data: tt } = useQuery({
    queryKey: ['portal-thong-tin'],
    queryFn: () => get<ThongTin>('/portal/thong-tin'),
  });

  const NAV: { id: Tab; nhan: string; icon: typeof Gift }[] = [
    { id: 'home', nhan: 'Trang chủ', icon: Landmark },
    { id: 'su-kien', nhan: 'Sự kiện', icon: Gift },
    { id: 'co-so', nhan: 'Cơ sở KD', icon: Building2 },
    { id: 'quy', nhan: 'Công khai quỹ', icon: Wallet },
    { id: 'bieu-mau', nhan: 'Biểu mẫu', icon: ClipboardList },
    { id: 'phan-anh', nhan: 'Gửi phản ánh', icon: Megaphone },
    { id: 'tra-cuu', nhan: 'Tra cứu', icon: Search },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header cờ */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: DO }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => setTab('home')} className="flex items-center gap-3 text-left">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl font-black"
              style={{ background: VANG, color: DO }}
            >
              ★
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-white uppercase sm:text-base">
                {tt?.name ?? 'Khu phố'}
              </h1>
              <p className="truncate text-[10.5px] font-medium text-white/80">
                {tt?.ward ?? 'Cổng thông tin cư dân'}
              </p>
            </div>
          </button>
          <a
            href="/quanly"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-[11px] font-bold text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            <LogIn className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Quản trị</span>
          </a>
        </div>
        {/* Nav */}
        <nav className="border-t border-white/15">
          <div className="mx-auto flex max-w-5xl gap-0.5 overflow-x-auto px-2">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-[3px] px-3 py-2.5 text-xs font-bold transition ${
                  tab === n.id ? 'text-white' : 'border-transparent text-white/70 hover:text-white'
                }`}
                style={tab === n.id ? { borderBottomColor: VANG } : undefined}
              >
                <n.icon className="h-4 w-4" /> {n.nhan}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === 'home' && <TrangChu tt={tt} onTab={setTab} />}
        {tab === 'su-kien' && <SuKienCK />}
        {tab === 'co-so' && <CoSoCK />}
        {tab === 'quy' && <QuyCK />}
        {tab === 'bieu-mau' && <BieuMauCK />}
        {tab === 'phan-anh' && <GuiPhanAnh />}
        {tab === 'tra-cuu' && <TraCuu />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-[11px] text-slate-400">
        <p>
          {tt?.name ?? 'Khu phố'} · Cổng thông tin cư dân · nền tảng{' '}
          <b className="text-slate-500">KhuPhoSo</b>
        </p>
        <p className="mt-1">Dự án phi lợi nhuận · chuyển đổi số vì cộng đồng</p>
      </footer>
    </div>
  );
}

/* ───────────────────────────── Trang chủ ───────────────────────────── */

function TrangChu({ tt, onTab }: { tt?: ThongTin; onTab: (t: Tab) => void }) {
  const { data: sk } = useQuery({
    queryKey: ['portal-su-kien'],
    queryFn: () => get<{ items: SuKienCK[] }>('/portal/su-kien'),
  });
  const sapToi = (sk?.items ?? []).slice(0, 3);

  const ONhanh = [
    { id: 'su-kien' as Tab, nhan: 'Sự kiện khu phố', icon: Gift, mau: '#DA251D' },
    { id: 'phan-anh' as Tab, nhan: 'Gửi phản ánh', icon: Megaphone, mau: '#0891b2' },
    { id: 'co-so' as Tab, nhan: 'Cơ sở kinh doanh', icon: Building2, mau: '#d97706' },
    { id: 'tra-cuu' as Tab, nhan: 'Tra cứu phản ánh', icon: Search, mau: '#059669' },
  ];

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl p-6 text-white shadow-md"
        style={{ background: `linear-gradient(135deg, ${DO}, #a01510)` }}
      >
        <h2 className="text-lg font-extrabold sm:text-xl">
          Chào mừng đến với {tt?.name ?? 'khu phố'}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/90">
          {tt?.gioi_thieu ??
            'Trang thông tin công khai của khu phố: sự kiện, cơ sở kinh doanh, công khai quỹ, và tiếp nhận phản ánh của bà con.'}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ONhanh.map((o) => (
          <button
            key={o.id}
            onClick={() => onTab(o.id)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
              style={{ background: o.mau }}
            >
              <o.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-slate-700">{o.nhan}</span>
          </button>
        ))}
      </div>

      {/* Công khai quỹ của khu phố */}
      <button
        onClick={() => onTab('quy')}
        className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:bg-emerald-100"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-900">Công khai quỹ khu phố</p>
          <p className="text-[11px] text-emerald-700">
            Xem số dư và các khoản chi của những quỹ khu phố công khai
          </p>
        </div>
      </button>

      {sapToi.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-extrabold text-slate-800">Sự kiện sắp tới</h3>
          <div className="space-y-2">
            {sapToi.map((e) => (
              <TheSuKien key={e.id} e={e} />
            ))}
          </div>
        </section>
      )}

      {tt?.lien_he && tt.lien_he.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
            <Phone className="h-4 w-4" style={{ color: DO }} /> Liên hệ ban điều hành
          </h3>
          <div className="space-y-1.5 text-xs">
            {tt.lien_he.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-slate-50 pb-1.5 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{l.ho_ten || '—'}</p>
                  {l.chuc_vu && <p className="text-[10.5px] text-slate-500">{l.chuc_vu}</p>}
                </div>
                {l.sdt && (
                  <a href={`tel:${l.sdt}`} className="shrink-0 font-mono font-bold" style={{ color: DO }}>
                    {l.sdt}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TheSuKien({ e }: { e: SuKienCK }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: DO }}
      >
        <Gift className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{e.name}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {e.starts_at ? dinhDangNgay(e.starts_at) : 'Chưa định ngày'}
          </span>
          {e.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {e.location}
            </span>
          )}
          <span className="font-semibold" style={{ color: DO }}>
            {LOAI_SK[e.event_type]}
          </span>
        </p>
        {e.gift_desc && <p className="mt-1 text-[11px] text-slate-600">🎁 {e.gift_desc}</p>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Sự kiện ───────────────────────────── */

function SuKienCK() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-su-kien'],
    queryFn: () => get<{ items: SuKienCK[] }>('/portal/su-kien'),
  });
  const items = data?.items ?? [];
  return (
    <div>
      <h2 className="mb-3 text-base font-extrabold text-slate-800">Sự kiện khu phố</h2>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Chưa có sự kiện nào được công bố.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <TheSuKien key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Cơ sở KD ───────────────────────────── */

function CoSoCK() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['portal-co-so'],
    queryFn: () => get<{ items: CoSoCK[] }>('/portal/co-so-kinh-doanh'),
  });
  const loc = (data?.items ?? []).filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.nganh_nghe ?? '').toLowerCase().includes(q.toLowerCase()) ||
      (c.address ?? '').toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div>
      <h2 className="mb-3 text-base font-extrabold text-slate-800">Cơ sở kinh doanh</h2>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm quán ăn, tạp hoá, ngành nghề…"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-3 pl-10 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : loc.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Không có cơ sở nào.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {loc.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-slate-900">{c.name}</p>
              {c.nganh_nghe && (
                <span
                  className="mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: '#fff7da', color: '#92610a' }}
                >
                  {c.nganh_nghe}
                </span>
              )}
              {c.address && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.address}
                </p>
              )}
              {c.phone && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-mono text-slate-600">
                  <Phone className="h-3.5 w-3.5" /> {c.phone}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Gửi phản ánh ───────────────────────────── */

function GuiPhanAnh() {
  const [f, setF] = useState({
    title: '',
    loai: 'khac',
    dia_chi: '',
    mo_ta: '',
    nguoi_bao: '',
    dien_thoai: '',
    website: '', // honeypot
  });
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [maPhieu, setMaPhieu] = useState<string | null>(null);

  const gui = async () => {
    setLoi('');
    if (f.title.trim().length < 3) {
      setLoi('Vui lòng mô tả ngắn gọn vấn đề (ít nhất 3 ký tự)');
      return;
    }
    if (f.dien_thoai.replace(/\D/g, '').length < 8) {
      setLoi('Vui lòng nhập số điện thoại để ban điều hành liên hệ lại');
      return;
    }
    setDangGui(true);
    try {
      const r = await post<{ success: boolean; id: string | null }>('/portal/phan-anh', f);
      setMaPhieu(r.id ? r.id.slice(0, 8) : '—');
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không gửi được, vui lòng thử lại');
    } finally {
      setDangGui(false);
    }
  };

  if (maPhieu) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-2 text-base font-extrabold text-emerald-900">Đã gửi phản ánh!</h2>
        <p className="mt-1 text-sm text-emerald-800">
          Cảm ơn bạn. Ban điều hành khu phố đã tiếp nhận và sẽ xử lý.
        </p>
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="text-[11px] text-slate-500">Mã phiếu của bạn (lưu lại để tra cứu)</p>
          <p className="font-mono text-lg font-black tracking-widest" style={{ color: DO }}>
            {maPhieu}
          </p>
        </div>
        <button
          onClick={() => {
            setMaPhieu(null);
            setF({ title: '', loai: 'khac', dia_chi: '', mo_ta: '', nguoi_bao: '', dien_thoai: '', website: '' });
          }}
          className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: DO }}
        >
          Gửi phản ánh khác
        </button>
      </div>
    );
  }

  const O = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none';
  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-1 text-base font-extrabold text-slate-800">Gửi phản ánh hiện trường</h2>
      <p className="mb-4 text-xs text-slate-500">
        Rác thải, ngập nước, đèn đường hỏng, lấn chiếm… Ban điều hành khu phố tiếp nhận và xử lý.
        Không cần đăng nhập.
      </p>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        {loi && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {loi}
          </p>
        )}
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">Vấn đề phản ánh *</label>
          <input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="vd Nắp cống vỡ trước hẻm 42"
            className={O}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Loại</label>
            <select value={f.loai} onChange={(e) => setF({ ...f, loai: e.target.value })} className={O}>
              {Object.entries(LOAI_PA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Địa điểm</label>
            <input
              value={f.dia_chi}
              onChange={(e) => setF({ ...f, dia_chi: e.target.value })}
              placeholder="Số nhà, đường, hẻm…"
              className={O}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">Mô tả chi tiết</label>
          <textarea
            value={f.mo_ta}
            onChange={(e) => setF({ ...f, mo_ta: e.target.value })}
            rows={3}
            className={O + ' resize-y'}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tên của bạn</label>
            <input
              value={f.nguoi_bao}
              onChange={(e) => setF({ ...f, nguoi_bao: e.target.value })}
              className={O}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Số điện thoại *</label>
            <input
              value={f.dien_thoai}
              onChange={(e) => setF({ ...f, dien_thoai: e.target.value })}
              inputMode="tel"
              className={O}
            />
          </div>
        </div>
        {/* Honeypot — ẩn khỏi người thật */}
        <input
          tabIndex={-1}
          autoComplete="off"
          value={f.website}
          onChange={(e) => setF({ ...f, website: e.target.value })}
          className="hidden"
          aria-hidden="true"
        />
        <button
          onClick={gui}
          disabled={dangGui}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: DO }}
        >
          <Send className="h-4 w-4" /> {dangGui ? 'ĐANG GỬI…' : 'GỬI PHẢN ÁNH'}
        </button>
        <p className="text-center text-[10.5px] text-slate-400">
          Số điện thoại chỉ dùng để ban điều hành liên hệ lại, không công khai.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── Tra cứu ───────────────────────────── */

interface KetQuaTC {
  id: string;
  title: string;
  loai: string;
  trang_thai: string;
  ly_do: string | null;
  ket_qua: string | null;
  created_at: string;
  ngay_xong: string | null;
}

function TraCuu() {
  const [ma, setMa] = useState('');
  const [sdt, setSdt] = useState('');
  const [kq, setKq] = useState<KetQuaTC | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);

  const tra = async () => {
    setLoi('');
    setKq(null);
    if (!ma.trim() || !sdt.trim()) {
      setLoi('Nhập mã phiếu và số điện thoại đã dùng khi gửi');
      return;
    }
    setDang(true);
    try {
      const r = await get<KetQuaTC>(
        `/portal/phan-anh/tra-cuu?${new URLSearchParams({ ma: ma.trim(), dien_thoai: sdt.trim() }).toString()}`,
      );
      setKq(r);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không tìm thấy');
    } finally {
      setDang(false);
    }
  };

  const O = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none';
  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-1 text-base font-extrabold text-slate-800">Tra cứu phản ánh của tôi</h2>
      <p className="mb-4 text-xs text-slate-500">
        Nhập mã phiếu (8 ký tự nhận khi gửi) và số điện thoại đã dùng.
      </p>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        {loi && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {loi}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Mã phiếu</label>
            <input value={ma} onChange={(e) => setMa(e.target.value)} className={O + ' font-mono'} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Số điện thoại</label>
            <input value={sdt} onChange={(e) => setSdt(e.target.value)} inputMode="tel" className={O} />
          </div>
        </div>
        <button
          onClick={tra}
          disabled={dang}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: DO }}
        >
          <Search className="h-4 w-4" /> {dang ? 'ĐANG TRA…' : 'TRA CỨU'}
        </button>
      </div>

      {kq && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">{kq.title}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
              {LOAI_PA[kq.loai]}
            </span>
            <span
              className="rounded-md px-2 py-0.5 font-bold text-white"
              style={{ background: kq.trang_thai === 'da_xong' ? '#059669' : DO }}
            >
              {TT_PA[kq.trang_thai]}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Gửi ngày {dinhDangNgay(kq.created_at)}</p>
          {kq.ket_qua && <p className="mt-1 text-xs text-slate-700">Kết quả: {kq.ket_qua}</p>}
          {kq.ly_do && <p className="mt-1 text-xs text-slate-700">Ghi chú: {kq.ly_do}</p>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Biểu mẫu ───────────────────────────── */

interface BieuMau {
  id: string;
  ten: string;
  mo_ta: string | null;
  nhom: string;
  url: string | null;
  files?: { id: string; ten_goc: string; kich_thuoc: number }[];
}
const NHOM_BM: Record<string, string> = {
  cu_tru: 'Cư trú',
  kinh_doanh: 'Kinh doanh',
  dan_chu: 'Dân chủ cơ sở',
  khac: 'Khác',
};

function BieuMauCK() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-bieu-mau'],
    queryFn: () => get<{ items: BieuMau[] }>('/portal/bieu-mau'),
  });
  const items = data?.items ?? [];
  const nhoms = [...new Set(items.map((i) => i.nhom))];

  return (
    <div>
      <h2 className="mb-1 text-base font-extrabold text-slate-800">Biểu mẫu &amp; thủ tục</h2>
      <p className="mb-4 text-xs text-slate-500">
        Các biểu mẫu thường dùng. Bấm để mở / tải về từ nguồn chính thức.
      </p>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Chưa có biểu mẫu nào.
        </p>
      ) : (
        <div className="space-y-4">
          {nhoms.map((nh) => (
            <section key={nh}>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
                {NHOM_BM[nh] ?? nh}
              </h3>
              <div className="space-y-2">
                {items
                  .filter((i) => i.nhom === nh)
                  .map((b) => {
                    const fs = b.files ?? [];
                    return (
                      <div
                        key={b.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                            <FileText className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900">{b.ten}</p>
                            {b.mo_ta && <p className="mt-0.5 text-[11px] text-slate-500">{b.mo_ta}</p>}
                          </div>
                        </div>
                        {fs.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {fs.map((file) => (
                              <button
                                key={file.id}
                                onClick={() =>
                                  taiTep(`/portal/bieu-mau/file/${file.id}`, file.ten_goc).catch(() => {})
                                }
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700"
                              >
                                <Download className="h-3.5 w-3.5" /> {file.ten_goc}
                              </button>
                            ))}
                          </div>
                        ) : b.url ? (
                          <a
                            href={b.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-50"
                          >
                            <Download className="h-3.5 w-3.5" /> Mở / tải từ nguồn chính thức
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Công khai quỹ ───────────────────────────── */

interface QuyItem {
  name: string;
  description: string | null;
  so_du: number;
  tong_thu: number;
  tong_chi: number;
}
interface ChiItem {
  description: string;
  payee: string | null;
  amount: number;
  paid_at: string | null;
  ten_quy: string;
}

function QuyCK() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-quy'],
    queryFn: () =>
      get<{ funds: QuyItem[]; chi_gan_day: ChiItem[]; tong_so_du: number }>('/portal/quy'),
  });

  if (isLoading) return <p className="py-10 text-center text-sm text-slate-400">Đang tải…</p>;
  const funds = data?.funds ?? [];
  const chi = data?.chi_gan_day ?? [];

  if (funds.length === 0) {
    return (
      <div>
        <h2 className="mb-3 text-base font-extrabold text-slate-800">Công khai quỹ khu phố</h2>
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Khu phố chưa công khai quỹ nào. Khi ban điều hành bật công khai, số dư và các khoản chi sẽ
          hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-extrabold text-slate-800">Công khai quỹ khu phố</h2>

      <div
        className="rounded-2xl p-5 text-center text-white shadow-md"
        style={{ background: `linear-gradient(135deg, #047857, #059669)` }}
      >
        <p className="text-[11px] font-bold tracking-wider text-emerald-100 uppercase">
          Tổng số dư các quỹ công khai
        </p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums">{vnd(data?.tong_so_du ?? 0)}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {funds.map((f) => (
          <div key={f.name} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">{f.name}</p>
            {f.description && <p className="mt-0.5 text-[11px] text-slate-500">{f.description}</p>}
            <p className="mt-2 text-lg font-extrabold tabular-nums" style={{ color: '#047857' }}>
              {vnd(f.so_du)}
            </p>
            <div className="mt-1 flex gap-3 text-[11px] font-semibold">
              <span className="text-emerald-700">↓ Thu {vnd(f.tong_thu)}</span>
              <span className="text-rose-700">↑ Chi {vnd(f.tong_chi)}</span>
            </div>
          </div>
        ))}
      </div>

      {chi.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-extrabold text-slate-800">Các khoản chi gần đây</h3>
          <div className="divide-y divide-slate-100">
            {chi.map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">{c.description}</p>
                  <p className="text-[10.5px] text-slate-400">
                    {c.ten_quy}
                    {c.payee ? ` · ${c.payee}` : ''}
                    {c.paid_at ? ` · ${dinhDangNgay(c.paid_at)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-rose-700 tabular-nums">
                  {vnd(c.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
