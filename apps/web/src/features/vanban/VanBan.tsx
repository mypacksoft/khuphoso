/**
 * Văn bản đến và văn bản đi.
 *
 * Một màn hình dùng cho cả hai chiều, khác nhau ở `loai` lấy từ đường dẫn. Cùng
 * cách tra cứu, cùng cách lọc theo cơ quan ban hành — tách hai màn hình chỉ nhân
 * đôi mã mà cán bộ vẫn phải học hai lần.
 *
 * Văn bản ĐẾN có thêm phần theo dõi xử lý (ai xử lý, hạn nào, xong chưa) và cảnh
 * báo quá hạn. Văn bản ĐI có phần thể thức để in ra đúng quy định.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Camera, Edit, FilePlus, Paperclip, Printer, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
import { del, get, patch, post, postForm, qs, taiTep } from '@/lib/api';
import { ngay } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

import { InVanBan } from './InVanBan';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

export const CO_QUAN: Record<string, string> = {
  dang: 'Đảng',
  chinh_quyen: 'Chính quyền',
  mat_tran: 'Mặt trận',
  doan_the: 'Đoàn thể',
};

const TRANG_THAI: Record<string, { nhan: string; mau: 'slate' | 'blue' | 'emerald' | 'amber' }> = {
  nhap: { nhan: 'Nháp', mau: 'slate' },
  moi: { nhan: 'Mới nhận', mau: 'amber' },
  dang_xu_ly: { nhan: 'Đang xử lý', mau: 'blue' },
  da_xu_ly: { nhan: 'Đã xử lý', mau: 'emerald' },
  luu: { nhan: 'Lưu hồ sơ', mau: 'slate' },
};

const DO_KHAN: Record<string, { nhan: string; mau: 'slate' | 'amber' | 'rose' }> = {
  thuong: { nhan: 'Thường', mau: 'slate' },
  khan: { nhan: 'Khẩn', mau: 'amber' },
  thuong_khan: { nhan: 'Thượng khẩn', mau: 'rose' },
  hoa_toc: { nhan: 'Hoả tốc', mau: 'rose' },
};

export interface VB {
  id: string;
  loai: 'den' | 'di';
  so_ky_hieu: string | null;
  title: string;
  co_quan: string | null;
  ten_co_quan: string | null;
  don_vi: string | null;
  ngay_van_ban: string | null;
  ngay_nhan: string | null;
  trich_yeu: string | null;
  trang_thai: string;
  ten_trang_thai: string;
  do_khan: string;
  nguoi_xu_ly: string | null;
  han_xu_ly: string | null;
  nguoi_ky: string | null;
  con_ngay: number | null;
  da_qua_han: boolean;
  so_tep: number;
}

export interface VBChiTiet extends VB {
  noi_nhan: string | null;
  chuc_vu_ky: string | null;
  noi_dung: string | null;
  ket_qua: string | null;
  tep: { id: string; ten_goc: string; kieu: string | null; kich_thuoc: number }[];
}

const kb = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function VanBan() {
  const { chieu } = useParams({ strict: false }) as { chieu?: string };
  const loai = chieu === 'di' ? 'di' : 'den';
  const laDen = loai === 'den';

  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  const tim = useManHinh((s) => s.tim);

  const [coQuan, setCoQuan] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [quaHan, setQuaHan] = useState(false);
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [form, setForm] = useState<string | null>(null);
  const [hoiXoa, setHoiXoa] = useState<VB | null>(null);

  useEffect(() => {
    datManHinh({
      tieu_de: laDen ? '📥 Văn bản đến' : '📤 Văn bản đi',
      goi_y_tim: 'Tìm theo số ký hiệu, trích yếu hoặc đơn vị ban hành…',
      nhanTim: () => setTrang(1),
    });
    setTrang(1);
    setTrangThai('');
    setQuaHan(false);
  }, [datManHinh, laDen]);

  const thamSo = {
    loai,
    q: tim,
    co_quan: coQuan,
    trang_thai: trangThai,
    qua_han: quaHan ? 'true' : '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };
  const { data } = useQuery({
    queryKey: ['van-ban', thamSo],
    queryFn: () => get<{ tong_so: number; items: VB[] }>('/van-ban' + qs(thamSo)),
    enabled: can('document:read'),
    placeholderData: keepPreviousData,
  });
  const { data: tq } = useQuery({
    queryKey: ['van-ban-tong-quan'],
    queryFn: () =>
      get<{ den: number; di: number; chua_xu_ly: number; qua_han: number; ban_nhap: number }>(
        '/van-ban/tong-quan',
      ),
    enabled: can('document:read'),
  });

  const xoa = useMutation({
    mutationFn: (v: VB) => del(`/van-ban/${v.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      for (const k of ['van-ban', 'van-ban-tong-quan', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  if (!can('document:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem văn bản." />;
  }

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;
  const suaDuoc = can('document:write');

  return (
    <>
      <ThanhTieuDe
        tieu_de={laDen ? 'Văn bản đến' : 'Văn bản đi'}
        mo_ta={
          laDen
            ? 'Theo dõi ai xử lý, hạn nào — văn bản quá hạn nổi lên trên'
            : 'Văn bản khu phố ban hành, soạn theo thể thức và in ra được'
        }
        so_loc_dang_bat={[coQuan, trangThai].filter(Boolean).length + (quaHan ? 1 : 0)}
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Truong nhan="Cơ quan ban hành">
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
            <Truong nhan="Trạng thái">
              <Select
                value={trangThai}
                onChange={(e) => {
                  setTrangThai(e.target.value);
                  setTrang(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(TRANG_THAI)
                  .filter(([k]) => (laDen ? k !== 'nhap' : k !== 'moi' && k !== 'dang_xu_ly'))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.nhan}
                    </option>
                  ))}
              </Select>
            </Truong>
            {laDen && (
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={quaHan}
                    onChange={(e) => {
                      setQuaHan(e.target.checked);
                      setTrang(1);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-400"
                  />
                  <span className="text-xs font-bold text-slate-600">Chỉ văn bản quá hạn</span>
                </label>
              </div>
            )}
          </div>
        }
      >
        {suaDuoc && (
          <Button icon={FilePlus} onClick={() => setForm('')}>
            {laDen ? 'VÀO SỔ VĂN BẢN ĐẾN' : 'SOẠN VĂN BẢN'}
          </Button>
        )}
      </ThanhTieuDe>

      {tq && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ONumber nhan="Văn bản đến" gia_tri={tq.den} icon={FilePlus} mau="blue" />
          <ONumber
            nhan="Chưa xử lý"
            gia_tri={tq.chua_xu_ly}
            phu={tq.chua_xu_ly ? 'Cần phân công người xử lý' : 'Đã xử lý hết'}
            phu_mau={tq.chua_xu_ly ? 'text-amber-700' : 'text-emerald-700'}
            icon={FilePlus}
            mau={tq.chua_xu_ly ? 'amber' : 'emerald'}
          />
          <ONumber
            nhan="Quá hạn xử lý"
            gia_tri={tq.qua_han}
            phu={tq.qua_han ? 'Xử lý ngay' : 'Không có văn bản nào trễ'}
            phu_mau={tq.qua_han ? 'text-rose-700' : 'text-emerald-700'}
            icon={FilePlus}
            mau={tq.qua_han ? 'rose' : 'emerald'}
          />
          <ONumber
            nhan="Văn bản đi"
            gia_tri={tq.di}
            phu={tq.ban_nhap ? `${tq.ban_nhap} bản nháp chưa ban hành` : 'Không còn bản nháp'}
            icon={FilePlus}
            mau="slate"
          />
        </div>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải danh sách văn bản…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji={laDen ? '📥' : '📤'}
          loi_nhan={
            tim || coQuan || trangThai || quaHan
              ? 'Không có văn bản nào khớp bộ lọc.'
              : laDen
                ? 'Chưa vào sổ văn bản đến nào.'
                : 'Chưa soạn văn bản đi nào.'
          }
        >
          {suaDuoc && (
            <Button icon={FilePlus} onClick={() => setForm('')}>
              {laDen ? 'VÀO SỔ VĂN BẢN ĐẦU TIÊN' : 'SOẠN VĂN BẢN ĐẦU TIÊN'}
            </Button>
          )}
        </Rong>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((v) => (
              <TheVanBan key={v.id} v={v} onMo={() => setForm(v.id)} />
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang className="min-w-[960px]">
                <Thead>
                  <tr>
                    <Th>Số ký hiệu</Th>
                    <Th>Trích yếu</Th>
                    <Th>{laDen ? 'Đơn vị ban hành' : 'Người ký'}</Th>
                    <Th>{laDen ? 'Ngày nhận' : 'Ngày ban hành'}</Th>
                    {laDen && <Th>Hạn xử lý</Th>}
                    <Th>Trạng thái</Th>
                    <Th className="text-center">Tệp</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {items.map((v) => {
                    const tt = TRANG_THAI[v.trang_thai] ?? TRANG_THAI.moi!;
                    const dk = DO_KHAN[v.do_khan] ?? DO_KHAN.thuong!;
                    return (
                      <Tr
                        key={v.id}
                        onClick={() => setForm(v.id)}
                        className={cx('cursor-pointer', v.da_qua_han && 'bg-rose-50/50')}
                      >
                        <Td className="font-mono font-bold whitespace-nowrap text-slate-700">
                          {v.so_ky_hieu || <ChuaCapNhat />}
                        </Td>
                        <Td className="max-w-sm truncate font-semibold text-slate-900">
                          {v.title}
                          {v.do_khan !== 'thuong' && (
                            <Chip mau={dk.mau} nho className="ml-1.5">
                              {dk.nhan}
                            </Chip>
                          )}
                        </Td>
                        <Td className="max-w-xs truncate text-slate-600">
                          {(laDen ? v.don_vi : v.nguoi_ky) || <ChuaCapNhat />}
                        </Td>
                        <Td className="font-mono whitespace-nowrap text-slate-700">
                          {ngay(laDen ? v.ngay_nhan : v.ngay_van_ban)}
                        </Td>
                        {laDen && (
                          <Td
                            className={cx(
                              'whitespace-nowrap',
                              v.da_qua_han ? 'font-bold text-rose-700' : 'text-slate-600',
                            )}
                          >
                            {v.han_xu_ly
                              ? v.da_qua_han
                                ? `Quá ${Math.abs(v.con_ngay ?? 0)} ngày`
                                : ngay(v.han_xu_ly)
                              : '—'}
                          </Td>
                        )}
                        <Td>
                          <Chip mau={tt.mau} nho>
                            {tt.nhan}
                          </Chip>
                        </Td>
                        <Td className="text-center">
                          {v.so_tep > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-slate-600">
                              <Paperclip className="h-3 w-3" />
                              {v.so_tep}
                            </span>
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
                                title="Mở văn bản"
                                onClick={() => setForm(v.id)}
                              />
                              <NutIcon
                                icon={Trash2}
                                mau="text-red-500"
                                title="Xoá văn bản"
                                onClick={() => setHoiXoa(v)}
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
          don_vi="văn bản"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {form !== null && <FormVanBan id={form || null} loai={loai} onClose={() => setForm(null)} />}

      <XacNhan
        nhan_nut="XOÁ VĨNH VIỄN"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá văn bản"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá văn bản <b>{hoiXoa?.so_ky_hieu || hoiXoa?.title}</b>?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Tệp đính kèm cũng bị xoá khỏi máy chủ. Thao tác có ghi nhật ký.
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Dạng thẻ ──── */

function TheVanBan({ v, onMo }: { v: VB; onMo: () => void }) {
  const tt = TRANG_THAI[v.trang_thai] ?? TRANG_THAI.moi!;
  const dk = DO_KHAN[v.do_khan] ?? DO_KHAN.thuong!;
  const laDen = v.loai === 'den';
  return (
    <Card className={cx('p-4', v.da_qua_han && 'border-rose-300 bg-rose-50/40')}>
      <button onClick={onMo} className="w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[10.5px] font-bold text-slate-500">
            {v.so_ky_hieu || 'chưa có số'}
          </p>
          <Chip mau={tt.mau} nho>
            {tt.nhan}
          </Chip>
        </div>
        <p className="mt-1 text-[12.5px] font-bold text-slate-900">{v.title}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {(laDen ? v.don_vi : v.nguoi_ky) || 'chưa rõ đơn vị'} ·{' '}
          <span className="font-mono">{ngay(laDen ? v.ngay_nhan : v.ngay_van_ban)}</span>
        </p>
        {v.da_qua_han && (
          <p className="mt-1 text-[10.5px] font-bold text-rose-700">
            ⏰ Quá hạn xử lý {Math.abs(v.con_ngay ?? 0)} ngày
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {v.do_khan !== 'thuong' && (
            <Chip mau={dk.mau} nho>
              {dk.nhan}
            </Chip>
          )}
          {v.ten_co_quan && (
            <Chip mau="slate" nho>
              {v.ten_co_quan}
            </Chip>
          )}
          {v.so_tep > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500">
              <Paperclip className="h-3 w-3" />
              {v.so_tep} tệp
            </span>
          )}
        </div>
      </button>
    </Card>
  );
}

/* ─────────────────────────────────────────────────── Thêm / sửa văn bản ── */

interface FormVB {
  so_ky_hieu: string;
  title: string;
  co_quan: string;
  don_vi: string;
  ngay_van_ban: string;
  ngay_nhan: string;
  trich_yeu: string;
  noi_nhan: string;
  nguoi_ky: string;
  chuc_vu_ky: string;
  noi_dung: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  han_xu_ly: string;
  ket_qua: string;
  do_khan: string;
}

const hom_nay = () => new Date().toISOString().slice(0, 10);

function rong(loai: 'den' | 'di'): FormVB {
  return {
    so_ky_hieu: '',
    title: '',
    co_quan: '',
    don_vi: '',
    ngay_van_ban: loai === 'di' ? hom_nay() : '',
    ngay_nhan: loai === 'den' ? hom_nay() : '',
    trich_yeu: '',
    noi_nhan: '',
    nguoi_ky: '',
    chuc_vu_ky: 'Trưởng khu phố',
    noi_dung: '',
    trang_thai: loai === 'den' ? 'moi' : 'nhap',
    nguoi_xu_ly: '',
    han_xu_ly: '',
    ket_qua: '',
    do_khan: 'thuong',
  };
}

function FormVanBan({
  id,
  loai,
  onClose,
}: {
  id: string | null;
  loai: 'den' | 'di';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const laDen = loai === 'den';
  const { can } = useAuth();
  const suaDuoc = can('document:write');

  const [f, setF] = useState<FormVB>(() => rong(loai));
  const [loi, setLoi] = useState('');
  const [moIn, setMoIn] = useState(false);
  const oTep = useRef<HTMLInputElement>(null);
  const oAnh = useRef<HTMLInputElement>(null);
  /**
   * Tệp chọn khi văn bản CHƯA được lưu.
   *
   * Máy chủ cần `document_id` mới nhận tệp, mà lúc vào sổ thì văn bản chưa có id.
   * Bắt cán bộ "lưu rồi mới đính kèm" là bắt họ nhớ quay lại — đứng ở phường cầm
   * xấp công văn thì quên là chuyện thường. Nên xếp hàng ở đây rồi tải lên ngay
   * sau khi máy chủ trả id.
   */
  const [xepHang, setXepHang] = useState<File[]>([]);
  const [dangTai, setDangTai] = useState(0);

  const { data: cu, isLoading } = useQuery({
    queryKey: ['van-ban', id],
    queryFn: () => get<VBChiTiet>(`/van-ban/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      so_ky_hieu: cu.so_ky_hieu ?? '',
      title: cu.title,
      co_quan: cu.co_quan ?? '',
      don_vi: cu.don_vi ?? '',
      ngay_van_ban: cu.ngay_van_ban ?? '',
      ngay_nhan: cu.ngay_nhan ?? '',
      trich_yeu: cu.trich_yeu ?? '',
      noi_nhan: cu.noi_nhan ?? '',
      nguoi_ky: cu.nguoi_ky ?? '',
      chuc_vu_ky: cu.chuc_vu_ky ?? '',
      noi_dung: cu.noi_dung ?? '',
      trang_thai: cu.trang_thai,
      nguoi_xu_ly: cu.nguoi_xu_ly ?? '',
      han_xu_ly: cu.han_xu_ly ?? '',
      ket_qua: cu.ket_qua ?? '',
      do_khan: cu.do_khan,
    });
  }, [cu]);

  const lamMoi = () => {
    for (const k of ['van-ban', 'van-ban-tong-quan', 'thong-bao']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const luu = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        loai,
        so_ky_hieu: f.so_ky_hieu,
        title: f.title.trim(),
        co_quan: f.co_quan || null,
        don_vi: f.don_vi,
        ngay_van_ban: f.ngay_van_ban || null,
        ngay_nhan: f.ngay_nhan || null,
        trich_yeu: f.trich_yeu,
        noi_nhan: f.noi_nhan,
        nguoi_ky: f.nguoi_ky,
        chuc_vu_ky: f.chuc_vu_ky,
        noi_dung: f.noi_dung,
        trang_thai: f.trang_thai,
        nguoi_xu_ly: f.nguoi_xu_ly,
        han_xu_ly: f.han_xu_ly || null,
        ket_qua: f.ket_qua,
        do_khan: f.do_khan,
      };
      if (suaDoi) {
        await patch(`/van-ban/${id}`, body);
        return id!;
      }
      return (await post<{ id: string }>('/van-ban', body)).id;
    },
    onSuccess: async (did) => {
      // Tải hàng đợi lên TRƯỚC khi đóng: đóng sớm thì cán bộ tưởng đã đính kèm
      // xong trong khi tệp còn chưa rời khỏi máy
      if (xepHang.length) await guiNhieuTep.mutateAsync({ did, ds: xepHang });
      lamMoi();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  /** Tải lần lượt, không song song: máy chủ chặn 20MB mỗi tệp và bà con hay dùng 3G. */
  const guiNhieuTep = useMutation({
    mutationFn: async ({ did, ds }: { did: string; ds: File[] }) => {
      const hong: string[] = [];
      for (let i = 0; i < ds.length; i++) {
        setDangTai(i + 1);
        const fd = new FormData();
        fd.append('tep', ds[i]!);
        try {
          await postForm(`/van-ban/${did}/tep`, fd);
        } catch (e) {
          hong.push(`${ds[i]!.name}: ${e instanceof Error ? e.message : 'lỗi'}`);
        }
      }
      setDangTai(0);
      return hong;
    },
    onSuccess: (hong) => {
      setXepHang([]);
      // Một tệp hỏng không được làm mất những tệp đã lên: báo riêng từng cái
      setLoi(hong.length ? `Không tải lên được ${hong.length} tệp — ${hong.join('; ')}` : '');
      void qc.invalidateQueries({ queryKey: ['van-ban', id] });
      lamMoi();
    },
    onError: (e) => {
      setDangTai(0);
      setLoi(e instanceof Error ? e.message : 'Không tải tệp lên được');
    },
  });

  /** Gộp tệp mới vào hàng đợi, bỏ trùng theo tên + kích thước. */
  const themVaoHang = (fl: FileList | null) => {
    if (!fl?.length) return;
    setLoi('');
    setXepHang((cu) => {
      const co = new Set(cu.map((t) => `${t.name}|${t.size}`));
      return [...cu, ...[...fl].filter((t) => !co.has(`${t.name}|${t.size}`))];
    });
  };

  const xoaTep = useMutation({
    mutationFn: (fid: string) => del(`/van-ban/tep/${fid}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['van-ban', id] });
      lamMoi();
    },
  });

  const dat = <K extends keyof FormVB>(k: K, v: FormVB[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={
          suaDoi
            ? laDen
              ? 'Văn bản đến'
              : 'Văn bản đi'
            : laDen
              ? 'Vào sổ văn bản đến'
              : 'Soạn văn bản đi'
        }
        mo_ta={
          laDen
            ? 'Ghi số, đơn vị ban hành và hạn xử lý — chuông sẽ tự nhắc'
            : 'Soạn đủ thể thức để in ra dùng được ngay'
        }
        rong="max-w-2xl"
        chan={
          <>
            {!laDen && suaDoi && (
              <Button mau="trang" icon={Printer} onClick={() => setMoIn(true)}>
                XEM & IN
              </Button>
            )}
            <div className="flex-1" />
            <Button mau="trang" onClick={onClose} type="button">
              {suaDuoc ? 'Huỷ bỏ' : 'Đóng'}
            </Button>
            {suaDuoc && (
              <Button
                onClick={() => {
                  setLoi('');
                  if (f.title.trim().length < 3) return setLoi('Chưa nhập trích yếu văn bản.');
                  luu.mutate();
                }}
                disabled={luu.isPending}
              >
                {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'LƯU'}
              </Button>
            )}
          </>
        }
      >
        {suaDoi && isLoading ? (
          <Spinner label="Đang mở văn bản…" />
        ) : (
          <div className="space-y-4">
            {loi && (
              <CanhBao loai="loi" emoji="⚠️">
                {loi}
              </CanhBao>
            )}

            {cu?.da_qua_han && (
              <CanhBao loai="loi" emoji="⏰">
                Văn bản này <b>quá hạn xử lý {Math.abs(cu.con_ngay ?? 0)} ngày</b>. Chuyển sang “Đã
                xử lý” hoặc dời hạn để thôi hiện trong chuông nhắc.
              </CanhBao>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Truong nhan="Số và ký hiệu" ghi_chu="vd 12/TB-KP3">
                <Input
                  value={f.so_ky_hieu}
                  onChange={(e) => dat('so_ky_hieu', e.target.value)}
                  className="font-mono font-bold"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Độ khẩn">
                <Select
                  value={f.do_khan}
                  onChange={(e) => dat('do_khan', e.target.value)}
                  disabled={!suaDuoc}
                >
                  {Object.entries(DO_KHAN).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.nhan}
                    </option>
                  ))}
                </Select>
              </Truong>
              <div className="sm:col-span-2">
                <Truong nhan="Trích yếu nội dung" bat_buoc>
                  <Input
                    value={f.title}
                    onChange={(e) => dat('title', e.target.value)}
                    placeholder="V/v tổ chức họp tổ dân phố tháng 9"
                    disabled={!suaDuoc}
                    autoFocus={!suaDoi}
                  />
                </Truong>
              </div>
              <Truong nhan="Cơ quan ban hành">
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
              <Truong nhan={laDen ? 'Đơn vị ban hành' : 'Đơn vị soạn'}>
                <Input
                  value={f.don_vi}
                  onChange={(e) => dat('don_vi', e.target.value)}
                  placeholder="UBND Phường An Phú"
                  disabled={!suaDuoc}
                />
              </Truong>
              <Truong nhan="Ngày văn bản">
                <Input
                  type="date"
                  value={f.ngay_van_ban}
                  onChange={(e) => dat('ngay_van_ban', e.target.value)}
                  disabled={!suaDuoc}
                />
              </Truong>
              {laDen && (
                <Truong nhan="Ngày nhận">
                  <Input
                    type="date"
                    value={f.ngay_nhan}
                    onChange={(e) => dat('ngay_nhan', e.target.value)}
                    disabled={!suaDuoc}
                  />
                </Truong>
              )}
            </div>

            {/* ── Theo dõi xử lý: chỉ văn bản đến ─────────────────────── */}
            {laDen && (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                  Theo dõi xử lý
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Truong nhan="Người xử lý">
                    <Input
                      value={f.nguoi_xu_ly}
                      onChange={(e) => dat('nguoi_xu_ly', e.target.value)}
                      placeholder="Tổ trưởng tổ 1"
                      disabled={!suaDuoc}
                    />
                  </Truong>
                  <Truong nhan="Hạn xử lý" ghi_chu="Điền để chuông tự nhắc trước 2 ngày">
                    <Input
                      type="date"
                      value={f.han_xu_ly}
                      onChange={(e) => dat('han_xu_ly', e.target.value)}
                      disabled={!suaDuoc}
                    />
                  </Truong>
                  <div className="sm:col-span-2">
                    <Truong nhan="Trạng thái">
                      <Select
                        value={f.trang_thai}
                        onChange={(e) => dat('trang_thai', e.target.value)}
                        disabled={!suaDuoc}
                      >
                        {Object.entries(TRANG_THAI)
                          .filter(([k]) => k !== 'nhap')
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.nhan}
                            </option>
                          ))}
                      </Select>
                    </Truong>
                  </div>
                  {(f.trang_thai === 'da_xu_ly' || f.trang_thai === 'luu') && (
                    <div className="sm:col-span-2">
                      <Truong nhan="Kết quả xử lý">
                        <Textarea
                          value={f.ket_qua}
                          onChange={(e) => dat('ket_qua', e.target.value)}
                          placeholder="Đã báo cáo phường ngày…"
                          disabled={!suaDuoc}
                        />
                      </Truong>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Thể thức: chỉ văn bản đi ────────────────────────────── */}
            {!laDen && (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                  Thể thức văn bản
                </h4>
                <Truong
                  nhan="Nơi nhận"
                  ghi_chu="Mỗi nơi nhận một dòng, dòng cuối thường là “Lưu: VT”"
                >
                  <Textarea
                    value={f.noi_nhan}
                    onChange={(e) => dat('noi_nhan', e.target.value)}
                    placeholder={'Các tổ trưởng dân phố;\nBan điều hành;\nLưu: VT.'}
                    disabled={!suaDuoc}
                  />
                </Truong>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Truong nhan="Chức vụ người ký">
                    <Input
                      value={f.chuc_vu_ky}
                      onChange={(e) => dat('chuc_vu_ky', e.target.value)}
                      placeholder="Trưởng khu phố"
                      disabled={!suaDuoc}
                    />
                  </Truong>
                  <Truong nhan="Họ tên người ký">
                    <Input
                      value={f.nguoi_ky}
                      onChange={(e) => dat('nguoi_ky', e.target.value)}
                      placeholder="Nguyễn Văn A"
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
                    <option value="nhap">Nháp</option>
                    <option value="da_xu_ly">Đã ban hành</option>
                    <option value="luu">Lưu hồ sơ</option>
                  </Select>
                </Truong>
              </section>
            )}

            <Truong
              nhan={laDen ? 'Nội dung tóm tắt' : 'Nội dung văn bản'}
              ghi_chu={
                laDen
                  ? undefined
                  : 'Gõ nội dung như văn bản giấy. Xem trước và in ở nút “XEM & IN”.'
              }
            >
              <Textarea
                value={laDen ? f.trich_yeu : f.noi_dung}
                onChange={(e) => dat(laDen ? 'trich_yeu' : 'noi_dung', e.target.value)}
                className={cx(!laDen && 'min-h-48 leading-relaxed')}
                disabled={!suaDuoc}
              />
            </Truong>

            {/* ── Tệp đính kèm ────────────────────────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                  Tệp đính kèm ({(cu?.tep.length ?? 0) + xepHang.length})
                </h4>
              </div>

              {suaDuoc && (
                <>
                  <input
                    ref={oTep}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      themVaoHang(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  {/*
                    Ô riêng cho máy ảnh. `capture="environment"` mở thẳng camera sau
                    trên điện thoại thay vì trình chọn tệp — cán bộ cầm công văn giấy
                    chụp luôn, khỏi phải chụp trước rồi mò trong thư viện ảnh.
                    `multiple` để chụp/chọn nhiều trang một lượt.
                  */}
                  <input
                    ref={oAnh}
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      themVaoHang(e.target.files);
                      e.target.value = '';
                    }}
                  />

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      mau="trang"
                      icon={Upload}
                      onClick={() => oTep.current?.click()}
                      disabled={dangTai > 0}
                      className="flex-1 justify-center"
                    >
                      CHỌN TỆP SCAN
                    </Button>
                    {/* Chỉ máy có camera mới hiện — máy bàn bấm vào cũng chỉ ra hộp chọn tệp */}
                    <Button
                      mau="trang"
                      icon={Camera}
                      onClick={() => oAnh.current?.click()}
                      disabled={dangTai > 0}
                      className="flex-1 justify-center sm:hidden"
                    >
                      CHỤP ẢNH VĂN BẢN
                    </Button>
                  </div>
                </>
              )}

              {/* Hàng đợi: tệp đã chọn nhưng chưa rời khỏi máy */}
              {xepHang.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-2.5">
                  <p className="text-[9.5px] font-extrabold tracking-wider text-blue-800 uppercase">
                    {dangTai > 0
                      ? `Đang tải ${dangTai}/${xepHang.length}…`
                      : suaDoi
                        ? `${xepHang.length} tệp sẽ tải lên khi bấm lưu`
                        : `${xepHang.length} tệp sẽ tải lên sau khi vào sổ`}
                  </p>
                  {xepHang.map((t, i) => (
                    <div
                      key={`${t.name}-${t.size}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate text-[11px] font-semibold text-slate-700">
                          {t.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono text-[9.5px] text-slate-400">{kb(t.size)}</span>
                        {dangTai === 0 && (
                          <NutIcon
                            icon={X}
                            mau="text-slate-400"
                            title="Bỏ tệp này"
                            onClick={() => setXepHang((s) => s.filter((_, j) => j !== i))}
                          />
                        )}
                      </span>
                    </div>
                  ))}
                  {suaDoi && dangTai === 0 && (
                    <Button
                      mau="chinh"
                      icon={Upload}
                      onClick={() => guiNhieuTep.mutate({ did: id!, ds: xepHang })}
                      className="w-full justify-center"
                    >
                      TẢI LÊN NGAY
                    </Button>
                  )}
                </div>
              )}

              {/* Tệp đã nằm trên máy chủ */}
              {cu?.tep.length ? (
                <div className="space-y-1.5">
                  {cu.tep.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          taiTep(`/van-ban/tep/${t.id}`, t.ten_goc).catch((e: unknown) =>
                            setLoi(e instanceof Error ? e.message : 'Không tải được tệp'),
                          )
                        }
                        className="flex min-w-0 cursor-pointer items-center gap-2 text-[11.5px] font-semibold text-blue-800 hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t.ten_goc}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">
                          {kb(t.kich_thuoc)}
                        </span>
                        {suaDuoc && (
                          <NutIcon
                            icon={X}
                            mau="text-red-500"
                            title="Gỡ tệp"
                            onClick={() => xoaTep.mutate(t.id)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : xepHang.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
                  Chưa có tệp nào. Nhận PDF, ảnh, Word, Excel — tối đa 20MB mỗi tệp, chọn nhiều tệp
                  một lượt được.
                </p>
              ) : null}

              <p className="text-[10px] font-medium text-slate-400">
                Tệp nằm sau lớp đăng nhập, chỉ người của khu phố này tải được.
              </p>
            </section>
          </div>
        )}
      </NganKeo>

      {moIn && cu && <InVanBan vb={cu} dong={() => setMoIn(false)} />}
    </>
  );
}
