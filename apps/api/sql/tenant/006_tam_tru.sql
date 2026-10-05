-- ============================================================================
-- THỜI HẠN TẠM TRÚ
--
-- Đăng ký tạm trú có thời hạn (Luật Cư trú 2020: tối đa 2 năm, gia hạn được).
-- Hết hạn mà không gia hạn thì việc cư trú không còn được đăng ký — cán bộ khu phố
-- phải nắm để nhắc bà con đi gia hạn, và để biết con số tạm trú thực tế trên địa bàn.
--
-- Trước đây không có cột này nên 9.855 người tạm trú trong sổ đều "vô thời hạn",
-- không cách nào biết ai sắp hết hạn.
--
-- Chỉ áp cho `residence_status = 'tam_tru'`. Không đặt CHECK ràng buộc cứng: người
-- chuyển từ tạm trú sang thường trú vẫn nên giữ lại ngày hết hạn cũ để tra cứu
-- lịch sử, ràng buộc cứng sẽ chặn mất việc đó.
-- ============================================================================

ALTER TABLE resident
    ADD COLUMN IF NOT EXISTS tam_tru_tu_ngay  date,
    ADD COLUMN IF NOT EXISTS tam_tru_den_ngay date;

-- Chuông nhắc quét theo cột này mỗi lần mở ứng dụng, nên phải có chỉ mục.
-- Chỉ mục một phần: chỉ người tạm trú còn hồ sơ mới cần quét.
CREATE INDEX IF NOT EXISTS resident_tam_tru_han_idx
    ON resident (tam_tru_den_ngay)
    WHERE deleted_at IS NULL
      AND residence_status = 'tam_tru'
      AND tam_tru_den_ngay IS NOT NULL;

INSERT INTO schema_migration (filename) VALUES ('006_tam_tru.sql') ON CONFLICT DO NOTHING;
