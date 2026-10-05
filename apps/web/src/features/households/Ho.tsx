/**
 * Hai màn hình hộ: "Sổ hộ khẩu thường trú" và "Hộ tạm trú".
 *
 * Nút chỉ đường mở thẳng Google Maps tới toạ độ đã ghim — đây là thao tác cán bộ
 * dùng nhiều nhất khi đi thăm hộ, nên nó nằm ngay trên dòng chứ không giấu trong
 * trang chi tiết.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Edit, Eye, FileSpreadsheet, HousePlus, Merge, Navigation } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Bang,
  Button,
  CanhBao,
  Card,
  Chip,
  ChonDangHien,
  ChuaCapNhat,
  cx,
  KhungBang,
  NutIcon,
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
import { ngay } from '@/lib/fmt';
import { DIEN_HO } from '@/lib/dieuhuong';

import { useAuth, useUi } from '@/lib/store';
import type { DanhSach, Ho as THo, ToDanPho } from '@/lib/types';
import { TRANG_THAI_DINH_VI } from '@/lib/types';

import { FormHo } from './FormHo';
import { GomHo } from './GomHo';
import { SoHoKhau } from './SoHoKhau';

/** Số hộ mỗi trang lúc mới vào. Cán bộ đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

const chiDuong = (h: { toa_do: { lat: number; lng: number } | null; address: string | null }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${
    h.toa_do ? `${h.toa_do.lat},${h.toa_do.lng}` : encodeURIComponent(h.address ?? '')
  }`;

export function Ho() {
  const { dien } = useParams({ strict: false }) as { dien?: string };
  const d = dien ? DIEN_HO[dien] : undefined;

  const { can } = useAuth();
  const { dangHien, doiDangHien } = useUi();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [to, setTo] = useState('');
  const [dinhVi, setDinhVi] = useState('');
  const [tinhTrang, setTinhTrang] = useState('');
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  /**
   * Sổ hộ khẩu vừa xin sang trang khác, đang chờ dữ liệu trang mới về để mở giúp
   * hộ đầu (`dau`) hay hộ cuối (`cuoi`).
   *
   * Phải qua một nhịp như vậy vì đổi trang là một lượt gọi máy chủ — không thể
   * biết ngay id của hộ kế tiếp.
   */
  const [choMo, setChoMo] = useState<'dau' | 'cuoi' | null>(null);
  const [xem, setXem] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [gom, setGom] = useState(false);

  useEffect(() => {
    if (!d) return;
    datManHinh({
      tieu_de: `${d.emoji} ${d.nhan}`,
      goi_y_tim: 'Tìm theo mã hộ hoặc địa chỉ…',
      nhanTim: () => setTrang(1),
    });
    setTrang(1);
  }, [datManHinh, d]);

  const { data: toDanPho } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
    staleTime: 5 * 60_000,
  });

  const thamSo = {
    q: tim,
    group_id: to,
    geo_status: dinhVi,
    tinh_trang: tinhTrang,
    household_type: d?.api ?? '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['ho-khau', thamSo],
    queryFn: () => get<DanhSach<THo>>('/ho-khau' + qs(thamSo)),
    placeholderData: keepPreviousData,
    enabled: !!d,
  });

  if (!d) {
    return (
      <CanhBao loai="canh" emoji="⚠️">
        Không có diện hộ “{dien}”. Chọn lại từ menu bên trái.
      </CanhBao>
    );
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;

  // Trang mới về rồi thì mở hộ đầu / cuối để sổ hộ khẩu chạy tiếp mạch đọc
  useEffect(() => {
    if (!choMo || !data?.items.length) return;
    const ds = data.items;
    setXem(choMo === 'dau' ? ds[0]!.id : ds[ds.length - 1]!.id);
    setChoMo(null);
  }, [choMo, data]);
  const chuaGhim = items.filter((h) => h.geo_status === 'pending').length;

  return (
    <>
      <ThanhTieuDe
        tieu_de={d.nhan}
        mo_ta={d.mo_ta}
        so_loc_dang_bat={[to, dinhVi, tinhTrang].filter(Boolean).length}
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Truong nhan="Tổ dân phố">
              <Select
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả Tổ dân phố</option>
                {toDanPho?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.so_ho} hộ)
                    {t.leader_name ? ` — ${t.leader_name}` : ''}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Tình trạng hồ sơ">
              <Select
                value={tinhTrang}
                onChange={(e) => {
                  setTinhTrang(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả hộ</option>
                <option value="thieu_chu_ho">⚠ Chưa có chủ hộ</option>
                <option value="thieu_dia_chi">Chưa có địa chỉ</option>
                <option value="chua_phan_to">Chưa phân tổ dân phố</option>
                {d.api === 'tam_tru' && (
                  <option value="tam_tru_qua_han">⏰ Đã hết hạn tạm trú</option>
                )}
              </Select>
            </Truong>

            <Truong nhan="Trạng thái định vị">
              <Select
                value={dinhVi}
                onChange={(e) => {
                  setDinhVi(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(TRANG_THAI_DINH_VI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
          </div>
        }
      >
        <ChonDangHien dang={dangHien} onDoi={doiDangHien} />
        {can('household:write') && (
          <>
            <Button mau="xam" icon={Merge} onClick={() => setGom(true)}>
              GOM NHÂN KHẨU VÀO HỘ
            </Button>
            <Button mau="luc" icon={FileSpreadsheet} onClick={() => xuatCsv(items, d.nhan)}>
              XUẤT EXCEL
            </Button>
            <Button icon={HousePlus} onClick={() => setForm('')}>
              KHAI SINH HỘ MỚI
            </Button>
          </>
        )}
      </ThanhTieuDe>

      {chuaGhim > 0 && (
        <CanhBao loai="canh" emoji="📍">
          <b>{chuaGhim}</b> hộ trong trang này chưa có toạ độ. Hộ chưa ghim thì nút chỉ đường phải
          dò theo địa chỉ chữ, dễ ra sai vị trí trong hẻm. Mở <b>Địa chỉ số</b> để ghim.
        </CanhBao>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải danh sách hộ…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="🏠"
          loi_nhan={
            tim || to || dinhVi
              ? 'Không tìm thấy hộ nào khớp bộ lọc.'
              : `Chưa có ${d.nhan.toLowerCase()} nào.`
          }
        >
          {can('household:write') && (
            <Button icon={HousePlus} onClick={() => setForm('')}>
              KHAI SINH HỘ ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          {/* Điện thoại luôn dùng thẻ — bảng 8 cột phải kéo ngang mới thấy nút */}
          <div
            className={cx(
              'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-fadeIn text-xs',
              dangHien === 'bang' && 'lg:hidden',
            )}
          >
            {items.map((h) => (
              <TheHo key={h.id} h={h} onMo={() => setXem(h.id)} />
            ))}
          </div>

          {dangHien === 'bang' && (
            <div className="hidden lg:block">
              <KhungBang>
                <Bang>
                  <Thead>
                    <tr>
                      <Th>{d.api === 'tam_tru' ? 'Mã hộ tạm trú' : 'Mã Hộ'}</Th>
                      <Th>Tên Chủ Hộ</Th>
                      <Th>Điện thoại</Th>
                      <Th>Tổ dân phố</Th>
                      <Th>{d.api === 'tam_tru' ? 'Địa chỉ tạm trú' : 'Địa chỉ cư trú'}</Th>
                      <Th className="text-center">Số thành viên</Th>
                      {d.api === 'tam_tru' && <Th>Hạn tạm trú</Th>}
                      <Th>Định vị</Th>
                      <Th className="text-right">Quản lý</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {items.map((h) => {
                      const tt = TRANG_THAI_DINH_VI[h.geo_status] ?? TRANG_THAI_DINH_VI.pending!;
                      return (
                        <Tr
                          key={h.id}
                          onClick={() => setXem(h.id)}
                          className="cursor-pointer"
                          title="Bấm để mở sổ hộ khẩu"
                        >
                          <Td
                            className={`font-mono font-bold ${
                              d.api === 'tam_tru' ? 'text-indigo-500' : 'text-slate-500'
                            }`}
                          >
                            #{h.code}
                          </Td>
                          <Td className="text-slate-900 font-semibold">
                            {h.chu_ho || <ChuaCapNhat />}
                          </Td>
                          <Td className="text-slate-800 font-mono">
                            {h.phone || h.dt_chu_ho || <ChuaCapNhat />}
                          </Td>
                          <Td className="text-slate-600">{h.to_dan_pho || <ChuaCapNhat />}</Td>
                          <Td className="text-slate-600 truncate max-w-xs" title={h.address ?? ''}>
                            {h.address || <ChuaCapNhat />}
                          </Td>
                          <Td className="text-center">
                            <Chip mau="blue">{h.so_nhan_khau} nhân khẩu</Chip>
                          </Td>
                          {d.api === 'tam_tru' && (
                            <Td className="whitespace-nowrap">
                              <HanHo den={h.han_tam_tru} con={h.con_ngay_tam_tru} />
                            </Td>
                          )}
                          <Td>
                            <Chip mau={tt.mau as 'slate'} nho>
                              {tt.nhan}
                            </Chip>
                          </Td>
                          <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <NutIcon
                                icon={Eye}
                                mau="text-blue-700"
                                title="Xem sổ hộ khẩu"
                                onClick={() => setXem(h.id)}
                              />
                              <a
                                href={chiDuong(h)}
                                target="_blank"
                                rel="noreferrer"
                                title="Chỉ đường tới nhà (Google Maps)"
                                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-emerald-600 cursor-pointer transition-colors shrink-0"
                              >
                                <Navigation className="w-4 h-4" />
                              </a>
                              {can('household:write') && (
                                <NutIcon
                                  icon={Edit}
                                  mau="text-amber-600"
                                  title="Sửa sổ hộ khẩu"
                                  onClick={() => setForm(h.id)}
                                />
                              )}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Bang>
              </KhungBang>
            </div>
          )}
        </>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="hộ"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {/* Truyền cả trang hộ đang hiện để lật qua lại ngay trong sổ, khỏi đóng ra
          bấm lại từng cái khi rà cả tổ. Chạm biên trang thì `onSangTrang` đổi
          trang rồi mở tiếp — cán bộ rà hết 500 hộ không phải bấm chuyển trang. */}
      <SoHoKhau
        id={xem}
        dong={() => setXem(null)}
        ds_id={items.map((h) => h.id)}
        onDoi={setXem}
        vi_tri={xem ? (trang - 1) * moiTrang + items.findIndex((h) => h.id === xem) + 1 : undefined}
        tong_so={data?.tong_so}
        onSangTrang={(huong) => {
          if (huong === 1 && trang < tongTrang) {
            setTrang(trang + 1);
            setChoMo('dau');
          } else if (huong === -1 && trang > 1) {
            setTrang(trang - 1);
            setChoMo('cuoi');
          }
        }}
      />
      <GomHo mo={gom} dong={() => setGom(false)} household_type={d.api} nhan_dien={d.nhan} />
      {form !== null && (
        <FormHo id={form || null} household_type={d.api} onClose={() => setForm(null)} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Dạng thẻ ──── */

/**
 * Hạn tạm trú của HỘ — lấy hạn xa nhất trong nhà.
 *
 * Lấy hạn ngắn nhất thì một hộ 5 người chỉ cần một người sắp hết hạn là cả hộ bị
 * báo đỏ, trong khi bốn người kia vẫn đăng ký hợp lệ. Hạn xa nhất mới là mốc mà
 * hộ đó thực sự không còn ai được đăng ký nữa.
 */
function HanHo({ den, con }: { den?: string | null; con?: number | null }) {
  if (!den) return <ChuaCapNhat />;
  const qua = con != null && con < 0;
  const sap = con != null && con >= 0 && con < 30;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-bold',
        qua ? 'bg-rose-50 text-rose-700' : sap ? 'bg-amber-50 text-amber-700' : 'text-slate-600',
      )}
      title={
        qua ? 'Cả hộ đã hết hạn tạm trú — kể cả người có hạn dài nhất' : 'Hạn xa nhất trong hộ'
      }
    >
      <span className="font-mono">{ngay(den)}</span>
      {qua && <span>· quá {Math.abs(con!)} ngày</span>}
      {sap && <span>· còn {con} ngày</span>}
    </span>
  );
}

/**
 * Thẻ hộ khẩu — dạng gọn.
 *
 * Bấm vào thẻ là mở sổ hộ khẩu. Giữ lại đúng MỘT nút riêng: chỉ đường, vì nó mở
 * ứng dụng bản đồ chứ không mở sổ, bấm nhầm thì nhảy hẳn ra khỏi ứng dụng.
 * Nút "xem" và "sửa" cũ đều dẫn vào cùng một sổ nên bỏ.
 */
function TheHo({ h, onMo }: { h: THo; onMo: () => void }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onMo}
        className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 pr-11 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]"
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs">
            🏠
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="truncate text-[12.5px] font-bold text-slate-900">
                {h.chu_ho || 'Chưa có chủ hộ'}
              </h4>
              <span className="shrink-0 font-mono text-[9.5px] font-bold text-slate-400">
                {h.code}
              </span>
            </div>

            <p className="mt-0.5 truncate text-[10.5px] font-medium text-slate-600">
              {h.address || <ChuaCapNhat />}
            </p>

            <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
              {h.to_dan_pho || 'chưa phân tổ'}
              {(h.phone || h.dt_chu_ho) && (
                <span className="font-mono"> · {h.phone || h.dt_chu_ho}</span>
              )}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Chip mau="blue" nho>
                {h.so_nhan_khau} nhân khẩu
              </Chip>
              {h.geo_status === 'pending' && (
                <Chip mau="amber" nho>
                  Chưa ghim
                </Chip>
              )}
              {h.han_tam_tru && <HanHo den={h.han_tam_tru} con={h.con_ngay_tam_tru} />}
            </div>
          </div>
        </div>
      </button>

      {/* Nút chỉ đường nằm ngoài nút thẻ: lồng nút trong nút là HTML không hợp lệ */}
      <a
        href={chiDuong(h)}
        target="_blank"
        rel="noreferrer"
        title="Chỉ đường tới nhà"
        className="absolute top-2.5 right-2.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-50"
      >
        <Navigation className="h-4 w-4" />
      </a>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── Xuất Excel ──── */

/** CSV có BOM UTF-8 — thiếu nó thì Excel trên Windows đọc tiếng Việt ra ký tự lạ. */
function xuatCsv(items: THo[], ten: string) {
  const cot = [
    'Mã hộ',
    'Chủ hộ',
    'Điện thoại',
    'Tổ dân phố',
    'Địa chỉ',
    'Số nhân khẩu',
    'Vĩ độ',
    'Kinh độ',
  ];
  const o = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const dong = items.map((h) =>
    [
      h.code,
      h.chu_ho,
      h.phone ?? h.dt_chu_ho,
      h.to_dan_pho,
      h.address,
      h.so_nhan_khau,
      h.toa_do?.lat,
      h.toa_do?.lng,
    ]
      .map(o)
      .join(','),
  );
  const csv = '﻿' + [cot.map(o).join(','), ...dong].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${ten.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
