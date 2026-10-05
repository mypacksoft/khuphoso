/** Định dạng dữ liệu cho người Việt đọc. */

export const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

export const so = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

export const ngay = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const gio = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';

/** Bỏ dấu tiếng Việt để so khớp phía client. */
export const khongDau = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
