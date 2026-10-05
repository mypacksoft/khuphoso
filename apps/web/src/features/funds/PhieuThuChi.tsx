/**
 * Ghi một khoản thu hoặc một khoản chi vào sổ quỹ khu phố.
 *
 * Một ngăn kéo dùng cho cả hai chiều. Thu và chi khác nhau đúng ba chỗ — ai nộp /
 * chi cho ai, có gắn đợt vận động hay không, và số phiếu — nên tách hai màn hình
 * chỉ làm cán bộ phải nhớ hai chỗ bấm.
 *
 * Người nộp tiền chọn từ danh sách HỘ chứ không gõ tay: gõ tay thì về sau không
 * biết hộ nào đã đóng, và bảng "đã đóng / chưa đóng" của đợt vận động sẽ trống.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ChonHo, type HoDaChon } from '@/components/ChonHo';
import {
  Button,
  CanhBao,
  Input,
  NganKeo,
  Select,
  Textarea,
  Truong,
} from '@/components/ui';
import { get, post } from '@/lib/api';
import { vnd } from '@/lib/fmt';

interface QuyGon {
  id: string;
  code: string;
  name: string;
}
interface DotThuGon {
  id: string;
  fund_id: string;
  name: string;
  period: string | null;
  per_household_amount: number | null;
  status: string;
}

const HINH_THUC = {
  tien_mat: 'Tiền mặt',
  chuyen_khoan: 'Chuyển khoản',
  vietqr: 'Quét VietQR',
} as const;

const KHOAN_CHI = [
  'Hoạt động thường xuyên',
  'Hội họp',
  'Lễ, Tết, ngày kỷ niệm',
  'Thăm hỏi, hiếu hỉ',
  'Văn phòng phẩm',
  'Sửa chữa, mua sắm',
  'Vệ sinh môi trường',
  'An ninh trật tự',
  'Khác',
];

/** Bỏ hết ký tự không phải số rồi format lại có dấu chấm ngăn nghìn. */
const chiSo = (v: string) => v.replace(/\D/g, '');
const nhomNghin = (v: string) => (v ? Number(v).toLocaleString('vi-VN') : '');

export function PhieuThuChi({
  loai,
  quy_id,
  onClose,
}: {
  loai: 'thu' | 'chi';
  /** Mở từ thẻ một quỹ cụ thể thì khoá sẵn quỹ đó. */
  quy_id?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const laThu = loai === 'thu';

  const [fundId, setFundId] = useState(quy_id ?? '');
  const [dotId, setDotId] = useState('');
  const [ho, setHo] = useState<HoDaChon | null>(null);
  const [tenKhac, setTenKhac] = useState('');
  const [soTien, setSoTien] = useState('');
  const [hinhThuc, setHinhThuc] = useState<keyof typeof HINH_THUC>('tien_mat');
  const [soPhieu, setSoPhieu] = useState('');
  const [khoanChi, setKhoanChi] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [nguoiDuyet, setNguoiDuyet] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [loi, setLoi] = useState('');

  const { data: quy } = useQuery({
    queryKey: ['quy'],
    queryFn: () => get<QuyGon[]>('/quy'),
  });
  const { data: dot } = useQuery({
    queryKey: ['dot-thu'],
    queryFn: () => get<DotThuGon[]>('/quy/dot-thu'),
    enabled: laThu,
  });

  // Quỹ chưa chọn mà chỉ có đúng một quỹ thì chọn luôn, đỡ một cú bấm
  const dsQuy = quy ?? [];
  const quyHienTai = fundId || (dsQuy.length === 1 ? dsQuy[0]!.id : '');

  // Chỉ hiện đợt vận động thuộc quỹ đang chọn và còn đang thu
  const dsDot = (dot ?? []).filter(
    (d) => d.fund_id === quyHienTai && (d.status === 'dang_thu' || d.id === dotId),
  );
  const dotDangChon = dsDot.find((d) => d.id === dotId);

  const luu = useMutation({
    mutationFn: () => {
      const tien = Number(soTien || 0);
      if (laThu) {
        return post('/quy/phieu-thu', {
          fund_id: quyHienTai,
          campaign_id: dotId || null,
          household_id: ho?.id ?? null,
          payer_name: ho ? null : tenKhac.trim() || null,
          amount: tien,
          method: hinhThuc,
          status: 'da_dong',
          receipt_number: soPhieu.trim() || null,
          note: [noiDung.trim(), ghiChu.trim()].filter(Boolean).join(' — ') || null,
        });
      }
      return post('/quy/phieu-chi', {
        fund_id: quyHienTai,
        amount: tien,
        description: noiDung.trim(),
        category: khoanChi || null,
        payee: tenKhac.trim() || null,
        voucher_number: soPhieu.trim() || null,
        approved_by: nguoiDuyet.trim() || null,
        note: ghiChu.trim() || null,
      });
    },
    onSuccess: () => {
      for (const k of ['quy', 'quy-tong-quan-chung', 'so-cai', 'dot-thu', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không ghi được vào sổ quỹ'),
  });

  const kiemTra = () => {
    setLoi('');
    if (!quyHienTai) return setLoi('Chưa chọn quỹ để ghi vào.');
    const tien = Number(soTien || 0);
    if (!tien) return setLoi('Chưa nhập số tiền.');
    if (!laThu && noiDung.trim().length < 3) {
      return setLoi('Khoản chi phải ghi rõ nội dung chi — đây là căn cứ khi quyết toán.');
    }
    if (laThu && !ho && !tenKhac.trim()) {
      return setLoi('Chưa cho biết ai nộp. Chọn hộ, hoặc gõ tên người/đơn vị nộp.');
    }
    luu.mutate();
  };

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={laThu ? 'Ghi khoản thu' : 'Ghi khoản chi'}
      mo_ta={
        laThu
          ? 'Tiền vào quỹ khu phố — chọn hộ nộp để đối chiếu được với đợt vận động'
          : 'Tiền ra khỏi quỹ khu phố — ghi rõ nội dung để quyết toán về sau'
      }
      rong="max-w-xl"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            mau={laThu ? 'luc' : 'do'}
            onClick={kiemTra}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG GHI…' : laThu ? 'GHI THU' : 'GHI CHI'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <Truong nhan="Ghi vào quỹ" bat_buoc>
          <Select
            value={quyHienTai}
            onChange={(e) => {
              setFundId(e.target.value);
              setDotId('');
            }}
            disabled={!!quy_id}
          >
            <option value="">Chọn quỹ…</option>
            {dsQuy.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </Select>
        </Truong>

        {/* ── Đợt vận động: chỉ khi thu ───────────────────────────────── */}
        {laThu && dsDot.length > 0 && (
          <Truong
            nhan="Thuộc đợt vận động"
            ghi_chu="Gắn đợt thì hộ này được tính là đã đóng của đợt đó"
          >
            <Select
              value={dotId}
              onChange={(e) => {
                const v = e.target.value;
                setDotId(v);
                // Đợt có mức vận động cố định thì điền sẵn, cán bộ khỏi gõ
                const d = dsDot.find((x) => x.id === v);
                if (d?.per_household_amount && !soTien) {
                  setSoTien(String(d.per_household_amount));
                }
              }}
            >
              <option value="">Thu lẻ, không thuộc đợt nào</option>
              {dsDot.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.period ? ` · ${d.period}` : ''}
                </option>
              ))}
            </Select>
          </Truong>
        )}

        {/* ── Ai nộp / chi cho ai ─────────────────────────────────────── */}
        {laThu ? (
          <>
            <Truong
              nhan="Hộ nộp tiền"
              ghi_chu={
                ho
                  ? 'Khoản thu này được ghi cho hộ trên.'
                  : 'Chọn hộ để đối chiếu được. Người ngoài hộ khẩu thì bỏ trống và gõ tên bên dưới.'
              }
            >
              <ChonHo gia_tri={ho} onChon={setHo} />
            </Truong>
            {!ho && (
              <Truong nhan="Người / đơn vị nộp" bat_buoc>
                <Input
                  value={tenKhac}
                  onChange={(e) => setTenKhac(e.target.value)}
                  placeholder="Công ty TNHH ABC ủng hộ, bà con hảo tâm…"
                />
              </Truong>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Truong nhan="Khoản chi">
              <Select value={khoanChi} onChange={(e) => setKhoanChi(e.target.value)}>
                <option value="">Chưa phân loại</option>
                {KHOAN_CHI.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Truong>
            <Truong nhan="Chi cho ai">
              <Input
                value={tenKhac}
                onChange={(e) => setTenKhac(e.target.value)}
                placeholder="Nhà in Tân Phú, ông Nguyễn Văn B…"
              />
            </Truong>
          </div>
        )}

        {/* ── Số tiền ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Truong
            nhan="Số tiền"
            bat_buoc
            ghi_chu={
              dotDangChon?.per_household_amount
                ? `Mức vận động của đợt: ${vnd(dotDangChon.per_household_amount)}/hộ`
                : undefined
            }
          >
            <div className="relative">
              <Input
                value={nhomNghin(soTien)}
                onChange={(e) => setSoTien(chiSo(e.target.value))}
                placeholder="0"
                inputMode="numeric"
                className="pr-8 text-right font-mono font-bold tabular-nums"
                autoFocus
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-slate-400">
                đ
              </span>
            </div>
          </Truong>

          {laThu ? (
            <Truong nhan="Hình thức nộp">
              <Select
                value={hinhThuc}
                onChange={(e) => setHinhThuc(e.target.value as keyof typeof HINH_THUC)}
              >
                {Object.entries(HINH_THUC).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>
          ) : (
            <Truong nhan="Người duyệt chi">
              <Input
                value={nguoiDuyet}
                onChange={(e) => setNguoiDuyet(e.target.value)}
                placeholder="Trưởng khu phố"
              />
            </Truong>
          )}
        </div>

        <Truong
          nhan={laThu ? 'Số phiếu thu' : 'Số phiếu chi'}
          ghi_chu="Ghi theo cuốn biên lai đang dùng, để trống cũng được"
        >
          <Input
            value={soPhieu}
            onChange={(e) => setSoPhieu(e.target.value)}
            placeholder={laThu ? 'PT-0123' : 'PC-0045'}
            className="font-mono"
          />
        </Truong>

        <Truong nhan={laThu ? 'Nội dung thu' : 'Nội dung chi'} bat_buoc={!laThu}>
          <Input
            value={noiDung}
            onChange={(e) => setNoiDung(e.target.value)}
            placeholder={
              laThu ? 'Quỹ vì người nghèo năm 2026' : 'In 200 tờ thông báo họp tổ dân phố'
            }
          />
        </Truong>

        <Truong nhan="Ghi chú">
          <Textarea
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Điều cần lưu ý khi đối chiếu sổ sách…"
          />
        </Truong>

        <p className="text-[10px] font-medium text-slate-400">
          Khoản đã ghi sẽ hiện ngay ở sổ cái và cộng vào số dư. Mọi lượt ghi đều vào nhật ký
          của khu phố kèm tên người ghi.
        </p>
      </div>
    </NganKeo>
  );
}
