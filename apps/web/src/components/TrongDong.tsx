/**
 * Mặt trống đồng Đông Sơn — hoạ tiết nền, dựng theo mặt trống Ngọc Lũ.
 *
 * Vì sao vẽ bằng SVG chứ không dùng ảnh: hoạ tiết này chạy nền toàn màn hình ở
 * nhiều cỡ khác nhau, ảnh bitmap phóng to là vỡ; và cần đổi màu theo ngữ cảnh
 * (trắng trên nền tối ở màn đăng nhập, nâu nhạt trên sổ hộ khẩu) mà không phải
 * xuất nhiều tệp. Toàn bộ nét vẽ dùng `currentColor`.
 *
 * Các con số lấy theo hiện vật, không phải bịa:
 *   · ngôi sao giữa mặt trống có **14 cánh**
 *   · vành chim Lạc có **18 con**, bay **ngược chiều kim đồng hồ**
 *   · giữa các vành hoa văn là những vành chấm tròn và răng cưa
 *
 * Toạ độ tính trong hệ 0–400, tâm (200, 200).
 */

import { useMemo } from 'react';

const TAM = 200;
const SO_CANH_SAO = 14;
const SO_CHIM = 18;

const rad = (do_: number) => ((do_ - 90) * Math.PI) / 180;
const x = (r: number, d: number) => TAM + r * Math.cos(rad(d));
const y = (r: number, d: number) => TAM + r * Math.sin(rad(d));

/** Ngôi sao 14 cánh ở tâm mặt trống. */
function duongSao(rNgoai: number, rTrong: number): string {
  const buoc = 360 / SO_CANH_SAO;
  const d: string[] = [];
  for (let i = 0; i < SO_CANH_SAO; i++) {
    const dinh = i * buoc;
    d.push(
      `${i === 0 ? 'M' : 'L'}${x(rNgoai, dinh).toFixed(1)},${y(rNgoai, dinh).toFixed(1)}`,
      `L${x(rTrong, dinh + buoc / 2).toFixed(1)},${y(rTrong, dinh + buoc / 2).toFixed(1)}`,
    );
  }
  return d.join(' ') + ' Z';
}

/**
 * Chim Lạc: mỏ dài, cổ vươn, cánh giương, đuôi dài — nhìn nghiêng, bay ngang.
 * Vẽ trong hệ toạ độ riêng (dài ~38, cao ~12), gốc ở mũi mỏ.
 */
const CHIM_LAC =
  'M0,6.4 L13,4.6 C15.6,2.4 19.4,1.6 22.4,3.2 L25.2,0.4 L27.4,4.4 ' +
  'L33.6,2.2 L37.4,6.2 L33.4,9.4 L26.8,8.6 C22.6,10.8 16.8,10 13,8.2 Z';

/** Vành răng cưa — hoạ tiết ngăn giữa các vành hoa văn. */
function duongRangCua(r: number, cao: number, so: number): string {
  const buoc = 360 / so;
  const d: string[] = [];
  for (let i = 0; i < so; i++) {
    const a = i * buoc;
    d.push(
      `M${x(r, a).toFixed(1)},${y(r, a).toFixed(1)}`,
      `L${x(r + cao, a + buoc / 2).toFixed(1)},${y(r + cao, a + buoc / 2).toFixed(1)}`,
      `L${x(r, a + buoc).toFixed(1)},${y(r, a + buoc).toFixed(1)}`,
    );
  }
  return d.join(' ');
}

export function TrongDong({
  className,
  /** Vẽ nét mảnh hơn khi dùng làm nền mờ phía sau chữ. */
  net = 1.6,
}: {
  className?: string;
  net?: number;
}) {
  const sao = useMemo(() => duongSao(46, 17), []);
  const rangCuaTrong = useMemo(() => duongRangCua(62, 7, 28), []);
  const rangCuaNgoai = useMemo(() => duongRangCua(168, 9, 36), []);

  // Vành chấm tròn giữa sao và vành chim
  const chamTron = useMemo(() => {
    const ds: { cx: number; cy: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i * 360) / 24;
      ds.push({ cx: x(85, a), cy: y(85, a) });
    }
    return ds;
  }, []);

  // Vành 18 chim Lạc, bay ngược chiều kim đồng hồ
  const chim = useMemo(() => {
    const ds: { d: string; xoay: string }[] = [];
    const r = 128;
    for (let i = 0; i < SO_CHIM; i++) {
      const a = (i * 360) / SO_CHIM;
      // Xoay -90 để chim nằm ngang theo tiếp tuyến, thêm 180 để bay ngược chiều kim đồng hồ
      const goc = a + 180;
      ds.push({
        d: CHIM_LAC,
        xoay: `translate(${x(r, a).toFixed(1)},${y(r, a).toFixed(1)}) rotate(${goc.toFixed(1)}) translate(-19,-6)`,
      });
    }
    return ds;
  }, []);

  return (
    <svg
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
    >
      {/* Ngôi sao 14 cánh */}
      <path d={sao} fill="currentColor" stroke="none" />

      {/* Vành trong: răng cưa + hai đường tròn */}
      <circle cx={TAM} cy={TAM} r={56} strokeWidth={net} />
      <path d={rangCuaTrong} strokeWidth={net} strokeLinejoin="round" />
      <circle cx={TAM} cy={TAM} r={72} strokeWidth={net} />

      {/* Vành chấm tròn */}
      <circle cx={TAM} cy={TAM} r={78} strokeWidth={net * 0.7} />
      {chamTron.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={3.2} fill="currentColor" stroke="none" />
      ))}
      <circle cx={TAM} cy={TAM} r={92} strokeWidth={net * 0.7} />

      {/* Vành 18 chim Lạc */}
      <circle cx={TAM} cy={TAM} r={106} strokeWidth={net} />
      <g fill="currentColor" stroke="none">
        {chim.map((c, i) => (
          <path key={i} d={c.d} transform={c.xoay} />
        ))}
      </g>
      <circle cx={TAM} cy={TAM} r={150} strokeWidth={net} />

      {/* Vành ngoài: răng cưa + viền */}
      <path d={rangCuaNgoai} strokeWidth={net * 0.8} strokeLinejoin="round" />
      <circle cx={TAM} cy={TAM} r={182} strokeWidth={net} />
      <circle cx={TAM} cy={TAM} r={190} strokeWidth={net * 1.6} />
    </svg>
  );
}

/**
 * Hoạ tiết nền mờ — đặt sau nội dung, không chắn thao tác.
 *
 * Độ mờ để rất thấp: đây là phần mềm cán bộ đọc số liệu cả ngày, hoa văn đậm quá
 * thì chữ khó đọc và mỏi mắt. Trên màn hình nhỏ thì ẩn hẳn cho đỡ rối.
 */
export function NenTrongDong({
  className,
  cuong_do = 'mo',
}: {
  className?: string;
  cuong_do?: 'mo' | 'ro';
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className ?? ''}`}
    >
      <TrongDong
        net={2}
        className={
          cuong_do === 'ro'
            ? 'absolute top-1/2 left-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 opacity-[0.13]'
            : 'absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-[0.035]'
        }
      />
    </div>
  );
}
