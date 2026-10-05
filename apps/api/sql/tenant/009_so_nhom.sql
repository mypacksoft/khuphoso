-- ============================================================================
-- SỔ ĐOÀN VIÊN, HỘI VIÊN
--
-- Theo đề nghị của Đoàn Thanh niên khu phố: theo dõi chức vụ, ngày kết nạp, và
-- ai đã chuyển đi. Làm cho Đoàn trước nhưng đặt ở bảng nối `resident_classification`
-- nên Hội Phụ nữ, Cựu chiến binh, Người cao tuổi dùng chung được ngay.
--
-- VÌ SAO ĐẶT Ở BẢNG NỐI CHỨ KHÔNG PHẢI Ở `resident`.
-- `resident` đã có `org_position`, `org_join_date` — nhưng chỉ MỘT bộ cho cả
-- người. Một người vừa là đoàn viên vừa là hội viên Phụ nữ thì hai chức vụ khác
-- nhau, một cột không chứa nổi. Chức vụ là chuyện giữa NGƯỜI và NHÓM, nên nó
-- thuộc về chỗ nối hai thứ đó.
--
-- CHUYỂN ĐI KHÔNG XOÁ HỒ SƠ.
-- Đoàn viên chuyển đi thì không tính vào tổng số nữa, nhưng bản ghi vẫn còn để
-- tra lại: ai đã từng sinh hoạt, chuyển đi ngày nào, đi đâu. Xoá hẳn là mất luôn
-- lịch sử, mà lịch sử đó chính là thứ cần khi làm báo cáo cuối năm hay khi người
-- ta quay lại.
-- ============================================================================

ALTER TABLE resident_classification
    ADD COLUMN IF NOT EXISTS chuc_vu        text,
    ADD COLUMN IF NOT EXISTS ngay_ket_nap   date,
    ADD COLUMN IF NOT EXISTS trang_thai     text NOT NULL DEFAULT 'dang_sinh_hoat',
    ADD COLUMN IF NOT EXISTS ngay_chuyen_di date,
    ADD COLUMN IF NOT EXISTS noi_chuyen_den text,
    ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'resident_classification'::regclass
          AND conname = 'resident_classification_trang_thai_check'
    ) THEN
        ALTER TABLE resident_classification
            ADD CONSTRAINT resident_classification_trang_thai_check
            CHECK (trang_thai IN ('dang_sinh_hoat', 'da_chuyen_di', 'thoi_sinh_hoat'));
    END IF;
END $$;

-- Đếm "kết nạp năm nào" và lọc "ai còn sinh hoạt" là hai truy vấn chạy suốt
CREATE INDEX IF NOT EXISTS rc_trang_thai_idx
    ON resident_classification (classification_id, trang_thai);
CREATE INDEX IF NOT EXISTS rc_ket_nap_idx
    ON resident_classification (classification_id, ngay_ket_nap);

-- ── Cảm tình Đảng ───────────────────────────────────────────────────────────
--
-- Đoàn Thanh niên cần biết đoàn viên nào đang học lớp cảm tình Đảng. Đây là
-- thuộc tính của NGƯỜI, không phải của việc họ sinh hoạt Đoàn — nên làm một
-- nhóm riêng trong khối Chi bộ chứ không thêm cột vào bảng nối.
--
-- Nhờ vậy "đoàn viên sinh hoạt Đảng" cũng không cần cột mới: đó là người vừa ở
-- nhóm Đoàn Thanh niên vừa ở nhóm Đảng viên.
INSERT INTO classification (code, name, khoi, icon, is_sensitive, is_active, sort_order)
SELECT 'cam_tinh_dang', 'Cảm tình Đảng', 'chi_bo', '🌱', true, true,
       COALESCE((SELECT max(sort_order) FROM classification WHERE khoi = 'chi_bo'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM classification WHERE code = 'cam_tinh_dang');

INSERT INTO schema_migration (filename) VALUES ('009_so_nhom.sql') ON CONFLICT DO NOTHING;
