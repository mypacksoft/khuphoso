/**
 * Tổ dân phố — tạo, sửa, nhập tổ, xoá.
 *
 * Tổ dân phố xuất hiện ở ô chọn của gần như mọi màn hình (khai hộ, khai nhân khẩu,
 * lọc danh sách, bản đồ) nhưng trước đây không có chỗ nào tạo ra nó — tổ chỉ có
 * được nếu ai đó chạy SQL tay. Đây là màn hình còn thiếu đó.
 *
 * Xoá tổ đang có hộ thì máy chủ từ chối: những hộ đó sẽ rơi vào "chưa phân tổ" mà
 * không ai hay, đến kỳ rà soát mới phát hiện thiếu cả trăm hộ. Muốn bỏ một tổ thì
 * nhập nó vào tổ khác trước — nút “Nhập vào tổ khác” làm đúng việc đó.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Merge, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChonNhanKhau, type NhanKhauDaChon } from '@/components/ChonNhanKhau';
import { useManHinh } from '@/components/Layout';
import {
  Bang,
  Button,
  CanhBao,
  Card,
  ChuaCapNhat,
  cx,
  HopThoai,
  Input,
  KhungBang,
  NutIcon,
  ONumber,
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
import { del, get, patch, post } from '@/lib/api';
import { so } from '@/lib/fmt';
import { useAuth } from '@/lib/store';

interface To {
  id: string;
  code: string;
  name: string;
  /** Trỏ tới hồ sơ nhân khẩu của tổ trưởng. Rỗng nếu tổ trưởng chưa có hồ sơ. */
  leader_resident_id: string | null;
  leader_name: string | null;
  /** Số hiện ra: số riêng của tổ nếu có khai, không thì số của tổ trưởng. */
  phone: string | null;
  /** Số trong hồ sơ tổ trưởng — để biết số đang hiện là lấy từ đâu. */
  dt_to_truong: string | null;
  ma_ho_to_truong: string | null;
  sort_order: number;
  so_ho: number;
  so_nhan_khau: number;
}

export function ToDanPho() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const datManHinh = useManHinh((s) => s.dat);

  const [form, setForm] = useState<To | null | undefined>(undefined); // undefined=đóng, null=thêm
  const [hoiXoa, setHoiXoa] = useState<To | null>(null);
  const [nhapTu, setNhapTu] = useState<To | null>(null);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    datManHinh({ tieu_de: '🏘️ Tổ dân phố' });
  }, [datManHinh]);

  const { data } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<To[]>('/cu-dan/to-dan-pho'),
    enabled: can('resident:read'),
  });

  const lamMoi = () => {
    for (const k of ['to-dan-pho', 'cu-dan', 'ho-khau', 'thong-ke', 'ho-khau-ban-do']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const xoa = useMutation({
    mutationFn: (t: To) => del(`/cu-dan/to-dan-pho/${t.id}`),
    onSuccess: () => {
      setHoiXoa(null);
      setLoi('');
      lamMoi();
    },
    onError: (e) => {
      setHoiXoa(null);
      setLoi(e instanceof Error ? e.message : 'Không xoá được');
    },
  });

  if (!can('resident:read')) {
    return <Rong emoji="🔒" loi_nhan="Tài khoản của bạn không được xem tổ dân phố." />;
  }

  const suaDuoc = can('resident:write');
  const ds = data ?? [];
  const tongHo = ds.reduce((t, x) => t + x.so_ho, 0);
  const tongNk = ds.reduce((t, x) => t + x.so_nhan_khau, 0);

  return (
    <>
      <ThanhTieuDe
        tieu_de="Tổ dân phố"
        mo_ta="Đơn vị chia nhỏ của khu phố — dùng cho mọi ô chọn tổ trong hệ thống"
      >
        {suaDuoc && (
          <Button icon={Users} onClick={() => setForm(null)}>
            THÊM TỔ
          </Button>
        )}
      </ThanhTieuDe>

      {loi && (
        <CanhBao loai="loi" emoji="⚠️">
          {loi}
        </CanhBao>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ONumber nhan="Số tổ dân phố" gia_tri={so(ds.length)} icon={Users} mau="blue" />
          <ONumber nhan="Hộ đã phân tổ" gia_tri={so(tongHo)} icon={Users} mau="emerald" />
          <ONumber nhan="Nhân khẩu đã phân tổ" gia_tri={so(tongNk)} icon={Users} mau="slate" />
        </div>
      )}

      {!data ? (
        <Card>
          <Spinner label="Đang tải tổ dân phố…" />
        </Card>
      ) : ds.length === 0 ? (
        <Rong
          emoji="🏘️"
          loi_nhan="Khu phố chưa chia tổ dân phố nào. Chia tổ rồi thì mọi ô chọn tổ mới có gì để chọn."
        >
          {suaDuoc && (
            <Button icon={Users} onClick={() => setForm(null)}>
              THÊM TỔ ĐẦU TIÊN
            </Button>
          )}
        </Rong>
      ) : (
        <>
          {/* Điện thoại: dạng thẻ, không kéo ngang */}
          <div className="space-y-2 lg:hidden">
            {ds.map((t) => (
              <Card key={t.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold text-slate-400">{t.code}</p>
                    <p className="text-[12.5px] font-bold text-slate-900">{t.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {t.leader_name ? `Tổ trưởng: ${t.leader_name}` : 'Chưa có tổ trưởng'}
                      {t.phone ? ` · ${t.phone}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{t.so_ho}</p>
                    <p className="text-[9.5px] font-bold text-slate-400 uppercase">hộ</p>
                  </div>
                </div>
                {suaDuoc && (
                  <div className="mt-2.5 flex gap-1.5 border-t border-slate-100 pt-2.5">
                    <Button mau="trang" icon={Edit} onClick={() => setForm(t)} className="flex-1">
                      SỬA
                    </Button>
                    <Button
                      mau="trang"
                      icon={Merge}
                      onClick={() => setNhapTu(t)}
                      className="flex-1"
                    >
                      NHẬP TỔ
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="hidden lg:block">
            <KhungBang>
              <Bang>
                <Thead>
                  <tr>
                    <Th>Mã tổ</Th>
                    <Th>Tên tổ dân phố</Th>
                    <Th>Tổ trưởng</Th>
                    <Th>Điện thoại</Th>
                    <Th className="text-right">Số hộ</Th>
                    <Th className="text-right">Nhân khẩu</Th>
                    {suaDuoc && <Th className="text-right">Quản lý</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {ds.map((t) => (
                    <Tr
                      key={t.id}
                      onClick={suaDuoc ? () => setForm(t) : undefined}
                      className={cx(suaDuoc && 'cursor-pointer')}
                    >
                      <Td className="font-mono font-bold whitespace-nowrap text-slate-700">
                        {t.code}
                      </Td>
                      <Td className="font-semibold text-slate-900">{t.name}</Td>
                      <Td className="text-slate-600">
                        {t.leader_name ? (
                          <>
                            {t.leader_name}
                            {t.leader_resident_id ? (
                              <span
                                className="ml-1 font-mono text-[9.5px] font-bold text-slate-400"
                                title="Đã nối với hồ sơ nhân khẩu"
                              >
                                {t.ma_ho_to_truong ? `#${t.ma_ho_to_truong}` : '✓'}
                              </span>
                            ) : (
                              <span
                                className="ml-1 text-[9.5px] font-semibold text-amber-600"
                                title="Chỉ là tên gõ tay, chưa nối với hồ sơ nhân khẩu nào"
                              >
                                gõ tay
                              </span>
                            )}
                          </>
                        ) : (
                          <ChuaCapNhat />
                        )}
                      </Td>
                      <Td className="font-mono text-slate-600">{t.phone || <ChuaCapNhat />}</Td>
                      <Td className="text-right font-bold tabular-nums">{so(t.so_ho)}</Td>
                      <Td className="text-right font-bold tabular-nums">{so(t.so_nhan_khau)}</Td>
                      {suaDuoc && (
                        <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <NutIcon
                              icon={Edit}
                              mau="text-amber-600"
                              title="Sửa tổ"
                              onClick={() => setForm(t)}
                            />
                            <NutIcon
                              icon={Merge}
                              mau="text-blue-700"
                              title="Nhập tổ này vào tổ khác"
                              onClick={() => setNhapTu(t)}
                            />
                            <NutIcon
                              icon={Trash2}
                              mau="text-red-500"
                              title={
                                t.so_ho || t.so_nhan_khau
                                  ? 'Tổ còn hộ — nhập vào tổ khác trước'
                                  : 'Xoá tổ'
                              }
                              onClick={() => {
                                setLoi('');
                                setHoiXoa(t);
                              }}
                            />
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Bang>
            </KhungBang>
          </div>
        </>
      )}

      {form !== undefined && (
        <FormTo
          to={form}
          onClose={() => setForm(undefined)}
          onXong={() => {
            setForm(undefined);
            lamMoi();
          }}
        />
      )}

      {nhapTu && (
        <NhapTo
          tu={nhapTu}
          ds={ds}
          onClose={() => setNhapTu(null)}
          onXong={() => {
            setNhapTu(null);
            lamMoi();
          }}
        />
      )}

      <XacNhan
        nhan_nut="XOÁ TỔ"
        nhan_dang_lam="ĐANG XOÁ…"
        mo={!!hoiXoa}
        dong={() => setHoiXoa(null)}
        tieu_de="Xoá tổ dân phố"
        dang_lam={xoa.isPending}
        loi_nhan={
          <>
            <p>
              Xoá tổ <b>{hoiXoa?.name}</b> (<span className="font-mono">{hoiXoa?.code}</span>)?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              {hoiXoa?.so_ho || hoiXoa?.so_nhan_khau
                ? 'Tổ này còn hộ — máy chủ sẽ từ chối. Nhập vào tổ khác trước.'
                : 'Tổ đang trống nên xoá được. Thao tác có ghi nhật ký.'}
            </p>
          </>
        }
        onXacNhan={() => xoa.mutate(hoiXoa!)}
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────── Thêm / sửa tổ ── */

function FormTo({
  to,
  onClose,
  onXong,
}: {
  to: To | null;
  onClose: () => void;
  onXong: () => void;
}) {
  const suaDoi = !!to;
  const [f, setF] = useState({
    code: to?.code ?? '',
    name: to?.name ?? '',
    leader_name: to?.leader_name ?? '',
    // Ô này chỉ giữ số RIÊNG của tổ. Trống nghĩa là dùng số của tổ trưởng.
    phone: to?.dt_to_truong && to.phone === to.dt_to_truong ? '' : (to?.phone ?? ''),
    sort_order: String(to?.sort_order ?? 0),
    note: '',
  });
  // Tổ trưởng đã nối hồ sơ thì hiện thẻ người đó; chưa nối thì để ô gõ tay
  const [toTruong, setToTruong] = useState<NhanKhauDaChon | null>(
    to?.leader_resident_id
      ? {
          id: to.leader_resident_id,
          full_name: to.leader_name ?? '',
          ma_ho: to.ma_ho_to_truong,
          phone: to.dt_to_truong,
        }
      : null,
  );
  const [goTay, setGoTay] = useState(!to?.leader_resident_id && !!to?.leader_name);
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        // Chọn được người thì lưu id; chuỗi rỗng ở đây nghĩa là GỠ tổ trưởng
        leader_resident_id: toTruong?.id ?? '',
        // Tên gõ tay chỉ dùng khi chưa nối được hồ sơ nào
        leader_name: toTruong ? '' : f.leader_name.trim(),
        phone: f.phone.trim(),
        note: f.note.trim(),
        sort_order: Number(f.sort_order) || 0,
      };
      return suaDoi
        ? patch(`/cu-dan/to-dan-pho/${to.id}`, body)
        : post('/cu-dan/to-dan-pho', { ...body, code: f.code.trim() });
    },
    onSuccess: onXong,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <HopThoai
      mo
      dong={onClose}
      tieu_de={suaDoi ? `Sửa ${to.name}` : 'Thêm tổ dân phố'}
      emoji="🏘️"
      rong="max-w-md"
      chan={
        <>
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (!suaDoi && !f.code.trim()) return setLoi('Chưa nhập mã tổ.');
              if (f.name.trim().length < 1) return setLoi('Chưa nhập tên tổ.');
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'THÊM TỔ'}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Truong
            nhan="Mã tổ"
            bat_buoc={!suaDoi}
            ghi_chu={suaDoi ? 'Mã không đổi được sau khi tạo' : 'vd to-1'}
          >
            <Input
              value={f.code}
              onChange={(e) => dat('code', e.target.value)}
              placeholder="to-1"
              disabled={suaDoi}
              className="font-mono font-bold"
              autoFocus={!suaDoi}
            />
          </Truong>
          <Truong nhan="Thứ tự hiện" ghi_chu="Số nhỏ hiện trước">
            <Input
              value={f.sort_order}
              onChange={(e) => dat('sort_order', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="font-mono"
            />
          </Truong>
        </div>

        <Truong nhan="Tên tổ dân phố" bat_buoc>
          <Input
            value={f.name}
            onChange={(e) => dat('name', e.target.value)}
            placeholder="Tổ 1 — Khu phố 1A"
            autoFocus={suaDoi}
          />
        </Truong>

        <Truong
          nhan="Tổ trưởng"
          ghi_chu={
            toTruong
              ? 'Đã nối với hồ sơ nhân khẩu. Đổi tên hay số ở hồ sơ thì tổ tự cập nhật theo.'
              : goTay
                ? 'Chỉ là tên gõ tay, không tra ngược ra hồ sơ được. Dùng khi tổ trưởng chưa khai nhân khẩu ở khu phố này.'
                : 'Gõ tên để tìm trong danh sách nhân khẩu.'
          }
        >
          {goTay && !toTruong ? (
            <>
              <Input
                value={f.leader_name}
                onChange={(e) => dat('leader_name', e.target.value)}
                placeholder="Nguyễn Văn A"
              />
              <button
                type="button"
                onClick={() => setGoTay(false)}
                className="mt-1.5 cursor-pointer text-[10.5px] font-bold text-blue-800 hover:underline"
              >
                Chọn từ danh sách nhân khẩu
              </button>
            </>
          ) : (
            <>
              <ChonNhanKhau
                gia_tri={toTruong}
                onChon={(nk) => {
                  setToTruong(nk);
                  if (nk) {
                    dat('leader_name', nk.full_name);
                    // Ô số điện thoại để trống nghĩa là "dùng số của tổ trưởng",
                    // máy chủ tự đọc theo hồ sơ. Xoá số cũ để không giữ lại số
                    // của người tổ trưởng TRƯỚC.
                    dat('phone', '');
                  }
                }}
                goi_y="Gõ tên tổ trưởng để tìm…"
              />
              {!toTruong && (
                <button
                  type="button"
                  onClick={() => setGoTay(true)}
                  className="mt-1.5 cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-600"
                >
                  Tổ trưởng chưa có hồ sơ nhân khẩu — gõ tên
                </button>
              )}
            </>
          )}
        </Truong>

        <Truong
          nhan="Điện thoại liên hệ của tổ"
          ghi_chu={
            toTruong
              ? 'Để trống thì lấy theo số trong hồ sơ tổ trưởng. Chỉ điền khi tổ dùng số khác.'
              : undefined
          }
        >
          <Input
            value={f.phone}
            onChange={(e) => dat('phone', e.target.value)}
            placeholder={
              toTruong ? (toTruong.phone ?? 'theo số của tổ trưởng') : '09xxxxxxxx'
            }
            inputMode="tel"
            className="font-mono"
          />
        </Truong>

        <Truong nhan="Ghi chú">
          <Textarea
            value={f.note}
            onChange={(e) => dat('note', e.target.value)}
            placeholder="Phạm vi địa bàn của tổ, mốc giới…"
          />
        </Truong>
      </div>
    </HopThoai>
  );
}

/* ─────────────────────────────────────────────────────── Nhập vào tổ khác ── */

function NhapTo({
  tu,
  ds,
  onClose,
  onXong,
}: {
  tu: To;
  ds: To[];
  onClose: () => void;
  onXong: () => void;
}) {
  const [den, setDen] = useState('');
  const [loi, setLoi] = useState('');
  const [ketQua, setKetQua] = useState<{ so_ho: number; so_nhan_khau: number } | null>(null);

  const khac = ds.filter((t) => t.id !== tu.id);

  const chuyen = useMutation({
    mutationFn: () =>
      post<{ so_ho: number; so_nhan_khau: number }>(
        `/cu-dan/to-dan-pho/${tu.id}/chuyen?den=${den}`,
      ),
    onSuccess: setKetQua,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không chuyển được'),
  });

  return (
    <HopThoai
      mo
      dong={ketQua ? onXong : onClose}
      tieu_de={`Nhập ${tu.name} vào tổ khác`}
      emoji="🔀"
      rong="max-w-md"
      chan={
        ketQua ? (
          <Button onClick={onXong}>XONG</Button>
        ) : (
          <>
            <Button mau="trang" onClick={onClose} type="button">
              Huỷ bỏ
            </Button>
            <Button
              onClick={() => {
                setLoi('');
                if (!den) return setLoi('Chưa chọn tổ nhận.');
                chuyen.mutate();
              }}
              disabled={chuyen.isPending}
            >
              {chuyen.isPending ? 'ĐANG CHUYỂN…' : 'CHUYỂN TOÀN BỘ'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        {ketQua ? (
          <CanhBao loai="ok" emoji="✅">
            Đã chuyển <b>{so(ketQua.so_ho)} hộ</b> và <b>{so(ketQua.so_nhan_khau)} nhân khẩu</b>{' '}
            sang tổ mới. Tổ <b>{tu.name}</b> giờ đã trống, xoá được nếu không dùng nữa.
          </CanhBao>
        ) : (
          <>
            <p className="text-[11.5px] font-medium text-slate-600">
              Toàn bộ <b>{so(tu.so_ho)} hộ</b> và <b>{so(tu.so_nhan_khau)} nhân khẩu</b> đang
              thuộc tổ <b>{tu.name}</b> sẽ chuyển sang tổ được chọn. Tổ cũ vẫn còn, chỉ là
              không còn ai.
            </p>

            <Truong nhan="Chuyển sang tổ" bat_buoc>
              <Select value={den} onChange={(e) => setDen(e.target.value)}>
                <option value="">Chọn tổ nhận…</option>
                {khac.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({so(t.so_ho)} hộ)
                  </option>
                ))}
              </Select>
            </Truong>

            {khac.length === 0 && (
              <CanhBao loai="canh" emoji="📂">
                Khu phố chỉ có đúng tổ này, không có tổ nào để chuyển sang. Thêm một tổ khác
                trước đã.
              </CanhBao>
            )}

            <p className="text-[10px] font-medium text-slate-400">
              Không hoàn tác tự động được — muốn trả lại thì phải chuyển ngược, mà lúc đó hộ
              của hai tổ đã trộn vào nhau. Kiểm kỹ tổ nhận trước khi bấm.
            </p>
          </>
        )}
      </div>
    </HopThoai>
  );
}
