-- ============================================================================
-- ẢNH SỰ KIỆN (thumbnail) & BANNER CỔNG (slider nhiều ảnh)
--
-- event.image_name: ảnh thumbnail của sự kiện (lưu E:\QLKP\data\su-kien\<slug>).
-- portal_banner: nhiều ảnh banner chạy slider ở đầu trang cổng
--                (lưu E:\QLKP\data\banner\<slug>).
-- ============================================================================

ALTER TABLE event ADD COLUMN IF NOT EXISTS image_name text;

CREATE TABLE IF NOT EXISTS portal_banner (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_goc     text,
    ten_luu     text NOT NULL UNIQUE,
    kieu        text,
    kich_thuoc  bigint NOT NULL,
    sort_order  int NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid
);

INSERT INTO schema_migration (filename) VALUES ('015_anh_su_kien_banner.sql') ON CONFLICT DO NOTHING;
