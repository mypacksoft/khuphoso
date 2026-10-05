/**
 * Cấu hình Cổng thông tin cư dân — nội dung hiển thị trên trang công khai của khu phố.
 *
 * Gồm: lời giới thiệu, danh bạ ban điều hành (hiện ở trang chủ portal), và danh mục
 * biểu mẫu để dân tải về. Cần quyền settings:write (ban điều hành / quản trị).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Pencil, Plus, Save, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import {
  Button,
  CanhBao,
  Card,
  Chip,
  Input,
  NganKeo,
  NutIcon,
  Rong,
  Select,
  Spinner,
  Textarea,
  ThanhTieuDe,
  Truong,
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post, postForm, put } from '@/lib/api';
import { useAuth } from '@/lib/store';

interface LienHe {
  chuc_vu: string;
  ho_ten: string;
  sdt: string;
}
interface FileBM {
  id: string;
  ten_goc: string;
  kich_thuoc: number;
}
interface BieuMau {
  id: string;
  ten: string;
  mo_ta: string | null;
  nhom: string;
  url: string | null;
  sort_order: number;
  is_public: boolean;
  files?: FileBM[];
}

const coKB = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const NHOM: Record<string, string> = {
  cu_tru: 'Cư trú',
  kinh_doanh: 'Kinh doanh',
  dan_chu: 'Dân chủ cơ sở',
  khac: 'Khác',
};

export function CongThongTin() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);
  useEffect(() => {
    datManHinh({ tieu_de: 'Cổng thông tin cư dân' });
  }, [datManHinh]);

  const { data: cfg } = useQuery({
    queryKey: ['cong-tt-cau-hinh'],
    queryFn: () => get<{ gioi_thieu: string | null; lien_he: LienHe[] }>('/cong-thong-tin/cau-hinh'),
    enabled: can('settings:write'),
  });
  const { data: bm } = useQuery({
    queryKey: ['cong-tt-bieu-mau'],
    queryFn: () => get<{ items: BieuMau[] }>('/cong-thong-tin/bieu-mau'),
    enabled: can('settings:write'),
  });

  const [gioiThieu, setGioiThieu] = useState('');
  const [lienHe, setLienHe] = useState<LienHe[]>([]);
  const [tin, setTin] = useState('');
  useEffect(() => {
    if (cfg) {
      setGioiThieu(cfg.gioi_thieu ?? '');
      setLienHe(cfg.lien_he?.length ? cfg.lien_he : []);
    }
  }, [cfg]);

  const [sua, setSua] = useState<BieuMau | 'moi' | null>(null);
  const [xoa, setXoa] = useState<BieuMau | null>(null);

  const luuCauHinh = useMutation({
    mutationFn: () =>
      put('/cong-thong-tin/cau-hinh', {
        gioi_thieu: gioiThieu.trim() || null,
        lien_he: lienHe.filter((l) => l.ho_ten.trim() || l.chuc_vu.trim() || l.sdt.trim()),
      }),
    onSuccess: () => {
      setTin('Đã lưu thông tin cổng.');
      setTimeout(() => setTin(''), 2500);
      void qc.invalidateQueries({ queryKey: ['cong-tt-cau-hinh'] });
    },
  });

  const xoaBM = useMutation({
    mutationFn: (id: string) => del(`/cong-thong-tin/bieu-mau/${id}`),
    onSuccess: () => {
      setXoa(null);
      void qc.invalidateQueries({ queryKey: ['cong-tt-bieu-mau'] });
    },
  });

  if (!can('settings:write')) {
    return <Rong emoji="🔒" loi_nhan="Bạn không có quyền cấu hình cổng thông tin." />;
  }

  return (
    <>
      <ThanhTieuDe
        tieu_de="Cổng thông tin cư dân"
        mo_ta="Nội dung hiển thị công khai trên trang của khu phố"
      />

      <CanhBao loai="tin" emoji="🌐">
        Đây là nội dung hiện công khai cho người dân tại trang gốc của khu phố (không cần đăng nhập).
        Trang quản trị nằm ở đường dẫn <b>/quanly</b>.
      </CanhBao>

      {/* Giới thiệu + danh bạ */}
      <Card className="space-y-4 p-5">
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800 uppercase">Giới thiệu khu phố</h4>
          <Textarea
            value={gioiThieu}
            onChange={(e) => setGioiThieu(e.target.value)}
            placeholder="Vài dòng giới thiệu khu phố hiển thị ở trang chủ cổng thông tin…"
            className="min-h-24"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 uppercase">Danh bạ ban điều hành</h4>
            <Button
              mau="trang"
              icon={UserPlus}
              onClick={() => setLienHe([...lienHe, { chuc_vu: '', ho_ten: '', sdt: '' }])}
            >
              Thêm dòng
            </Button>
          </div>
          {lienHe.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-400">
              Chưa có liên hệ nào. Thêm bí thư, tổ trưởng, công an khu vực…
            </p>
          ) : (
            <div className="space-y-2">
              {lienHe.map((l, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <Input
                    value={l.chuc_vu}
                    onChange={(e) =>
                      setLienHe(lienHe.map((x, j) => (j === i ? { ...x, chuc_vu: e.target.value } : x)))
                    }
                    placeholder="Chức vụ (vd Bí thư chi bộ)"
                  />
                  <Input
                    value={l.ho_ten}
                    onChange={(e) =>
                      setLienHe(lienHe.map((x, j) => (j === i ? { ...x, ho_ten: e.target.value } : x)))
                    }
                    placeholder="Họ tên"
                  />
                  <Input
                    value={l.sdt}
                    onChange={(e) =>
                      setLienHe(lienHe.map((x, j) => (j === i ? { ...x, sdt: e.target.value } : x)))
                    }
                    placeholder="Số điện thoại"
                    inputMode="tel"
                    className="sm:w-40"
                  />
                  <NutIcon
                    icon={Trash2}
                    title="Xoá dòng"
                    mau="text-slate-400 hover:text-rose-600"
                    onClick={() => setLienHe(lienHe.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
          <Button icon={Save} onClick={() => luuCauHinh.mutate()} disabled={luuCauHinh.isPending}>
            {luuCauHinh.isPending ? 'ĐANG LƯU…' : 'LƯU THÔNG TIN'}
          </Button>
          {tin && <span className="text-xs font-semibold text-emerald-600">{tin}</span>}
        </div>
      </Card>

      {/* Biểu mẫu */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-800 uppercase">Biểu mẫu tải về</h4>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Link biểu mẫu / thủ tục cho dân. Đã có sẵn mẫu cư trú (CT01, CT07…).
            </p>
          </div>
          <Button icon={Plus} onClick={() => setSua('moi')}>
            Thêm biểu mẫu
          </Button>
        </div>
        {!bm ? (
          <Spinner />
        ) : bm.items.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-400">
            Chưa có biểu mẫu.
          </p>
        ) : (
          <div className="space-y-2">
            {bm.items.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-bold text-slate-900">{b.ten}</p>
                    <Chip mau="blue" nho>
                      {NHOM[b.nhom] ?? b.nhom}
                    </Chip>
                    {!b.is_public && (
                      <Chip mau="slate" nho>
                        Ẩn
                      </Chip>
                    )}
                    {b.files && b.files.length > 0 && (
                      <Chip mau="emerald" nho>
                        {b.files.length} file
                      </Chip>
                    )}
                  </div>
                  {b.mo_ta && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{b.mo_ta}</p>
                  )}
                  {b.url && (!b.files || b.files.length === 0) && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] font-medium text-blue-700 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" /> {b.url}
                    </a>
                  )}
                </div>
                <NutIcon icon={Pencil} title="Sửa" onClick={() => setSua(b)} />
                <NutIcon
                  icon={Trash2}
                  title="Xoá"
                  mau="text-slate-400 hover:text-rose-600"
                  onClick={() => setXoa(b)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {sua && <FormBieuMau bm={sua} onClose={() => setSua(null)} />}

      <XacNhan
        mo={!!xoa}
        dong={() => setXoa(null)}
        tieu_de="Xoá biểu mẫu"
        nhan_nut="XOÁ"
        dang_lam={xoaBM.isPending}
        loi_nhan={<p>Xoá biểu mẫu <b>{xoa?.ten}</b>?</p>}
        onXacNhan={() => xoa && xoaBM.mutate(xoa.id)}
      />
    </>
  );
}

function FormBieuMau({ bm, onClose }: { bm: BieuMau | 'moi'; onClose: () => void }) {
  const qc = useQueryClient();
  const moi = bm === 'moi';
  const g = moi ? null : bm;
  const [f, setF] = useState({
    ten: g?.ten ?? '',
    mo_ta: g?.mo_ta ?? '',
    nhom: g?.nhom ?? 'cu_tru',
    is_public: g?.is_public ?? true,
  });
  const [loi, setLoi] = useState('');
  // File đã có (sửa) và file mới chọn để tải lên.
  const [daCo, setDaCo] = useState<FileBM[]>(g?.files ?? []);
  const [moi_tep, setMoiTep] = useState<File[]>([]);

  const upFiles = async (bid: string) => {
    for (const tep of moi_tep) {
      const fd = new FormData();
      fd.append('tep', tep);
      await postForm(`/cong-thong-tin/bieu-mau/${bid}/file`, fd);
    }
  };

  const luu = useMutation({
    mutationFn: async () => {
      const body = {
        ten: f.ten.trim(),
        mo_ta: f.mo_ta.trim() || null,
        nhom: f.nhom,
        url: g?.url ?? null, // giữ nguyên link cũ (nếu có) — không dùng ô nhập link nữa
        sort_order: g?.sort_order ?? 0,
        is_public: f.is_public,
      };
      if (moi) {
        const res = await post<{ id: string }>('/cong-thong-tin/bieu-mau', body);
        await upFiles(res.id);
      } else {
        await patch(`/cong-thong-tin/bieu-mau/${g!.id}`, body);
        await upFiles(g!.id);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cong-tt-bieu-mau'] });
      onClose();
    },
    onError: (e: unknown) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const xoaFile = useMutation({
    mutationFn: (fid: string) => del(`/cong-thong-tin/bieu-mau/file/${fid}`),
    onSuccess: (_d, fid) => {
      setDaCo((x) => x.filter((t) => t.id !== fid));
      void qc.invalidateQueries({ queryKey: ['cong-tt-bieu-mau'] });
    },
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={moi ? 'Thêm biểu mẫu' : 'Sửa biểu mẫu'}
      rong="max-w-lg"
      chan={
        <>
          <Button mau="trang" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (!f.ten.trim()) {
                setLoi('Cần nhập tên biểu mẫu');
                return;
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
      <div className="flex flex-col gap-4">
        {loi && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {loi}
          </p>
        )}
        <Truong nhan="Tên biểu mẫu" bat_buoc>
          <Input value={f.ten} onChange={(e) => setF({ ...f, ten: e.target.value })} autoFocus />
        </Truong>
        <Truong nhan="Mô tả">
          <Input value={f.mo_ta} onChange={(e) => setF({ ...f, mo_ta: e.target.value })} />
        </Truong>
        <Truong nhan="Nhóm">
          <Select value={f.nhom} onChange={(e) => setF({ ...f, nhom: e.target.value })}>
            {Object.entries(NHOM).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Truong>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-500">File tải về</label>
          {daCo.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {daCo.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-blue-700" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                    {t.ten_goc}
                  </span>
                  <span className="text-[10px] text-slate-400">{coKB(t.kich_thuoc)}</span>
                  <NutIcon
                    icon={Trash2}
                    title="Xoá file"
                    mau="text-slate-400 hover:text-rose-600"
                    onClick={() => xoaFile.mutate(t.id)}
                  />
                </div>
              ))}
            </div>
          )}
          {moi_tep.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {moi_tep.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-blue-700" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                    {t.name}
                  </span>
                  <span className="text-[10px] font-semibold text-blue-600">sẽ tải lên</span>
                  <NutIcon
                    icon={X}
                    title="Bỏ"
                    mau="text-slate-400 hover:text-rose-600"
                    onClick={() => setMoiTep((a) => a.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100">
            <Upload className="h-4 w-4" /> Chọn file (Word, PDF, Excel…) — chọn nhiều file được
            <input
              type="file"
              multiple
              accept=".doc,.docx,.pdf,.xls,.xlsx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                setMoiTep((a) => [...a, ...fs]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="mt-1 text-[10px] text-slate-400">Tối đa 20MB mỗi file.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={f.is_public}
            onChange={(e) => setF({ ...f, is_public: e.target.checked })}
            className="h-4 w-4 accent-blue-700"
          />
          <span className="text-xs font-semibold text-slate-700">Hiện công khai cho dân</span>
        </label>
      </div>
    </NganKeo>
  );
}
