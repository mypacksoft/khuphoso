/**
 * Năm khối đoàn thể & chính sách: Chi Bộ, Chính Quyền, Đoàn Thể, Chính sách, Nhóm Khác.
 *
 * Vào khối nào là thấy ngay nhóm mặc định của khối đó (Chi Bộ → đảng viên, Chính Quyền
 * → ban điều hành…), rồi chuyển nhóm khác trong cùng khối bằng dải nút phía trên.
 * Cán bộ nghĩ theo "khối", không nghĩ theo "mã phân loại".
 *
 * Danh sách nhóm đọc từ CSDL (`classification.khoi`) chứ không viết cứng — khu phố
 * nào thêm nhóm riêng thì nhóm đó tự hiện ở đúng khối.
 */

import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ClipboardList, Settings2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CanhBao, Card, cx, Spinner } from '@/components/ui';
import { get } from '@/lib/api';
import { KHOI_DOAN_THE, MAU_KHOI } from '@/lib/dieuhuong';
import { useAuth } from '@/lib/store';
import type { PhanLoai } from '@/lib/types';

import { BangCuDan } from '../residents/BangCuDan';
import { QuanLyNhom } from './QuanLyNhom';
import { SoNhom } from './SoNhom';

export function DoanThe() {
  const { khoi } = useParams({ strict: false }) as { khoi?: string };
  const k = khoi ? KHOI_DOAN_THE[khoi] : undefined;

  const { data: danhMuc } = useQuery({
    queryKey: ['phan-loai'],
    queryFn: () => get<PhanLoai[]>('/cu-dan/danh-muc/phan-loai'),
    staleTime: 30 * 60_000,
  });

  const [nhom, setNhom] = useState<string | null>(null);
  const [moQuanLy, setMoQuanLy] = useState(false);
  const [xem, setXem] = useState<'danh_sach' | 'so_nhom'>('danh_sach');
  const { can } = useAuth();

  // Đổi khối thì quay về nhóm mặc định của khối đó
  useEffect(() => setNhom(null), [khoi]);

  if (!k) {
    return (
      <CanhBao loai="canh" emoji="⚠️">
        Không có khối “{khoi}”. Chọn lại từ menu bên trái.
      </CanhBao>
    );
  }
  if (!danhMuc) {
    return (
      <Card>
        <Spinner label="Đang tải danh mục nhóm…" />
      </Card>
    );
  }

  const trongKhoi = danhMuc.filter((c) => c.khoi === k.khoi);
  const dangChon =
    nhom ?? (trongKhoi.some((c) => c.code === k.mac_dinh) ? k.mac_dinh : trongKhoi[0]?.code);

  if (!dangChon) {
    return (
      <CanhBao loai="canh" emoji="📂">
        Khối <b>{k.nhan}</b> chưa có nhóm nào. Thêm nhóm trong danh mục phân loại của khu phố.
      </CanhBao>
    );
  }

  const hienTai = trongKhoi.find((c) => c.code === dangChon);
  const mau = MAU_KHOI[k.khoi] ?? MAU_KHOI.nhom_khac!;

  return (
    <>
      {/* Dải nút chọn nhóm trong khối */}
      <Card className="p-2">
        <div className="flex flex-wrap gap-1.5">
          {trongKhoi.map((c) => {
            const chon = c.code === dangChon;
            return (
              <button
                key={c.code}
                onClick={() => setNhom(c.code)}
                className={cx(
                  'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer',
                  chon ? `${mau.chon} shadow-sm` : 'text-slate-500 hover:bg-slate-50',
                )}
              >
                {chon && '• '}
                {c.name}
                {c.is_sensitive && (
                  <span
                    className="ml-1.5 opacity-70"
                    title="Dữ liệu nhạy cảm — mọi lượt xem chi tiết đều ghi nhật ký"
                  >
                    🔒
                  </span>
                )}
              </button>
            );
          })}

          {can('resident:write') && (
            <button
              onClick={() => setMoQuanLy(true)}
              title="Thêm hội, tổ, ban của khu phố — thêm xong hiện ngay ở đây"
              className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-500 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Quản lý nhóm
            </button>
          )}
        </div>
      </Card>

      {moQuanLy && <QuanLyNhom khoi={k.khoi} onClose={() => setMoQuanLy(false)} />}

      {/* Hai cách nhìn cùng một nhóm: danh sách nhân khẩu, và sổ theo dõi sinh hoạt */}
      <Card className="p-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['danh_sach', 'Danh sách nhân khẩu', Users],
              ['so_nhom', 'Sổ theo dõi sinh hoạt', ClipboardList],
            ] as const
          ).map(([k2, nhan, Icon]) => (
            <button
              key={k2}
              onClick={() => setXem(k2)}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                xem === k2 ? `${mau.chon} shadow-sm` : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {nhan}
            </button>
          ))}
        </div>
      </Card>

      {hienTai?.is_sensitive && (
        <CanhBao loai="canh" emoji="🔒">
          <b>{hienTai.name}</b> là dữ liệu cá nhân nhạy cảm theo Luật Bảo vệ dữ liệu cá nhân
          91/2025/QH15. Chỉ dùng cho công tác của khu phố, không sao chép ra ngoài. Mọi lượt xem hồ
          sơ chi tiết đều được ghi vào nhật ký của khu phố.
        </CanhBao>
      )}

      {xem === 'so_nhom' ? (
        <SoNhom key={dangChon} ma={dangChon} ten={hienTai?.name ?? dangChon} />
      ) : (
        <BangCuDan
          key={`${khoi}-${dangChon}`}
          tieu_de={`${k.nhan} — ${hienTai?.name ?? dangChon}`}
          emoji={k.emoji}
          mo_ta={`Danh sách nhân khẩu thuộc khối ${k.nhan.toLowerCase()}`}
          khoa={{ phan_loai: dangChon }}
          nhom_trong_khoi={trongKhoi}
          cot_phan_loai={false}
        />
      )}
    </>
  );
}
