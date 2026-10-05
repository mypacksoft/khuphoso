/**
 * Giờ Việt Nam lấy từ MÁY CHỦ, không tin đồng hồ máy người dùng.
 *
 * Máy tính ở khu phố hay sai giờ hoặc sai múi giờ (Windows đặt sẵn múi giờ khác,
 * pin CMOS hỏng, máy ảo lệch giờ). Mà cán bộ ghi biên bản, giấy mời, phiếu thu đều
 * phải ghi giờ, nên hiển thị sai là sai vào giấy tờ.
 *
 * Cách làm: gọi `/gio` một lần để biết giờ máy chủ, tính ĐỘ LỆCH so với đồng hồ máy,
 * rồi tự chạy tiếp bằng `Date.now() + lệch`. Không phải gọi mạng mỗi giây. Đồng bộ
 * lại mỗi 10 phút và mỗi khi người dùng quay lại tab (máy ngủ dậy hay bị trôi giờ).
 */

import { useEffect, useState } from 'react';

const TZ = 'Asia/Ho_Chi_Minh';
const CHU_KY_DONG_BO = 10 * 60_000;

const BASE = import.meta.env.DEV ? '/api' : 'https://api.khuphoso.vn';

/** Độ lệch giữa đồng hồ máy chủ và đồng hồ máy này, tính bằng mili giây. */
let lech = 0;
let daDongBo = false;
const nguoiNghe = new Set<() => void>();

async function dongBo(): Promise<void> {
  const truoc = Date.now();
  try {
    const r = await fetch(`${BASE}/gio`, { cache: 'no-store' });
    if (!r.ok) return;
    const { epoch_ms } = (await r.json()) as { epoch_ms: number };
    // Trừ nửa thời gian đi–về để bù độ trễ mạng
    const sau = Date.now();
    lech = epoch_ms + (sau - truoc) / 2 - sau;
    daDongBo = true;
    nguoiNghe.forEach((f) => f());
  } catch {
    // Mất mạng thì tạm dùng đồng hồ máy, đồng bộ lại ở lần sau
  }
}

/** Thời điểm hiện tại theo máy chủ. */
export const bayGio = () => new Date(Date.now() + lech);

/** Đã đồng bộ được với máy chủ chưa — để giao diện khỏi hiện giờ sai rồi nhảy. */
export const daCoGioMayChu = () => daDongBo;

const fGio = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const fNgay = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  weekday: 'long',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const fGioSo = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hour12: false,
});

/** Giờ trong ngày (0–23) theo giờ Việt Nam — dùng cho lời chào. */
export function gioTrongNgay(t: Date = bayGio()): number {
  return Number(fGioSo.format(t));
}

export function loiChao(t: Date = bayGio()): string {
  const g = gioTrongNgay(t);
  if (g < 11) return 'Chào buổi sáng';
  if (g < 13) return 'Chào buổi trưa';
  if (g < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Đồng hồ chạy mỗi giây, bám theo giờ máy chủ. */
export function useGioVN() {
  const [t, setT] = useState(bayGio);

  useEffect(() => {
    const capNhat = () => setT(bayGio());
    nguoiNghe.add(capNhat);

    if (!daDongBo) void dongBo();

    // Nhịp vào đúng đầu giây để số giây không nhảy cóc
    let idGiay: number;
    const cho = window.setTimeout(
      () => {
        capNhat();
        idGiay = window.setInterval(capNhat, 1000);
      },
      1000 - ((Date.now() + lech) % 1000),
    );

    const idDongBo = window.setInterval(() => void dongBo(), CHU_KY_DONG_BO);
    // Máy ngủ dậy hoặc đổi tab thì đồng hồ dễ trôi — đồng bộ lại
    const khiHien = () => {
      if (document.visibilityState === 'visible') void dongBo();
    };
    document.addEventListener('visibilitychange', khiHien);

    return () => {
      nguoiNghe.delete(capNhat);
      window.clearTimeout(cho);
      window.clearInterval(idGiay);
      window.clearInterval(idDongBo);
      document.removeEventListener('visibilitychange', khiHien);
    };
  }, []);

  return {
    thoi_diem: t,
    gio: fGio.format(t),
    ngay: fNgay.format(t),
    loi_chao: loiChao(t),
    theo_may_chu: daDongBo,
  };
}
