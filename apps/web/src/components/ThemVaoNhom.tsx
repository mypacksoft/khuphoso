/**
 * Thêm nhân khẩu có sẵn vào một nhóm đoàn thể / diện chính sách.
 *
 * Ở màn hình Chi bộ, Đoàn thể… người ta không khai sinh hồ sơ mới — bà con đã có
 * trong sổ nhân khẩu rồi, việc cần làm chỉ là đánh dấu ai thuộc nhóm nào. Nên ở đây
 * chỉ tra tên rồi chọn, không bày ra cả tờ khai nhân khẩu.
 *
 * Gọi `POST /cu-dan/{id}/phan-loai/{code}` chứ không gọi `PATCH /cu-dan/{id}`:
 * ở PATCH thì `classifications` là danh sách ĐẦY ĐỦ, gửi lên một mã là xoá sạch các
 * nhóm khác — đảng viên kiêm tổ trưởng sẽ mất mất diện tổ trưởng.
 *
 * Hộp thoại không tự đóng sau mỗi lần thêm: cán bộ thường ngồi nhập cả danh sách
 * một lượt, đóng ra mở vào mỗi người một lần thì mỏi tay.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ChonNhanKhau, type NhanKhauDaChon } from '@/components/ChonNhanKhau';
import { Button, CanhBao, HopThoai, Truong } from '@/components/ui';
import { post } from '@/lib/api';

interface DaThem {
  ten: string;
  da_co: boolean;
}

export function ThemVaoNhom({
  /** Mã nhóm, vd `dang_vien`. */
  code,
  /** Tên nhóm để hiển thị, vd "Đảng viên". */
  ten_nhom,
  onClose,
}: {
  code: string;
  ten_nhom: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [xong, setXong] = useState<DaThem[]>([]);
  const [loi, setLoi] = useState('');

  const them = useMutation({
    mutationFn: (nk: NhanKhauDaChon) =>
      post<{ da_co: boolean; full_name: string }>(`/cu-dan/${nk.id}/phan-loai/${code}`),
    onSuccess: (r) => {
      setLoi('');
      setXong((s) => [{ ten: r.full_name, da_co: r.da_co }, ...s]);
      for (const k of ['cu-dan', 'thong-ke']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => setLoi(e instanceof Error ? e.message : 'Không thêm được vào nhóm'),
  });

  return (
    <HopThoai
      mo
      dong={onClose}
      tieu_de={`Thêm vào ${ten_nhom}`}
      emoji="➕"
      rong="max-w-lg"
      chan={
        <Button onClick={onClose} type="button">
          {xong.length ? 'XONG' : 'ĐÓNG'}
        </Button>
      }
    >
      <div className="space-y-3">
        {loi && (
          <CanhBao loai="loi" emoji="⚠️">
            {loi}
          </CanhBao>
        )}

        <Truong
          nhan="Tìm nhân khẩu"
          ghi_chu="Gõ tên, chọn đúng người — thêm xong ô tìm tự trống lại để nhập người tiếp theo."
        >
          <ChonNhanKhau
            gia_tri={null}
            onChon={(nk) => nk && them.mutate(nk)}
            goi_y={`Gõ tên người cần đưa vào ${ten_nhom.toLowerCase()}…`}
            disabled={them.isPending}
          />
        </Truong>

        {xong.length > 0 && (
          <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
              Vừa thêm ({xong.filter((x) => !x.da_co).length})
            </p>
            {xong.map((x, i) => (
              <p key={i} className="text-[11px] font-semibold text-slate-700">
                {x.da_co ? (
                  <>
                    <span className="text-amber-600">•</span> {x.ten} —{' '}
                    <span className="font-medium text-slate-400">đã ở trong nhóm từ trước</span>
                  </>
                ) : (
                  <>
                    <span className="text-emerald-600">✓</span> {x.ten}
                  </>
                )}
              </p>
            ))}
          </div>
        )}

        <p className="text-[10px] font-medium text-slate-400">
          Chỉ đánh dấu người này thuộc <b>{ten_nhom}</b>; các nhóm khác của họ giữ nguyên. Muốn
          gỡ khỏi nhóm thì mở hồ sơ nhân khẩu, bỏ chọn nhóm ở mục “Đoàn thể &amp; diện chính
          sách”.
        </p>
      </div>
    </HopThoai>
  );
}
