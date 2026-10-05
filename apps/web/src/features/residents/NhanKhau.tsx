/**
 * Bốn màn hình nhân khẩu theo diện cư trú.
 *
 * Cùng một bảng nhưng vào bằng bốn đường khác nhau, diện cư trú khoá cứng theo
 * đường dẫn. Cán bộ không phải chọn bộ lọc mỗi lần — họ vào thẳng đúng danh sách
 * đang cần, y như app cũ.
 */

import { useParams } from '@tanstack/react-router';

import { CanhBao } from '@/components/ui';
import { DIEN_NHAN_KHAU } from '@/lib/dieuhuong';

import { BangCuDan } from './BangCuDan';

export function NhanKhau() {
  const { dien } = useParams({ strict: false }) as { dien?: string };
  const d = dien ? DIEN_NHAN_KHAU[dien] : undefined;

  if (!d) {
    return (
      <CanhBao loai="canh" emoji="⚠️">
        Không có diện cư trú “{dien}”. Chọn lại từ menu bên trái.
      </CanhBao>
    );
  }

  return (
    <BangCuDan
      key={dien}
      tieu_de={d.nhan}
      emoji={d.emoji}
      mo_ta={d.mo_ta}
      khoa={{ residence_status: d.api }}
    />
  );
}
