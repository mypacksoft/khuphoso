/**
 * Lịch họp khu phố.
 *
 * Cuộc họp sắp tới luôn đứng đầu danh sách, kể cả khi họp cũ nhiều hơn — cán bộ mở
 * màn hình này để biết "sắp tới họp gì", không phải để đọc lịch sử.
 *
 * Họp xong thì ghi biên bản ngay trong phần chi tiết. Biên bản nằm cùng chỗ với
 * cuộc họp, không phải một tệp rời trôi nổi trong máy ai đó.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Edit, FileText, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Bang,
  Button,
  CanhBao,
  Card,
  Chip,
  ChuaCapNhat,
  cx,
  Input,
  KhungBang,
  NganKeo,
  NutIcon,
  PhanTrang,
  Rong,
  Select,
  Spinner,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  ThanhTieuDe,
  Tr,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/store';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

const CO_QUAN: Record<string, string> = {
  dang: 'Đảng',
  chinh_quyen: 'Chính quyền',
  mat_tran: 'Mặt trận',
  doan_the: 'Đoàn thể',
};

const TRANG_THAI: Record<string, { nhan: string; mau: 'emerald' | 'slate' | 'rose' }> = {
  sap_dien_ra: { nhan: 'Sắp diễn ra', mau: 'emerald' },
  da_dien_ra: { nhan: 'Đã diễn ra', mau: 'slate' },
  da_huy: { nhan: 'Đã huỷ', mau: 'rose' },
};

interface Hop {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  co_quan: string | null;
  ten_co_quan: string | null;
  status: string;
  thanh_phan: string | null;
  so_nguoi_du: number | null;
  co_bien_ban: boolean;
  con_ngay: number | null;
}

interface HopChiTiet extends Omit<Hop, 'co_bien_ban'> {
  noi_dung: string | null;
  bien_ban: string | null;
}

/** `2026-08-25T14:30:00+07:00` -> `14:30 · 25/08/2026` */
const gioNgay = (s: string) => {
  const d = new Date(s);
  return (
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' +
    d.toLocaleDateString('vi-VN')
  );
};

/** Datetime cho ô `<input type="datetime-local">` — phải là giờ địa phương, không có Z. */
const choONhap = (s: string) => {
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function LichHop() {
  const { can } = useAuth();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [trangThai, setTrangThai] = useState('');
  const [coQuan, setCoQuan] = useState('');
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [form, setForm] = useState<string | null>(null);
  const [hoiXoa, setHoiXoa] = useState<Hop | null>(null);

  const qc = useQueryClient();

  useEffect(() => {
    datManHinh({
      tieu_de: '📅 Lịch họp',
      goi_y_tim: 'Tìm theo tên cuộc họp hoặc địa điểm…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh]);

  const thamSo = {
    q: tim,
    trang_thai: trangThai,
    co_quan: coQuan,
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['lich-hop', thamSo],
    queryFn: () => get<{ tong_so: number; items: Hop[] }>('/lich-hop' + qs(thamSo)),
    enabled: can('meeting:read'),
    placeholderData: keepPreviousData,
  });

  const xoa = useMutation({
    mutationFn: (h: Hop) => del(`/lich-hop/${h.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      void qc.invalidateQueries({ queryKey: ['lich-hop'] });
      void qc.invalidateQueries({ queryKey: ['thong-bao'] });
    },
  });

  if (!can('meeting:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem lịch họp." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const sapHop = items.filter(
    (h) => h.status === 'sap_dien_ra' && h.con_ngay !== null && h.con_ngay <= 2,
  );
  const suaDuoc = can('meeting:write');

  return (
    <>
      <ThanhTieuDe
        tieu_de="Lịch họp khu phố"
        mo_ta="Cuộc họp sắp tới luôn đứng đầu danh sách"
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Truong nhan="Trạng thái">
              <Select
                value={trangThai}
                onChange={(e) => {
                  setTrangThai(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(TRANG_THAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Cơ quan chủ trì">
              <Select
                value={coQuan}
                onChange={(e) => {
                  setCoQuan(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả cơ quan</option>
                {Object.entries(CO_QUAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
          </div>
        }
      >
        {suaDuoc && (
          <Button icon={CalendarPlus} onClick={() => setForm('')}>
            LÊN LỊCH HỌP
          </Button>
        )}
      </ThanhTieuDe>

      {sapHop.length > 0 && (
        <CanhBao loai="canh" emoji="🔔">
          <b>{sapHop.length}</b> cuộc họp trong 2 ngày tới:{' '}
          {sapHop.map((h) => h.title).join(' · ')}
        </CanhBao>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải lịch họp…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="📅"
          loi_nhan={
            tim || trangThai || coQuan
              ? 'Không có cuộc họp nào khớp bộ lọc.'
              : 'Chưa có cuộc họp nào được lên lịch.'
          }
        >
          {suaDuoc && (
            <Button icon={CalendarPlus} onClick={() => setForm('')}>
              LÊN LỊCH CUỘC HỌP ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          {/* Điện thoại: thẻ dọc */}
          <div className="space-y-3 lg:hidden">
            {items.map((h) => (
              <TheHop key={h.id} h={h} onMo={() => setForm(h.id)} />
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang className="min-w-[860px]">
                <Thead>
                  <tr>
                    <Th>Nội dung họp</Th>
                    <Th>Thời gian</Th>
                    <Th>Địa điểm</Th>
                    <Th>Chủ trì</Th>
                    <Th>Trạng thái</Th>
                    <Th className="text-center">Biên bản</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {items.map((h) => {
                    const tt = TRANG_THAI[h.status] ?? TRANG_THAI.da_dien_ra!;
                    const gap = h.status === 'sap_dien_ra' && (h.con_ngay ?? 9) <= 2;
                    return (
                      <Tr
                        key={h.id}
                        onClick={() => setForm(h.id)}
                        className={cx('cursor-pointer', gap && 'bg-amber-50/50')}
                      >
                        <Td className="font-semibold text-slate-900">{h.title}</Td>
                        <Td className="font-mono whitespace-nowrap text-slate-700">
                          {gioNgay(h.starts_at)}
                          {gap && (
                            <span className="ml-1.5 font-sans text-[9.5px] font-bold text-amber-700">
                              {h.con_ngay === 0 ? 'hôm nay' : `còn ${h.con_ngay} ngày`}
                            </span>
                          )}
                        </Td>
                        <Td className="max-w-xs truncate text-slate-600">
                          {h.location || <ChuaCapNhat />}
                        </Td>
                        <Td className="text-slate-600">{h.ten_co_quan || <ChuaCapNhat />}</Td>
                        <Td>
                          <Chip mau={tt.mau} nho>
                            {tt.nhan}
                          </Chip>
                        </Td>
                        <Td className="text-center">
                          {h.co_bien_ban ? (
                            <Chip mau="emerald" nho>
                              Đã có
                            </Chip>
                          ) : h.status === 'da_dien_ra' ? (
                            <Chip mau="amber" nho>
                              Chưa ghi
                            </Chip>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </Td>
                        {suaDuoc && (
                          <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <NutIcon
                                icon={Edit}
                                mau="text-amber-600"
                                title="Sửa cuộc họp"
                                onClick={() => setForm(h.id)}
                              />
                              <NutIcon
                                icon={Trash2}
                                mau="text-red-500"
                                title="Xoá cuộc họp"
                                onClick={() => setHoiXoa(h)}
                              />
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </Tbody>
              </Bang>
            </KhungBang>
          </div>
        </>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="cuộc họp"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {form !== null && <FormHop id={form || null} onClose={() => setForm(null)} />}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá cuộc họp"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá cuộc họp <b>{hoiXoa?.title}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Biên bản đã ghi cũng mất theo. Thao tác có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Dạng thẻ ──── */

function TheHop({ h, onMo }: { h: Hop; onMo: () => void }) {
  const tt = TRANG_THAI[h.status] ?? TRANG_THAI.da_dien_ra!;
  const gap = h.status === 'sap_dien_ra' && (h.con_ngay ?? 9) <= 2;
  return (
    <Card className={cx('p-4', gap && 'border-amber-300 bg-amber-50/40')}>
      <button onClick={onMo} className="w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-bold text-slate-900">{h.title}</p>
          <Chip mau={tt.mau} nho>
            {tt.nhan}
          </Chip>
        </div>
        <p className="mt-1.5 font-mono text-[11px] font-semibold text-slate-700">
          {gioNgay(h.starts_at)}
        </p>
        {gap && (
          <p className="mt-0.5 text-[10.5px] font-bold text-amber-700">
            {h.con_ngay === 0 ? '🔔 Họp hôm nay' : `🔔 Còn ${h.con_ngay} ngày`}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-600">
          {h.location || 'Chưa có địa điểm'}
          {h.ten_co_quan ? ` · ${h.ten_co_quan}` : ''}
        </p>
        {h.status === 'da_dien_ra' && (
          <div className="mt-2">
            <Chip mau={h.co_bien_ban ? 'emerald' : 'amber'} nho>
              {h.co_bien_ban ? 'Đã có biên bản' : 'Chưa ghi biên bản'}
            </Chip>
          </div>
        )}
      </button>
    </Card>
  );
}

/* ────────────────────────────────────────────────────── Thêm / sửa họp ── */

interface FormHopData {
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  co_quan: string;
  status: string;
  thanh_phan: string;
  noi_dung: string;
  bien_ban: string;
  so_nguoi_du: string;
}

const RONG: FormHopData = {
  title: '',
  starts_at: '',
  ends_at: '',
  location: '',
  co_quan: '',
  status: 'sap_dien_ra',
  thanh_phan: '',
  noi_dung: '',
  bien_ban: '',
  so_nguoi_du: '',
};

function FormHop({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const { can } = useAuth();
  const suaDuoc = can('meeting:write');
  const [f, setF] = useState<FormHopData>(RONG);
  const [loi, setLoi] = useState('');

  const { data: cu, isLoading } = useQuery({
    queryKey: ['lich-hop', id],
    queryFn: () => get<HopChiTiet>(`/lich-hop/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      title: cu.title,
      starts_at: choONhap(cu.starts_at),
      ends_at: cu.ends_at ? choONhap(cu.ends_at) : '',
      location: cu.location ?? '',
      co_quan: cu.co_quan ?? '',
      status: cu.status,
      thanh_phan: cu.thanh_phan ?? '',
      noi_dung: cu.noi_dung ?? '',
      bien_ban: cu.bien_ban ?? '',
      so_nguoi_du: cu.so_nguoi_du != null ? String(cu.so_nguoi_du) : '',
    });
  }, [cu]);

  const luu = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: f.title.trim(),
        starts_at: new Date(f.starts_at).toISOString(),
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
        location: f.location,
        co_quan: f.co_quan || null,
        thanh_phan: f.thanh_phan,
        noi_dung: f.noi_dung,
      };
      if (suaDoi) {
        body.status = f.status;
        body.bien_ban = f.bien_ban;
        body.so_nguoi_du = f.so_nguoi_du ? Number(f.so_nguoi_du) : null;
        return patch(`/lich-hop/${id}`, body);
      }
      return post('/lich-hop', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lich-hop'] });
      void qc.invalidateQueries({ queryKey: ['thong-bao'] });
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof FormHopData>(k: K, v: FormHopData[K]) =>
    setF((s) => ({ ...s, [k]: v }));
  const daHop = f.status === 'da_dien_ra';

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Cuộc họp' : 'Lên lịch cuộc họp'}
      mo_ta={daHop ? 'Họp xong rồi — ghi biên bản ở cuối biểu mẫu' : undefined}
      rong="max-w-xl"
      chan={
        suaDuoc ? (
          <>
            <Button mau="trang" onClick={onClose} type="button">
              Huỷ bỏ
            </Button>
            <Button
              onClick={() => {
                setLoi('');
                if (f.title.trim().length < 3) return setLoi('Chưa nhập nội dung cuộc họp.');
                if (!f.starts_at) return setLoi('Chưa chọn thời gian họp.');
                if (f.ends_at && f.ends_at <= f.starts_at)
                  return setLoi('Giờ kết thúc phải sau giờ bắt đầu.');
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'LÊN LỊCH'}
            </Button>
          </>
        ) : (
          <Button mau="trang" onClick={onClose}>
            Đóng
          </Button>
        )
      }
    >
      {suaDoi && isLoading ? (
        <Spinner label="Đang mở cuộc họp…" />
      ) : (
        <div className="space-y-4">
          {loi && (
            <CanhBao loai="loi" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          <Truong nhan="Nội dung cuộc họp" bat_buoc>
            <Input
              value={f.title}
              onChange={(e) => dat('title', e.target.value)}
              placeholder="Họp Ban điều hành tháng 9"
              disabled={!suaDuoc}
              autoFocus={!suaDoi}
            />
          </Truong>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Truong nhan="Bắt đầu" bat_buoc>
              <Input
                type="datetime-local"
                value={f.starts_at}
                onChange={(e) => dat('starts_at', e.target.value)}
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Kết thúc (nếu biết)">
              <Input
                type="datetime-local"
                value={f.ends_at}
                onChange={(e) => dat('ends_at', e.target.value)}
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Địa điểm">
              <Input
                value={f.location}
                onChange={(e) => dat('location', e.target.value)}
                placeholder="Nhà văn hoá khu phố"
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Cơ quan chủ trì">
              <Select
                value={f.co_quan}
                onChange={(e) => dat('co_quan', e.target.value)}
                disabled={!suaDuoc}
              >
                <option value="">Chưa xác định</option>
                {Object.entries(CO_QUAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
          </div>

          <Truong nhan="Thành phần mời">
            <Textarea
              value={f.thanh_phan}
              onChange={(e) => dat('thanh_phan', e.target.value)}
              placeholder="Ban điều hành, tổ trưởng các tổ, đại diện đoàn thể…"
              disabled={!suaDuoc}
            />
          </Truong>

          <Truong nhan="Nội dung dự kiến">
            <Textarea
              value={f.noi_dung}
              onChange={(e) => dat('noi_dung', e.target.value)}
              placeholder="Các vấn đề đưa ra bàn…"
              disabled={!suaDuoc}
            />
          </Truong>

          {suaDoi && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Truong nhan="Trạng thái">
                  <Select
                    value={f.status}
                    onChange={(e) => dat('status', e.target.value)}
                    disabled={!suaDuoc}
                  >
                    {Object.entries(TRANG_THAI).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.nhan}
                      </option>
                    ))}
                  </Select>
                </Truong>
                {daHop && (
                  <Truong nhan="Số người dự">
                    <Input
                      type="number"
                      min={0}
                      value={f.so_nguoi_du}
                      onChange={(e) => dat('so_nguoi_du', e.target.value)}
                      className="font-mono"
                      disabled={!suaDuoc}
                    />
                  </Truong>
                )}
              </div>

              {daHop && (
                <Truong
                  nhan="Biên bản cuộc họp"
                  ghi_chu="Ghi ngay sau khi họp — để lâu là quên. Biên bản lưu cùng cuộc họp, không nằm rời."
                >
                  <Textarea
                    value={f.bien_ban}
                    onChange={(e) => dat('bien_ban', e.target.value)}
                    placeholder={
                      'Thời gian, địa điểm, thành phần dự…\n' +
                      'Nội dung đã bàn…\n' +
                      'Kết luận và phân công…'
                    }
                    className="min-h-40 leading-relaxed"
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}

              {!daHop && (
                <CanhBao loai="tin" emoji="📝">
                  Chuyển trạng thái sang <b>Đã diễn ra</b> thì sẽ hiện ô ghi biên bản.
                </CanhBao>
              )}
            </>
          )}

          {suaDoi && cu?.bien_ban && (
            <div className="flex items-center gap-2 text-[10.5px] font-semibold text-emerald-700">
              <FileText className="h-3.5 w-3.5" />
              Cuộc họp này đã có biên bản
            </div>
          )}
        </div>
      )}
    </NganKeo>
  );
}
