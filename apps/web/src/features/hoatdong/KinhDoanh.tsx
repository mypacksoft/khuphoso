/**
 * Cơ sở kinh doanh trên địa bàn.
 *
 * Việc thật của cán bộ ở đây không phải "lưu danh sách quán xá" mà là **biết giấy
 * tờ nào sắp hết hạn**. Giấy an toàn thực phẩm có thời hạn; hết hạn mà quán vẫn bán
 * là chuyện khu phố phải nhắc trước, không đợi đoàn kiểm tra xuống mới biết.
 *
 * Vì vậy danh sách sắp theo ngày hết hạn gần nhất trước, và có bộ lọc riêng cho
 * nhóm sắp hết hạn / đã hết hạn / thiếu giấy.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Store, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChonDiaChi } from '@/components/ChonDiaChi';
import { ChonNhanKhau, type NhanKhauDaChon } from '@/components/ChonNhanKhau';
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
  ONumber,
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
import { ngay, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

const TRANG_THAI: Record<string, { nhan: string; mau: 'emerald' | 'amber' | 'slate' }> = {
  dang_hoat_dong: { nhan: 'Đang hoạt động', mau: 'emerald' },
  tam_nghi: { nhan: 'Tạm nghỉ', mau: 'amber' },
  da_dong_cua: { nhan: 'Đã đóng cửa', mau: 'slate' },
};

const LOC_GIAY_TO = {
  attp_het_han: 'Giấy ATTP đã hết hạn',
  attp_sap_het: 'Giấy ATTP sắp hết hạn',
  thieu_gpkd: 'Chưa có giấy phép kinh doanh',
  thieu_attp: 'Chưa có giấy ATTP',
};

interface CoSo {
  id: string;
  name: string;
  nganh_nghe: string | null;
  address: string | null;
  phone: string | null;
  trang_thai: string;
  ten_trang_thai: string;
  so_gpkd: string | null;
  so_attp: string | null;
  ngay_het_han_attp: string | null;
  attp_con_ngay: number | null;
  chu_co_so: string | null;
  owner_resident_id: string | null;
  to_dan_pho: string | null;
}

interface CoSoChiTiet extends CoSo {
  owner_name: string | null;
  group_id: string | null;
  ngay_cap_gpkd: string | null;
  ngay_cap_attp: string | null;
  so_pccc: string | null;
  ngay_cap_pccc: string | null;
  so_lao_dong: number | null;
  note: string | null;
}

interface TongQuan {
  tong: number;
  dang_hoat_dong: number;
  thieu_gpkd: number;
  thieu_attp: number;
  attp_het_han: number;
  attp_sap_het: number;
  nguong_nhac_ngay: number;
}

/** Nhãn hạn giấy ATTP — đọc là biết ngay còn bao lâu. */
function nhanAttp(c: { ngay_het_han_attp: string | null; attp_con_ngay: number | null }) {
  if (!c.ngay_het_han_attp) return null;
  const n = c.attp_con_ngay ?? 0;
  if (n < 0) return { chu: `Hết hạn ${Math.abs(n)} ngày`, mau: 'rose' as const };
  if (n <= 60) return { chu: `Còn ${n} ngày`, mau: 'amber' as const };
  return { chu: ngay(c.ngay_het_han_attp), mau: 'emerald' as const };
}

export function KinhDoanh() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [trangThai, setTrangThai] = useState('');
  const [giayTo, setGiayTo] = useState('');
  const [nganhNghe, setNganhNghe] = useState('');
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [form, setForm] = useState<string | null>(null);
  const [hoiXoa, setHoiXoa] = useState<CoSo | null>(null);

  useEffect(() => {
    datManHinh({
      tieu_de: '🏬 Cơ sở kinh doanh',
      goi_y_tim: 'Tìm theo tên cơ sở, chủ cơ sở hoặc địa chỉ…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh]);

  const thamSo = {
    q: tim,
    trang_thai: trangThai,
    giay_to: giayTo,
    nganh_nghe: nganhNghe,
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['kinh-doanh', thamSo],
    queryFn: () => get<{ tong_so: number; items: CoSo[] }>('/kinh-doanh' + qs(thamSo)),
    enabled: can('business:read'),
    placeholderData: keepPreviousData,
  });
  const { data: tq } = useQuery({
    queryKey: ['kinh-doanh-tong-quan'],
    queryFn: () => get<TongQuan>('/kinh-doanh/tong-quan'),
    enabled: can('business:read'),
  });
  const { data: dsNganh } = useQuery({
    queryKey: ['kinh-doanh-nganh-nghe'],
    queryFn: () => get<{ nganh_nghe: string; so_luong: number }[]>('/kinh-doanh/nganh-nghe'),
    enabled: can('business:read'),
    staleTime: 5 * 60_000,
  });

  const xoa = useMutation({
    mutationFn: (c: CoSo) => del(`/kinh-doanh/${c.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      for (const k of ['kinh-doanh', 'kinh-doanh-tong-quan', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  if (!can('business:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem cơ sở kinh doanh." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const suaDuoc = can('business:write');
  const canNhac = (tq?.attp_het_han ?? 0) + (tq?.attp_sap_het ?? 0);

  return (
    <>
      <ThanhTieuDe
        tieu_de="Cơ sở kinh doanh"
        mo_ta="Sắp theo giấy an toàn thực phẩm hết hạn gần nhất"
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Truong nhan="Tình trạng giấy tờ">
              <Select
                value={giayTo}
                onChange={(e) => {
                  setGiayTo(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả</option>
                {Object.entries(LOC_GIAY_TO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
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
            <Truong nhan="Ngành nghề">
              <Select
                value={nganhNghe}
                onChange={(e) => {
                  setNganhNghe(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả ngành nghề</option>
                {dsNganh?.map((n) => (
                  <option key={n.nganh_nghe} value={n.nganh_nghe}>
                    {n.nganh_nghe} ({n.so_luong})
                  </option>
                ))}
              </Select>
            </Truong>
          </div>
        }
      >
        {suaDuoc && (
          <Button icon={Store} onClick={() => setForm('')}>
            THÊM CƠ SỞ
          </Button>
        )}
      </ThanhTieuDe>

      {tq && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ONumber
            nhan="Tổng cơ sở"
            gia_tri={so(tq.tong)}
            phu={`${so(tq.dang_hoat_dong)} đang hoạt động`}
            icon={Store}
            mau="blue"
          />
          <ONumber
            nhan="ATTP đã hết hạn"
            gia_tri={so(tq.attp_het_han)}
            phu={tq.attp_het_han ? 'Cần nhắc chủ cơ sở ngay' : 'Không có cơ sở nào'}
            phu_mau={tq.attp_het_han ? 'text-rose-700' : 'text-emerald-700'}
            icon={Store}
            mau={tq.attp_het_han ? 'rose' : 'emerald'}
          />
          <ONumber
            nhan="ATTP sắp hết hạn"
            gia_tri={so(tq.attp_sap_het)}
            phu={`Trong ${tq.nguong_nhac_ngay} ngày tới`}
            phu_mau={tq.attp_sap_het ? 'text-amber-700' : 'text-slate-500'}
            icon={Store}
            mau={tq.attp_sap_het ? 'amber' : 'slate'}
          />
          <ONumber
            nhan="Thiếu giấy tờ"
            gia_tri={so(tq.thieu_gpkd + tq.thieu_attp)}
            phu={`${so(tq.thieu_gpkd)} thiếu GPKD · ${so(tq.thieu_attp)} thiếu ATTP`}
            icon={Store}
            mau="slate"
          />
        </div>
      )}

      {canNhac > 0 && !giayTo && (
        <CanhBao loai="canh" emoji="🍜">
          <b>{canNhac}</b> cơ sở có giấy an toàn thực phẩm đã hoặc sắp hết hạn.{' '}
          <button
            onClick={() => setGiayTo('attp_het_han')}
            className="cursor-pointer font-bold underline"
          >
            Xem danh sách
          </button>
        </CanhBao>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải danh sách cơ sở…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="🏬"
          loi_nhan={
            tim || trangThai || giayTo || nganhNghe
              ? 'Không có cơ sở nào khớp bộ lọc.'
              : 'Chưa có cơ sở kinh doanh nào.'
          }
        >
          {suaDuoc && (
            <Button icon={Store} onClick={() => setForm('')}>
              THÊM CƠ SỞ ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((c) => (
              <TheCoSo key={c.id} c={c} onMo={() => setForm(c.id)} />
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang className="min-w-[940px]">
                <Thead>
                  <tr>
                    <Th>Tên cơ sở</Th>
                    <Th>Chủ cơ sở</Th>
                    <Th>Ngành nghề</Th>
                    <Th>Địa chỉ</Th>
                    <Th>Điện thoại</Th>
                    <Th>Giấy ATTP</Th>
                    <Th>Trạng thái</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {items.map((c) => {
                    const tt = TRANG_THAI[c.trang_thai] ?? TRANG_THAI.dang_hoat_dong!;
                    const attp = nhanAttp(c);
                    return (
                      <Tr
                        key={c.id}
                        onClick={() => setForm(c.id)}
                        className={cx(
                          'cursor-pointer',
                          attp?.mau === 'rose' && 'bg-rose-50/50',
                        )}
                      >
                        <Td className="font-semibold text-slate-900">{c.name}</Td>
                        <Td className="text-slate-700">{c.chu_co_so || <ChuaCapNhat />}</Td>
                        <Td className="text-slate-600">{c.nganh_nghe || <ChuaCapNhat />}</Td>
                        <Td className="max-w-xs truncate text-slate-600">
                          {c.address || <ChuaCapNhat />}
                        </Td>
                        <Td className="font-mono text-slate-800">
                          {c.phone || <ChuaCapNhat />}
                        </Td>
                        <Td>
                          {attp ? (
                            <Chip mau={attp.mau} nho>
                              {attp.chu}
                            </Chip>
                          ) : (
                            <Chip mau="slate" nho>
                              Chưa có
                            </Chip>
                          )}
                        </Td>
                        <Td>
                          <Chip mau={tt.mau} nho>
                            {tt.nhan}
                          </Chip>
                        </Td>
                        {suaDuoc && (
                          <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <NutIcon
                                icon={Edit}
                                mau="text-amber-600"
                                title="Sửa cơ sở"
                                onClick={() => setForm(c.id)}
                              />
                              <NutIcon
                                icon={Trash2}
                                mau="text-red-500"
                                title="Xoá cơ sở"
                                onClick={() => setHoiXoa(c)}
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
          don_vi="cơ sở"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {form !== null && <FormCoSo id={form || null} onClose={() => setForm(null)} />}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá cơ sở kinh doanh"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá cơ sở <b>{hoiXoa?.name}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Thông tin giấy tờ đã ghi cũng mất theo. Nếu cơ sở chỉ ngưng bán thì đổi trạng
              thái sang “Đã đóng cửa” thay vì xoá.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

function TheCoSo({ c, onMo }: { c: CoSo; onMo: () => void }) {
  const tt = TRANG_THAI[c.trang_thai] ?? TRANG_THAI.dang_hoat_dong!;
  const attp = nhanAttp(c);
  return (
    <Card className={cx('p-4', attp?.mau === 'rose' && 'border-rose-300 bg-rose-50/40')}>
      <button onClick={onMo} className="w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-bold text-slate-900">{c.name}</p>
          <Chip mau={tt.mau} nho>
            {tt.nhan}
          </Chip>
        </div>
        <div className="mt-1.5 space-y-1">
          {(
            [
              ['Chủ cơ sở', c.chu_co_so],
              ['Ngành nghề', c.nganh_nghe],
              ['Địa chỉ', c.address],
              ['Điện thoại', c.phone],
            ] as [string, string | null][]
          ).map(([nhan, gt]) => (
            <p key={nhan} className="flex justify-between gap-2 text-[11px]">
              <span className="shrink-0 font-bold text-slate-400">{nhan}:</span>
              <span className="truncate font-medium text-slate-800">
                {gt || <ChuaCapNhat />}
              </span>
            </p>
          ))}
        </div>
        <div className="mt-2">
          <Chip mau={attp?.mau ?? 'slate'} nho>
            ATTP: {attp?.chu ?? 'chưa có'}
          </Chip>
        </div>
      </button>
    </Card>
  );
}

/* ──────────────────────────────────────────────── Thêm / sửa cơ sở ─────── */

interface FormCS {
  name: string;
  owner_name: string;
  nganh_nghe: string;
  address: string;
  phone: string;
  so_gpkd: string;
  ngay_cap_gpkd: string;
  so_attp: string;
  ngay_cap_attp: string;
  ngay_het_han_attp: string;
  so_pccc: string;
  ngay_cap_pccc: string;
  trang_thai: string;
  so_lao_dong: string;
  note: string;
}

const RONG_CS: FormCS = {
  name: '',
  owner_name: '',
  nganh_nghe: '',
  address: '',
  phone: '',
  so_gpkd: '',
  ngay_cap_gpkd: '',
  so_attp: '',
  ngay_cap_attp: '',
  ngay_het_han_attp: '',
  so_pccc: '',
  ngay_cap_pccc: '',
  trang_thai: 'dang_hoat_dong',
  so_lao_dong: '',
  note: '',
};

function FormCoSo({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const { can } = useAuth();
  const suaDuoc = can('business:write');
  const [f, setF] = useState<FormCS>(RONG_CS);
  const [chu, setChu] = useState<NhanKhauDaChon | null>(null);
  const [loi, setLoi] = useState('');

  const { data: cu, isLoading } = useQuery({
    queryKey: ['kinh-doanh', id],
    queryFn: () => get<CoSoChiTiet>(`/kinh-doanh/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      name: cu.name,
      owner_name: cu.owner_name ?? '',
      nganh_nghe: cu.nganh_nghe ?? '',
      address: cu.address ?? '',
      phone: cu.phone ?? '',
      so_gpkd: cu.so_gpkd ?? '',
      ngay_cap_gpkd: cu.ngay_cap_gpkd ?? '',
      so_attp: cu.so_attp ?? '',
      ngay_cap_attp: cu.ngay_cap_attp ?? '',
      ngay_het_han_attp: cu.ngay_het_han_attp ?? '',
      so_pccc: cu.so_pccc ?? '',
      ngay_cap_pccc: cu.ngay_cap_pccc ?? '',
      trang_thai: cu.trang_thai,
      so_lao_dong: cu.so_lao_dong != null ? String(cu.so_lao_dong) : '',
      note: cu.note ?? '',
    });
    setChu(
      cu.owner_resident_id
        ? { id: cu.owner_resident_id, full_name: cu.chu_co_so ?? '', dia_chi: cu.address }
        : null,
    );
  }, [cu]);

  const luu = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        owner_resident_id: chu?.id ?? null,
        owner_name: chu ? '' : f.owner_name,
        nganh_nghe: f.nganh_nghe,
        address: f.address,
        phone: f.phone,
        so_gpkd: f.so_gpkd,
        ngay_cap_gpkd: f.ngay_cap_gpkd || null,
        so_attp: f.so_attp,
        ngay_cap_attp: f.ngay_cap_attp || null,
        ngay_het_han_attp: f.ngay_het_han_attp || null,
        so_pccc: f.so_pccc,
        ngay_cap_pccc: f.ngay_cap_pccc || null,
        trang_thai: f.trang_thai,
        so_lao_dong: f.so_lao_dong ? Number(f.so_lao_dong) : null,
        note: f.note,
      };
      return suaDoi ? patch(`/kinh-doanh/${id}`, body) : post('/kinh-doanh', body);
    },
    onSuccess: () => {
      for (const k of ['kinh-doanh', 'kinh-doanh-tong-quan', 'kinh-doanh-nganh-nghe', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof FormCS>(k: K, v: FormCS[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Cơ sở kinh doanh' : 'Thêm cơ sở kinh doanh'}
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
                if (f.name.trim().length < 2) return setLoi('Chưa nhập tên cơ sở.');
                if (
                  f.ngay_het_han_attp &&
                  f.ngay_cap_attp &&
                  f.ngay_het_han_attp <= f.ngay_cap_attp
                ) {
                  return setLoi('Ngày hết hạn ATTP phải sau ngày cấp.');
                }
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'THÊM CƠ SỞ'}
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
        <Spinner label="Đang mở hồ sơ cơ sở…" />
      ) : (
        <div className="space-y-4">
          {loi && (
            <CanhBao loai="loi" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          {cu && (cu.attp_con_ngay ?? 99) < 0 && (
            <CanhBao loai="loi" emoji="🍜">
              Giấy an toàn thực phẩm đã <b>hết hạn {Math.abs(cu.attp_con_ngay!)} ngày</b>.
              Nhắc chủ cơ sở đi làm lại.
            </CanhBao>
          )}

          <Truong nhan="Tên cơ sở" bat_buoc>
            <Input
              value={f.name}
              onChange={(e) => dat('name', e.target.value)}
              placeholder="Quán cơm Bà Năm"
              disabled={!suaDuoc}
              autoFocus={!suaDoi}
            />
          </Truong>

          <Truong
            nhan="Chủ cơ sở"
            ghi_chu={
              chu
                ? 'Đã nối với hồ sơ nhân khẩu — bấm × nếu muốn gõ tên tự do.'
                : 'Chọn từ danh sách nhân khẩu nếu chủ ở trong khu phố; người ngoài thì gõ tên.'
            }
          >
            <ChonNhanKhau
              gia_tri={chu}
              onChon={(nk) => {
                setChu(nk);
                if (nk?.dia_chi && !f.address.trim()) dat('address', nk.dia_chi);
              }}
              goi_y="Gõ tên chủ cơ sở để tìm…"
              disabled={!suaDuoc}
            />
            {!chu && (
              <Input
                value={f.owner_name}
                onChange={(e) => dat('owner_name', e.target.value)}
                placeholder="…hoặc gõ thẳng tên chủ cơ sở"
                className="mt-2"
                disabled={!suaDuoc}
              />
            )}
          </Truong>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Truong nhan="Ngành nghề">
              <Input
                value={f.nganh_nghe}
                onChange={(e) => dat('nganh_nghe', e.target.value)}
                placeholder="Ăn uống, tạp hoá, sửa xe…"
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Điện thoại">
              <Input
                value={f.phone}
                onChange={(e) => dat('phone', e.target.value)}
                placeholder="09xxxxxxxx"
                className="font-mono"
                inputMode="tel"
                disabled={!suaDuoc}
              />
            </Truong>
            <div className="sm:col-span-2">
              <Truong nhan="Địa chỉ">
                <ChonDiaChi
                  gia_tri={f.address}
                  onDoi={(v) => dat('address', v)}
                  disabled={!suaDuoc}
                />
              </Truong>
            </div>
            <Truong nhan="Trạng thái">
              <Select
                value={f.trang_thai}
                onChange={(e) => dat('trang_thai', e.target.value)}
                disabled={!suaDuoc}
              >
                {Object.entries(TRANG_THAI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Số lao động">
              <Input
                type="number"
                min={0}
                value={f.so_lao_dong}
                onChange={(e) => dat('so_lao_dong', e.target.value)}
                className="font-mono"
                disabled={!suaDuoc}
              />
            </Truong>
          </div>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
              Giấy tờ
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Truong nhan="Số giấy phép kinh doanh">
                <Input
                  value={f.so_gpkd}
                  onChange={(e) => dat('so_gpkd', e.target.value)}
                  className="font-mono"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Ngày cấp GPKD">
                <Input
                  type="date"
                  value={f.ngay_cap_gpkd}
                  onChange={(e) => dat('ngay_cap_gpkd', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>

              <Truong nhan="Số giấy an toàn thực phẩm">
                <Input
                  value={f.so_attp}
                  onChange={(e) => dat('so_attp', e.target.value)}
                  className="font-mono"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Ngày cấp ATTP">
                <Input
                  type="date"
                  value={f.ngay_cap_attp}
                  onChange={(e) => dat('ngay_cap_attp', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>
              <div className="sm:col-span-2">
                <Truong
                  nhan="Ngày hết hạn ATTP"
                  ghi_chu="Điền để hệ thống nhắc trước 60 ngày — chủ quán kịp đi làm lại giấy"
                >
                  <Input
                    type="date"
                    value={f.ngay_het_han_attp}
                    onChange={(e) => dat('ngay_het_han_attp', e.target.value)}
                    disabled={!suaDuoc}
                  />
                </Truong>
              </div>

              <Truong nhan="Số phương án PCCC">
                <Input
                  value={f.so_pccc}
                  onChange={(e) => dat('so_pccc', e.target.value)}
                  className="font-mono"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Ngày cấp PCCC">
                <Input
                  type="date"
                  value={f.ngay_cap_pccc}
                  onChange={(e) => dat('ngay_cap_pccc', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>
            </div>
          </section>

          <Truong nhan="Ghi chú">
            <Textarea
              value={f.note}
              onChange={(e) => dat('note', e.target.value)}
              placeholder="Giờ mở cửa, lưu ý khi kiểm tra…"
              disabled={!suaDuoc}
            />
          </Truong>
        </div>
      )}
    </NganKeo>
  );
}
