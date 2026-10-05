-- ============================================================================
-- FILE ĐÍNH KÈM BIỂU MẪU
--
-- Mỗi biểu mẫu có thể có NHIỀU file tải về (doc, docx, pdf, xls…). File lưu trên
-- đĩa máy chủ (E:\QLKP\data\bieu-mau\<slug>), phục vụ tải công khai trên cổng dân.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bieu_mau_file (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bieu_mau_id uuid NOT NULL REFERENCES bieu_mau(id) ON DELETE CASCADE,
    ten_goc     text NOT NULL,
    ten_luu     text NOT NULL UNIQUE,
    kieu        text,
    kich_thuoc  bigint NOT NULL,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid
);

CREATE INDEX IF NOT EXISTS ix_bmf_bieu_mau ON bieu_mau_file (bieu_mau_id);

INSERT INTO schema_migration (filename) VALUES ('014_bieu_mau_file.sql') ON CONFLICT DO NOTHING;
