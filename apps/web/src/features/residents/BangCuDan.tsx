/**
 * Danh sách nhân khẩu — dùng chung cho CHÍN màn hình.
 *
 * Bốn diện cư trú (thường trú, tạm trú, tạm vắng, vãng lai) và năm khối đoàn thể.
 * Khác nhau chỉ ở bộ lọc bị khoá sẵn; thao tác của cán bộ thì giống hệt nhau.
 *
 * Bộ lọc khoá không hiện ra ô chọn: người vào màn hình "NK tạm trú" là đã chọn diện
 * rồi, bày thêm ô "diện cư trú" ở đó chỉ gây nhầm.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Eye, FileSpreadsheet, Trash2, UserPlus, UserRoundPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useManHinh } from '@/components/Layout';
import { ThemVaoNhom } from '@/components/ThemVaoNhom';
import {
  Bang,
  Button,
  CanhBao,
  Card,
  ChipMau,
  ChonDangHien,
  ChuaCapNhat,
  cx,
  KhungBang,
  NutIcon,
  PhanTrang,
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
import { get, post, qs } from '@/lib/api';
import { ngay, so } from '@/lib/fmt';
import { useAuth, useUi } from '@/lib/store';
import type { CuDan, DanhSach, PhanLoai, ToDanPho } from '@/lib/types';
import { GIOI_TINH } from '@/lib/types';

import { FormCuDan } from './FormCuDan';

/** Số bản ghi mỗi trang lúc mới vào. Đổi được ở ô chọn dưới bảng. */
const MOI_TRANG_MAC_DINH = 20;

export interface KhoaLoc {
  residence_status?: string;
  phan_loai?: string;
}

export function BangCuDan({
  tieu_de,
  emoji,
  mo_ta,
  khoa = {},
  /** Nhóm được phép chọn ở màn hình này — dùng cho khối đoàn thể. */
  nhom_trong_khoi,
  /** Màn hình đoàn thể đã lọc theo nhóm rồi nên bỏ cột "Diện chính sách". */
  cot_phan_loai = true,
}: {
  tieu_de: string;
  emoji: string;
  mo_ta: string;
  khoa?: KhoaLoc;
  nhom_trong_khoi?: PhanLoai[];
  cot_phan_loai?: boolean;
}) {
  const { can } = useAuth();
  const { dangHien, doiDangHien } = useUi();
  const datManHinh = useManHinh((s) => s.dat);
  const timTuThanhTren = useManHinh((s) => s.tim);

  const [to, setTo] = useState('');
  const [gioiTinh, setGioiTinh] = useState('');
  const [nhom, setNhom] = useState('');
  const [doTuoi, setDoTuoi] = useState('');
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(MOI_TRANG_MAC_DINH);
  const [form, setForm] = useState<string | null>(null); // null=đóng, ''=thêm, id=sửa
  const [themNhom, setThemNhom] = useState(false);
  /** Lọc theo hạn tạm trú. Chỉ có nghĩa ở màn hình diện tạm trú. */
  const [hanTamTru, setHanTamTru] = useState('');
  /** Chỉ hiện hồ sơ có dấu ⚠ trong ghi chú — dựng ra khi nhập hàng loạt. */
  const [canRaSoat, setCanRaSoat] = useState(false);

  // Ô tìm kiếm nằm trên thanh trên cùng, đăng ký gợi ý riêng cho màn hình này
  useEffect(() => {
    datManHinh({
      tieu_de: `${emoji} ${tieu_de}`,
      goi_y_tim: 'Tìm theo họ tên, số điện thoại, 4 số cuối CCCD…',
      nhanTim: () => setTrang(1),
    });
  }, [datManHinh, tieu_de, emoji]);

  const { data: toDanPho } = useQuery({
    queryKey: ['to-dan-pho'],
    queryFn: () => get<ToDanPho[]>('/cu-dan/to-dan-pho'),
    staleTime: 5 * 60_000,
  });

  const [tuoiTu, tuoiDen] = ({
    tre_em: ['0', '15'],
    thanh_nien: ['16', '35'],
    trung_nien: ['36', '60'],
    cao_tuoi: ['61', ''],
  }[doTuoi] ?? ['', '']) as [string, string];

  const thamSo = {
    q: timTuThanhTren,
    group_id: to,
    gender: gioiTinh,
    tuoi_tu: tuoiTu,
    tuoi_den: tuoiDen,
    // Lựa chọn của người dùng nằm TRONG khối, không thoát khỏi khoá của màn hình
    phan_loai: nhom || khoa.phan_loai || '',
    residence_status: khoa.residence_status ?? '',
    han_tam_tru: hanTamTru,
    can_ra_soat: canRaSoat ? 'true' : '',
    limit: moiTrang,
    offset: (trang - 1) * moiTrang,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['cu-dan', thamSo],
    queryFn: () => get<DanhSach<CuDan>>('/cu-dan' + qs(thamSo)),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const tongTrang = data ? Math.max(1, Math.ceil(data.tong_so / moiTrang)) : 1;

  // ── Chọn nhiều để xoá ─────────────────────────────────────────────────────
  // Chỉ Ban điều hành và Quản trị hệ thống (quyền resident:delete) mới thấy ô tick.
  const xoaDuoc = can('resident:delete');
  const qc = useQueryClient();
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [hoiXoa, setHoiXoa] = useState(false);
  const [lyDoXoa, setLyDoXoa] = useState('');
  const [ketQuaXoa, setKetQuaXoa] = useState('');

  // Đổi bộ lọc / trang thì bỏ chọn — tránh xoá nhầm người ở trang khác.
  useEffect(() => {
    setChon(new Set());
  }, [to, gioiTinh, nhom, doTuoi, hanTamTru, canRaSoat, trang, timTuThanhTren]);

  const trongTrang = items.map((r) => r.id);
  const chonHet = trongTrang.length > 0 && trongTrang.every((id) => chon.has(id));
  const doiChon = (id: string) =>
    setChon((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const doiChonHet = () =>
    setChon((s) => {
      const n = new Set(s);
      if (chonHet) trongTrang.forEach((id) => n.delete(id));
      else trongTrang.forEach((id) => n.add(id));
      return n;
    });

  const xoaHangLoat = useMutation({
    mutationFn: () =>
      post<{ da_xoa: number; loi_nhan: string }>('/cu-dan/xoa-hang-loat', {
        ids: [...chon],
        ly_do: lyDoXoa.trim() || null,
      }),
    onSuccess: (kq) => {
      setHoiXoa(false);
      setChon(new Set());
      setLyDoXoa('');
      setKetQuaXoa(kq.loi_nhan);
      void qc.invalidateQueries({ queryKey: ['cu-dan'] });
      void qc.invalidateQueries({ queryKey: ['ho-khau'] });
    },
  });

  // Màn hình đoàn thể: "thêm" nghĩa là ĐÁNH DẤU người có sẵn thuộc nhóm đang xem,
  // không phải khai sinh hồ sơ mới — bà con đã nằm trong sổ nhân khẩu rồi.
  const nhomDich = nhom_trong_khoi ? nhom || khoa.phan_loai || '' : '';
  const tenNhomDich = nhom_trong_khoi?.find((c) => c.code === nhomDich)?.name ?? 'nhóm này';
  const doiLoc = (dat: () => void) => {
    dat();
    setTrang(1);
  };

  return (
    <>
      <ThanhTieuDe
        tieu_de={tieu_de}
        mo_ta={mo_ta}
        so_loc_dang_bat={
          [to, gioiTinh, nhom, doTuoi, hanTamTru].filter(Boolean).length + (canRaSoat ? 1 : 0)
        }
        duoi={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Truong nhan="Tổ dân phố">
              <Select value={to} onChange={(e) => doiLoc(() => setTo(e.target.value))}>
                <option value="">Tất cả Tổ dân phố</option>
                {toDanPho?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.so_nhan_khau}){t.leader_name ? ` — ${t.leader_name}` : ''}
                  </option>
                ))}
              </Select>
            </Truong>

            <Truong nhan="Giới tính">
              <Select value={gioiTinh} onChange={(e) => doiLoc(() => setGioiTinh(e.target.value))}>
                <option value="">Tất cả Giới tính</option>
                {Object.entries(GIOI_TINH).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Truong>

            <Truong nhan="Độ tuổi">
              <Select value={doTuoi} onChange={(e) => doiLoc(() => setDoTuoi(e.target.value))}>
                <option value="">Tất cả độ tuổi</option>
                <option value="tre_em">Trẻ em (0–15)</option>
                <option value="thanh_nien">Thanh niên (16–35)</option>
                <option value="trung_nien">Trung niên (36–60)</option>
                <option value="cao_tuoi">Người cao tuổi (&gt;60)</option>
              </Select>
            </Truong>

            {khoa.residence_status === 'tam_tru' && (
              <Truong nhan="Hạn tạm trú">
                <Select
                  value={hanTamTru}
                  onChange={(e) => doiLoc(() => setHanTamTru(e.target.value))}
                >
                  <option value="">Tất cả</option>
                  <option value="qua_han">⚠ Đã quá hạn</option>
                  <option value="sap_het">Sắp hết trong 30 ngày</option>
                </Select>
              </Truong>
            )}

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={canRaSoat}
                  onChange={(e) => doiLoc(() => setCanRaSoat(e.target.checked))}
                  className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                />
                <span className="text-xs font-bold text-slate-600">⚠ Chỉ hồ sơ cần rà soát</span>
              </label>
            </div>

            <Truong nhan={nhom_trong_khoi ? 'Nhóm trong khối' : 'Đoàn thể & Nhóm chính sách'}>
              <Select value={nhom} onChange={(e) => doiLoc(() => setNhom(e.target.value))}>
                <option value="">
                  {nhom_trong_khoi ? 'Tất cả nhóm trong khối' : 'Tất cả nhóm xã hội'}
                </option>
                {nhom_trong_khoi?.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
                {!nhom_trong_khoi && <DanhMucNhom />}
              </Select>
            </Truong>
          </div>
        }
      >
        <ChonDangHien dang={dangHien} onDoi={doiDangHien} />
        {can('resident:write') && (
          <>
            <Button mau="luc" icon={FileSpreadsheet} onClick={() => xuatExcel(items, tieu_de)}>
              XUẤT EXCEL
            </Button>
            {nhomDich ? (
              <Button icon={UserRoundPlus} onClick={() => setThemNhom(true)}>
                THÊM VÀO NHÓM
              </Button>
            ) : (
              <Button icon={UserPlus} onClick={() => setForm('')}>
                THÊM NHÂN KHẨU
              </Button>
            )}
          </>
        )}
      </ThanhTieuDe>

      {!data ? (
        <Card>
          <Spinner label="Đang tải danh sách nhân khẩu…" />
        </Card>
      ) : items.length === 0 ? (
        <Rong
          emoji="👥"
          loi_nhan={
            timTuThanhTren || to || gioiTinh || nhom || doTuoi
              ? 'Không tìm thấy nhân khẩu nào khớp bộ lọc.'
              : `Chưa có nhân khẩu nào trong ${tieu_de.toLowerCase()}.`
          }
        >
          {can('resident:write') &&
            (nhomDich ? (
              <Button icon={UserRoundPlus} onClick={() => setThemNhom(true)}>
                THÊM NGƯỜI ĐẦU TIÊN VÀO NHÓM
              </Button>
            ) : (
              <Button icon={UserPlus} onClick={() => setForm('')}>
                THÊM NHÂN KHẨU ĐẦU TIÊN
              </Button>
            ))}
        </Rong>
      ) : (
        <>
          {ketQuaXoa && (
            <CanhBao loai="ok" emoji="🗑️">
              {ketQuaXoa}
            </CanhBao>
          )}

          {/* Thanh hành động — hiện khi đã tick chọn ai đó */}
          {xoaDuoc && chon.size > 0 && (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-rose-200 bg-rose-50/60 p-3">
              <span className="text-[12.5px] font-bold text-rose-900">
                Đã chọn {so(chon.size)} nhân khẩu
              </span>
              <div className="flex items-center gap-2">
                <Button mau="trang" icon={X} onClick={() => setChon(new Set())}>
                  BỎ CHỌN
                </Button>
                <Button mau="do" icon={Trash2} onClick={() => setHoiXoa(true)}>
                  XOÁ {so(chon.size)} NGƯỜI
                </Button>
              </div>
            </Card>
          )}

          {/* Điện thoại luôn dùng thẻ — bảng 10 cột phải kéo ngang mới thấy hết */}
          <div
            className={cx(
              'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-fadeIn text-xs',
              dangHien === 'bang' && 'lg:hidden',
            )}
          >
            {items.map((r) => (
              <TheCuDan key={r.id} r={r} onMo={() => setForm(r.id)} />
            ))}
          </div>

          {dangHien === 'bang' && (
            <div className="hidden lg:block">
              <KhungBang>
                <Bang className="min-w-[950px]">
                  <Thead>
                    <tr>
                      {xoaDuoc && (
                        <Th className="w-8">
                          <input
                            type="checkbox"
                            checked={chonHet}
                            onChange={doiChonHet}
                            title="Chọn tất cả trong trang này"
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-700 focus:ring-blue-400"
                          />
                        </Th>
                      )}
                      <Th>Họ và Tên</Th>
                      <Th>Mã hộ</Th>
                      <Th>Ngày sinh</Th>
                      <Th className="text-center">Tuổi</Th>
                      <Th>Giới tính</Th>
                      <Th>Số CCCD</Th>
                      <Th>Điện thoại</Th>
                      <Th>Địa chỉ cư trú</Th>
                      {khoa.residence_status === 'tam_tru' && <Th>Hạn tạm trú</Th>}
                      {cot_phan_loai && <Th>Diện chính sách</Th>}
                      <Th className="text-right">Quản lý</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {items.map((r) => (
                      <Tr
                        key={r.id}
                        onClick={() => setForm(r.id)}
                        className={cx('cursor-pointer', chon.has(r.id) && 'bg-blue-50/60')}
                        title="Bấm để mở hồ sơ nhân khẩu"
                      >
                        {xoaDuoc && (
                          <Td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={chon.has(r.id)}
                              onChange={() => doiChon(r.id)}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-700 focus:ring-blue-400"
                            />
                          </Td>
                        )}
                        <Td className="text-slate-900 font-semibold">
                          {r.full_name}
                          {r.is_head && (
                            <span className="ml-1.5 text-[9.5px] font-bold text-blue-800">
                              (Chủ hộ)
                            </span>
                          )}
                        </Td>
                        <Td className="text-slate-500 font-mono font-bold">
                          {r.ma_ho ? `#${r.ma_ho}` : <ChuaCapNhat />}
                        </Td>
                        <Td className="text-slate-800 font-mono">
                          {r.dob ? ngay(r.dob) : <ChuaCapNhat />}
                        </Td>
                        <Td className="text-center font-mono font-bold text-slate-800">
                          {r.tuoi ?? <ChuaCapNhat />}
                        </Td>
                        <Td className="text-slate-700">
                          {r.gender ? GIOI_TINH[r.gender] : <ChuaCapNhat />}
                        </Td>
                        <Td className="text-slate-600 font-mono tracking-wider font-semibold">
                          {r.id_card_last4 ? (
                            <>
                              <span className="text-slate-300">••••••••</span>
                              {r.id_card_last4}
                            </>
                          ) : (
                            <ChuaCapNhat />
                          )}
                        </Td>
                        <Td className="text-slate-800 font-mono">{r.phone || <ChuaCapNhat />}</Td>
                        <Td className="text-slate-600 truncate max-w-xs" title={r.dia_chi ?? ''}>
                          {r.dia_chi || <ChuaCapNhat />}
                        </Td>
                        {khoa.residence_status === 'tam_tru' && (
                          <Td className="whitespace-nowrap">
                            <HanTamTru den={r.tam_tru_den_ngay} con={r.con_ngay_tam_tru} />
                          </Td>
                        )}
                        {cot_phan_loai && (
                          <Td>
                            <div className="flex flex-wrap gap-1 max-w-[190px]">
                              {r.phan_loai.slice(0, 3).map((c) => (
                                <ChipMau key={c.code} color={c.color}>
                                  {c.name}
                                </ChipMau>
                              ))}
                              {r.phan_loai.length > 3 && (
                                <ChipMau color="#64748b">+{r.phan_loai.length - 3}</ChipMau>
                              )}
                              {r.phan_loai.length === 0 && <ChuaCapNhat />}
                            </div>
                          </Td>
                        )}
                        <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <NutIcon
                              icon={Eye}
                              mau="text-blue-700"
                              title="Xem hồ sơ nhân khẩu"
                              onClick={() => setForm(r.id)}
                            />
                            {can('resident:write') && (
                              <NutIcon
                                icon={Edit}
                                mau="text-amber-600"
                                title="Sửa hồ sơ"
                                onClick={() => setForm(r.id)}
                              />
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Bang>
              </KhungBang>
            </div>
          )}
        </>
      )}

      {data && data.tong_so > 0 && (
        <PhanTrang
          trang={trang}
          tong_trang={tongTrang}
          tong_ban_ghi={data.tong_so}
          moi_trang={moiTrang}
          don_vi="nhân khẩu"
          onDoi={setTrang}
          onDoiMoiTrang={(n) => {
            setMoiTrang(n);
            setTrang(1);
          }}
        />
      )}

      {isFetching && (
        <p className="text-center text-[10px] text-slate-400 font-semibold">Đang cập nhật…</p>
      )}

      {form !== null && <FormCuDan id={form || null} onClose={() => setForm(null)} />}

      {themNhom && nhomDich && (
        <ThemVaoNhom code={nhomDich} ten_nhom={tenNhomDich} onClose={() => setThemNhom(false)} />
      )}

      <XacNhan
        nhan_nut={`XOÁ ${so(chon.size)} NGƯỜI`}
        nhan_dang_lam="ĐANG XOÁ…"
        mo={hoiXoa}
        dong={() => setHoiXoa(false)}
        tieu_de="Xoá hàng loạt nhân khẩu"
        dang_lam={xoaHangLoat.isPending}
        loi_nhan={
          <div className="space-y-2.5">
            <p>
              Xoá <b>{so(chon.size)} nhân khẩu</b> đã chọn?
            </p>
            <p className="text-[10.5px] font-medium text-slate-400">
              Xoá mềm — hồ sơ vẫn nằm trong cơ sở dữ liệu và khôi phục được, không mất hẳn. Người
              đang là <b>chủ hộ</b> sẽ chưa bị xoá; xử lý hộ của họ trước rồi xoá sau. Mọi lượt xoá
              đều ghi vào nhật ký khu phố.
            </p>
            <Truong nhan="Lý do xoá" ghi_chu="Ghi vào nhật ký để sau này tra lại được">
              <Textarea
                value={lyDoXoa}
                onChange={(e) => setLyDoXoa(e.target.value)}
                placeholder="Trùng lặp, nhập nhầm, đã chuyển đi lâu…"
              />
            </Truong>
          </div>
        }
        onXacNhan={() => xoaHangLoat.mutate()}
      />
    </>
  );
}

/**
 * Hạn tạm trú: chữ đỏ khi đã quá, chữ hổ phách khi còn dưới 30 ngày.
 *
 * Số ngày do MÁY CHỦ tính (`con_ngay_tam_tru`), không tính ở trình duyệt — máy ở
 * khu phố hay sai giờ, mà đây là con số cán bộ dựa vào để đi nhắc bà con.
 */
function HanTamTru({ den, con }: { den?: string | null; con?: number | null }) {
  if (!den) return <ChuaCapNhat />;
  const qua = con != null && con < 0;
  const sap = con != null && con >= 0 && con < 30;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-bold',
        qua ? 'bg-rose-50 text-rose-700' : sap ? 'bg-amber-50 text-amber-700' : 'text-slate-600',
      )}
      title={qua ? 'Đã hết hạn, cần nhắc bà con đi gia hạn' : undefined}
    >
      <span className="font-mono">{ngay(den)}</span>
      {qua && <span>· quá {Math.abs(con!)} ngày</span>}
      {sap && <span>· còn {con} ngày</span>}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── Dạng thẻ ──── */

/**
 * Thẻ nhân khẩu — dạng gọn.
 *
 * Bản đầu bày mỗi trường một dòng "Nhãn: giá trị" nên một thẻ cao 10 dòng; cuộn
 * hết một trang 20 người mất cả chục lần vuốt. Ở đây gộp ngày sinh, tuổi, tổ vào
 * một dòng phụ — vẫn đủ thông tin để nhận ra người cần tìm, mà cao bằng một phần ba.
 *
 * Cả thẻ là một nút. Trước có hai biểu tượng 👁 và ✏️ nhưng cả hai gọi CÙNG một
 * hàm — hai nút giống hệt nhau, chỉ tổ làm ngón tay phải nhắm.
 */
function TheCuDan({ r, onMo }: { r: CuDan; onMo: () => void }) {
  const phu = [
    r.tuoi != null ? `${r.tuoi} tuổi` : null,
    r.dob ? ngay(r.dob) : null,
    r.to_dan_pho,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onMo}
      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs">
          {r.gender === 'nu' ? '👩' : '👨'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="truncate text-[12.5px] font-bold text-slate-900">{r.full_name}</h4>
            <span className="shrink-0 font-mono text-[9.5px] font-bold text-slate-400">
              {r.ma_ho ?? 'chưa gán hộ'}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[10.5px] font-medium text-slate-500">
            {phu.length ? phu.join(' · ') : <ChuaCapNhat />}
          </p>

          {r.phone && <p className="mt-0.5 font-mono text-[10.5px] text-slate-600">{r.phone}</p>}

          {r.tam_tru_den_ngay && (
            <p className="mt-1">
              <HanTamTru den={r.tam_tru_den_ngay} con={r.con_ngay_tam_tru} />
            </p>
          )}

          {r.note?.startsWith('⚠') && (
            <p className="mt-1 rounded-lg bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-800">
              {r.note}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
              {r.relation_to_head || (r.is_head ? 'Chủ hộ' : 'chưa rõ quan hệ')}
            </span>
            {r.phan_loai.map((c) => (
              <ChipMau key={c.code} color={c.color}>
                {c.name}
              </ChipMau>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────── Danh mục nhóm chung ──── */

function DanhMucNhom() {
  const { data } = useQuery({
    queryKey: ['phan-loai'],
    queryFn: () => get<PhanLoai[]>('/cu-dan/danh-muc/phan-loai'),
    staleTime: 30 * 60_000,
  });
  return (
    <>
      {data?.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </>
  );
}

/* ──────────────────────────────────────────────────────── Xuất Excel ──── */

/**
 * Xuất CSV mở được bằng Excel. Có BOM UTF-8 ở đầu file, thiếu nó thì Excel trên
 * Windows đọc tiếng Việt thành ký tự lạ — đây là lỗi thường gặp nhất khi cán bộ
 * gửi file cho phường.
 */
function xuatExcel(items: CuDan[], ten: string) {
  const cot = [
    'Họ và tên',
    'Mã hộ',
    'Ngày sinh',
    'Tuổi',
    'Giới tính',
    'CCCD (4 số cuối)',
    'Điện thoại',
    'Tổ dân phố',
    'Địa chỉ',
    'Diện chính sách',
  ];
  const o = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const dong = items.map((r) =>
    [
      r.full_name,
      r.ma_ho,
      r.dob ? ngay(r.dob) : '',
      r.tuoi,
      r.gender ? GIOI_TINH[r.gender] : '',
      r.id_card_last4,
      r.phone,
      r.to_dan_pho,
      r.dia_chi,
      r.phan_loai.map((c) => c.name).join('; '),
    ]
      .map(o)
      .join(','),
  );
  const csv = '﻿' + [cot.map(o).join(','), ...dong].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${ten.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
