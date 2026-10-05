/**
 * Gom nhân khẩu rời thành hộ, theo địa chỉ và tên chủ hộ đã khai.
 *
 * LUÔN xem trước rồi mới ghi. Máy chủ trả về danh sách dự kiến: hộ nào tạo mới, ai
 * vào hộ nào, ai không gom được và vì sao. Cán bộ đọc xong mới bấm xác nhận.
 *
 * Việc này ghi vào hồ sơ hộ tịch nên không được làm âm thầm — gom nhầm hai nhà
 * thành một hộ rất khó phát hiện về sau.
 */

import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Merge } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  CanhBao,
  Chip,
  ChuaCapNhat,
  cx,
  HopThoai,
  Spinner,
} from '@/components/ui';
import { post } from '@/lib/api';

interface ThanhVien {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  la_chu_ho: boolean;
}

interface DuKien {
  dia_chi: string;
  chu_ho_khai: string | null;
  to_dan_pho: string | null;
  so_nguoi: number;
  ho_dang_co: string | null;
  ma_ho?: string;
  chu_ho_ten: string | null;
  viec: 'tao_ho_moi' | 'gan_vao_ho_co';
  thanh_vien: ThanhVien[];
}

interface BoQua {
  id: string;
  full_name: string;
  dia_chi_khai: string | null;
  ten_chu_ho_khai: string | null;
  ly_do: string;
}

interface KetQua {
  dien: string;
  xem_truoc: boolean;
  tong_nhan_khau_roi: number;
  se_tao_ho_moi: number;
  se_gan_vao_ho_co: number;
  se_gan_nhan_khau: number;
  du_kien: DuKien[];
  bo_qua: BoQua[];
  da_tao_ho?: number;
  da_gan_nhan_khau?: number;
}

export function GomHo({
  mo,
  dong,
  household_type,
  nhan_dien,
}: {
  mo: boolean;
  dong: () => void;
  household_type: string;
  nhan_dien: string;
}) {
  const qc = useQueryClient();
  const [kq, setKq] = useState<KetQua | null>(null);
  const [xong, setXong] = useState(false);
  const [loi, setLoi] = useState('');

  const chay = useMutation({
    mutationFn: (xac_nhan: boolean) =>
      post<KetQua>('/ho-khau/gop-tu-dia-chi', { household_type, xac_nhan }),
    onSuccess: (d) => {
      setKq(d);
      setXong(!d.xem_truoc);
      setLoi('');
      if (!d.xem_truoc) {
        for (const k of ['ho-khau', 'cu-dan', 'ho-khau-ban-do', 'thong-ke', 'thong-bao']) {
          void qc.invalidateQueries({ queryKey: [k] });
        }
      }
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không chạy được'),
  });

  const dongVaXoa = () => {
    setKq(null);
    setXong(false);
    setLoi('');
    dong();
  };

  return (
    <HopThoai
      mo={mo}
      dong={dongVaXoa}
      tieu_de={`Gom nhân khẩu vào ${nhan_dien.toLowerCase()}`}
      emoji="🧩"
      rong="max-w-3xl"
      chan={
        xong ? (
          <Button onClick={dongVaXoa}>XONG</Button>
        ) : (
          <>
            <Button mau="trang" onClick={dongVaXoa} type="button">
              Huỷ bỏ
            </Button>
            {!kq ? (
              <Button
                icon={Merge}
                onClick={() => chay.mutate(false)}
                disabled={chay.isPending}
              >
                {chay.isPending ? 'ĐANG DÒ…' : 'XEM TRƯỚC'}
              </Button>
            ) : (
              <Button
                onClick={() => chay.mutate(true)}
                disabled={chay.isPending || kq.du_kien.length === 0}
              >
                {chay.isPending ? 'ĐANG GOM…' : `XÁC NHẬN GOM ${kq.se_gan_nhan_khau} NHÂN KHẨU`}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        {!kq && !chay.isPending && (
          <>
            <CanhBao loai="tin" emoji="🧩">
              Gom những nhân khẩu chưa thuộc hộ nào thành hộ, dựa trên <b>địa chỉ</b> và{' '}
              <b>tên chủ hộ</b> họ đã khai trong hồ sơ.
            </CanhBao>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Quy tắc gom
              </p>
              {household_type === 'tam_tru' ? (
                <ul className="space-y-1.5 text-[11px] text-slate-700 font-medium leading-relaxed">
                  <li>
                    · Cùng địa chỉ <b>và</b> cùng tên chủ hộ → một hộ tạm trú.
                  </li>
                  <li>
                    · <b>Bắt buộc</b> có tên chủ hộ. Một địa chỉ nhà trọ thường có nhiều hộ
                    không liên quan gì nhau, thiếu tên thì không đoán được.
                  </li>
                </ul>
              ) : (
                <ul className="space-y-1.5 text-[11px] text-slate-700 font-medium leading-relaxed">
                  <li>· Cùng địa chỉ và cùng tên chủ hộ → một hộ.</li>
                  <li>
                    · Một địa chỉ chỉ có một nhóm và không ai khai tên chủ hộ → gom chung
                    thành một hộ.
                  </li>
                  <li>
                    · Một địa chỉ có nhiều tên chủ hộ khác nhau, lại có người không khai tên
                    → <b>để riêng</b>, không đoán người đó thuộc hộ nào.
                  </li>
                </ul>
              )}
              <p className="text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200">
                Địa chỉ được so sau khi bỏ dấu và bỏ các chữ “đường”, “hẻm”, “số nhà”. So
                chính xác chứ không so gần đúng — thà để sót cho người rà tay còn hơn gom
                nhầm hai nhà thành một hộ.
              </p>
            </div>
          </>
        )}

        {chay.isPending && <Spinner label={kq ? 'Đang gom…' : 'Đang dò dữ liệu…'} />}

        {kq && !chay.isPending && (
          <>
            {xong ? (
              <CanhBao loai="ok" emoji="✅">
                Đã tạo <b>{kq.da_tao_ho}</b> hộ mới và gán{' '}
                <b>{kq.da_gan_nhan_khau}</b> nhân khẩu vào hộ.
              </CanhBao>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    ['Nhân khẩu rời', kq.tong_nhan_khau_roi, 'slate'],
                    ['Sẽ tạo hộ mới', kq.se_tao_ho_moi, 'emerald'],
                    ['Vào hộ đã có', kq.se_gan_vao_ho_co, 'blue'],
                    ['Không gom được', kq.bo_qua.length, 'amber'],
                  ] as [string, number, 'slate' | 'emerald' | 'blue' | 'amber'][]
                ).map(([nhan, n, mau]) => (
                  <div key={nhan} className="rounded-xl border border-slate-200 p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
                      {nhan}
                    </p>
                    <p
                      className={cx(
                        'text-xl font-bold mt-1',
                        mau === 'emerald' && 'text-emerald-700',
                        mau === 'blue' && 'text-blue-800',
                        mau === 'amber' && 'text-amber-700',
                        mau === 'slate' && 'text-slate-800',
                      )}
                    >
                      {n}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {kq.du_kien.length > 0 && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                  {xong ? 'Đã gom' : 'Dự kiến'} ({kq.du_kien.length} hộ)
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {kq.du_kien.map((d, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-bold text-slate-900 truncate">
                            {d.dia_chi}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            Chủ hộ: <b>{d.chu_ho_ten ?? d.chu_ho_khai ?? 'chưa xác định'}</b>
                            {d.to_dan_pho ? ` · ${d.to_dan_pho}` : ''}
                          </p>
                        </div>
                        <Chip mau={d.viec === 'tao_ho_moi' ? 'emerald' : 'blue'} nho>
                          {d.viec === 'tao_ho_moi'
                            ? d.ma_ho
                              ? `Hộ mới #${d.ma_ho}`
                              : 'Tạo hộ mới'
                            : `Vào hộ #${d.ho_dang_co}`}
                        </Chip>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {d.thanh_vien.map((t) => (
                          <span
                            key={t.id}
                            className={cx(
                              'rounded-lg px-2 py-0.5 text-[10px] font-semibold',
                              t.la_chu_ho
                                ? 'bg-amber-100 text-amber-800 font-bold'
                                : 'bg-slate-100 text-slate-700',
                            )}
                          >
                            {t.full_name}
                            {t.la_chu_ho && ' 👑'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kq.du_kien.length === 0 && !xong && (
              <CanhBao loai="canh" emoji="🤷">
                Không gom được nhóm nào. Nhân khẩu cần có <b>địa chỉ khai</b> trong hồ sơ —
                mở hồ sơ từng người và điền mục “Địa chỉ khai”, hoặc nhập lại từ file có cột
                địa chỉ.
              </CanhBao>
            )}

            {kq.bo_qua.length > 0 && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 mb-2">
                  Không gom được ({kq.bo_qua.length} người) — cần rà tay
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                  {kq.bo_qua.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-bold text-slate-900">{b.full_name}</p>
                        <p className="text-[10px] text-slate-500 font-medium shrink-0">
                          {b.dia_chi_khai ?? <ChuaCapNhat />}
                        </p>
                      </div>
                      <p className="text-[10px] text-amber-800 font-medium mt-0.5">{b.ly_do}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </HopThoai>
  );
}
