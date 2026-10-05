/**
 * Service worker — chỉ để cài được lên màn hình chính và mở nhanh khi mạng chậm.
 *
 * KHÔNG lưu bất kỳ dữ liệu API nào xuống máy. Dữ liệu cư dân có CCCD, diện chính
 * sách, thông tin đảng viên — để lại trên điện thoại cán bộ là rủi ro lộ lọt nếu
 * mất máy, và Luật Bảo vệ dữ liệu cá nhân 91/2025 coi đó là dữ liệu nhạy cảm.
 * Bộ nhớ đệm ở đây chỉ chứa khung ứng dụng: HTML, JS, CSS, biểu tượng.
 */

const PHIEN_BAN = 'khuphoso-v1';
const KHUNG = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PHIEN_BAN).then((c) => c.addAll(KHUNG)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ten) => Promise.all(ten.filter((t) => t !== PHIEN_BAN).map((t) => caches.delete(t))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Tuyệt đối không đụng vào API và bản đồ — dữ liệu phải luôn lấy mới
  if (
    url.hostname.startsWith('api.') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('unpkg.com')
  ) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Trang HTML: LUÔN lấy từ mạng, bỏ qua mọi bộ đệm trung gian.
  // `cache: 'reload'` bắt buộc vì Cloudflare đứng trước máy chủ có thể trả bản
  // HTML cũ trỏ tới gói JS đã bị thay — người dùng kẹt bản cũ mà không biết.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
        .then((res) => {
          const ban_sao = res.clone();
          void caches.open(PHIEN_BAN).then((c) => c.put('/', ban_sao));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Tệp tĩnh có mã băm trong tên: lấy từ bộ đệm trước cho nhanh
  e.respondWith(
    caches.match(req).then(
      (da_co) =>
        da_co ??
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const ban_sao = res.clone();
            void caches.open(PHIEN_BAN).then((c) => c.put(req, ban_sao));
          }
          return res;
        }),
    ),
  );
});
