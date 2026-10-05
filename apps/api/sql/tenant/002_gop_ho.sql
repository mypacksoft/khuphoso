-- ============================================================================
-- ĐỊA CHỈ VÀ TÊN CHỦ HỘ KHAI TRÊN NHÂN KHẨU
--
-- Nhân khẩu lấy địa chỉ TỪ hộ. Nhưng dữ liệu nhập từ sổ giấy thì ngược lại: có
-- địa chỉ và tên chủ hộ của từng người trước, chưa có hộ nào cả. Hai cột này giữ
-- lại phần khai ban đầu để về sau gom được thành hộ.
--
-- Sau khi nhân khẩu đã được gán vào hộ, địa chỉ chính thức là địa chỉ của HỘ;
-- hai cột này chỉ còn giá trị đối chiếu.
-- ============================================================================

ALTER TABLE resident
    ADD COLUMN IF NOT EXISTS dia_chi_khai     text,
    ADD COLUMN IF NOT EXISTS ten_chu_ho_khai  text;

COMMENT ON COLUMN resident.dia_chi_khai IS
    'Địa chỉ người này khai lúc nhập liệu, dùng để gom thành hộ khi chưa có mã hộ';
COMMENT ON COLUMN resident.ten_chu_ho_khai IS
    'Tên chủ hộ người này khai. Bắt buộc với tạm trú: một địa chỉ trọ có nhiều hộ';

-- Tra nhanh "ai chưa được gán hộ" — truy vấn chạy mỗi lần mở màn hình gom hộ
CREATE INDEX IF NOT EXISTS resident_chua_co_ho_idx
    ON resident (residence_status)
    WHERE deleted_at IS NULL AND household_id IS NULL;

-- Tìm theo địa chỉ khai, không dấu
CREATE INDEX IF NOT EXISTS resident_dia_chi_khai_idx
    ON resident USING gin (kp_unaccent(coalesce(dia_chi_khai, '')) gin_trgm_ops);

INSERT INTO schema_migration (filename) VALUES ('002_gop_ho.sql') ON CONFLICT DO NOTHING;
