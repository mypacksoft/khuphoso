/**
 * Xác minh vị trí hộ khi cán bộ đang đứng tại nhà.
 *
 * Ba cách, xếp theo độ tin cậy giảm dần:
 *
 *   1. **Lấy GPS của tôi** — máy điện thoại đo trực tiếp, sai số vài mét. Chính xác
 *      nhất, và là lý do chính để cán bộ mở app khi đi thực địa.
 *   2. **Xác nhận vị trí đang có là đúng** — ghim đang đúng chỗ, chỉ cần đóng dấu.
 *   3. **Ghim tay trên bản đồ** — làm ở màn hình bản đồ, cho trường hợp GPS kém.
 *
 * Sau khi xác minh, hệ thống nói rõ vị trí cũ lệch bao nhiêu mét. Con số đó cho biết
 * chất lượng dò tự động của cả khu phố, và giúp quyết định có nên đi rà tiếp không.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Crosshair, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, CanhBao, Chip, HopThoai, Spinner } from '@/components/ui';
import { post } from '@/lib/api';
import type { Ho } from '@/lib/types';

interface KetQuaXacMinh {
  success: boolean;
  geo_status: string;
  lech_m: number | null;
  message: string;
}

export function XacMinhViTri({ ho, dong }: { ho: Ho | null; dong: () => void }) {
  const qc = useQueryClient();
  const [dangDoGps, setDangDoGps] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; sai_so: number } | null>(null);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState<KetQuaXacMinh | null>(null);
  // Mỗi lần mở cho một hộ chỉ tự đo MỘT lần — không đo lại mỗi lần vẽ lại.
  const daTuDo = useRef<string | null>(null);

  const xacMinh = useMutation({
    mutationFn: (than: Record<string, unknown>) =>
      post<KetQuaXacMinh>(`/ho-khau/${ho!.id}/xac-minh`, than),
    onSuccess: (d) => {
      setXong(d);
      for (const k of ['ho-khau-ban-do', 'ho-khau', 'dinh-vi-tong-quan', 'thong-bao', 'thong-ke']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không xác minh được'),
  });

  /** Đo toạ độ bằng GPS của máy. `enableHighAccuracy` để dùng vệ tinh, không dùng wifi. */
  const layGps = () => {
    setLoi('');
    if (!navigator.geolocation) {
      setLoi('Máy này không hỗ trợ định vị GPS.');
      return;
    }
    setDangDoGps(true);
    navigator.geolocation.getCurrentPosition(
      (v) => {
        setDangDoGps(false);
        setGps({
          lat: v.coords.latitude,
          lng: v.coords.longitude,
          sai_so: Math.round(v.coords.accuracy),
        });
      },
      (e) => {
        setDangDoGps(false);
        setLoi(
          e.code === e.PERMISSION_DENIED
            ? 'Trình duyệt chưa được cấp quyền vị trí. Vào cài đặt trang, bật quyền Vị trí rồi thử lại.'
            : e.code === e.TIMEOUT
              ? 'Đo GPS quá lâu. Ra chỗ thoáng, tránh trong nhà bê tông, rồi thử lại.'
              : 'Không lấy được vị trí GPS.',
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  const dongVaDon = () => {
    setGps(null);
    setLoi('');
    setXong(null);
    daTuDo.current = null;
    dong();
  };

  // Bấm "Xác minh tại chỗ" là tự đo GPS ngay — cán bộ đang đứng trước nhà, không
  // phải bấm thêm một nút nữa. Vẫn để họ xem sai số rồi mới lưu, vì GPS trong nhà
  // bê tông có thể lệch mấy chục mét, ghi đè vị trí đúng bằng toạ độ tệ thì hại hơn.
  useEffect(() => {
    if (ho && daTuDo.current !== ho.id) {
      daTuDo.current = ho.id;
      layGps();
    }
  }, [ho]);

  if (!ho) return null;

  return (
    <HopThoai
      mo
      dong={dongVaDon}
      tieu_de={ho.toa_do ? `Xác minh vị trí hộ #${ho.code}` : `Lấy vị trí hộ #${ho.code}`}
      emoji="📍"
      rong="max-w-md"
      chan={
        xong ? (
          <Button onClick={dongVaDon}>XONG</Button>
        ) : (
          <>
            <Button mau="trang" onClick={dongVaDon} type="button">
              Huỷ bỏ
            </Button>
            {gps ? (
              <Button
                icon={ShieldCheck}
                onClick={() =>
                  xacMinh.mutate({ lat: gps.lat, lng: gps.lng, do_chinh_xac_m: gps.sai_so })
                }
                disabled={xacMinh.isPending}
              >
                {xacMinh.isPending ? 'ĐANG LƯU…' : 'LƯU VỊ TRÍ GPS NÀY'}
              </Button>
            ) : (
              <Button
                icon={ShieldCheck}
                onClick={() => xacMinh.mutate({})}
                disabled={xacMinh.isPending || !ho.toa_do}
              >
                {xacMinh.isPending ? 'ĐANG LƯU…' : 'VỊ TRÍ ĐANG CÓ LÀ ĐÚNG'}
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

        {xong ? (
          <>
            <CanhBao loai="ok" emoji="✅">
              {xong.message}
            </CanhBao>
            {xong.lech_m != null && xong.lech_m > 60 && (
              <CanhBao loai="canh" emoji="📏">
                Lệch <b>{xong.lech_m}m</b> là khá nhiều. Nếu nhiều hộ cùng lệch lớn thì địa chỉ khu
                vực này dò tự động không đáng tin — nên đi rà tay cả tổ.
              </CanhBao>
            )}
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11.5px] font-bold text-slate-900">
                {ho.chu_ho || 'Chưa có chủ hộ'}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-600">{ho.address}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ho.toa_do ? (
                  <>
                    <Chip mau={ho.geo_status === 'auto' ? 'amber' : 'blue'} nho>
                      {ho.geo_status === 'auto' ? 'Máy dò — cần xác minh' : 'Ghim tay'}
                    </Chip>
                    <span className="font-mono text-[10px] text-slate-500">
                      {ho.toa_do.lat.toFixed(6)}, {ho.toa_do.lng.toFixed(6)}
                    </span>
                  </>
                ) : (
                  <Chip mau="rose" nho>
                    Chưa có toạ độ
                  </Chip>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                {ho.toa_do ? 'Cách chính xác nhất' : 'Cách nhanh và chính xác nhất'}
              </p>
              <Button
                mau="trang"
                icon={Crosshair}
                onClick={layGps}
                disabled={dangDoGps}
                className="w-full !py-3"
              >
                {dangDoGps ? 'ĐANG ĐO GPS…' : 'LẤY GPS CỦA TÔI'}
              </Button>
              <p className="mt-1.5 text-[10px] leading-relaxed font-medium text-slate-400">
                Bấm khi anh/chị đang <b>đứng trước nhà</b>. Máy đo trực tiếp, chính xác hơn hẳn dò
                theo địa chỉ chữ.
              </p>
            </div>

            {dangDoGps && <Spinner label="Đang bắt tín hiệu vệ tinh…" />}

            {gps && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
                <p className="text-[10px] font-extrabold tracking-wider text-emerald-700 uppercase">
                  Đã đo được
                </p>
                <p className="mt-1 font-mono text-xs font-bold text-slate-800">
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                </p>
                <p className="mt-1 text-[10.5px] font-medium text-slate-600">
                  Sai số máy báo: <b>±{gps.sai_so}m</b>
                  {gps.sai_so > 40 && ' — hơi lớn, ra chỗ thoáng đo lại cho chắc.'}
                </p>
                <button
                  onClick={layGps}
                  className="mt-1.5 cursor-pointer text-[10px] font-bold text-emerald-800 underline"
                >
                  Đo lại
                </button>
              </div>
            )}

            {!gps &&
              (ho.toa_do ? (
                <CanhBao loai="tin" emoji="👍">
                  Nếu ghim trên bản đồ đã đúng nhà rồi thì bấm <b>“Vị trí đang có là đúng”</b> — hộ
                  chuyển sang trạng thái <b>đã xác minh</b>.
                </CanhBao>
              ) : (
                <CanhBao loai="tin" emoji="🚶">
                  Hộ này chưa có toạ độ. Đo GPS ngay tại nhà là xong luôn cả bước ghim lẫn bước xác
                  minh — không cần dò từ địa chỉ.
                </CanhBao>
              ))}
          </>
        )}
      </div>
    </HopThoai>
  );
}
