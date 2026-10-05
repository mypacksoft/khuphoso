/**
 * Hồ sơ nhân khẩu — thêm mới và sửa dùng chung một biểu mẫu.
 *
 * Số CCCD được mã hoá ở phía máy chủ; khi sửa, ô này để trống nghĩa là "giữ nguyên"
 * chứ không phải "xoá đi". Ghi rõ điều đó ngay dưới ô để cán bộ không hiểu nhầm.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ChonDiaChi } from '@/components/ChonDiaChi';
import { ChonHo, type HoDaChon } from '@/components/ChonHo';
import { ChonNhanKhau, type NhanKhauDaChon } from '@/components/ChonNhanKhau';

import {
  Button,
  CanhBao,
  ChipMau,
  cx,
  Input,
  NganKeo,
  Select,
  Spinner,
  Textarea,
  Truong,
} from '@/components/ui';
import { get, patch, post } from '@/lib/api';

import { NutChuyenKhuPho } from './ChuyenKhuPho';
import type { CuDanChiTiet, HoChiTiet, PhanLoai, ToDanPho } from '@/lib/types';
import { DIEN_CU_TRU, GIOI_TINH, QUAN_HE } from '@/lib/types';

interface Form {
  full_name: string;
  dia_chi_khai: string;
  ten_chu_ho_khai: string;
  dob: string;
  gender: string;
  id_card: string;
  group_id: string;
  residence_status: string;
  tam_tru_tu_ngay: string;
  tam_tru_den_ngay: string;
  relation_to_head: string;
  phone: string;
  email: string;
  occupation: string;
  note: string;
  is_head: boolean;
}

const RONG: Form = {
  full_name: '',
  dia_chi_khai: '',
  ten_chu_ho_khai: '',
  dob: '',
  gender: '',
  id_card: '',
  group_id: '',
  residence_status: 'thuong_tru',
  tam_tru_tu_ngay: '',
  tam_tru_den_ngay: '',
  relation_to_head: '',
  phone: '',
  email: '',
  occupation: '',
  note: '',
  is_head: false,
};

const TEN_KHOI: Record<string, string> = {
  chi_bo: '🚩 Chi bộ',
  chinh_quyen: '🛡️ Chính quyền',
  doan_the: '💚 Đoàn thể',
  chinh_sach: '📘 Chính sách',
  nhom_khac: '👥 Nhóm khác',
};

/** Đặt một nhân khẩu làm chủ hộ. Máy chủ tự bỏ cờ chủ hộ của người cũ. */
async function datLamChuHo(resident_id: string, household_id: string) {
  await post('/ho-khau/chuyen-ho', {
    resident_id,
    household_id,
    relation_to_head: 'Chủ hộ',
    is_head: true,
  });
}

export function FormCuDan({
  id,
  householdId,
  onClose,
}: {
  /** Có id là sửa, không có là thêm mới. */
  id?: string | null;
  householdId?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suaDoi = Boolean(id);
  const [f, setF] = useState<Form>(RONG);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [ho, setHo] = useState<HoDaChon | null>(null);
  const [chuHo, setChuHo] = useState<NhanKhauDaChon | null>(null);
  const [loi, setLoi] = useState('');

  const { data: to } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
  });
  const { data: danhMuc } = useQuery({
    queryKey: ['phan-loai'],
    queryFn: () => get<PhanLoai[]>('/cu-dan/danh-muc/phan-loai'),
  });
  const { data: cu, isLoading } = useQuery({
    queryKey: ['cu-dan', id],
    queryFn: () => get<CuDanChiTiet>(`/cu-dan/${id}`),
    enabled: suaDoi,
  });

  useEffect(() => {
    if (!cu) return;
    setF({
      full_name: cu.full_name,
      dia_chi_khai: cu.dia_chi_khai ?? '',
      ten_chu_ho_khai: cu.ten_chu_ho_khai ?? '',
      dob: cu.dob ?? '',
      gender: cu.gender ?? '',
      // Điền sẵn số CCCD đầy đủ. Máy chủ chỉ trả số này cho tài khoản có quyền
      // `resident:read_pii` (Quản trị, Ban điều hành) và ghi nhật ký mỗi lần xem.
      // Trước đây ô này luôn để trống, nên cán bộ nhìn vào tưởng chưa nhập số nào
      // rồi gõ lại từ đầu — trong khi số đã có sẵn trong hồ sơ.
      id_card: cu.id_card ?? '',
      group_id: cu.group_id ?? '',
      residence_status: cu.residence_status,
      tam_tru_tu_ngay: cu.tam_tru_tu_ngay ?? '',
      tam_tru_den_ngay: cu.tam_tru_den_ngay ?? '',
      relation_to_head: cu.relation_to_head ?? '',
      phone: cu.phone ?? '',
      email: cu.email ?? '',
      occupation: cu.occupation ?? '',
      note: cu.note ?? '',
      is_head: cu.is_head,
    });
    setChon(new Set(cu.phan_loai.map((c) => c.code)));
    setHo(
      cu.household_id
        ? {
            id: cu.household_id,
            code: cu.ma_ho ?? '',
            address: cu.dia_chi ?? null,
            to_dan_pho: cu.to_dan_pho,
          }
        : null,
    );
    setChuHo(null);
  }, [cu]);

  // Mở từ trong một hộ (nút "Thêm đồng cư") thì khoá sẵn hộ đó
  const { data: hoTruyen } = useQuery({
    queryKey: ['ho-khau', householdId],
    queryFn: () => get<HoChiTiet>(`/ho-khau/${householdId}`),
    enabled: !!householdId && !suaDoi,
  });
  useEffect(() => {
    if (hoTruyen) {
      setHo({
        id: hoTruyen.id,
        code: hoTruyen.code,
        address: hoTruyen.address,
        to_dan_pho: hoTruyen.to_dan_pho,
      });
    }
  }, [hoTruyen]);

  const luu = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        ...f,
        dob: f.dob || null,
        gender: f.gender || null,
        tam_tru_tu_ngay: f.tam_tru_tu_ngay || null,
        tam_tru_den_ngay: f.tam_tru_den_ngay || null,
        id_card: f.id_card || null,
        group_id: f.group_id || null,
        relation_to_head: f.relation_to_head || null,
        classifications: [...chon],
      };
      // Chọn hộ từ lookup là đường chính xác nhất: ra đúng một household_id
      if (ho) {
        body.household_id = ho.id;
        body.dia_chi_khai = '';
        body.ten_chu_ho_khai = '';
      } else if (suaDoi && cu?.household_id) {
        // Đã bỏ chọn hộ -> gỡ hẳn khỏi hộ cũ
        body.go_khoi_ho = true;
      }
      if (suaDoi) {
        // Ô trống khi SỬA nghĩa là không đổi — bỏ khỏi body để backend giữ giá trị cũ
        // Ô trống nghĩa là "không đổi" -> bỏ khỏi body. Riêng địa chỉ khai và
        // tên chủ hộ khai thì chuỗi rỗng nghĩa là XOÁ, nên giữ nguyên để gửi lên.
        for (const k of ['phone', 'email', 'occupation', 'note', 'id_card']) {
          if (!body[k]) delete body[k];
        }
        await patch(`/cu-dan/${id}`, body);
        if (ho && f.is_head) await datLamChuHo(id!, ho.id);
        return { id };
      }
      const moi = await post<{ id: string }>('/cu-dan', body);
      if (ho && f.is_head) await datLamChuHo(moi.id, ho.id);
      return moi;
    },
    onSuccess: () => {
      for (const k of ['cu-dan', 'thong-ke', 'ho-khau', 'to-dan-pho', 'thong-bao']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      onClose();
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const dat = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  // Nhóm phân loại theo khối để cán bộ tìm nhanh, thay vì một danh sách 18 ô rối mắt
  const theoKhoi = (danhMuc ?? []).reduce<Record<string, PhanLoai[]>>((acc, c) => {
    const k = c.khoi ?? 'nhom_khac';
    (acc[k] ??= []).push(c);
    return acc;
  }, {});

  return (
    <NganKeo
      mo
      dong={onClose}
      tieu_de={suaDoi ? 'Sửa hồ sơ nhân khẩu' : 'Thêm nhân khẩu mới'}
      mo_ta={
        suaDoi
          ? 'Mọi thay đổi đều được ghi vào nhật ký của khu phố'
          : 'Nhập tối thiểu họ tên; các mục khác bổ sung sau cũng được'
      }
      chan={
        <>
          {suaDoi && cu && <NutChuyenKhuPho loai="nhan_khau" nguon_id={id!} ten={cu.full_name} />}
          <Button mau="trang" onClick={onClose} type="button">
            Huỷ bỏ
          </Button>
          <Button
            onClick={() => {
              setLoi('');
              if (!f.full_name.trim()) {
                setLoi('Chưa nhập họ và tên.');
                return;
              }
              // Một địa chỉ trọ có nhiều hộ tạm trú không liên quan nhau, thiếu tên
              // chủ hộ thì về sau không gom đúng hộ được
              if (
                !ho &&
                f.residence_status === 'tam_tru' &&
                f.dia_chi_khai.trim() &&
                !f.ten_chu_ho_khai.trim()
              ) {
                setLoi('Nhân khẩu tạm trú phải khai tên chủ hộ, vì một địa chỉ trọ có nhiều hộ.');
                return;
              }
              luu.mutate();
            }}
            disabled={luu.isPending}
          >
            {luu.isPending ? 'ĐANG LƯU…' : suaDoi ? 'LƯU THAY ĐỔI' : 'THÊM NHÂN KHẨU'}
          </Button>
        </>
      }
    >
      {suaDoi && isLoading ? (
        <Spinner label="Đang mở hồ sơ…" />
      ) : (
        <div className="space-y-5">
          {loi && (
            <CanhBao loai="loi" emoji="⚠️">
              {loi}
            </CanhBao>
          )}

          <section className="space-y-3">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Thông tin nhân thân
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Truong nhan="Họ và tên" bat_buoc>
                  <Input
                    value={f.full_name}
                    onChange={(e) => dat('full_name', e.target.value)}
                    placeholder="Nguyễn Văn A"
                    autoFocus
                  />
                </Truong>
              </div>
              <Truong nhan="Ngày sinh">
                <Input type="date" value={f.dob} onChange={(e) => dat('dob', e.target.value)} />
              </Truong>
              <Truong nhan="Giới tính">
                <Select value={f.gender} onChange={(e) => dat('gender', e.target.value)}>
                  <option value="">Chưa xác định</option>
                  {Object.entries(GIOI_TINH).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Truong>
              <div className="sm:col-span-2">
                <Truong
                  nhan="Số CCCD / CMND"
                  ghi_chu={
                    !suaDoi
                      ? 'Được mã hoá trước khi lưu. Chỉ 4 số cuối hiện ra ở danh sách.'
                      : cu?.id_card
                        ? 'Sửa thẳng vào ô để đổi số. Xoá trắng thì giữ nguyên số cũ, không xoá được số bằng cách đó.'
                        : cu?.id_card_last4
                          ? `Tài khoản của bạn không được xem số đầy đủ. Số đang lưu kết thúc bằng ${cu.id_card_last4}. Gõ số mới nếu cần thay.`
                          : 'Hồ sơ này chưa có số định danh.'
                  }
                >
                  <Input
                    value={f.id_card}
                    onChange={(e) => dat('id_card', e.target.value.replace(/\D/g, ''))}
                    placeholder={
                      suaDoi && cu?.id_card_last4 && !cu?.id_card
                        ? `••••••••${cu.id_card_last4}`
                        : '012345678901'
                    }
                    inputMode="numeric"
                    maxLength={12}
                    className="font-mono tracking-wider"
                  />
                </Truong>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Cư trú
            </h4>
            <Truong
              nhan="Hộ khẩu"
              ghi_chu={
                ho
                  ? 'Nhân khẩu này thuộc hộ trên. Bấm dấu × để gỡ khỏi hộ.'
                  : 'Chọn hộ có sẵn. Chưa có hộ thì khai địa chỉ bên dưới, sau này gom lại.'
              }
            >
              <ChonHo
                gia_tri={ho}
                onChon={setHo}
                dien_ho={f.residence_status === 'tam_tru' ? 'tam_tru' : 'thuong_tru'}
                disabled={!!householdId && !suaDoi}
              />
            </Truong>

            {ho ? (
              <Truong
                nhan="Quan hệ với chủ hộ"
                ghi_chu={
                  f.is_head
                    ? 'Người này sẽ là chủ hộ. Chủ hộ cũ (nếu có) thành thành viên thường.'
                    : undefined
                }
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={f.relation_to_head}
                    onChange={(e) => dat('relation_to_head', e.target.value)}
                    disabled={f.is_head}
                    className="flex-1"
                  >
                    <option value="">Chưa xác định</option>
                    {Object.entries(QUAN_HE).map(([k, v]) => (
                      <option key={k} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 px-1">
                    <input
                      type="checkbox"
                      checked={f.is_head}
                      onChange={(e) => dat('is_head', e.target.checked)}
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-400 w-4 h-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">Là chủ hộ</span>
                  </label>
                </div>
              </Truong>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                  Chưa thuộc hộ nào
                </p>
                <p className="text-[10.5px] text-amber-800 font-medium leading-relaxed">
                  Khai địa chỉ và chủ hộ ở đây thì màn hình sổ hộ khẩu tự gom được người này vào
                  đúng hộ. Hộ tạm trú <b>bắt buộc</b> có chủ hộ vì một địa chỉ trọ thường có nhiều
                  hộ.
                </p>
                <Truong
                  nhan="Địa chỉ khai"
                  ghi_chu="Chọn từ gợi ý để cách viết thống nhất; nhà mới thì cứ gõ tự do"
                >
                  <ChonDiaChi
                    gia_tri={f.dia_chi_khai}
                    onDoi={(v) => dat('dia_chi_khai', v)}
                    onChonGoiY={(g) => {
                      // Địa chỉ đã có chủ hộ mà người này chưa khai thì điền sẵn cho đỡ gõ
                      if (g.chu_ho && !f.ten_chu_ho_khai.trim()) {
                        dat('ten_chu_ho_khai', g.chu_ho);
                      }
                    }}
                  />
                </Truong>
                <Truong
                  nhan="Chủ hộ"
                  bat_buoc={f.residence_status === 'tam_tru'}
                  ghi_chu="Chọn từ danh sách nhân khẩu cho chính xác; chưa có hồ sơ thì gõ tên."
                >
                  <ChonNhanKhau
                    gia_tri={chuHo}
                    onChon={(nk) => {
                      setChuHo(nk);
                      dat('ten_chu_ho_khai', nk?.full_name ?? '');
                      // Chọn ai làm chủ hộ nghĩa là ở cùng nhà người đó — lấy luôn
                      // địa chỉ của họ, cán bộ khỏi gõ lại và chắc chắn khớp chữ
                      if (nk?.dia_chi) dat('dia_chi_khai', nk.dia_chi);
                    }}
                    dien_cu_tru={f.residence_status === 'tam_tru' ? 'tam_tru' : 'thuong_tru'}
                    goi_y="Gõ tên chủ hộ để tìm…"
                  />
                  {!chuHo && (
                    <Input
                      value={f.ten_chu_ho_khai}
                      onChange={(e) => dat('ten_chu_ho_khai', e.target.value)}
                      placeholder="…hoặc gõ thẳng tên chủ hộ"
                      className="mt-2"
                    />
                  )}
                </Truong>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Truong nhan="Diện cư trú">
                <Select
                  value={f.residence_status}
                  onChange={(e) => dat('residence_status', e.target.value)}
                >
                  {Object.entries(DIEN_CU_TRU).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Truong>
              {f.residence_status === 'tam_tru' && (
                <>
                  <Truong nhan="Tạm trú từ ngày">
                    <Input
                      type="date"
                      value={f.tam_tru_tu_ngay}
                      onChange={(e) => dat('tam_tru_tu_ngay', e.target.value)}
                    />
                  </Truong>
                  <Truong
                    nhan="Hết hạn tạm trú"
                    ghi_chu="Hết hạn thì chuông tự nhắc để đi vận động gia hạn"
                  >
                    <Input
                      type="date"
                      value={f.tam_tru_den_ngay}
                      onChange={(e) => dat('tam_tru_den_ngay', e.target.value)}
                    />
                  </Truong>
                </>
              )}

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
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Liên hệ
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Truong nhan="Số điện thoại">
                <Input
                  value={f.phone}
                  onChange={(e) => dat('phone', e.target.value)}
                  placeholder="09xxxxxxxx"
                  inputMode="tel"
                  className="font-mono"
                />
              </Truong>
              <Truong nhan="Nghề nghiệp">
                <Input
                  value={f.occupation}
                  onChange={(e) => dat('occupation', e.target.value)}
                  placeholder="Công nhân, buôn bán, hưu trí…"
                />
              </Truong>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Đoàn thể & diện chính sách
            </h4>
            {!danhMuc ? (
              <Spinner />
            ) : (
              <div className="space-y-3 bg-[#f8f9ff] p-4 rounded-2xl border border-slate-200">
                {Object.entries(theoKhoi).map(([khoi, ds]) => (
                  <div key={khoi}>
                    <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                      {TEN_KHOI[khoi] ?? khoi}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ds.map((c) => {
                        const dangChon = chon.has(c.code);
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() =>
                              setChon((s) => {
                                const n = new Set(s);
                                if (n.has(c.code)) n.delete(c.code);
                                else n.add(c.code);
                                return n;
                              })
                            }
                            className={cx(
                              'px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer border',
                              dangChon
                                ? 'border-transparent'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300',
                            )}
                            style={
                              dangChon
                                ? {
                                    backgroundColor: `${c.color ?? '#1e40af'}1a`,
                                    color: c.color ?? '#1e40af',
                                  }
                                : undefined
                            }
                          >
                            {dangChon && '✓ '}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {chon.size > 0 && (
              <p className="text-[10px] text-slate-400 font-medium">
                Đã chọn {chon.size} diện:{' '}
                {[...chon].map((code) => {
                  const c = danhMuc?.find((x) => x.code === code);
                  return c ? (
                    <ChipMau key={code} color={c.color}>
                      {c.name}
                    </ChipMau>
                  ) : null;
                })}
              </p>
            )}
          </section>

          <Truong nhan="Ghi chú">
            <Textarea
              value={f.note}
              onChange={(e) => dat('note', e.target.value)}
              placeholder="Thông tin cần lưu ý khi làm việc với nhân khẩu này…"
            />
          </Truong>
        </div>
      )}
    </NganKeo>
  );
}
