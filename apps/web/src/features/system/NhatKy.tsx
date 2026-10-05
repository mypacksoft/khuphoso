/**
 * Nhật ký hệ thống của khu phố.
 *
 * Nhật ký nằm ở database CỦA khu phố, không phải của nền tảng. Nhờ vậy Ban điều
 * hành tra được ai đã đụng vào dữ liệu của mình — kể cả người từ nền tảng vào hỗ
 * trợ, những lượt đó có cờ riêng và lọc được bằng một nút.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Bang,
  CanhBao,
  Card,
  Chip,
  ChuaCapNhat,
  cx,
  KhungBang,
  PhanTrang,
  Rong,
  Select,
  Spinner,
  Tbody,
  Td,
  Th,
  Thead,
  ThanhTieuDe,
  Tr,
  Truong,
} from '@/components/ui';
import { get, qs } from '@/lib/api';
import { gio } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 50;

interface DongNhatKy {
  id: string;
  actor_name: string | null;
  ho_tro: boolean;
  action: string;
  module: string | null;
  nhan_hanh_dong: string;
  nhan_module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  created_at: string;
}

interface DanhMuc {
  hanh_dong: { ma: string; nhan: string }[];
  module: { ma: string; nhan: string }[];
}

const MAU_HANH_DONG: Record<string, 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet'> = {
  create: 'emerald',
  update: 'blue',
  delete: 'rose',
  login: 'slate',
  login_ho_tro: 'amber',
  login_failed: 'rose',
  view_pii: 'violet',
  ghim_vi_tri: 'blue',
  change_password: 'amber',
};

export function NhatKy() {
  const { can } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);

  const [hanhDong, setHanhDong] = useState('');
  const [module, setModule] = useState('');
  const [chiHoTro, setChiHoTro] = useState(false);
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);

  useEffect(() => {
    datManHinh({ tieu_de: '📝 Nhật ký hệ thống' });
  }, [datManHinh]);

  const { data: dm } = useQuery({
    queryKey: ['nhat-ky-danh-muc'],
    queryFn: () => get<DanhMuc>('/he-thong/nhat-ky/danh-muc'),
    enabled: can('audit:read'),
    staleTime: 5 * 60_000,
  });

  const thamSo = {
    action: hanhDong,
    module,
    chi_ho_tro: chiHoTro ? 'true' : '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['nhat-ky', thamSo],
    queryFn: () => get<{ tong_so: number; items: DongNhatKy[] }>('/he-thong/nhat-ky' + qs(thamSo)),
    enabled: can('audit:read'),
    placeholderData: keepPreviousData,
  });

  if (!can('audit:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem nhật ký hệ thống." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;

  return (
    <>
      <ThanhTieuDe
        tieu_de="Nhật ký hệ thống"
        mo_ta="Toàn bộ thao tác trên dữ liệu của khu phố này, không thể sửa hay xoá"
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Truong nhan="Hành động">
              <Select
                value={hanhDong}
                onChange={(e) => {
                  setHanhDong(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả hành động</option>
                {dm?.hanh_dong.map((a) => (
                  <option key={a.ma} value={a.ma}>
                    {a.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Phân hệ">
              <Select
                value={module}
                onChange={(e) => {
                  setModule(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả phân hệ</option>
                {dm?.module.map((m) => (
                  <option key={m.ma} value={m.ma}>
                    {m.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={chiHoTro}
                  onChange={(e) => {
                    setChiHoTro(e.target.checked);
                    setTrang(1);
                  }}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-400 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-600">
                  Chỉ lượt truy cập từ nền tảng
                </span>
              </label>
            </div>
          </div>
        }
      />

      <CanhBao loai="tin" emoji="🔎">
        Lượt truy cập của quản trị nền tảng vào hỗ trợ được đánh dấu{' '}
        <b>“Hỗ trợ nền tảng”</b> ở cột Người thực hiện. Bật ô lọc bên trên để xem riêng
        những lượt đó.
      </CanhBao>

      {!data ? (
        <Card>
          <Spinner label="Đang tải nhật ký…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong emoji="📝" loi_nhan="Chưa có bản ghi nào khớp bộ lọc." />
      ) : (
        <KhungBang>
          <Bang className="min-w-[880px]">
            <Thead>
              <tr>
                <Th>Thời gian</Th>
                <Th>Người thực hiện</Th>
                <Th>Hành động</Th>
                <Th>Phân hệ</Th>
                <Th>Đối tượng</Th>
                <Th>Địa chỉ IP</Th>
              </tr>
            </Thead>
            <Tbody>
              {items.map((r) => (
                <Tr key={r.id} className={cx(r.ho_tro && 'bg-amber-50/40')}>
                  <Td className="text-slate-500 font-mono whitespace-nowrap">
                    {gio(r.created_at)}
                  </Td>
                  <Td>
                    <span className="text-slate-900 font-semibold">
                      {r.actor_name || <ChuaCapNhat />}
                    </span>
                    {r.ho_tro && (
                      <Chip mau="amber" nho className="ml-1.5">
                        HỖ TRỢ NỀN TẢNG
                      </Chip>
                    )}
                  </Td>
                  <Td>
                    <Chip mau={MAU_HANH_DONG[r.action] ?? 'slate'} nho>
                      {r.nhan_hanh_dong}
                    </Chip>
                  </Td>
                  <Td className="text-slate-600">{r.nhan_module || <ChuaCapNhat />}</Td>
                  <Td className="text-slate-500 font-mono text-[10.5px]">
                    {r.entity_type ? `${r.entity_type} ${r.entity_id?.slice(0, 8) ?? ''}` : <ChuaCapNhat />}
                  </Td>
                  <Td className="text-slate-500 font-mono">{r.ip || <ChuaCapNhat />}</Td>
                </Tr>
              ))}
            </Tbody>
          </Bang>
        </KhungBang>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="bản ghi"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}
    </>
  );
}
