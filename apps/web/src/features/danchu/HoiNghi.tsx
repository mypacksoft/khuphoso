/**
 * Hội nghị nhân dân — Luật Thực hiện dân chủ ở cơ sở 10/2022/QH15.
 *
 * ĐƠN VỊ BIỂU QUYẾT LÀ ĐẠI DIỆN HỘ, KHÔNG PHẢI ĐẦU NGƯỜI. Một hộ 9 người vẫn chỉ
 * một phiếu. Màn hình nói rõ điều này ở mọi chỗ nhập số, vì thư ký quen đếm người
 * giơ tay chứ không đếm hộ.
 *
 * TỈ LỆ TÍNH TRÊN TỔNG SỐ HỘ CỦA ĐỊA BÀN, không phải trên số hộ có mặt. Hội nghị
 * vắng không làm nhỏ mẫu số đi để dễ thông qua hơn. Máy chủ tính và trả về kết
 * luận — thư ký đang ghi biên bản giữa cuộc họp không nên phải nhẩm 4.160/8.318.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, RefreshCw, Trash2, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  cx,
  HopThoai,
  Input,
  NganKeo,
  NutIcon,
  PhanTrang,
  Rong,
  Select,
  Spinner,
  Textarea,
  ThanhTieuDe,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post, qs } from '@/lib/api';
import { gio, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { ToDanPho } from '@/lib/types';

const MOI_TRANG_MAC_DINH = 20;

const TRANG_THAI: Record<string, { nhan: string; mau: 'slate' | 'blue' | 'emerald' | 'rose' }> = {
  chuan_bi: { nhan: 'Đang chuẩn bị', mau: 'slate' },
  dang_hop: { nhan: 'Đang họp', mau: 'blue' },
  da_hop: { nhan: 'Đã họp xong', mau: 'emerald' },
  huy: { nhan: 'Đã huỷ', mau: 'rose' },
};

const HINH_THUC: Record<string, string> = {
  gio_tay: 'Giơ tay tại hội nghị',
  phieu_kin: 'Bỏ phiếu kín',
  phieu_tung_ho: 'Phát phiếu tới từng hộ',
  truc_tuyen: 'Lấy ý kiến trực tuyến',
};

interface HN {
  id: string;
  title: string;
  thoi_gian: string | null;
  dia_diem: string | null;
  chu_tri: string | null;
  thu_ky: string | null;
  trang_thai: string;
  ten_trang_thai: string;
  tong_so_ho: number;
  so_ho_du: number;
  ty_le_du: number | null;
  ty_le_du_toi_thieu: number;
  du_dieu_kien: boolean | null;
  to_dan_pho: string | null;
  so_noi_dung: number;
}

interface ND {
  id: string;
  title: string;
  mo_ta: string | null;
  hinh_thuc: string;
  ten_hinh_thuc: string;
  tan_thanh: number;
  khong_tan_thanh: number;
  khong_y_kien: number;
  tong_phieu: number;
  ty_le_yeu_cau: number;
  ty_le_tan_thanh: number | null;
  da_thong_qua: boolean | null;
  ket_qua: string | null;
  sort_order: number;
}

interface HNChiTiet extends HN {
  group_id: string | null;
  noi_dung: string | null;
  bien_ban: string | null;
  noi_dung_bieu_quyet: ND[];
}

export function HoiNghi() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [trangThai, setTrangThai] = useState('');
  const [mo, setMo] = useState<string | null>(null);
  const [hoiXoa, setHoiXoa] = useState<HN | null>(null);

  useEffect(() => {
    datManHinh({
      tieu_de: '🗳️ Hội nghị nhân dân',
      goi_y_tim: 'Tìm hội nghị theo tên…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh]);

  const thamSo = {
    q: tim,
    trang_thai: trangThai,
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['hoi-nghi', thamSo],
    queryFn: () => get<{ tong_so: number; items: HN[] }>('/hoi-nghi' + qs(thamSo)),
    enabled: can('meeting:read'),
    placeholderData: keepPreviousData,
  });

  const xoa = useMutation({
    mutationFn: (h: HN) => del(`/hoi-nghi/${h.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      void qc.invalidateQueries({ queryKey: ['hoi-nghi'] });
    },
  });

  if (!can('meeting:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem hội nghị nhân dân." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const suaDuoc = can('meeting:write');

  return (
    <>
      <ThanhTieuDe
        tieu_de="Hội nghị nhân dân"
        mo_ta="Bàn và quyết định — biểu quyết tính theo đại diện hộ, không theo đầu người"
        duoi={
          <Truong nhan="Trạng thái">
            <Select
              value={trangThai}
              onChange={(e) => {
                setTrangThai(e.target.value);
                setTrang(1);
              }}
            >
              <option value="">Tất cả hội nghị</option>
              {Object.entries(TRANG_THAI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nhan}
                </option>
              ))}
            </Select>
          </Truong>
        }
      >
        {suaDuoc && (
          <Button icon={Plus} onClick={() => setMo('')}>
            MỞ HỘI NGHỊ
          </Button>
        )}
      </ThanhTieuDe>

      {!data ? (
        <Card>
          <Spinner label="Đang tải hội nghị…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="🗳️"
          loi_nhan={
            tim || trangThai
              ? 'Không có hội nghị nào khớp bộ lọc.'
              : 'Chưa mở hội nghị nhân dân nào.'
          }
        >
          {suaDuoc && (
            <Button icon={Plus} onClick={() => setMo('')}>
              MỞ HỘI NGHỊ ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <div className="space-y-2">
          {items.map((h) => {
            const tt = TRANG_THAI[h.trang_thai] ?? TRANG_THAI.chuan_bi!;
            return (
              <div key={h.id} className="relative">
                <button
                  onClick={() => setMo(h.id)}
                  className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 pr-11 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.995]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-bold text-slate-900">
                      {h.title}
                    </span>
                    <Chip mau={tt.mau} nho>
                      {tt.nhan}
                    </Chip>
                  </div>

                  <p className="mt-0.5 truncate text-[10.5px] font-medium text-slate-500">
                    {h.thoi_gian ? gio(h.thoi_gian) : 'chưa định ngày'}
                    {h.dia_diem && ` · ${h.dia_diem}`}
                    {h.to_dan_pho ? ` · ${h.to_dan_pho}` : ' · cả khu phố'}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Chip mau="blue" nho>
                      {so(h.so_ho_du)}/{so(h.tong_so_ho)} hộ dự
                      {h.ty_le_du != null && ` · ${h.ty_le_du}%`}
                    </Chip>
                    {h.du_dieu_kien === true && (
                      <Chip mau="emerald" nho>
                        Đủ điều kiện tiến hành
                      </Chip>
                    )}
                    {h.du_dieu_kien === false && (
                      <Chip mau="amber" nho>
                        Chưa đủ {h.ty_le_du_toi_thieu}% đại diện hộ
                      </Chip>
                    )}
                    {h.so_noi_dung > 0 && (
                      <Chip mau="slate" nho>
                        {h.so_noi_dung} nội dung biểu quyết
                      </Chip>
                    )}
                  </div>
                </button>

                {suaDuoc && (
                  <div className="absolute top-3 right-3">
                    <NutIcon
                      icon={Trash2}
                      mau="text-red-500"
                      title="Xoá hội nghị"
                      onClick={() => setHoiXoa(h)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="hội nghị"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {mo !== null && <FormHoiNghi id={mo || null} onClose={() => setMo(null)} />}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá hội nghị"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá hội nghị <b>{hoiXoa?.title}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Biên bản và kết quả biểu quyết mất theo. Thao tác có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ─────────────────────────────────────────────── Mở / sửa hội nghị ──── */

function FormHoiNghi({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const { can } = useAuth();
  const suaDuoc = can('meeting:write');

  const [f, setF] = useState({
    title: '',
    group_id: '',
    thoi_gian: '',
    dia_diem: '',
    chu_tri: '',
    thu_ky: '',
    so_ho_du: '0',
    ty_le_du_toi_thieu: '50',
    trang_thai: 'chuan_bi',
    noi_dung: '',
    bien_ban: '',
  });
  const [loi, setLoi] = useState('');
  const [suaND, setSuaND] = useState<ND | null | undefined>(undefined);

  const { data: to } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
  });
  const { data: cu, isLoading } = useQuery({
    queryKey: ['hoi-nghi', id],
    queryFn: () => get<HNChiTiet>(`/hoi-nghi/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      title: cu.title,
      group_id: cu.group_id ?? '',
      thoi_gian: cu.thoi_gian ? cu.thoi_gian.slice(0, 16) : '',
      dia_diem: cu.dia_diem ?? '',
      chu_tri: cu.chu_tri ?? '',
      thu_ky: cu.thu_ky ?? '',
      so_ho_du: String(cu.so_ho_du ?? 0),
      ty_le_du_toi_thieu: String(cu.ty_le_du_toi_thieu ?? 50),
      trang_thai: cu.trang_thai,
      noi_dung: cu.noi_dung ?? '',
      bien_ban: cu.bien_ban ?? '',
    });
  }, [cu]);

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ['hoi-nghi'] });
  };

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title.trim(),
        group_id: f.group_id,
        thoi_gian: f.thoi_gian || null,
        dia_diem: f.dia_diem,
        chu_tri: f.chu_tri,
        thu_ky: f.thu_ky,
        so_ho_du: Number(f.so_ho_du) || 0,
        ty_le_du_toi_thieu: Number(f.ty_le_du_toi_thieu) || 50,
        noi_dung: f.noi_dung,
        ...(suaDoi ? { trang_thai: f.trang_thai, bien_ban: f.bien_ban } : {}),
      };
      return suaDoi ? patch(`/hoi-nghi/${id}`, body) : post('/hoi-nghi', body);
    },
    onSuccess: () => {
      lamMoi();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const chotSoHo = useMutation({
    mutationFn: () => post(`/hoi-nghi/${id}/chot-so-ho`),
    onSuccess: () => {
      setLoi('');
      lamMoi();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không chốt được'),
  });

  const xoaND = useMutation({
    mutationFn: (n: ND) => del(`/hoi-nghi/noi-dung/${n.id}`),
    onSuccess: lamMoi,
  });

  const dat = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={suaDoi ? 'Hội nghị nhân dân' : 'Mở hội nghị nhân dân'}
        mo_ta="Biểu quyết tính theo đại diện hộ — mỗi hộ một phiếu, dù hộ có bao nhiêu người"
        rong="max-w-2xl"
        chan={
          <>
            <Button mau="trang" onClick={onClose} type="button">
              {suaDuoc ? 'Huỷ bỏ' : 'Đóng'}
            </Button>
            {suaDuoc && (
              <Button
                onClick={() => {
                  setLoi('');
                  if (f.title.trim().length < 3) return setLoi('Chưa nhập tên hội nghị.');
                  luu.mutate();
                }}
                disabled={luu.isPending}
              >
                {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'MỞ HỘI NGHỊ'}
              </Button>
            )}
          </>
        }
      >
        {suaDoi && isLoading ? (
          <Spinner label="Đang mở hội nghị…" />
        ) : (
          <div className="space-y-4">
            {loi && (
              <CanhBao loai="loi" emoji="⚠️">
                {loi}
              </CanhBao>
            )}

            <Truong nhan="Tên hội nghị" bat_buoc>
              <Input
                value={f.title}
                onChange={(e) => dat('title', e.target.value)}
                placeholder="Hội nghị nhân dân bàn mức thu quỹ vệ sinh 2027"
                disabled={!suaDuoc}
                autoFocus={!suaDoi}
              />
            </Truong>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Truong
                nhan="Phạm vi"
                ghi_chu="Chọn tổ thì chỉ tính hộ của tổ đó vào mẫu số biểu quyết"
              >
                <Select
                  value={f.group_id}
                  onChange={(e) => dat('group_id', e.target.value)}
                  disabled={!suaDuoc}
                >
                  <option value="">Cả khu phố</option>
                  {to?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.leader_name ? ` — ${t.leader_name}` : ''}
                    </option>
                  ))}
                </Select>
              </Truong>
              <Truong nhan="Thời gian">
                <Input
                  type="datetime-local"
                  value={f.thoi_gian}
                  onChange={(e) => dat('thoi_gian', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Địa điểm">
                <Input
                  value={f.dia_diem}
                  onChange={(e) => dat('dia_diem', e.target.value)}
                  placeholder="Nhà văn hoá khu phố"
                  disabled={!suaDuoc}
                />
              </Truong>
              {suaDoi && (
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
              )}
              <Truong nhan="Chủ trì">
                <Input
                  value={f.chu_tri}
                  onChange={(e) => dat('chu_tri', e.target.value)}
                  placeholder="Trưởng khu phố"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Thư ký">
                <Input
                  value={f.thu_ky}
                  onChange={(e) => dat('thu_ky', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>
            </div>

            {/* ── Điều kiện tiến hành ──────────────────────────────────── */}
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Điều kiện tiến hành
              </h4>

              {cu && (
                <div className="rounded-xl bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">
                      Tổng số hộ trên địa bàn
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {so(cu.tong_so_ho)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-slate-400">
                    Chốt tại thời điểm mở hội nghị. Số hộ đổi hằng ngày, nhưng mẫu số của một
                    kết quả đã ghi vào biên bản thì không được đổi theo.
                  </p>
                  {suaDuoc && cu.trang_thai !== 'da_hop' && (
                    <Button
                      mau="trang"
                      icon={RefreshCw}
                      onClick={() => chotSoHo.mutate()}
                      disabled={chotSoHo.isPending}
                      className="mt-2"
                    >
                      {chotSoHo.isPending ? 'ĐANG ĐẾM…' : 'ĐẾM LẠI SỐ HỘ'}
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Truong nhan="Số hộ có đại diện dự" ghi_chu="Đếm HỘ, không đếm người">
                  <Input
                    value={f.so_ho_du}
                    onChange={(e) => dat('so_ho_du', e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="font-mono font-bold"
                    disabled={!suaDuoc}
                  />
                </Truong>
                <Truong nhan="Tỉ lệ dự tối thiểu (%)">
                  <Input
                    value={f.ty_le_du_toi_thieu}
                    onChange={(e) =>
                      dat('ty_le_du_toi_thieu', e.target.value.replace(/[^\d.]/g, ''))
                    }
                    inputMode="decimal"
                    className="font-mono"
                    disabled={!suaDuoc}
                  />
                </Truong>
              </div>

              {cu?.du_dieu_kien === true && (
                <CanhBao loai="ok" emoji="✅">
                  <b>{cu.ty_le_du}%</b> đại diện hộ dự — đủ điều kiện tiến hành hội nghị.
                </CanhBao>
              )}
              {cu?.du_dieu_kien === false && (
                <CanhBao loai="canh" emoji="⚠️">
                  Mới <b>{cu.ty_le_du}%</b> đại diện hộ dự, chưa đạt {cu.ty_le_du_toi_thieu}%.
                  Hội nghị chưa đủ điều kiện tiến hành.
                </CanhBao>
              )}
            </section>

            <Truong nhan="Chương trình nghị sự">
              <Textarea
                value={f.noi_dung}
                onChange={(e) => dat('noi_dung', e.target.value)}
                placeholder="Những việc đưa ra bàn tại hội nghị…"
                disabled={!suaDuoc}
              />
            </Truong>

            {/* ── Nội dung biểu quyết ──────────────────────────────────── */}
            {suaDoi && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                    Nội dung biểu quyết ({cu?.noi_dung_bieu_quyet.length ?? 0})
                  </h4>
                  {suaDuoc && (
                    <Button mau="trang" icon={Vote} onClick={() => setSuaND(null)}>
                      THÊM NỘI DUNG
                    </Button>
                  )}
                </div>

                {cu?.noi_dung_bieu_quyet.length ? (
                  <div className="space-y-2">
                    {cu.noi_dung_bieu_quyet.map((n) => (
                      <div
                        key={n.id}
                        className={cx(
                          'rounded-xl border p-3',
                          n.da_thong_qua === true
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : n.da_thong_qua === false
                              ? 'border-rose-200 bg-rose-50/40'
                              : 'border-slate-200',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-bold text-slate-900">{n.title}</p>
                            <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                              {n.ten_hinh_thuc}
                            </p>
                          </div>
                          {suaDuoc && (
                            <div className="flex shrink-0 gap-1">
                              <NutIcon
                                icon={Edit}
                                mau="text-amber-600"
                                title="Sửa"
                                onClick={() => setSuaND(n)}
                              />
                              <NutIcon
                                icon={Trash2}
                                mau="text-red-500"
                                title="Xoá"
                                onClick={() => xoaND.mutate(n)}
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-3 text-[10.5px] font-bold">
                          <span className="text-emerald-700">Tán thành {so(n.tan_thanh)}</span>
                          <span className="text-rose-700">
                            Không tán thành {so(n.khong_tan_thanh)}
                          </span>
                          <span className="text-slate-500">
                            Không ý kiến {so(n.khong_y_kien)}
                          </span>
                        </div>

                        {n.ty_le_tan_thanh != null && (
                          <>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={cx(
                                  'h-full rounded-full transition-all',
                                  n.da_thong_qua ? 'bg-emerald-600' : 'bg-amber-500',
                                )}
                                style={{ width: `${Math.min(100, n.ty_le_tan_thanh)}%` }}
                              />
                            </div>
                            <p className="mt-1.5 text-[10.5px]">
                              <b
                                className={
                                  n.da_thong_qua ? 'text-emerald-700' : 'text-rose-700'
                                }
                              >
                                {n.da_thong_qua ? '✅ THÔNG QUA' : '❌ KHÔNG THÔNG QUA'}
                              </b>
                              <span className="text-slate-500">
                                {' '}
                                — {n.tan_thanh}/{cu.tong_so_ho} hộ tán thành ={' '}
                                <b>{n.ty_le_tan_thanh}%</b>, cần trên {n.ty_le_yeu_cau}%
                              </span>
                            </p>
                          </>
                        )}

                        {n.ket_qua && (
                          <p className="mt-1 text-[10px] font-medium text-slate-500">
                            {n.ket_qua}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
                    Chưa có nội dung nào đưa ra biểu quyết.
                  </p>
                )}

                <p className="text-[10px] font-medium text-slate-400">
                  Tỉ lệ tán thành tính trên <b>tổng số hộ của địa bàn</b> ({so(cu?.tong_so_ho ?? 0)}
                  ), không phải trên số hộ có mặt — hội nghị vắng không làm nhỏ mẫu số đi.
                </p>
              </section>
            )}

            {suaDoi && (
              <Truong nhan="Biên bản hội nghị">
                <Textarea
                  value={f.bien_ban}
                  onChange={(e) => dat('bien_ban', e.target.value)}
                  className="min-h-32"
                  placeholder="Diễn biến, ý kiến phát biểu, kết luận…"
                  disabled={!suaDuoc}
                />
              </Truong>
            )}
          </div>
        )}
      </NganKeo>

      {suaND !== undefined && id && (
        <FormNoiDung
          hoiNghiId={id}
          nd={suaND}
          tongSoHo={cu?.tong_so_ho ?? 0}
          onClose={() => setSuaND(undefined)}
          onXong={lamMoi}
        />
      )}
    </>
  );
}

/* ────────────────────────────────────────────── Nội dung biểu quyết ──── */

function FormNoiDung({
  hoiNghiId,
  nd,
  tongSoHo,
  onClose,
  onXong,
}: {
  hoiNghiId: string;
  nd: ND | null;
  tongSoHo: number;
  onClose: () => void;
  onXong: () => void;
}) {
  const [f, setF] = useState({
    title: nd?.title ?? '',
    mo_ta: nd?.mo_ta ?? '',
    hinh_thuc: nd?.hinh_thuc ?? 'gio_tay',
    tan_thanh: String(nd?.tan_thanh ?? 0),
    khong_tan_thanh: String(nd?.khong_tan_thanh ?? 0),
    khong_y_kien: String(nd?.khong_y_kien ?? 0),
    ty_le_yeu_cau: String(nd?.ty_le_yeu_cau ?? 50),
    ket_qua: nd?.ket_qua ?? '',
  });
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title.trim(),
        mo_ta: f.mo_ta,
        hinh_thuc: f.hinh_thuc,
        tan_thanh: Number(f.tan_thanh) || 0,
        khong_tan_thanh: Number(f.khong_tan_thanh) || 0,
        khong_y_kien: Number(f.khong_y_kien) || 0,
        ty_le_yeu_cau: Number(f.ty_le_yeu_cau) || 50,
        ket_qua: f.ket_qua,
        sort_order: nd?.sort_order ?? 0,
      };
      return nd
        ? patch(`/hoi-nghi/noi-dung/${nd.id}`, body)
        : post(`/hoi-nghi/${hoiNghiId}/noi-dung`, body);
    },
    onSuccess: () => {
      onXong();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Xem trước kết quả ngay khi gõ, để thư ký thấy luôn có thông qua hay không
  const tt = Number(f.tan_thanh) || 0;
  const yeu_cau = Number(f.ty_le_yeu_cau) || 50;
  const tyLe = tongSoHo ? Math.round((tt * 100) / tongSoHo * 10) / 10 : null;
  const thongQua = tyLe == null ? null : tyLe > yeu_cau;
  const tongPhieu = tt + (Number(f.khong_tan_thanh) || 0) + (Number(f.khong_y_kien) || 0);

  return (
    <HopThoai
      mo
      dong={onClose}
      tieu_de={nd ? 'Sửa nội dung biểu quyết' : 'Thêm nội dung biểu quyết'}
      emoji="🗳️"
      rong="max-w-lg"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (f.title.trim().length < 3) return setLoi('Chưa nhập nội dung biểu quyết.');
              if (tongPhieu > tongSoHo && tongSoHo) {
                return setLoi(
                  `Tổng số phiếu (${tongPhieu}) nhiều hơn tổng số hộ (${tongSoHo}). ` +
                    'Nhớ đếm HỘ chứ không đếm người.',
                );
              }
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG LƯU…' : 'LƯU'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <Truong nhan="Nội dung đưa ra biểu quyết" bat_buoc>
          <Input
            value={f.title}
            onChange={(e) => dat('title', e.target.value)}
            placeholder="Mức thu quỹ vệ sinh môi trường năm 2027"
            autoFocus
          />
        </Truong>

        <Truong nhan="Mô tả">
          <Textarea
            value={f.mo_ta}
            onChange={(e) => dat('mo_ta', e.target.value)}
            placeholder="Phương án cụ thể đưa ra lấy ý kiến…"
          />
        </Truong>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Truong nhan="Hình thức biểu quyết">
            <Select value={f.hinh_thuc} onChange={(e) => dat('hinh_thuc', e.target.value)}>
              {Object.entries(HINH_THUC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Truong>
          <Truong
            nhan="Tỉ lệ tán thành cần đạt (%)"
            ghi_chu="Trên tổng số hộ. Mặc định trên 50%"
          >
            <Input
              value={f.ty_le_yeu_cau}
              onChange={(e) => dat('ty_le_yeu_cau', e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              className="font-mono"
            />
          </Truong>
        </div>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
            Số phiếu — đếm theo ĐẠI DIỆN HỘ
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Truong nhan="Tán thành">
              <Input
                value={f.tan_thanh}
                onChange={(e) => dat('tan_thanh', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="text-center font-mono font-bold"
              />
            </Truong>
            <Truong nhan="Không tán thành">
              <Input
                value={f.khong_tan_thanh}
                onChange={(e) => dat('khong_tan_thanh', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="text-center font-mono font-bold"
              />
            </Truong>
            <Truong nhan="Không ý kiến">
              <Input
                value={f.khong_y_kien}
                onChange={(e) => dat('khong_y_kien', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="text-center font-mono font-bold"
              />
            </Truong>
          </div>
          <p className="text-[10px] font-medium text-slate-400">
            Một hộ 9 người vẫn chỉ <b>một phiếu</b>. Tổng đang là {so(tongPhieu)} phiếu trên{' '}
            {so(tongSoHo)} hộ.
          </p>
        </section>

        {/* Kết luận hiện ngay khi gõ — thư ký không phải nhẩm giữa cuộc họp */}
        {tyLe != null && (
          <CanhBao loai={thongQua ? 'ok' : 'canh'} emoji={thongQua ? '✅' : '⚠️'}>
            {tt}/{tongSoHo} hộ tán thành = <b>{tyLe}%</b>.{' '}
            {thongQua ? (
              <>
                Trên {yeu_cau}% nên nội dung này <b>THÔNG QUA</b>.
              </>
            ) : (
              <>
                Chưa quá {yeu_cau}% nên <b>KHÔNG thông qua</b>. Cần ít nhất{' '}
                {Math.floor((yeu_cau * tongSoHo) / 100) + 1} hộ tán thành.
              </>
            )}
          </CanhBao>
        )}

        <Truong nhan="Ghi chú của thư ký">
          <Textarea
            value={f.ket_qua}
            onChange={(e) => dat('ket_qua', e.target.value)}
            placeholder="Ý kiến khác, điều kiện kèm theo…"
          />
        </Truong>
      </div>
    </HopThoai>
  );
}
