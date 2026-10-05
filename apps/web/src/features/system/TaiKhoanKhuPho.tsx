/**
 * Quản lý tài khoản của khu phố: tạo, phân quyền, khoá, đặt lại mật khẩu, thu hồi.
 *
 * Quản trị khu phố tự làm được, không phải nhờ nền tảng. Máy chủ chặn ba việc:
 * không cấp được vai trò cao hơn của chính mình, không tự hạ quyền / tự khoá mình,
 * và khu phố phải luôn còn ít nhất một quản trị hoạt động.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Lock, ShieldCheck, Unlock, UserPlus, UserX } from 'lucide-react';
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
  HopThoai,
  Input,
  KhungBang,
  NutIcon,
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
  XacNhan,
} from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { gio } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

interface TaiKhoanKP {
  id: string;
  username: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  vai_tro_ma: string;
  vai_tro: string;
  position: string | null;
  status: string;
}

interface VaiTro {
  code: string;
  name: string;
  level: number;
  so_quyen: number;
  so_nguoi: number;
  cap_duoc: boolean;
}

const MAU_VAI_TRO: Record<string, 'rose' | 'blue' | 'emerald' | 'amber' | 'slate'> = {
  quan_tri: 'rose',
  ban_dieu_hanh: 'blue',
  to_truong: 'emerald',
  can_bo: 'amber',
  chi_xem: 'slate',
};

const MO_TA_VAI_TRO: Record<string, string> = {
  quan_tri: 'Toàn quyền, kể cả quản lý tài khoản và nhật ký',
  ban_dieu_hanh: 'Điều hành khu phố, duyệt thu chi, sửa mọi hồ sơ',
  to_truong: 'Quản lý nhân khẩu và hộ trong tổ, ghim bản đồ',
  can_bo: 'Nhập liệu, soạn kế hoạch, không xoá được hồ sơ',
  chi_xem: 'Chỉ xem, không sửa gì',
};

export function TaiKhoanKhuPho() {
  const { can, user, khuPho } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);

  const [moTao, setMoTao] = useState(false);
  const [sua, setSua] = useState<TaiKhoanKP | null>(null);
  const [hoiThuHoi, setHoiThuHoi] = useState<TaiKhoanKP | null>(null);
  const [matKhauMoi, setMatKhauMoi] = useState<{ ten: string; mk: string } | null>(null);
  const [loi, setLoi] = useState('');

  const suaDuoc = can('user:write');

  useEffect(() => {
    datManHinh({ tieu_de: '👤 Quản lý tài khoản' });
  }, [datManHinh]);

  const { data } = useQuery({
    queryKey: ['he-thong-tai-khoan'],
    queryFn: () => get<TaiKhoanKP[]>('/he-thong/tai-khoan'),
    enabled: can('user:read'),
  });
  const { data: vaiTro } = useQuery({
    queryKey: ['he-thong-vai-tro'],
    queryFn: () => get<VaiTro[]>('/he-thong/tai-khoan/vai-tro'),
    enabled: can('user:read'),
  });

  const lamMoi = () => void qc.invalidateQueries({ queryKey: ['he-thong-tai-khoan'] });

  const thuHoi = useMutation({
    mutationFn: (u: TaiKhoanKP) => del(`/he-thong/tai-khoan/${u.id}`),
    onSuccess: () => {
      setHoiThuHoi(null);
      lamMoi();
    },
    onError: (e) => {
      setHoiThuHoi(null);
      setLoi(e instanceof Error ? e.message : 'Không thu hồi được');
    },
  });

  const doiKhoa = useMutation({
    mutationFn: (u: TaiKhoanKP) =>
      patch(`/he-thong/tai-khoan/${u.id}`, { is_active: !u.is_active }),
    onSuccess: lamMoi,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không đổi được trạng thái'),
  });

  const datLaiMk = useMutation({
    mutationFn: (u: TaiKhoanKP) =>
      patch<{ mat_khau_tam: string }>(`/he-thong/tai-khoan/${u.id}`, {
        dat_lai_mat_khau: true,
      }).then((d) => ({ ten: u.full_name, mk: d.mat_khau_tam })),
    onSuccess: (d) => {
      setMatKhauMoi(d);
      lamMoi();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không đặt lại được mật khẩu'),
  });

  if (!can('user:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được quản lý tài khoản." />;
  }

  return (
    <>
      <ThanhTieuDe
        tieu_de="Quản lý tài khoản"
        mo_ta={
          khuPho ? `Cán bộ được cấp quyền tại ${khuPho.name}` : 'Cán bộ được cấp quyền tại khu phố'
        }
      >
        {suaDuoc && (
          <Button
            icon={UserPlus}
            onClick={() => {
              setLoi('');
              setMoTao(true);
            }}
          >
            THÊM TÀI KHOẢN
          </Button>
        )}
      </ThanhTieuDe>

      {loi && (
        <CanhBao loai="loi" emoji="⚠️">
          {loi}
        </CanhBao>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải danh sách tài khoản…" />
        </Card>
      ) : data.length === 0 ? (
        <Rong emoji="👤" loi_nhan="Khu phố chưa có tài khoản nào.">
          {suaDuoc && (
            <Button icon={UserPlus} onClick={() => setMoTao(true)}>
              THÊM TÀI KHOẢN ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          {/* Điện thoại: thẻ xếp dọc, không phải bảng kéo ngang */}
          <div className="space-y-3 lg:hidden">
            {data.map((u) => (
              <TheTaiKhoan
                key={u.id}
                u={u}
                laToi={u.id === user?.id}
                suaDuoc={suaDuoc}
                onSua={() => setSua(u)}
                onKhoa={() => doiKhoa.mutate(u)}
                onDatLaiMk={() => datLaiMk.mutate(u)}
                onThuHoi={() => setHoiThuHoi(u)}
              />
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang className="min-w-[860px]">
                <Thead>
                  <tr>
                    <Th>Họ và tên</Th>
                    <Th>Tên đăng nhập</Th>
                    <Th>Vai trò</Th>
                    <Th>Chức vụ</Th>
                    <Th>Điện thoại</Th>
                    <Th>Đăng nhập gần nhất</Th>
                    <Th>Trạng thái</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {data.map((u) => {
                    const laToi = u.id === user?.id;
                    return (
                      <Tr
                        key={u.id}
                        onClick={() => suaDuoc && setSua(u)}
                        className={cx(suaDuoc && 'cursor-pointer', !u.is_active && 'opacity-60')}
                      >
                        <Td className="text-slate-900 font-semibold">
                          {u.full_name}
                          {laToi && (
                            <span className="ml-1.5 text-[9.5px] font-bold text-blue-800">
                              (bạn)
                            </span>
                          )}
                        </Td>
                        <Td className="text-slate-600 font-mono">
                          {u.username || <ChuaCapNhat />}
                        </Td>
                        <Td>
                          <Chip mau={MAU_VAI_TRO[u.vai_tro_ma] ?? 'slate'} nho>
                            {u.vai_tro}
                          </Chip>
                        </Td>
                        <Td className="text-slate-600">{u.position || <ChuaCapNhat />}</Td>
                        <Td className="text-slate-800 font-mono">{u.phone || <ChuaCapNhat />}</Td>
                        <Td className="text-slate-500 font-mono whitespace-nowrap">
                          {u.last_login_at ? gio(u.last_login_at) : <ChuaCapNhat />}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            <Chip mau={u.is_active ? 'emerald' : 'rose'} nho>
                              {u.is_active ? 'Đang hoạt động' : 'Đã khoá'}
                            </Chip>
                            {u.must_change_password && (
                              <Chip mau="amber" nho>
                                Mật khẩu tạm
                              </Chip>
                            )}
                          </div>
                        </Td>
                        {suaDuoc && (
                          <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <NutIcon
                                icon={ShieldCheck}
                                mau="text-blue-700"
                                title="Đổi vai trò & thông tin"
                                onClick={() => setSua(u)}
                              />
                              <NutIcon
                                icon={KeyRound}
                                mau="text-amber-600"
                                title="Đặt lại mật khẩu"
                                onClick={() => datLaiMk.mutate(u)}
                              />
                              <NutIcon
                                icon={u.is_active ? Lock : Unlock}
                                mau={u.is_active ? 'text-slate-500' : 'text-emerald-600'}
                                title={u.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
                                disabled={laToi}
                                onClick={() => doiKhoa.mutate(u)}
                              />
                              <NutIcon
                                icon={UserX}
                                mau="text-red-500"
                                title="Thu hồi quyền truy cập"
                                disabled={laToi}
                                onClick={() => setHoiThuHoi(u)}
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

      {/* Bảng vai trò — để người cấp quyền biết mình đang cấp cái gì */}
      {vaiTro && vaiTro.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h4 className="font-bold text-sm text-slate-800 uppercase mb-1">Các vai trò</h4>
          <p className="text-[11px] text-slate-500 font-medium mb-4">
            Vai trò quyết định người đó làm được gì. Không cấp được vai trò cao hơn vai trò của
            chính bạn.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {vaiTro.map((v) => (
              <div
                key={v.code}
                className={cx(
                  'border rounded-xl p-3.5',
                  v.cap_duoc ? 'border-slate-200' : 'border-slate-100 bg-slate-50/60 opacity-70',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Chip mau={MAU_VAI_TRO[v.code] ?? 'slate'} nho>
                    {v.name}
                  </Chip>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                    {v.so_nguoi} người
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium mt-2 leading-relaxed">
                  {MO_TA_VAI_TRO[v.code] ?? `${v.so_quyen} quyền`}
                </p>
                {!v.cap_duoc && (
                  <p className="text-[10px] text-amber-700 font-bold mt-1.5">
                    Cao hơn vai trò của bạn — không cấp được
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <FormTaiKhoan
        mo={moTao}
        dong={() => setMoTao(false)}
        vaiTro={vaiTro ?? []}
        onXong={(ten, mk) => {
          setMoTao(false);
          setMatKhauMoi({ ten, mk });
          lamMoi();
        }}
      />

      <FormSua
        u={sua}
        dong={() => setSua(null)}
        vaiTro={vaiTro ?? []}
        laToi={sua?.id === user?.id}
        suaDuoc={suaDuoc}
        onXong={() => {
          setSua(null);
          lamMoi();
        }}
      />

      <HopThoai
        mo={!!matKhauMoi}
        dong={() => setMatKhauMoi(null)}
        tieu_de="Mật khẩu tạm"
        emoji="🔑"
        chan={
          <Button mau="trang" onClick={() => setMatKhauMoi(null)}>
            Đã ghi lại
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-700 font-semibold">
            Mật khẩu tạm của <b>{matKhauMoi?.ten}</b>:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-100 rounded-xl px-4 py-3 font-mono text-base font-bold text-slate-900 tracking-wider break-all">
              {matKhauMoi?.mk}
            </code>
            <NutIcon
              icon={Copy}
              mau="text-blue-700"
              title="Chép mật khẩu"
              onClick={() => void navigator.clipboard?.writeText(matKhauMoi?.mk ?? '')}
            />
          </div>
          <CanhBao loai="canh" emoji="⚠️">
            Mật khẩu này <b>chỉ hiện một lần</b>. Ghi lại và đưa tận tay người dùng. Họ buộc
            phải đổi ở lần đăng nhập đầu.
          </CanhBao>
        </div>
      </HopThoai>

      <XacNhan
        nhan_nut="THU HỒI QUYỀN"
        nhan_dang_lam="ĐANG THU HỒI…"
        muc_do="thuong"
        mo={!!hoiThuHoi}
        dong={() => setHoiThuHoi(null)}
        tieu_de="Thu hồi quyền truy cập"
        dang_lam={thuHoi.isPending}
        loi_nhan={
          <>
            <p>
              Thu hồi quyền truy cập khu phố của <b>{hoiThuHoi?.full_name}</b> (
              <span className="font-mono">{hoiThuHoi?.username}</span>)?
            </p>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Người này không đăng nhập vào khu phố được nữa, mọi phiên đang mở bị cắt. Các dòng
              nhật ký cũ vẫn giữ tên họ. Cấp lại quyền lúc nào cũng được.
            </p>
          </>
        }
        onXacNhan={() => thuHoi.mutate(hoiThuHoi!)}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────── Thẻ trên điện thoại ── */

function TheTaiKhoan({
  u,
  laToi,
  suaDuoc,
  onSua,
  onKhoa,
  onDatLaiMk,
  onThuHoi,
}: {
  u: TaiKhoanKP;
  laToi: boolean;
  suaDuoc: boolean;
  onSua: () => void;
  onKhoa: () => void;
  onDatLaiMk: () => void;
  onThuHoi: () => void;
}) {
  return (
    <Card className={cx('p-4', !u.is_active && 'opacity-70')}>
      <button
        onClick={() => suaDuoc && onSua()}
        disabled={!suaDuoc}
        className="w-full text-left cursor-pointer disabled:cursor-default"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-[13px] truncate">
              {u.full_name}
              {laToi && <span className="ml-1.5 text-[9.5px] font-bold text-blue-800">(bạn)</span>}
            </p>
            <p className="text-[10.5px] text-slate-400 font-mono font-bold mt-0.5">
              {u.username}
            </p>
          </div>
          <Chip mau={MAU_VAI_TRO[u.vai_tro_ma] ?? 'slate'} nho>
            {u.vai_tro}
          </Chip>
        </div>

        <div className="mt-2.5 space-y-1">
          {(
            [
              ['Chức vụ', u.position],
              ['Điện thoại', u.phone],
              ['Đăng nhập gần nhất', u.last_login_at ? gio(u.last_login_at) : null],
            ] as [string, string | null][]
          ).map(([nhan, gt]) => (
            <p key={nhan} className="flex justify-between gap-2 text-[11px]">
              <span className="text-slate-400 font-bold shrink-0">{nhan}:</span>
              <span className="text-slate-800 font-medium truncate">
                {gt || <ChuaCapNhat />}
              </span>
            </p>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          <Chip mau={u.is_active ? 'emerald' : 'rose'} nho>
            {u.is_active ? 'Đang hoạt động' : 'Đã khoá'}
          </Chip>
          {u.must_change_password && (
            <Chip mau="amber" nho>
              Mật khẩu tạm
            </Chip>
          )}
        </div>
      </button>

      {suaDuoc && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          <Button mau="trang" icon={ShieldCheck} onClick={onSua}>
            PHÂN QUYỀN
          </Button>
          <Button mau="trang" icon={KeyRound} onClick={onDatLaiMk}>
            ĐỔI MẬT KHẨU
          </Button>
          <Button mau="trang" icon={u.is_active ? Lock : Unlock} onClick={onKhoa} disabled={laToi}>
            {u.is_active ? 'KHOÁ' : 'MỞ KHOÁ'}
          </Button>
          <Button
            mau="trang"
            icon={UserX}
            onClick={onThuHoi}
            disabled={laToi}
            className="!text-rose-700 !border-rose-200"
          >
            THU HỒI
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────── Thêm tài khoản ── */

function FormTaiKhoan({
  mo,
  dong,
  vaiTro,
  onXong,
}: {
  mo: boolean;
  dong: () => void;
  vaiTro: VaiTro[];
  onXong: (ten: string, mk: string) => void;
}) {
  const capDuoc = vaiTro.filter((v) => v.cap_duoc);
  const [f, setF] = useState({
    full_name: '',
    username: '',
    role_code: '',
    position: '',
    phone: '',
    email: '',
  });
  const [loi, setLoi] = useState('');

  useEffect(() => {
    if (mo) {
      setF({
        full_name: '',
        username: '',
        role_code: capDuoc.find((v) => v.code === 'can_bo')?.code ?? capDuoc.at(-1)?.code ?? '',
        position: '',
        phone: '',
        email: '',
      });
      setLoi('');
    }
    // capDuoc đổi theo vaiTro; chỉ cần chạy khi mở
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, vaiTro]);

  const tao = useMutation({
    mutationFn: () =>
      post<{ username: string; mat_khau_tam: string }>('/he-thong/tai-khoan', {
        ...f,
        position: f.position || null,
        phone: f.phone || null,
        email: f.email || null,
      }),
    onSuccess: (d) => onXong(f.full_name, d.mat_khau_tam),
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không tạo được tài khoản'),
  });

  const dat = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  /** Gợi ý tên đăng nhập từ họ tên: "Trần Thị Bình" -> "tranthibinh". */
  const goiYTen = () => {
    const t = f.full_name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (t.length >= 4) dat('username', t.slice(0, 30));
  };

  return (
    <HopThoai
      mo={mo}
      dong={dong}
      tieu_de="Thêm tài khoản cho cán bộ"
      emoji="👤"
      rong="max-w-lg"
      chan={
        <>
          <Button mau="trang" onClick={dong} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (f.full_name.trim().length < 2) return setLoi('Chưa nhập họ và tên.');
              if (f.username.trim().length < 4)
                return setLoi('Tên đăng nhập phải từ 4 ký tự, chỉ dùng chữ, số và . _ -');
              if (!f.role_code) return setLoi('Chưa chọn vai trò.');
              tao.mutate();
            }}
            disabled={tao.isPending}
          >
            {tao.isPending ? 'ĐANG TẠO…' : 'TẠO TÀI KHOẢN'}
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

        <Truong nhan="Họ và tên" bat_buoc>
          <Input
            value={f.full_name}
            onChange={(e) => dat('full_name', e.target.value)}
            onBlur={() => !f.username && goiYTen()}
            placeholder="Trần Thị Bình"
            autoFocus
          />
        </Truong>

        <Truong
          nhan="Tên đăng nhập"
          bat_buoc
          ghi_chu="Chỉ chữ không dấu, số và dấu . _ - · không đổi được sau khi tạo"
        >
          <Input
            value={f.username}
            onChange={(e) => dat('username', e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
            placeholder="tranthibinh"
            className="font-mono"
            autoComplete="off"
          />
        </Truong>

        <Truong nhan="Vai trò" bat_buoc ghi_chu={MO_TA_VAI_TRO[f.role_code]}>
          <Select value={f.role_code} onChange={(e) => dat('role_code', e.target.value)}>
            <option value="">— Chọn vai trò —</option>
            {capDuoc.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </Select>
        </Truong>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Truong nhan="Chức vụ trong khu phố">
            <Input
              value={f.position}
              onChange={(e) => dat('position', e.target.value)}
              placeholder="Tổ trưởng tổ 3"
            />
          </Truong>
          <Truong nhan="Điện thoại">
            <Input
              value={f.phone}
              onChange={(e) => dat('phone', e.target.value)}
              placeholder="09xxxxxxxx"
              className="font-mono"
              inputMode="tel"
            />
          </Truong>
        </div>

        <CanhBao loai="tin" emoji="🔑">
          Hệ thống sinh mật khẩu tạm và hiện <b>một lần</b> sau khi tạo. Người dùng buộc phải
          đổi ở lần đăng nhập đầu.
        </CanhBao>
      </div>
    </HopThoai>
  );
}

/* ───────────────────────────────────────────────── Đổi vai trò & thông tin ── */

function FormSua({
  u,
  dong,
  vaiTro,
  laToi,
  suaDuoc,
  onXong,
}: {
  u: TaiKhoanKP | null;
  dong: () => void;
  vaiTro: VaiTro[];
  laToi: boolean;
  suaDuoc: boolean;
  onXong: () => void;
}) {
  const [f, setF] = useState({ role_code: '', position: '', phone: '', full_name: '' });
  const [loi, setLoi] = useState('');
  /** Ô đặt mật khẩu chỉ mở khi bấm — để không ai vô tình đổi mật khẩu người khác. */
  const [moMatKhau, setMoMatKhau] = useState(false);
  const [matKhau, setMatKhau] = useState('');
  const [matKhau2, setMatKhau2] = useState('');
  const [hienMK, setHienMK] = useState(false);

  useEffect(() => {
    if (u) {
      setF({
        role_code: u.vai_tro_ma,
        position: u.position ?? '',
        phone: u.phone ?? '',
        full_name: u.full_name,
      });
      setLoi('');
      setMoMatKhau(false);
      setMatKhau('');
      setMatKhau2('');
      setHienMK(false);
    }
  }, [u]);

  const { data: quyen } = useQuery({
    queryKey: ['quyen-tai-khoan', u?.id],
    queryFn: () => get<string[]>(`/he-thong/tai-khoan/${u!.id}/quyen`),
    enabled: !!u,
  });

  const luu = useMutation({
    mutationFn: () =>
      patch(`/he-thong/tai-khoan/${u!.id}`, {
        role_code: f.role_code !== u!.vai_tro_ma ? f.role_code : undefined,
        position: f.position,
        phone: f.phone || undefined,
        full_name: f.full_name !== u!.full_name ? f.full_name : undefined,
        mat_khau_moi: moMatKhau && matKhau ? matKhau : undefined,
      }),
    onSuccess: onXong,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  /** Kiểm ở đây cho người dùng biết sớm; máy chủ vẫn kiểm lại độ dài. */
  const loiMatKhau = !moMatKhau
    ? ''
    : matKhau.length > 0 && matKhau.length < 10
      ? 'Mật khẩu phải từ 10 ký tự trở lên.'
      : matKhau2 && matKhau !== matKhau2
        ? 'Hai ô mật khẩu chưa khớp nhau.'
        : '';

  if (!u) return null;
  const capDuoc = vaiTro.filter((v) => v.cap_duoc);
  const nhomQuyen = (quyen ?? []).reduce<Record<string, number>>((acc, p) => {
    const m = p.split(':')[0]!;
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <HopThoai
      mo
      dong={dong}
      tieu_de={u.full_name}
      emoji="🛡️"
      rong="max-w-lg"
      chan={
        suaDuoc ? (
          <>
            <Button mau="trang" onClick={dong} type="button">
              Đóng
            </Button>
            <Button
              onClick={() => {
                setLoi('');
                if (moMatKhau && matKhau && (loiMatKhau || !matKhau2)) {
                  setLoi(loiMatKhau || 'Nhập lại mật khẩu ở ô thứ hai để xác nhận.');
                  return;
                }
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : 'LƯU THAY ĐỔI'}
            </Button>
          </>
        ) : (
          <Button mau="trang" onClick={dong}>
            Đóng
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-slate-400">{u.username}</span>
          <Chip mau={u.is_active ? 'emerald' : 'rose'} nho>
            {u.is_active ? 'Đang hoạt động' : 'Đã khoá'}
          </Chip>
          {u.must_change_password && (
            <Chip mau="amber" nho>
              Đang dùng mật khẩu tạm
            </Chip>
          )}
        </div>

        <Truong nhan="Họ và tên">
          <Input
            value={f.full_name}
            onChange={(e) => setF((s) => ({ ...s, full_name: e.target.value }))}
            disabled={!suaDuoc}
          />
        </Truong>

        <Truong
          nhan="Vai trò"
          ghi_chu={
            laToi
              ? 'Không tự đổi vai trò của chính mình — nhờ một quản trị khác làm.'
              : MO_TA_VAI_TRO[f.role_code]
          }
        >
          <Select
            value={f.role_code}
            onChange={(e) => setF((s) => ({ ...s, role_code: e.target.value }))}
            disabled={!suaDuoc || laToi}
          >
            {capDuoc.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
            {!capDuoc.some((v) => v.code === u.vai_tro_ma) && (
              <option value={u.vai_tro_ma}>{u.vai_tro} (không đổi được)</option>
            )}
          </Select>
        </Truong>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Truong nhan="Chức vụ">
            <Input
              value={f.position}
              onChange={(e) => setF((s) => ({ ...s, position: e.target.value }))}
              disabled={!suaDuoc}
              placeholder="Tổ trưởng tổ 3"
            />
          </Truong>
          <Truong nhan="Điện thoại">
            <Input
              value={f.phone}
              onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))}
              disabled={!suaDuoc}
              className="font-mono"
              inputMode="tel"
            />
          </Truong>
        </div>

        {/* ── Đặt mật khẩu ────────────────────────────────────────────────
            Đóng sẵn, phải bấm mới mở: mở sẵn thì rất dễ gõ nhầm vào ô này khi
            chỉ định sửa chức vụ, và mọi phiên của người ta bị đăng xuất oan. */}
        {suaDuoc && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            {!moMatKhau ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-bold text-slate-700">Mật khẩu</p>
                  <p className="text-[10.5px] font-medium text-slate-400">
                    {laToi
                      ? 'Đặt mật khẩu mới cho chính bạn.'
                      : 'Đặt thẳng mật khẩu, hoặc dùng nút “Đặt lại” ở danh sách để máy sinh ngẫu nhiên.'}
                  </p>
                </div>
                <Button
                  mau="trang"
                  icon={KeyRound}
                  onClick={() => setMoMatKhau(true)}
                  className="shrink-0"
                >
                  ĐẶT MẬT KHẨU
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                    Đặt mật khẩu mới
                  </p>
                  <button
                    type="button"
                    onClick={() => setHienMK((v) => !v)}
                    className="cursor-pointer text-[10.5px] font-bold text-slate-500 hover:text-blue-800"
                  >
                    {hienMK ? 'Ẩn đi' : 'Hiện mật khẩu'}
                  </button>
                </div>

                <Truong nhan="Mật khẩu mới" ghi_chu="Tối thiểu 10 ký tự">
                  <Input
                    type={hienMK ? 'text' : 'password'}
                    value={matKhau}
                    onChange={(e) => setMatKhau(e.target.value)}
                    autoComplete="new-password"
                    className="font-mono"
                  />
                </Truong>
                <Truong nhan="Nhập lại mật khẩu">
                  <Input
                    type={hienMK ? 'text' : 'password'}
                    value={matKhau2}
                    onChange={(e) => setMatKhau2(e.target.value)}
                    autoComplete="new-password"
                    className="font-mono"
                  />
                </Truong>

                {loiMatKhau && (
                  <p className="text-[10.5px] font-bold text-rose-600">{loiMatKhau}</p>
                )}

                <p className="text-[10px] font-medium text-slate-400">
                  Lưu xong, mọi phiên đang mở của tài khoản này bị đăng xuất.
                  {laToi
                    ? ' Bạn cũng phải đăng nhập lại bằng mật khẩu mới.'
                    : ' Người dùng phải đổi lại mật khẩu ở lần đăng nhập đầu, vì bạn đang biết mật khẩu của họ.'}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setMoMatKhau(false);
                    setMatKhau('');
                    setMatKhau2('');
                  }}
                  className="cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-600"
                >
                  Thôi, không đổi mật khẩu
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
            Quyền đang có {quyen && `(${quyen.length})`}
          </p>
          {!quyen ? (
            <Spinner />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(nhomQuyen).map(([m, n]) => (
                <Chip key={m} mau="blue" nho>
                  {TEN_MODULE[m] ?? m} · {n}
                </Chip>
              ))}
              {quyen.length === 0 && (
                <p className="text-[11px] text-slate-400 font-medium">Chưa có quyền nào.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </HopThoai>
  );
}

const TEN_MODULE: Record<string, string> = {
  resident: 'Nhân khẩu',
  household: 'Hộ khẩu',
  fund: 'Quỹ',
  gis: 'Bản đồ',
  user: 'Tài khoản',
  role: 'Phân quyền',
  audit: 'Nhật ký',
  settings: 'Cấu hình',
  report: 'Báo cáo',
  document: 'Văn bản',
  meeting: 'Lịch họp',
  plan: 'Kế hoạch',
  business: 'Kinh doanh',
  org: 'Đoàn thể',
  campaign: 'Đợt vận động',
  democracy: 'Dân chủ cơ sở',
  backup: 'Sao lưu',
};
