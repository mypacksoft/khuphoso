/**
 * Sổ đoàn viên, hội viên — theo dõi từng nhóm đoàn thể.
 *
 * Theo đề nghị của Đoàn Thanh niên khu phố: chức vụ, ngày kết nạp, ai đã chuyển
 * đi, ai đang sinh hoạt Đảng, ai học lớp cảm tình Đảng. Làm cho Đoàn trước nhưng
 * dùng chung được cho Hội Phụ nữ, Cựu chiến binh và mọi nhóm khác.
 *
 * CHUYỂN ĐI KHÔNG XOÁ HỒ SƠ. Người chuyển đi thì trừ khỏi tổng số nhưng vẫn tra
 * lại được — ai từng sinh hoạt, chuyển đi ngày nào, đi đâu. Đó chính là thứ cần
 * khi làm báo cáo cuối năm hoặc khi người ta quay về.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, LogOut, Pencil, RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';

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
  Tr,
  Truong,
} from '@/components/ui';
import { get, patch, post, qs } from '@/lib/api';
import { ngay, so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

const MOI_TRANG = 50;

const TRANG_THAI: Record<string, { nhan: string; mau: 'emerald' | 'amber' | 'slate' }> = {
  dang_sinh_hoat: { nhan: 'Đang sinh hoạt', mau: 'emerald' },
  da_chuyen_di: { nhan: 'Đã chuyển đi', mau: 'amber' },
  thoi_sinh_hoat: { nhan: 'Thôi sinh hoạt', mau: 'slate' },
};

interface ThanhVien {
  id: string;
  full_name: string;
  dob: string | null;
  tuoi: number | null;
  gender: string | null;
  phone: string | null;
  occupation: string | null;
  id_card_last4: string | null;
  to_dan_pho: string | null;
  ma_ho: string | null;
  chuc_vu: string | null;
  ngay_ket_nap: string | null;
  trang_thai: string;
  ten_trang_thai: string;
  ngay_chuyen_di: string | null;
  noi_chuyen_den: string | null;
  note: string | null;
  sinh_hoat_dang: boolean;
  cam_tinh_dang: boolean;
}

interface TongQuan {
  nhom: { code: string; name: string; icon: string | null };
  dang_sinh_hoat: number;
  da_chuyen_di: number;
  thoi_sinh_hoat: number;
  tung_sinh_hoat: number;
  co_chuc_vu: number;
  thieu_ngay_ket_nap: number;
  sinh_hoat_dang: number;
  cam_tinh_dang: number;
  theo_nam: { nam: number; so_nguoi: number; con_sinh_hoat: number }[];
  do_tuoi: {
    tuoi_tb: number | null;
    tre_nhat: number | null;
    lon_nhat: number | null;
    thieu_ngay_sinh: number;
  };
}

export function SoNhom({ ma, ten }: { ma: string; ten: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const suaDuoc = can('resident:write');

  const [trang, setTrang] = useState(1);
  const [trangThai, setTrangThai] = useState('dang_sinh_hoat');
  const [namKetNap, setNamKetNap] = useState('');
  const [tim, setTim] = useState('');
  const [sua, setSua] = useState<ThanhVien | null>(null);
  const [roi, setRoi] = useState<ThanhVien | null>(null);

  const thamSo = {
    q: tim,
    trang_thai: trangThai,
    nam_ket_nap: namKetNap,
    limit: MOI_TRANG,
    offset: (trang - 1) * MOI_TRANG,
  };

  const { data: tq } = useQuery({
    queryKey: ['so-nhom-tong-quan', ma],
    queryFn: () => get<TongQuan>(`/cu-dan/nhom/${ma}/tong-quan`),
  });
  const { data } = useQuery({
    queryKey: ['so-nhom', ma, thamSo],
    queryFn: () =>
      get<{ tong_so: number; items: ThanhVien[] }>(`/cu-dan/nhom/${ma}/thanh-vien` + qs(thamSo)),
    placeholderData: keepPreviousData,
  });

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ['so-nhom'] });
    void qc.invalidateQueries({ queryKey: ['so-nhom-tong-quan'] });
    void qc.invalidateQueries({ queryKey: ['cu-dan'] });
  };

  const quayLai = useMutation({
    mutationFn: (t: ThanhVien) => post(`/cu-dan/nhom/${ma}/thanh-vien/${t.id}/quay-lai`, {}),
    onSuccess: lamMoi,
  });

  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / MOI_TRANG)) : 1;
  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      {tq && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ONumber
              nhan="Đang sinh hoạt"
              gia_tri={so(tq.dang_sinh_hoat)}
              phu={`${so(tq.co_chuc_vu)} người có chức vụ`}
              icon={Users}
              mau="emerald"
            />
            <ONumber
              nhan="Sinh hoạt Đảng"
              gia_tri={so(tq.sinh_hoat_dang)}
              phu={`${so(tq.cam_tinh_dang)} đang cảm tình Đảng`}
              icon={Users}
              mau="rose"
            />
            <ONumber
              nhan="Đã chuyển đi"
              gia_tri={so(tq.da_chuyen_di + tq.thoi_sinh_hoat)}
              phu="hồ sơ vẫn tra lại được"
              icon={LogOut}
              mau="amber"
            />
            <ONumber
              nhan="Độ tuổi trung bình"
              gia_tri={tq.do_tuoi.tuoi_tb ? `${tq.do_tuoi.tuoi_tb}` : '—'}
              phu={
                tq.do_tuoi.tre_nhat != null
                  ? `từ ${tq.do_tuoi.tre_nhat} đến ${tq.do_tuoi.lon_nhat} tuổi`
                  : 'chưa có ngày sinh'
              }
              icon={CalendarDays}
              mau="blue"
            />
          </div>

          {tq.thieu_ngay_ket_nap > 0 && (
            <CanhBao loai="canh" emoji="📅">
              <b>{so(tq.thieu_ngay_ket_nap)} người</b> chưa có ngày kết nạp nên không vào được bảng
              thống kê theo năm. Bấm nút sửa ở từng dòng để bổ sung.
            </CanhBao>
          )}

          {tq.theo_nam.length > 0 && (
            <Card className="p-3.5">
              <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                Kết nạp theo năm
              </p>
              <div className="flex flex-wrap gap-2">
                {tq.theo_nam.map((n) => (
                  <button
                    key={n.nam}
                    onClick={() => {
                      setNamKetNap(namKetNap === String(n.nam) ? '' : String(n.nam));
                      setTrang(1);
                    }}
                    title={`${n.con_sinh_hoat}/${n.so_nguoi} người kết nạp năm ${n.nam} còn sinh hoạt`}
                    className={cx(
                      'cursor-pointer rounded-xl border px-3 py-1.5 text-left transition-all',
                      namKetNap === String(n.nam)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="block font-mono text-[10px] font-bold text-slate-400">
                      {n.nam}
                    </span>
                    <span className="text-[15px] font-black text-slate-900">{so(n.so_nguoi)}</span>
                    {n.con_sinh_hoat < n.so_nguoi && (
                      <span className="ml-1 text-[10px] font-bold text-amber-700">
                        còn {n.con_sinh_hoat}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="p-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Truong nhan="Tìm nhanh">
            <Input
              value={tim}
              onChange={(e) => {
                setTim(e.target.value);
                setTrang(1);
              }}
              placeholder="Tên, 4 số cuối CCCD, điện thoại…"
            />
          </Truong>
          <Truong nhan="Tình trạng sinh hoạt">
            <Select
              value={trangThai}
              onChange={(e) => {
                setTrangThai(e.target.value);
                setTrang(1);
              }}
            >
              <option value="dang_sinh_hoat">Đang sinh hoạt</option>
              <option value="da_chuyen_di">Đã chuyển đi</option>
              <option value="thoi_sinh_hoat">Thôi sinh hoạt</option>
              <option value="tat_ca">Tất cả, kể cả đã rời</option>
            </Select>
          </Truong>
          <Truong nhan="Năm kết nạp">
            <Select
              value={namKetNap}
              onChange={(e) => {
                setNamKetNap(e.target.value);
                setTrang(1);
              }}
            >
              <option value="">Tất cả các năm</option>
              {tq?.theo_nam.map((n) => (
                <option key={n.nam} value={n.nam}>
                  Năm {n.nam} ({n.so_nguoi} người)
                </option>
              ))}
            </Select>
          </Truong>
        </div>
      </Card>

      {!data ? (
        <Card>
          <Spinner label="Đang tải sổ…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="👥"
          loi_nhan={
            tim || namKetNap
              ? 'Không có ai khớp bộ lọc.'
              : trangThai === 'dang_sinh_hoat'
                ? `Chưa có ai sinh hoạt ở ${ten}. Thêm người ở tab danh sách nhân khẩu.`
                : 'Chưa có ai ở tình trạng này.'
          }
        />
      ) : (
        <KhungBang>
          <Bang className="min-w-[900px]">
            <Thead>
              <tr>
                <Th>Họ và tên</Th>
                <Th>Chức vụ</Th>
                <Th>Ngày sinh</Th>
                <Th>Nghề nghiệp</Th>
                <Th>CCCD</Th>
                <Th>Kết nạp</Th>
                <Th>Tình trạng</Th>
                {suaDuoc && <Th className="text-right">Thao tác</Th>}
              </tr>
            </Thead>
            <Tbody>
              {items.map((t) => {
                const tt = TRANG_THAI[t.trang_thai] ?? TRANG_THAI.dang_sinh_hoat!;
                const dangSinhHoat = t.trang_thai === 'dang_sinh_hoat';
                return (
                  <Tr key={t.id}>
                    <Td>
                      <span className="font-semibold text-slate-900">{t.full_name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        {t.tuoi != null && (
                          <span className="text-[10.5px] text-slate-500">{t.tuoi} tuổi</span>
                        )}
                        {t.to_dan_pho && (
                          <span className="text-[10.5px] text-slate-400">· {t.to_dan_pho}</span>
                        )}
                        {t.sinh_hoat_dang && (
                          <Chip mau="rose" nho>
                            Đảng viên
                          </Chip>
                        )}
                        {t.cam_tinh_dang && (
                          <Chip mau="amber" nho>
                            Cảm tình Đảng
                          </Chip>
                        )}
                      </span>
                    </Td>
                    <Td className="text-slate-700">
                      {t.chuc_vu ? (
                        <b className="font-semibold">{t.chuc_vu}</b>
                      ) : (
                        <span className="text-[11px] text-slate-400">Đoàn viên</span>
                      )}
                    </Td>
                    <Td className="font-mono text-slate-600">
                      {t.dob ? ngay(t.dob) : <ChuaCapNhat />}
                    </Td>
                    <Td className="text-slate-600">{t.occupation || <ChuaCapNhat />}</Td>
                    <Td className="font-mono text-slate-500">
                      {t.id_card_last4 ? `••••${t.id_card_last4}` : <ChuaCapNhat />}
                    </Td>
                    <Td className="font-mono text-slate-600">
                      {t.ngay_ket_nap ? ngay(t.ngay_ket_nap) : <ChuaCapNhat />}
                    </Td>
                    <Td>
                      <Chip mau={tt.mau} nho>
                        {tt.nhan}
                      </Chip>
                      {!dangSinhHoat && t.ngay_chuyen_di && (
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          {ngay(t.ngay_chuyen_di)}
                          {t.noi_chuyen_den && ` → ${t.noi_chuyen_den}`}
                        </span>
                      )}
                    </Td>
                    {suaDuoc && (
                      <Td className="text-right">
                        <span className="inline-flex items-center gap-0.5">
                          <NutIcon
                            icon={Pencil}
                            mau="text-slate-500"
                            title="Sửa chức vụ, ngày kết nạp"
                            onClick={() => setSua(t)}
                          />
                          {dangSinhHoat ? (
                            <NutIcon
                              icon={LogOut}
                              mau="text-amber-600"
                              title="Ghi nhận chuyển đi"
                              onClick={() => setRoi(t)}
                            />
                          ) : (
                            <NutIcon
                              icon={RotateCcw}
                              mau="text-emerald-600"
                              title="Quay lại sinh hoạt"
                              onClick={() => quayLai.mutate(t)}
                            />
                          )}
                        </span>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </Tbody>
          </Bang>
        </KhungBang>
      )}

      {data && data.tong_so > MOI_TRANG && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={MOI_TRANG}
          don_vi="người"
          onDoi={setTrang}
        />
      )}

      {sua && <FormThanhVien ma={ma} tv={sua} onClose={() => setSua(null)} onXong={lamMoi} />}
      {roi && <FormChuyenDi ma={ma} tv={roi} onClose={() => setRoi(null)} onXong={lamMoi} />}
    </div>
  );
}

/* ──────────────────────────────────────── Sửa chức vụ, ngày kết nạp ── */

function FormThanhVien({
  ma,
  tv,
  onClose,
  onXong,
}: {
  ma: string;
  tv: ThanhVien;
  onClose: () => void;
  onXong: () => void;
}) {
  const [chucVu, setChucVu] = useState(tv.chuc_vu ?? '');
  const [ngayKetNap, setNgayKetNap] = useState(tv.ngay_ket_nap ?? '');
  const [ghiChu, setGhiChu] = useState(tv.note ?? '');
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () =>
      patch(`/cu-dan/nhom/${ma}/thanh-vien/${tv.id}`, {
        chuc_vu: chucVu,
        ngay_ket_nap: ngayKetNap || null,
        note: ghiChu,
      }),
    onSuccess: () => {
      onXong();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={tv.full_name}
      mo_ta="Chức vụ và ngày kết nạp riêng của nhóm này"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button onClick={() => luu.mutate()} disabled={luu.isPending}>
            {luu.isPending ? 'ĐANG LƯU…' : 'LƯU THAY ĐỔI'}
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

        <Truong nhan="Chức vụ trong nhóm" ghi_chu="Bỏ trống nếu là đoàn viên, hội viên thường">
          <Input
            value={chucVu}
            onChange={(e) => setChucVu(e.target.value)}
            placeholder="Bí thư chi đoàn, Phó bí thư, Uỷ viên…"
            autoFocus
          />
        </Truong>

        <Truong nhan="Ngày kết nạp" ghi_chu="Dùng để thống kê kết nạp theo từng năm">
          <Input type="date" value={ngayKetNap} onChange={(e) => setNgayKetNap(e.target.value)} />
        </Truong>

        <Truong nhan="Ghi chú">
          <Textarea
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Khen thưởng, kỷ luật, việc cần nhớ…"
          />
        </Truong>

        <p className="text-[10.5px] leading-snug font-medium text-slate-400">
          Ngày sinh, số CCCD và nghề nghiệp nằm ở hồ sơ nhân khẩu — sửa ở đó thì mọi nhóm đều thấy.
          Chức vụ thì riêng từng nhóm, vì một người có thể vừa là bí thư chi đoàn vừa là hội viên
          thường của hội khác.
        </p>
      </div>
    </NganKeo>
  );
}

/* ──────────────────────────────────────────────────── Ghi nhận rời nhóm ── */

function FormChuyenDi({
  ma,
  tv,
  onClose,
  onXong,
}: {
  ma: string;
  tv: ThanhVien;
  onClose: () => void;
  onXong: () => void;
}) {
  const [thoiSinhHoat, setThoiSinhHoat] = useState(false);
  const [ngayDi, setNgayDi] = useState(new Date().toISOString().slice(0, 10));
  const [noiDen, setNoiDen] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () =>
      post(`/cu-dan/nhom/${ma}/thanh-vien/${tv.id}/chuyen-di`, {
        ngay_chuyen_di: ngayDi || null,
        noi_chuyen_den: noiDen,
        ly_do: lyDo,
        thoi_sinh_hoat: thoiSinhHoat,
      }),
    onSuccess: () => {
      onXong();
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={`${tv.full_name} rời nhóm`}
      mo_ta="Trừ khỏi tổng số nhưng hồ sơ vẫn còn"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button onClick={() => luu.mutate()} disabled={luu.isPending}>
            {luu.isPending ? 'ĐANG LƯU…' : 'GHI NHẬN'}
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

        <CanhBao loai="tin" emoji="📁">
          Hồ sơ <b>không mất</b>. Người này biến khỏi danh sách đang sinh hoạt và không tính vào
          tổng số, nhưng vẫn tra lại được ở mục “Đã chuyển đi”. Quay về thì bật lại một nút, giữ
          nguyên ngày kết nạp cũ.
        </CanhBao>

        <Truong nhan="Lý do rời nhóm">
          <Select
            value={thoiSinhHoat ? 'thoi' : 'chuyen'}
            onChange={(e) => setThoiSinhHoat(e.target.value === 'thoi')}
          >
            <option value="chuyen">Chuyển đi nơi khác</option>
            <option value="thoi">Thôi sinh hoạt (quá tuổi, xin thôi…)</option>
          </Select>
        </Truong>

        <Truong nhan={thoiSinhHoat ? 'Ngày thôi sinh hoạt' : 'Ngày chuyển đi'}>
          <Input type="date" value={ngayDi} onChange={(e) => setNgayDi(e.target.value)} />
        </Truong>

        {!thoiSinhHoat && (
          <Truong nhan="Chuyển đi đâu" ghi_chu="Để sau này còn liên hệ hoặc chuyển hồ sơ">
            <Input
              value={noiDen}
              onChange={(e) => setNoiDen(e.target.value)}
              placeholder="Phường Thạnh Mỹ Lợi, TP. Hồ Chí Minh"
            />
          </Truong>
        )}

        <Truong nhan="Ghi chú thêm">
          <Textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Đi học, đi làm xa, lập gia đình…"
          />
        </Truong>
      </div>
    </NganKeo>
  );
}
