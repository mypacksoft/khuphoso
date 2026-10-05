/**
 * Quản lý nhóm trong khối — khu phố tự thêm hội, tổ, ban của mình.
 *
 * Danh sách mặc định (Hội Phụ nữ, Đoàn Thanh niên, Tổ dân phòng…) chỉ là chỗ bắt
 * đầu. Mỗi khu phố mỗi khác: nơi có Hội Khuyến học, nơi có Câu lạc bộ dưỡng sinh,
 * nơi có Tổ tự quản đường phố.
 *
 * THÊM XONG HIỆN NGAY TRONG BỘ LỌC. Dải nút chọn nhóm và ô "Nhóm trong khối" đều
 * đọc thẳng từ danh mục, nên không phải khai báo thêm chỗ nào.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  CanhBao,
  Chip,
  cx,
  Input,
  NganKeo,
  NutIcon,
  Select,
  Spinner,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

const KHOI: Record<string, string> = {
  chi_bo: 'Chi bộ',
  chinh_quyen: 'Chính quyền',
  doan_the: 'Đoàn thể',
  chinh_sach: 'Chính sách',
  nhom_khac: 'Nhóm khác',
};

interface Nhom {
  id: string;
  code: string;
  name: string;
  khoi: string;
  ten_khoi: string;
  color: string | null;
  icon: string | null;
  is_sensitive: boolean;
  is_active: boolean;
  sort_order: number | null;
  so_nguoi: number;
  la_he_thong: boolean;
}

export function QuanLyNhom({ khoi, onClose }: { khoi: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const suaDuoc = can('resident:write');

  const [sua, setSua] = useState<Nhom | 'moi' | null>(null);
  const [hoiXoa, setHoiXoa] = useState<Nhom | null>(null);
  const [loi, setLoi] = useState('');
  const [tin, setTin] = useState('');

  const { data } = useQuery({
    queryKey: ['phan-loai-tat-ca'],
    queryFn: () => get<Nhom[]>('/cu-dan/danh-muc/phan-loai/tat-ca'),
  });

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ['phan-loai'] });
    void qc.invalidateQueries({ queryKey: ['phan-loai-tat-ca'] });
  };

  const doiHien = useMutation({
    mutationFn: (n: Nhom) =>
      patch(`/cu-dan/danh-muc/phan-loai/${n.code}`, { is_active: !n.is_active }),
    onSuccess: lamMoi,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không đổi được'),
  });

  const xoa = useMutation({
    mutationFn: (n: Nhom) =>
      del<{ da_an: boolean; loi_nhan: string }>(`/cu-dan/danh-muc/phan-loai/${n.code}`),
    onSuccess: (kq) => {
      setHoiXoa(null);
      setTin(kq.loi_nhan);
      lamMoi();
    },
    onError: (e) => {
      setHoiXoa(null);
      setLoi(e instanceof Error ? e.message : 'Không xoá được');
    },
  });

  const trongKhoi = (data ?? []).filter((n) => n.khoi === khoi);

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={`Nhóm trong khối ${KHOI[khoi] ?? khoi}`}
        mo_ta="Thêm hội, tổ, ban của khu phố — thêm xong hiện ngay trong bộ lọc"
        rong="max-w-xl"
        chan={
          <>
            <Button mau="trang" onClick={onClose} type="button">
              Đóng
            </Button>
            {suaDuoc && (
              <Button icon={Plus} onClick={() => setSua('moi')}>
                THÊM NHÓM
              </Button>
            )}
          </>
        }
      >
        {!data ? (
          <Spinner label="Đang tải danh mục nhóm…" />
        ) : (
          <div className="space-y-3">
            {loi && (
              <CanhBao loai="canh" emoji="⚠️">
                {loi}
              </CanhBao>
            )}
            {tin && (
              <CanhBao loai="tin" emoji="✅">
                {tin}
              </CanhBao>
            )}

            {trongKhoi.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[12px] font-medium text-slate-400">
                Khối này chưa có nhóm nào. Bấm “Thêm nhóm” để tạo.
              </p>
            ) : (
              <div className="space-y-1.5">
                {trongKhoi.map((n) => (
                  <div
                    key={n.code}
                    className={cx(
                      'flex items-center gap-2 rounded-xl border p-2.5',
                      n.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cx(
                            'text-[13px] font-bold',
                            n.is_active ? 'text-slate-900' : 'text-slate-400',
                          )}
                        >
                          {n.icon} {n.name}
                        </span>
                        {n.is_sensitive && (
                          <span title="Dữ liệu nhạy cảm — mọi lượt xem chi tiết đều ghi nhật ký">
                            🔒
                          </span>
                        )}
                        {!n.is_active && (
                          <Chip mau="slate" nho>
                            Đang ẩn
                          </Chip>
                        )}
                        {n.la_he_thong && (
                          <Chip mau="blue" nho>
                            Nhóm hệ thống
                          </Chip>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {n.code} · {so(n.so_nguoi)} người
                      </p>
                    </div>

                    {suaDuoc && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <NutIcon
                          icon={n.is_active ? Eye : EyeOff}
                          mau={n.is_active ? 'text-emerald-600' : 'text-slate-400'}
                          title={
                            n.is_active
                              ? 'Đang hiện — bấm để ẩn khỏi bộ lọc'
                              : 'Đang ẩn — bấm để hiện lại'
                          }
                          onClick={() => {
                            setLoi('');
                            setTin('');
                            doiHien.mutate(n);
                          }}
                        />
                        <NutIcon
                          icon={Pencil}
                          mau="text-slate-500"
                          title="Đổi tên nhóm"
                          onClick={() => setSua(n)}
                        />
                        {!n.la_he_thong && (
                          <NutIcon
                            icon={Trash2}
                            mau="text-red-500"
                            title="Xoá nhóm"
                            onClick={() => setHoiXoa(n)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10.5px] leading-snug font-medium text-slate-400">
              Nhóm đang có người thì bấm xoá chỉ <b>ẩn khỏi bộ lọc</b>, không xoá hẳn — xoá hẳn là
              mất luôn dấu vết ai từng thuộc nhóm đó.
            </p>
          </div>
        )}
      </NganKeo>

      {sua && (
        <FormNhom
          nhom={sua === 'moi' ? null : sua}
          khoiMacDinh={khoi}
          onClose={() => setSua(null)}
        />
      )}

      <XacNhan
        nhan_nut={hoiXoa?.so_nguoi ? 'ẨN KHỎI BỘ LỌC' : 'XOÁ NHÓM'}
        nhan_dang_lam="ĐANG XOÁ…"
        muc_do={hoiXoa?.so_nguoi ? 'thuong' : 'nguy_hiem'}
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de={hoiXoa?.so_nguoi ? 'Ẩn nhóm khỏi bộ lọc' : 'Xoá nhóm'}
        dang_lam={xoa.isPending}
        loi_nhan={
          hoiXoa?.so_nguoi ? (
            <>
              <p>
                <b>{hoiXoa.name}</b> đang có <b>{so(hoiXoa.so_nguoi)} người</b>.
              </p>
              <p className="text-[10.5px] font-medium text-slate-400">
                Nhóm sẽ biến khỏi bộ lọc nhưng không xoá hẳn — danh sách người từng thuộc nhóm vẫn
                tra lại được. Bật lại lúc nào cũng được.
              </p>
            </>
          ) : (
            <>
              <p>
                Xoá nhóm <b>{hoiXoa?.name}</b>?
              </p>
              <p className="text-[10.5px] font-medium text-slate-400">
                Nhóm này chưa có ai nên xoá hẳn được.
              </p>
            </>
          )
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

function FormNhom({
  nhom,
  khoiMacDinh,
  onClose,
}: {
  nhom: Nhom | null;
  khoiMacDinh: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suaDoi = !!nhom;
  const [f, setF] = useState({
    name: nhom?.name ?? '',
    khoi: nhom?.khoi ?? khoiMacDinh,
    icon: nhom?.icon ?? '',
    is_sensitive: nhom?.is_sensitive ?? false,
  });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () =>
      suaDoi
        ? patch(`/cu-dan/danh-muc/phan-loai/${nhom!.code}`, {
            name: f.name.trim(),
            icon: f.icon,
            is_sensitive: f.is_sensitive,
          })
        : post('/cu-dan/danh-muc/phan-loai', {
            name: f.name.trim(),
            khoi: f.khoi,
            icon: f.icon,
            is_sensitive: f.is_sensitive,
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phan-loai'] });
      void qc.invalidateQueries({ queryKey: ['phan-loai-tat-ca'] });
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Đổi tên nhóm' : 'Thêm nhóm mới'}
      mo_ta={suaDoi ? nhom!.code : 'Nhóm mới hiện ngay trong bộ lọc sau khi lưu'}
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (f.name.trim().length < 2) return setLoi('Chưa điền tên nhóm.');
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'THÊM NHÓM'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loi && (
          <CanhBao loai="canh" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <Truong nhan="Tên nhóm" bat_buoc ghi_chu="Ví dụ: Hội Khuyến học, Câu lạc bộ dưỡng sinh">
          <Input
            value={f.name}
            onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))}
            placeholder="Hội Khuyến học"
            autoFocus
          />
        </Truong>

        {!suaDoi && (
          <Truong nhan="Thuộc khối" bat_buoc>
            <Select value={f.khoi} onChange={(e) => setF((s) => ({ ...s, khoi: e.target.value }))}>
              {Object.entries(KHOI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Truong>
        )}

        <Truong nhan="Biểu tượng" ghi_chu="Một emoji cho dễ nhận ra trong danh sách">
          <Input
            value={f.icon}
            onChange={(e) => setF((s) => ({ ...s, icon: e.target.value.slice(0, 4) }))}
            placeholder="📚"
            className="text-center text-lg"
          />
        </Truong>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
          <input
            type="checkbox"
            checked={f.is_sensitive}
            onChange={(e) => setF((s) => ({ ...s, is_sensitive: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
          />
          <span className="text-[12px] leading-snug font-semibold text-slate-700">
            Dữ liệu nhạy cảm
            <span className="block font-medium text-slate-500">
              Đánh dấu cho nhóm như đảng viên, hộ nghèo, người có công. Nhóm nhạy cảm có cảnh báo
              riêng và mọi lượt xem hồ sơ chi tiết đều ghi vào nhật ký.
            </span>
          </span>
        </label>

        {suaDoi && (
          <p className="text-[10.5px] font-medium text-slate-400">
            Mã nhóm <b className="font-mono">{nhom!.code}</b> không đổi được — các màn hình khác
            đang trỏ vào mã này. Đổi tên hiển thị thì thoải mái.
          </p>
        )}
      </div>
    </NganKeo>
  );
}
