-- ============================================================================
-- THỰC HIỆN DÂN CHỦ Ở CƠ SỞ — Luật 10/2022/QH15
--
-- Ba việc khu phố bị kiểm tra:
--
--   1. CÔNG KHAI  — những nội dung bắt buộc phải cho dân biết, và đã công khai
--                   bằng hình thức nào, ngày nào.
--   2. BÀN VÀ QUYẾT ĐỊNH — hội nghị nhân dân, biểu quyết, ra quyết định của
--                   cộng đồng dân cư.
--   3. LƯU HỒ SƠ  — biên bản, số liệu biểu quyết, để khi thanh tra còn xuất ra.
--
-- ĐIỂM DỄ LÀM SAI NHẤT: đơn vị biểu quyết là ĐẠI DIỆN HỘ GIA ĐÌNH, không phải
-- đầu người. Một hộ 9 người vẫn chỉ một phiếu. Và tỉ lệ tán thành tính trên TỔNG
-- SỐ HỘ của địa bàn, không phải trên số hộ có mặt tại hội nghị — hội nghị đông
-- hay vắng không làm thay đổi mẫu số.
--
-- Vì thế `tong_so_ho` được CHỐT LẠI vào lúc mở hội nghị chứ không đếm động: số hộ
-- thay đổi hằng ngày, mà kết quả biểu quyết đã ghi thì không được đổi theo.
-- ============================================================================

-- ── HỘI NGHỊ NHÂN DÂN ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hoi_nghi (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    title         text NOT NULL,
    title_search  text GENERATED ALWAYS AS (kp_unaccent(title)) STORED,
    -- Phạm vi: cả khu phố, hay chỉ một tổ dân phố
    group_id      uuid REFERENCES neighborhood_group(id),

    thoi_gian     timestamptz,
    dia_diem      text,
    chu_tri       text,
    thu_ky        text,

    -- Chốt tại thời điểm mở hội nghị. Xem chú thích đầu file.
    tong_so_ho    int NOT NULL DEFAULT 0,
    so_ho_du      int NOT NULL DEFAULT 0,

    -- Hội nghị chỉ tiến hành được khi đủ tỉ lệ đại diện hộ tham dự.
    -- Để cấu hình được vì có loại việc đòi tỉ lệ cao hơn.
    ty_le_du_toi_thieu numeric(5,2) NOT NULL DEFAULT 50,

    trang_thai    text NOT NULL DEFAULT 'chuan_bi'
                  CHECK (trang_thai IN ('chuan_bi','dang_hop','da_hop','huy')),
    noi_dung      text,        -- chương trình nghị sự
    bien_ban      text,        -- biên bản sau khi họp

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS hoi_nghi_thoi_gian_idx
    ON hoi_nghi (thoi_gian DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS hoi_nghi_tim_idx
    ON hoi_nghi USING gin (title_search gin_trgm_ops);

DROP TRIGGER IF EXISTS hoi_nghi_touch ON hoi_nghi;
CREATE TRIGGER hoi_nghi_touch BEFORE UPDATE ON hoi_nghi
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ── NỘI DUNG ĐƯA RA BIỂU QUYẾT ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS noi_dung_bieu_quyet (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hoi_nghi_id  uuid NOT NULL REFERENCES hoi_nghi(id) ON DELETE CASCADE,

    title        text NOT NULL,
    mo_ta        text,
    -- Hình thức lấy ý kiến. Phát phiếu tới từng hộ thì không cần họp.
    hinh_thuc    text NOT NULL DEFAULT 'gio_tay'
                 CHECK (hinh_thuc IN ('gio_tay','phieu_kin','phieu_tung_ho','truc_tuyen')),

    -- Số phiếu, tính theo ĐẠI DIỆN HỘ
    tan_thanh    int NOT NULL DEFAULT 0,
    khong_tan_thanh int NOT NULL DEFAULT 0,
    khong_y_kien int NOT NULL DEFAULT 0,

    -- Tỉ lệ tán thành tối thiểu trên TỔNG SỐ HỘ để thông qua.
    -- Mặc định trên 50%. Việc về đóng góp hoặc hương ước có thể đòi cao hơn,
    -- nên để khu phố tự đặt theo văn bản hướng dẫn của phường.
    ty_le_yeu_cau numeric(5,2) NOT NULL DEFAULT 50,

    ket_qua      text,         -- ghi chú thêm của thư ký
    sort_order   int NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ndbq_hoi_nghi_idx ON noi_dung_bieu_quyet (hoi_nghi_id, sort_order);


-- ── BẢNG KIỂM NỘI DUNG PHẢI CÔNG KHAI ────────────────────────────────────────
--
-- Không viết cứng danh sách trong mã: nội dung phải công khai thay đổi theo văn
-- bản hướng dẫn của phường và của từng thời kỳ. Để trong bảng thì khu phố tự
-- thêm bớt được mà không cần đợi bản cập nhật phần mềm.
CREATE TABLE IF NOT EXISTS noi_dung_cong_khai (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    title        text NOT NULL,
    mo_ta        text,
    nhom         text,          -- ngân sách, quy hoạch, chính sách…
    bat_buoc     boolean NOT NULL DEFAULT true,

    -- Đã công khai chưa, bằng cách nào
    da_cong_khai boolean NOT NULL DEFAULT false,
    hinh_thuc    text,          -- niêm yết | hội nghị | loa truyền thanh | zalo | trang tin
    ngay_cong_khai date,
    nguoi_thuc_hien text,
    ghi_chu      text,

    -- Bao lâu phải công khai lại. NULL nghĩa là công khai một lần là xong.
    dinh_ky_thang int,

    sort_order   int NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS ndck_idx ON noi_dung_cong_khai (sort_order)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS ndck_touch ON noi_dung_cong_khai;
CREATE TRIGGER ndck_touch BEFORE UPDATE ON noi_dung_cong_khai
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ── Danh mục gợi ý theo Luật 10/2022 ─────────────────────────────────────────
-- Khu phố sửa lại cho khớp hướng dẫn của phường mình. Đây chỉ là điểm khởi đầu
-- để không phải gõ từ con số không.
INSERT INTO noi_dung_cong_khai (title, nhom, mo_ta, dinh_ky_thang, sort_order) VALUES
 ('Kế hoạch phát triển kinh tế - xã hội của khu phố', 'ke_hoach',
  'Kế hoạch và kết quả thực hiện hằng năm', 12, 1),
 ('Dự toán, quyết toán ngân sách khu phố', 'ngan_sach',
  'Số thu chi của khu phố trong kỳ', 6, 2),
 ('Các khoản huy động nhân dân đóng góp', 'ngan_sach',
  'Mức đóng góp, đối tượng, và kết quả sử dụng từng khoản', 6, 3),
 ('Kết quả thu chi các loại quỹ', 'ngan_sach',
  'Quỹ hoạt động, Vì người nghèo, Đền ơn đáp nghĩa, Phòng chống thiên tai', 6, 4),
 ('Quy hoạch, kế hoạch sử dụng đất trên địa bàn', 'quy_hoach',
  'Nội dung liên quan trực tiếp tới khu phố', NULL, 5),
 ('Phương án bồi thường, hỗ trợ, tái định cư', 'quy_hoach',
  'Khi có dự án thu hồi đất trên địa bàn', NULL, 6),
 ('Đối tượng và mức hưởng chính sách xã hội', 'chinh_sach',
  'Hộ nghèo, cận nghèo, người có công, bảo trợ xã hội', 12, 7),
 ('Danh sách hộ nghèo, hộ cận nghèo', 'chinh_sach',
  'Sau mỗi kỳ rà soát', 12, 8),
 ('Kết quả tiếp thu ý kiến của nhân dân', 'dan_chu',
  'Những việc dân đã góp ý và cách xử lý', 6, 9),
 ('Hương ước, quy ước của khu phố', 'dan_chu',
  'Nội dung đang có hiệu lực', NULL, 10),
 ('Kết quả bình xét gia đình văn hoá, khu phố văn hoá', 'dan_chu',
  'Danh sách và tiêu chí bình xét', 12, 11),
 ('Nhiệm vụ, quyền hạn của cán bộ khu phố', 'to_chuc',
  'Ai phụ trách việc gì, liên hệ ở đâu', NULL, 12),
 ('Kết quả thanh tra, kiểm tra, giải quyết khiếu nại tố cáo', 'giam_sat',
  'Vụ việc liên quan tới khu phố', 6, 13),
 ('Kết quả lấy phiếu tín nhiệm với chức danh do nhân dân bầu', 'giam_sat',
  'Theo kỳ lấy phiếu', NULL, 14)
ON CONFLICT DO NOTHING;

INSERT INTO schema_migration (filename) VALUES ('007_dan_chu.sql') ON CONFLICT DO NOTHING;
