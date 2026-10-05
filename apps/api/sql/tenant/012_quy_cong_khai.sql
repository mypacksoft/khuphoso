-- ============================================================================
-- CÔNG KHAI QUỸ KHU PHỐ
--
-- Thêm cờ `is_public` cho từng quỹ. Cán bộ tick "công khai" trong Quản lý quỹ thì
-- quỹ đó (số dư + các khoản chi gần đây) hiện trên CỔNG THÔNG TIN CƯ DÂN của khu
-- phố. Đây là quỹ CỦA KHU PHỐ, khác hoàn toàn quỹ nền tảng (minhbach.khuphoso.vn).
-- Mặc định KHÔNG công khai — khu phố tự quyết quỹ nào cho dân xem.
-- ============================================================================

ALTER TABLE fund ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

INSERT INTO schema_migration (filename) VALUES ('012_quy_cong_khai.sql') ON CONFLICT DO NOTHING;
