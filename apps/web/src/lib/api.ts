/**
 * Lớp gọi API dùng chung.
 *
 * Access token giữ trong bộ nhớ (không sessionStorage) để giảm bề mặt XSS;
 * refresh token nằm ở cookie httpOnly nên trình duyệt tự gửi kèm.
 * Gặp 401 thì thử refresh đúng MỘT lần rồi gọi lại — nhiều request 401 cùng lúc
 * cùng chờ một lời gọi refresh chứ không gọi song song.
 */

const BASE = import.meta.env.DEV ? '/api' : 'https://api.khuphoso.vn';

/**
 * Tenant lấy từ chính tên miền đang truy cập.
 * `kp3-anphu.khuphoso.vn` -> `kp3-anphu`, và người dùng không phải gõ gì.
 * Trên `app.` / `admin.` (subdomain dùng chung) thì mới cần chọn tay.
 */
const DUNG_CHUNG = new Set([
  'app',
  'admin',
  'api',
  'www',
  'cdn',
  'docs',
  'status',
  'minhbach',
  'roadmap',
  'blog',
]);

export function tenantTuHost(): string | null {
  const h = location.hostname;
  if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  const phan = h.split('.');
  if (phan.length < 3) return null;
  const sub = phan[0]!;
  return DUNG_CHUNG.has(sub) ? null : sub;
}

/** Subdomain khu phố thì tenant là cố định, không cho đổi. */
export const tenantCoDinh = tenantTuHost();

let accessToken: string | null = null;
/**
 * KHÔNG có khu phố mặc định.
 *
 * Trước đây chỗ này ghi cứng `?? 'kp3-anphu'` cho tiện lúc phát triển, hậu quả là
 * `admin.khuphoso.vn` mở ra sổ sách của Khu phố 3 — một khu phố nhìn thấy dữ liệu
 * khu phố khác. Tên miền quyết định khu phố, không có tên miền thì không có khu phố.
 */
let tenantSlug: string = tenantCoDinh ?? '';
let refreshing: Promise<boolean> | null = null;

export const auth = {
  get token() {
    return accessToken;
  },
  set token(v: string | null) {
    accessToken = v;
  },
  get tenant() {
    return tenantSlug;
  },
  set tenant(v: string) {
    if (tenantCoDinh) return; // tên miền đã quyết định, bỏ qua
    tenantSlug = v;
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: dauKhuPho(),
      });
      if (!r.ok) return false;
      accessToken = (await r.json()).access_token;
      return true;
    } catch {
      return false;
    } finally {
      // để lời gọi tiếp theo có thể refresh lại khi cần
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/**
 * Chỉ gửi `X-Tenant-Slug` khi thật sự có khu phố.
 *
 * Gửi chuỗi rỗng thì máy chủ phải đoán ý; không gửi gì thì rõ ràng — đây là
 * yêu cầu ở cấp nền tảng, không thuộc khu phố nào.
 */
function dauKhuPho(): Record<string, string> {
  return tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const { retry = true, ...init } = opts;
  const res = await fetch(BASE + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...dauKhuPho(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return api<T>(path, { ...opts, retry: false });
  }

  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = (body as { detail?: string }).detail;
    throw new ApiError(res.status, detail ?? `Lỗi ${res.status}`);
  }
  return body as T;
}

/**
 * Gửi tệp lên (multipart).
 *
 * Không đặt `Content-Type`: trình duyệt phải tự thêm để kèm được `boundary`.
 * Vì thế không dùng chung `api()` được — hàm đó luôn đặt `application/json`.
 */
export async function postForm<T = unknown>(path: string, fd: FormData, retry = true): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    body: fd,
    credentials: 'include',
    headers: {
      ...dauKhuPho(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (res.status === 401 && retry && (await tryRefresh())) {
    return postForm<T>(path, fd, false);
  }
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    throw new ApiError(res.status, (body as { detail?: string }).detail ?? `Lỗi ${res.status}`);
  }
  return body as T;
}

/**
 * Tải tệp về máy.
 *
 * Không dùng `<a href>` thẳng được: access token nằm trong bộ nhớ chứ không phải
 * cookie, thẻ `<a>` không gửi được `Authorization` nên máy chủ sẽ trả 401. Phải
 * fetch có token, lấy blob, rồi mới dựng liên kết tạm để trình duyệt lưu xuống.
 */
export async function taiTep(path: string, ten_goc: string, retry = true): Promise<void> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: {
      ...dauKhuPho(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (res.status === 401 && retry && (await tryRefresh())) {
    return taiTep(path, ten_goc, false);
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => b?.detail)
      .catch(() => null);
    throw new ApiError(res.status, detail ?? `Không tải được tệp (lỗi ${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = ten_goc;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi ngay thì Safari huỷ mất lượt tải; chờ một nhịp cho chắc
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const get = <T>(p: string) => api<T>(p);
export const post = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const patch = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const put = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
export const del = <T>(p: string) => api<T>(p, { method: 'DELETE' });

/**
 * Tải nội dung nhị phân (ảnh) kèm header khu phố, trả về object URL để gán vào <img>.
 * Dùng cho cổng công khai: <img src> không gửi được X-Tenant-Slug nên phải fetch tay.
 * Nhớ URL.revokeObjectURL khi gỡ ảnh.
 */
export async function taiBlobUrl(path: string): Promise<string> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: {
      ...dauKhuPho(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, `Lỗi ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Ghép query string, bỏ qua giá trị rỗng/undefined. */
export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/**
 * Ghi một lượt mở trang.
 *
 * KHÔNG THEO DÕI TỪNG NGƯỜI. Chỉ gửi đường dẫn và một mã phiên ngẫu nhiên sống
 * trong `sessionStorage` — đóng tab là mất. Không gửi tài khoản, không đặt mã
 * theo dõi lâu dài. Máy chủ băm mã phiên theo ngày rồi mới dùng.
 *
 * Hỏng thì im lặng: thống kê không đáng làm gãy màn hình của ai.
 */
export function ghiLuotXem(duong_dan: string): void {
  try {
    let phien = sessionStorage.getItem('kp_phien');
    if (!phien) {
      phien = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('kp_phien', phien);
    }
    void fetch(`${BASE}/luot-xem`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...dauKhuPho() },
      body: JSON.stringify({ duong_dan, phien }),
    }).catch(() => {});
  } catch {
    /* thống kê hỏng thì thôi, không làm phiền người dùng */
  }
}
