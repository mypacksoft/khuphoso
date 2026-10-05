/**
 * Khai sinh hộ mới / sửa sổ hộ khẩu.
 *
 * Chủ hộ CHỌN TỪ danh sách nhân khẩu chứ không gõ tay. Gõ tay thì mỗi người viết
 * một kiểu và về sau không nối được sổ hộ khẩu với hồ sơ nhân khẩu nào cả; chọn từ
 * danh sách thì luôn ra đúng một `resident_id`, và người được chọn tự động được gán
 * vào hộ này với quan hệ "Chủ hộ".
 *
 * Mã hộ để trống thì máy chủ tự sinh theo tổ (`{tổ}-{số thứ tự}`). Cán bộ vẫn nhập
 * tay được khi cần khớp với sổ giấy đang dùng.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Crosshair, History, MapPin, UserPlus, UserRoundPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChonDiaChi } from '@/components/ChonDiaChi';
import { ChonNhanKhau, type NhanKhauDaChon } from '@/components/ChonNhanKhau';
import {
  cx,
  Button,
  CanhBao,
  Input,
  NganKeo,
  NutIcon,
  Select,
  Spinner,
  Textarea,
  Truong,
} from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { gio } from '@/lib/fmt';
import { useAuth } from '@/lib/store';
import type { HoChiTiet, ToDanPho } from '@/lib/types';

import { NutChuyenKhuPho } from '../residents/ChuyenKhuPho';
import { FormCuDan } from '../residents/FormCuDan';

interface Form {
  code: string;
  group_id: string;
  address: string;
  phone: string;
  household_type: string;
  residence_type: string;
  note: string;
}

const RONG: Form = {
  code: '',
  group_id: '',
  address: '',
  phone: '',
  household_type: 'thuong_tru',
  residence_type: '',
  note: '',
};

export function FormHo({
  id,
  household_type = 'thuong_tru',
  onClose,
}: {
  id?: string | null;
  household_type?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const [f, setF] = useState<Form>({ ...RONG, household_type });
  const [chuHo, setChuHo] = useState<NhanKhauDaChon | null>(null);
  const [loi, setLoi] = useState('');
  /** Đang mở ô tra tên để thêm người có sẵn vào hộ. */
  const [dangThem, setDangThem] = useState(false);
  /** Đang mở form khai sinh nhân khẩu mới cho hộ này. */
  const [themMoi, setThemMoi] = useState(false);

  const { data: to } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
  });
  const { data: cu, isLoading } = useQuery({
    queryKey: ['ho-khau', id],
    queryFn: () => get<HoChiTiet>(`/ho-khau/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      code: cu.code,
      group_id: cu.group_id ?? '',
      address: cu.address ?? '',
      phone: cu.phone ?? '',
      household_type: cu.household_type,
      residence_type: cu.residence_type ?? '',
      note: cu.note ?? '',
    });
    const ch = cu.thanh_vien.find((t) => t.is_head);
    setChuHo(ch ? { id: ch.id, full_name: ch.full_name, dob: ch.dob, ma_ho: cu.code } : null);
  }, [cu]);

  const luu = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        group_id: f.group_id || null,
        address: f.address || null,
        phone: f.phone || null,
        household_type: f.household_type,
        residence_type: f.residence_type || null,
        note: f.note || null,
      };

      const hid = suaDoi
        ? id!
        : (
            await post<{ id: string }>('/ho-khau', {
              ...body,
              code: f.code || null,
            })
          ).id;
      if (suaDoi) await patch(`/ho-khau/${id}`, body);

      // Gán chủ hộ sau khi hộ đã tồn tại; đổi người thì backend tự bỏ cờ chủ hộ cũ
      const chuHoCu = cu?.thanh_vien.find((t) => t.is_head)?.id ?? null;
      if (chuHo && chuHo.id !== chuHoCu) {
        await post('/ho-khau/chuyen-ho', {
          resident_id: chuHo.id,
          household_id: hid,
          relation_to_head: 'Chủ hộ',
          is_head: true,
        });
      }
      return { id: hid };
    },
    onSuccess: () => {
      for (const k of [
        'ho-khau',
        'ho-khau-ban-do',
        'cu-dan',
        'to-dan-pho',
        'thong-ke',
        'thong-bao',
      ]) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const lamMoiHo = () => {
    for (const k of ['ho-khau', 'cu-dan', 'thong-ke', 'to-dan-pho', 'thong-bao']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  /** Kéo một nhân khẩu có sẵn vào hộ này. */
  const themThanhVien = useMutation({
    mutationFn: (nk: NhanKhauDaChon) =>
      post('/ho-khau/chuyen-ho', {
        resident_id: nk.id,
        household_id: id,
        relation_to_head: null,
        is_head: false,
      }),
    onSuccess: () => {
      setDangThem(false);
      lamMoiHo();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không thêm được thành viên'),
  });

  /** Gỡ khỏi hộ — hồ sơ nhân khẩu vẫn còn, chỉ là không thuộc hộ nào nữa. */
  const goThanhVien = useMutation({
    mutationFn: (rid: string) =>
      post('/ho-khau/chuyen-ho', {
        resident_id: rid,
        household_id: null,
        is_head: false,
      }),
    onSuccess: lamMoiHo,
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không gỡ được thành viên'),
  });

  const dat = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const laTamTru = f.household_type === 'tam_tru';

  return (
    <>
      <NganKeo
        mo
        dong={onClose}
        tieu_de={suaDoi ? `Sửa sổ hộ khẩu #${cu?.code ?? ''}` : 'Khai sinh hộ mới'}
        mo_ta={
          suaDoi
            ? 'Sửa thông tin hộ và thêm bớt thành viên ngay tại đây'
            : 'Tạo hộ, chọn chủ hộ, sau đó gán thêm thành viên'
        }
        rong="max-w-xl"
        chan={
          <>
            {/* Chuyển cả hộ sang khu phố khác — đặt ngay đây vì lúc mở hồ sơ
                mới là lúc cán bộ biết hộ này cần chuyển */}
            {suaDoi && cu && (
              <NutChuyenKhuPho
                loai="ho_khau"
                nguon_id={id!}
                ten={`Hộ ${cu.code}${cu.address ? ` — ${cu.address}` : ''}`}
              />
            )}
            <Button mau="trang" onClick={onClose} type="button">
              Huỷ bỏ
            </Button>
            <Button
              onClick={() => {
                setLoi('');
                if (!f.address.trim()) {
                  setLoi('Chưa nhập địa chỉ. Không có địa chỉ thì không ghim được lên bản đồ.');
                  return;
                }
                if (laTamTru && !chuHo) {
                  setLoi(
                    'Hộ tạm trú bắt buộc có chủ hộ: một địa chỉ trọ thường có nhiều hộ, ' +
                      'thiếu chủ hộ thì không phân biệt được hộ nào với hộ nào.',
                  );
                  return;
                }
                luu.mutate();
              }}
              disabled={luu.isPending}
            >
              {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'KHAI SINH HỘ'}
            </Button>
          </>
        }
      >
        {suaDoi && isLoading ? (
          <Spinner label="Đang mở sổ hộ khẩu…" />
        ) : (
          <div className="space-y-4">
            {loi && (
              <CanhBao loai="loi" emoji="⚠️">
                {loi}
              </CanhBao>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Truong
                nhan="Mã hộ"
                ghi_chu={
                  suaDoi
                    ? 'Mã hộ không đổi được sau khi tạo'
                    : 'Để trống thì hệ thống tự sinh theo tổ'
                }
              >
                <Input
                  value={f.code}
                  onChange={(e) => dat('code', e.target.value)}
                  placeholder="Tự sinh, vd 3-012"
                  disabled={suaDoi}
                  className="font-mono font-bold"
                />
              </Truong>

              <Truong nhan="Diện cư trú của hộ">
                <Select
                  value={f.household_type}
                  onChange={(e) => dat('household_type', e.target.value)}
                >
                  <option value="thuong_tru">🏡 Hộ khẩu thường trú</option>
                  <option value="tam_tru">🏠 Hộ tạm trú</option>
                </Select>
              </Truong>

              <div className="sm:col-span-2">
                <Truong
                  nhan="Địa chỉ"
                  bat_buoc
                  ghi_chu="Ghi đủ số nhà, hẻm, đường — để ghim đúng vị trí trên bản đồ"
                >
                  <ChonDiaChi
                    gia_tri={f.address}
                    onDoi={(v) => dat('address', v)}
                    onChonGoiY={(g) => {
                      if (g.ma_ho) {
                        setLoi(
                          `Địa chỉ này đã có hộ #${g.ma_ho}` +
                            (g.chu_ho ? ` của ${g.chu_ho}` : '') +
                            '. Một địa chỉ có nhiều hộ là bình thường, nhưng kiểm lại xem ' +
                            'có phải anh/chị định thêm người vào hộ đó không.',
                        );
                      }
                    }}
                  />
                </Truong>
              </div>

              {/* Chủ hộ chọn từ danh sách nhân khẩu, không gõ tay */}
              <div className="sm:col-span-2">
                <Truong
                  nhan="Chủ hộ"
                  bat_buoc={laTamTru}
                  ghi_chu={
                    chuHo
                      ? 'Người này sẽ được gán vào hộ với quan hệ “Chủ hộ”.'
                      : 'Gõ tên để tìm trong danh sách nhân khẩu. Chưa có hồ sơ thì thêm nhân khẩu trước.'
                  }
                >
                  <ChonNhanKhau
                    gia_tri={chuHo}
                    onChon={(nk) => {
                      setChuHo(nk);
                      // Hộ mới chưa có địa chỉ thì lấy theo địa chỉ người được chọn
                      if (nk?.dia_chi && !f.address.trim()) dat('address', nk.dia_chi);
                    }}
                    dien_cu_tru={laTamTru ? 'tam_tru' : 'thuong_tru'}
                    goi_y="Gõ tên chủ hộ để tìm…"
                  />
                </Truong>
              </div>

              <Truong nhan="Tổ dân phố">
                <Select value={f.group_id} onChange={(e) => dat('group_id', e.target.value)}>
                  <option value="">Chưa phân tổ</option>
                  {to?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.leader_name ? ` — ${t.leader_name}` : ''}
                    </option>
                  ))}
                </Select>
              </Truong>

              <Truong nhan="Điện thoại liên hệ của hộ">
                <Input
                  value={f.phone}
                  onChange={(e) => dat('phone', e.target.value)}
                  placeholder="09xxxxxxxx"
                  inputMode="tel"
                  className="font-mono"
                />
              </Truong>

              <div className="sm:col-span-2">
                <Truong nhan="Hình thức ở">
                  <Select
                    value={f.residence_type}
                    onChange={(e) => dat('residence_type', e.target.value)}
                  >
                    <option value="">Chưa xác định</option>
                    <option value="so_huu">Nhà thuộc sở hữu</option>
                    <option value="thue">Nhà thuê</option>
                    <option value="o_nho">Ở nhờ</option>
                  </Select>
                </Truong>
              </div>
            </div>

            {suaDoi && cu && <ViTriHo ho={cu} />}

            <Truong nhan="Ghi chú">
              <Textarea
                value={f.note}
                onChange={(e) => dat('note', e.target.value)}
                placeholder="Đặc điểm nhận biết nhà, giờ thường có người ở nhà…"
              />
            </Truong>

            {/* Thành viên trong hộ — thêm bớt ngay tại đây, khỏi qua màn hình khác */}
            {suaDoi && cu && (
              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                  {cu.thanh_vien.length} thành viên trong hộ
                </p>

                {cu.thanh_vien.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {cu.thanh_vien.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1 pr-1 pl-2 text-[10.5px] font-semibold text-slate-700"
                      >
                        {t.full_name}
                        {t.is_head && <span className="font-bold text-blue-800">· chủ hộ</span>}
                        <NutIcon
                          icon={X}
                          mau="text-slate-400"
                          title={
                            t.is_head
                              ? 'Gỡ chủ hộ khỏi hộ — hộ sẽ không còn chủ hộ'
                              : `Gỡ ${t.full_name} khỏi hộ`
                          }
                          onClick={() => goThanhVien.mutate(t.id)}
                        />
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10.5px] font-medium text-slate-400">
                    Hộ chưa có ai. Thêm chủ hộ ở ô phía trên, hoặc thêm thành viên bằng hai nút dưới
                    đây.
                  </p>
                )}

                {/* Hai đường thêm người: người đã có hồ sơ, và người hoàn toàn mới */}
                {dangThem ? (
                  <div className="space-y-1.5">
                    <ChonNhanKhau
                      gia_tri={null}
                      onChon={(nk) => nk && themThanhVien.mutate(nk)}
                      goi_y="Gõ tên người cần thêm vào hộ…"
                      disabled={themThanhVien.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => setDangThem(false)}
                      className="cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Thôi, đóng lại
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      mau="trang"
                      icon={UserPlus}
                      onClick={() => {
                        setLoi('');
                        setDangThem(true);
                      }}
                      className="flex-1 justify-center"
                    >
                      THÊM NGƯỜI CÓ SẴN
                    </Button>
                    <Button
                      mau="trang"
                      icon={UserRoundPlus}
                      onClick={() => {
                        setLoi('');
                        setThemMoi(true);
                      }}
                      className="flex-1 justify-center"
                    >
                      TẠO NHÂN KHẨU MỚI
                    </Button>
                  </div>
                )}

                <p className="text-[10px] font-medium text-slate-400">
                  “Có sẵn” là người đã có hồ sơ nhân khẩu — tra tên rồi chọn. “Tạo mới” dùng cho
                  người chưa từng khai, hộ và địa chỉ được điền sẵn theo hộ này.
                </p>
              </div>
            )}
          </div>
        )}
      </NganKeo>

      {/* Khai sinh nhân khẩu mới ngay trong hộ này: hộ và địa chỉ điền sẵn */}
      {themMoi && id && (
        <FormCuDan
          householdId={id}
          onClose={() => {
            setThemMoi(false);
            lamMoiHo();
          }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────── Vị trí của hộ ── */

/**
 * Sửa vị trí hộ bằng GPS đo tại chỗ.
 *
 * Vị trí sai thì phải sửa được ngay khi cán bộ đang đứng trước nhà, không phải
 * mở màn hình bản đồ rồi mò tìm đúng cái ghim.
 *
 * ĐO TẠI CHỖ CHỨ KHÔNG DÒ TỪ ĐỊA CHỈ. Bản đồ mở gần như không có số nhà ở Việt
 * Nam, dò "123/45 Nguyễn Duy Trinh" là trượt. Người đứng trước cửa bấm một nút
 * thì vừa nhanh vừa đúng.
 */
function ViTriHo({ ho }: { ho: HoChiTiet }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const suaDuoc = can('household:write');

  const [dangLay, setDangLay] = useState(false);
  const [loi, setLoi] = useState('');
  const [tin, setTin] = useState('');

  const toaDo = ho.toa_do ?? null;
  const daXacMinh = ho.geo_status === 'da_xac_minh';

  const luu = useMutation({
    mutationFn: (v: { lat: number; lng: number; acc: number }) =>
      post<{ lech_m?: number | null }>(`/ho-khau/${ho.id}/xac-minh`, {
        lat: v.lat,
        lng: v.lng,
        do_chinh_xac_m: v.acc,
      }),
    onSuccess: (kq) => {
      setTin(
        kq?.lech_m != null
          ? `Đã cập nhật vị trí, lệch ${kq.lech_m}m so với vị trí cũ.`
          : 'Đã lưu vị trí đo tại chỗ.',
      );
      for (const k of ['ho-khau', 'ho-khau-ban-do', 'dinh-vi-tong-quan']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được vị trí'),
  });

  const layGps = () => {
    setLoi('');
    setTin('');
    if (!navigator.geolocation) return setLoi('Máy này không hỗ trợ định vị.');
    setDangLay(true);
    navigator.geolocation.getCurrentPosition(
      (v) => {
        setDangLay(false);
        luu.mutate({ lat: v.coords.latitude, lng: v.coords.longitude, acc: v.coords.accuracy });
      },
      (e) => {
        setDangLay(false);
        const chu: Record<number, string> = {
          1: 'Chưa cấp quyền vị trí cho trình duyệt.',
          2: 'Chưa bắt được tín hiệu. Ra chỗ thoáng rồi thử lại.',
          3: 'Chờ định vị quá lâu.',
        };
        setLoi(chu[e.code] ?? 'Không lấy được vị trí.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
      <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
        Vị trí của hộ
      </p>

      {loi && (
        <CanhBao loai="canh" emoji="📍">
          {loi}
        </CanhBao>
      )}
      {tin && (
        <CanhBao loai="tin" emoji="✅">
          {tin}
        </CanhBao>
      )}

      {toaDo ? (
        <div className="rounded-xl bg-white p-3">
          <p className="font-mono text-[11.5px] font-bold text-slate-800">
            {toaDo.lat.toFixed(6)}, {toaDo.lng.toFixed(6)}
          </p>
          <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">
            {daXacMinh ? '✅ Đã đo tại chỗ' : '📌 Ghim tay trên bản đồ — chưa đo tại chỗ'}
          </p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${toaDo.lat},${toaDo.lng}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <MapPin className="h-3.5 w-3.5" />
            CHỈ ĐƯỜNG TỚI ĐÂY
          </a>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-center text-[11.5px] font-medium text-slate-400">
          Hộ này chưa có vị trí trên bản đồ.
        </p>
      )}

      {suaDuoc && (
        <>
          <Button
            mau={toaDo ? 'trang' : 'chinh'}
            icon={Crosshair}
            onClick={layGps}
            disabled={dangLay || luu.isPending}
            className="w-full justify-center"
          >
            {dangLay
              ? 'ĐANG BẮT TÍN HIỆU…'
              : luu.isPending
                ? 'ĐANG LƯU…'
                : toaDo
                  ? 'ĐO LẠI BẰNG GPS TẠI ĐÂY'
                  : 'LẤY VỊ TRÍ GPS TẠI ĐÂY'}
          </Button>
          <p className="text-[10px] leading-snug font-medium text-slate-400">
            Bấm khi đang <b>đứng trước nhà</b> — máy lấy toạ độ hiện tại và ghi đè vị trí cũ. Vị trí
            nào sai thì đi ngang qua bấm lại một cái là xong.
          </p>
        </>
      )}

      <LichSuViTri hid={ho.id} />
    </section>
  );
}

/* ─────────────────────────────────────────────────── Lịch sử vị trí ── */

interface DongLichSu {
  luc: string;
  hanh_dong: string;
  nguoi: string;
  qua_ho_tro: boolean;
  lat: number | null;
  lng: number | null;
  xac_nhan: boolean | null;
  lech_lan_truoc_m: number | null;
}

/**
 * Ai đã đổi vị trí hộ này, lúc nào, dịch bao xa.
 *
 * Gấp lại mặc định: phần lớn lúc mở hộ là để sửa thông tin, không phải để soi
 * lịch sử. Nhưng khi vị trí "tự nhiên nhảy đi đâu mất" thì đây là chỗ trả lời
 * ngay ai sửa, khỏi phải nhờ người tra cơ sở dữ liệu.
 */
function LichSuViTri({ hid }: { hid: string }) {
  const [mo, setMo] = useState(false);
  const { data } = useQuery({
    queryKey: ['lich-su-vi-tri', hid],
    queryFn: () => get<DongLichSu[]>(`/ho-khau/${hid}/lich-su-vi-tri`),
    enabled: mo,
  });

  return (
    <div className="border-t border-slate-200 pt-2.5">
      <button
        onClick={() => setMo((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700"
      >
        <History className="h-3.5 w-3.5" />
        Lịch sử thay đổi vị trí
        <ChevronDown
          className={cx('ml-auto h-3.5 w-3.5 transition-transform', mo && 'rotate-180')}
        />
      </button>

      {mo && (
        <div className="mt-2">
          {!data ? (
            <p className="py-2 text-center text-[11px] text-slate-400">Đang tải…</p>
          ) : data.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-slate-400">
              Chưa có lần đổi vị trí nào được ghi lại.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {data.map((d, i) => (
                <li
                  key={i}
                  className={cx(
                    'rounded-xl border p-2.5',
                    i === 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] font-bold text-slate-800">{d.hanh_dong}</span>
                    {i === 0 && (
                      <span className="rounded bg-emerald-600 px-1.5 text-[9px] font-black text-white">
                        HIỆN TẠI
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">
                    <b className="text-slate-700">{d.nguoi}</b>
                    {d.qua_ho_tro && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                        quản trị nền tảng
                      </span>
                    )}
                    <span className="font-mono"> · {gio(d.luc)}</span>
                  </p>
                  {d.lat != null ? (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {d.lat.toFixed(6)}, {d.lng!.toFixed(6)}
                      {d.lech_lan_truoc_m != null && d.lech_lan_truoc_m > 0 && (
                        <span className="ml-1 font-sans font-bold text-amber-600">
                          dịch {d.lech_lan_truoc_m}m so với lần trước
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Xác nhận vị trí đang có là đúng — không đổi toạ độ
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
