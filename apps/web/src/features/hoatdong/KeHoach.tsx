/**
 * Kế hoạch công tác khu phố.
 *
 * Việc quá hạn luôn nổi lên trên cùng và tô đỏ. Một phần mềm quản lý công việc mà
 * để việc trễ hạn nằm lẫn giữa việc đã xong thì không giúp được gì cho trưởng khu
 * phố — người vốn đã có quá nhiều thứ phải nhớ.
 *
 * Đánh dấu "Hoàn thành" thì tiến độ tự lên 100%, khỏi phải kéo thanh trượt.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, ClipboardPlus, Edit, Trash2 } from 'lucide-react';
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
import { ngay } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

const TRANG_THAI: Record<string, { nhan: string; mau: 'slate' | 'blue' | 'emerald' | 'amber' }> = {
  chua_bat_dau: { nhan: 'Chưa bắt đầu', mau: 'slate' },
  dang_thuc_hien: { nhan: 'Đang thực hiện', mau: 'blue' },
  hoan_thanh: { nhan: 'Hoàn thành', mau: 'emerald' },
  tam_dung: { nhan: 'Tạm dừng', mau: 'amber' },
};

const UU_TIEN: Record<string, { nhan: string; mau: 'slate' | 'blue' | 'amber' | 'rose' }> = {
  thap: { nhan: 'Thấp', mau: 'slate' },
  binh_thuong: { nhan: 'Bình thường', mau: 'blue' },
  cao: { nhan: 'Cao', mau: 'amber' },
  khan: { nhan: 'Khẩn', mau: 'rose' },
};

interface KH {
  id: string;
  title: string;
  deadline: string | null;
  status: string;
  tien_do: number;
  uu_tien: string;
  phu_trach: string | null;
  con_ngay: number | null;
  da_qua_han: boolean;
  done_at: string | null;
}

interface KHChiTiet extends KH {
  noi_dung: string | null;
  ket_qua: string | null;
  started_at: string | null;
}

/** Câu mô tả hạn, đọc là hiểu ngay còn bao lâu. */
function nhanHan(k: { deadline: string | null; con_ngay: number | null; status: string }) {
  if (!k.deadline) return 'Chưa định hạn';
  if (k.status === 'hoan_thanh') return ngay(k.deadline);
  const c = k.con_ngay ?? 0;
  if (c < 0) return `Quá hạn ${Math.abs(c)} ngày`;
  if (c === 0) return 'Hết hạn hôm nay';
  if (c <= 7) return `Còn ${c} ngày`;
  return ngay(k.deadline);
}

export function KeHoach() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [trangThai, setTrangThai] = useState('');
  const [chiQuaHan, setChiQuaHan] = useState(false);
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [form, setForm] = useState<string | null>(null);
  const [hoiXoa, setHoiXoa] = useState<KH | null>(null);

  useEffect(() => {
    datManHinh({
      tieu_de: '📋 Kế hoạch khu phố',
      goi_y_tim: 'Tìm theo tên kế hoạch…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh]);

  const thamSo = {
    q: tim,
    trang_thai: trangThai,
    qua_han: chiQuaHan ? 'true' : '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['ke-hoach', thamSo],
    queryFn: () => get<{ tong_so: number; items: KH[] }>('/ke-hoach' + qs(thamSo)),
    enabled: can('plan:read'),
    placeholderData: keepPreviousData,
  });

  const xoa = useMutation({
    mutationFn: (k: KH) => del(`/ke-hoach/${k.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      void qc.invalidateQueries({ queryKey: ['ke-hoach'] });
      void qc.invalidateQueries({ queryKey: ['thong-bao'] });
    },
  });

  /** Đánh dấu xong ngay từ danh sách — thao tác hay dùng nhất, không nên bắt mở form. */
  const danhDauXong = useMutation({
    mutationFn: (k: KH) => patch(`/ke-hoach/${k.id}`, { status: 'hoan_thanh' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ke-hoach'] });
      void qc.invalidateQueries({ queryKey: ['thong-bao'] });
    },
  });

  if (!can('plan:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem kế hoạch khu phố." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const quaHan = items.filter((k) => k.da_qua_han);
  const suaDuoc = can('plan:write');

  return (
    <>
      <ThanhTieuDe
        tieu_de="Kế hoạch công tác"
        mo_ta="Việc quá hạn luôn nổi lên trên cùng"
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
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={chiQuaHan}
                  onChange={(e) => {
                    setChiQuaHan(e.target.checked);
                    setTrang(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
                />
                <span className="text-xs font-bold text-slate-600">Chỉ việc đã quá hạn</span>
              </label>
            </div>
          </div>
        }
      >
        {suaDuoc && (
          <Button icon={ClipboardPlus} onClick={() => setForm('')}>
            THÊM KẾ HOẠCH
          </Button>
        )}
      </ThanhTieuDe>

      {quaHan.length > 0 && !chiQuaHan && (
        <CanhBao loai="loi" emoji="⏰">
          <b>{quaHan.length}</b> kế hoạch đã quá hạn: {quaHan.map((k) => k.title).join(' · ')}
        </CanhBao>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải kế hoạch…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="📋"
          loi_nhan={
            tim || trangThai || chiQuaHan
              ? 'Không có kế hoạch nào khớp bộ lọc.'
              : 'Chưa có kế hoạch nào.'
          }
        >
          {suaDuoc && (
            <Button icon={ClipboardPlus} onClick={() => setForm('')}>
              THÊM KẾ HOẠCH ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((k) => (
              <TheKeHoach
                key={k.id}
                k={k}
                suaDuoc={suaDuoc}
                onMo={() => setForm(k.id)}
                onXong={() => danhDauXong.mutate(k)}
              />
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang className="min-w-[900px]">
                <Thead>
                  <tr>
                    <Th>Nội dung kế hoạch</Th>
                    <Th>Hạn hoàn thành</Th>
                    <Th>Phụ trách</Th>
                    <Th>Ưu tiên</Th>
                    <Th className="w-40">Tiến độ</Th>
                    <Th>Trạng thái</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {items.map((k) => {
                    const tt = TRANG_THAI[k.status] ?? TRANG_THAI.chua_bat_dau!;
                    const ut = UU_TIEN[k.uu_tien] ?? UU_TIEN.binh_thuong!;
                    return (
                      <Tr
                        key={k.id}
                        onClick={() => setForm(k.id)}
                        className={cx('cursor-pointer', k.da_qua_han && 'bg-rose-50/50')}
                      >
                        <Td className="font-semibold text-slate-900">{k.title}</Td>
                        <Td
                          className={cx(
                            'whitespace-nowrap',
                            k.da_qua_han ? 'font-bold text-rose-700' : 'text-slate-700',
                          )}
                        >
                          {nhanHan(k)}
                        </Td>
                        <Td className="text-slate-600">{k.phu_trach || <ChuaCapNhat />}</Td>
                        <Td>
                          <Chip mau={ut.mau} nho>
                            {ut.nhan}
                          </Chip>
                        </Td>
                        <Td>
                          <ThanhTienDo n={k.tien_do} />
                        </Td>
                        <Td>
                          <Chip mau={tt.mau} nho>
                            {tt.nhan}
                          </Chip>
                        </Td>
                        {suaDuoc && (
                          <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              {k.status !== 'hoan_thanh' && (
                                <NutIcon
                                  icon={ClipboardCheck}
                                  mau="text-emerald-600"
                                  title="Đánh dấu hoàn thành"
                                  onClick={() => danhDauXong.mutate(k)}
                                />
                              )}
                              <NutIcon
                                icon={Edit}
                                mau="text-amber-600"
                                title="Sửa kế hoạch"
                                onClick={() => setForm(k.id)}
                              />
                              <NutIcon
                                icon={Trash2}
                                mau="text-red-500"
                                title="Xoá kế hoạch"
                                onClick={() => setHoiXoa(k)}
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
          don_vi="kế hoạch"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {form !== null && <FormKeHoach id={form || null} onClose={() => setForm(null)} />}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá kế hoạch"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá kế hoạch <b>{hoiXoa?.title}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Nội dung và kết quả đã ghi cũng mất theo. Thao tác có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

function ThanhTienDo({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cx(
            'h-full rounded-full transition-all',
            n >= 100 ? 'bg-emerald-600' : 'bg-blue-800',
          )}
          style={{ width: `${n}%` }}
        />
      </div>
      <span className="font-mono text-[10px] font-bold text-slate-500 tabular-nums">{n}%</span>
    </div>
  );
}

function TheKeHoach({
  k,
  suaDuoc,
  onMo,
  onXong,
}: {
  k: KH;
  suaDuoc: boolean;
  onMo: () => void;
  onXong: () => void;
}) {
  const tt = TRANG_THAI[k.status] ?? TRANG_THAI.chua_bat_dau!;
  const ut = UU_TIEN[k.uu_tien] ?? UU_TIEN.binh_thuong!;
  return (
    <Card className={cx('p-4', k.da_qua_han && 'border-rose-300 bg-rose-50/40')}>
      <button onClick={onMo} className="w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-bold text-slate-900">{k.title}</p>
          <Chip mau={tt.mau} nho>
            {tt.nhan}
          </Chip>
        </div>
        <p
          className={cx(
            'mt-1 text-[11px] font-semibold',
            k.da_qua_han ? 'text-rose-700' : 'text-slate-600',
          )}
        >
          {k.da_qua_han && '⏰ '}
          {nhanHan(k)}
          {k.phu_trach ? ` · ${k.phu_trach}` : ''}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Chip mau={ut.mau} nho>
            {ut.nhan}
          </Chip>
          <div className="flex-1">
            <ThanhTienDo n={k.tien_do} />
          </div>
        </div>
      </button>

      {suaDuoc && k.status !== 'hoan_thanh' && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Button mau="trang" icon={ClipboardCheck} onClick={onXong} className="w-full">
            ĐÁNH DẤU HOÀN THÀNH
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────── Thêm / sửa kế hoạch ──── */

interface FormKH {
  title: string;
  deadline: string;
  status: string;
  tien_do: string;
  uu_tien: string;
  phu_trach: string;
  noi_dung: string;
  ket_qua: string;
}

const RONG_KH: FormKH = {
  title: '',
  deadline: '',
  status: 'chua_bat_dau',
  tien_do: '0',
  uu_tien: 'binh_thuong',
  phu_trach: '',
  noi_dung: '',
  ket_qua: '',
};

function FormKeHoach({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const { can } = useAuth();
  const suaDuoc = can('plan:write');
  const [f, setF] = useState<FormKH>(RONG_KH);
  const [loi, setLoi] = useState('');

  const { data: cu, isLoading } = useQuery({
    queryKey: ['ke-hoach', id],
    queryFn: () => get<KHChiTiet>(`/ke-hoach/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      title: cu.title,
      deadline: cu.deadline ?? '',
      status: cu.status,
      tien_do: String(cu.tien_do),
      uu_tien: cu.uu_tien,
      phu_trach: cu.phu_trach ?? '',
      noi_dung: cu.noi_dung ?? '',
      ket_qua: cu.ket_qua ?? '',
    });
  }, [cu]);

  const luu = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: f.title.trim(),
        deadline: f.deadline || null,
        uu_tien: f.uu_tien,
        phu_trach: f.phu_trach,
        noi_dung: f.noi_dung,
      };
      if (suaDoi) {
        body.status = f.status;
        body.tien_do = Number(f.tien_do);
        body.ket_qua = f.ket_qua;
        return patch(`/ke-hoach/${id}`, body);
      }
      return post('/ke-hoach', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ke-hoach'] });
      void qc.invalidateQueries({ queryKey: ['thong-bao'] });
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof FormKH>(k: K, v: FormKH[K]) => setF((s) => ({ ...s, [k]: v }));
  const xong = f.status === 'hoan_thanh';

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Kế hoạch công tác' : 'Thêm kế hoạch'}
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
                if (f.title.trim().length < 3) return setLoi('Chưa nhập nội dung kế hoạch.');
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'THÊM KẾ HOẠCH'}
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
        <Spinner label="Đang mở kế hoạch…" />
      ) : (
        <div className="space-y-4">
          {loi && (
            <CanhBao loai="loi" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          {cu?.da_qua_han && (
            <CanhBao loai="loi" emoji="⏰">
              Kế hoạch này đã <b>quá hạn {Math.abs(cu.con_ngay ?? 0)} ngày</b>. Dời hạn hoặc
              đánh dấu hoàn thành để thôi hiện trong chuông nhắc.
            </CanhBao>
          )}

          <Truong nhan="Nội dung kế hoạch" bat_buoc>
            <Input
              value={f.title}
              onChange={(e) => dat('title', e.target.value)}
              placeholder="Tổng vệ sinh khu phố quý 3"
              disabled={!suaDuoc}
              autoFocus={!suaDoi}
            />
          </Truong>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Truong nhan="Hạn hoàn thành">
              <Input
                type="date"
                value={f.deadline}
                onChange={(e) => dat('deadline', e.target.value)}
                disabled={!suaDuoc}
              />
            </Truong>
            <Truong nhan="Mức ưu tiên">
              <Select
                value={f.uu_tien}
                onChange={(e) => dat('uu_tien', e.target.value)}
                disabled={!suaDuoc}
              >
                {Object.entries(UU_TIEN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nhan}
                  </option>
                ))}
              </Select>
            </Truong>
            <div className="sm:col-span-2">
              <Truong nhan="Người / bộ phận phụ trách">
                <Input
                  value={f.phu_trach}
                  onChange={(e) => dat('phu_trach', e.target.value)}
                  placeholder="Tổ trưởng tổ 1, Chi hội Phụ nữ…"
                  disabled={!suaDuoc}
                />
              </Truong>
            </div>
          </div>

          <Truong nhan="Nội dung chi tiết">
            <Textarea
              value={f.noi_dung}
              onChange={(e) => dat('noi_dung', e.target.value)}
              placeholder="Các đầu việc, phân công, nguồn lực cần…"
              disabled={!suaDuoc}
            />
          </Truong>

          {suaDoi && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Truong nhan="Trạng thái">
                  <Select
                    value={f.status}
                    onChange={(e) => {
                      dat('status', e.target.value);
                      if (e.target.value === 'hoan_thanh') dat('tien_do', '100');
                    }}
                    disabled={!suaDuoc}
                  >
                    {Object.entries(TRANG_THAI).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.nhan}
                      </option>
                    ))}
                  </Select>
                </Truong>
                <Truong
                  nhan={`Tiến độ: ${f.tien_do}%`}
                  ghi_chu={xong ? 'Hoàn thành thì tiến độ luôn là 100%' : undefined}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={f.tien_do}
                    onChange={(e) => dat('tien_do', e.target.value)}
                    disabled={!suaDuoc || xong}
                    className="w-full accent-blue-800 disabled:opacity-50"
                  />
                </Truong>
              </div>

              {xong && (
                <Truong nhan="Kết quả thực hiện">
                  <Textarea
                    value={f.ket_qua}
                    onChange={(e) => dat('ket_qua', e.target.value)}
                    placeholder="Đã làm được gì, còn tồn gì…"
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}
            </>
          )}
        </div>
      )}
    </NganKeo>
  );
}
