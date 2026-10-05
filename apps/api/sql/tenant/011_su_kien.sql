-- ============================================================================
-- SỰ KIỆN & DANH SÁCH KHÁCH MỜI
--
-- Sự kiện khu phố (tặng quà người cao tuổi, họp mặt, trung thu…). Điểm mạnh là
-- TỰ GOM danh sách khách mời bằng cách lọc cư dân theo độ tuổi từ–đến, giới tính,
-- đoàn thể, diện chính sách, tổ dân phố — thay vì gõ tay từng người.
--
-- Điểm danh và đánh dấu "đã nhận quà" nằm ngay trên danh sách khách.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE,
    name        text NOT NULL,
    event_type  text NOT NULL DEFAULT 'tang_qua'
                CHECK (event_type IN ('tang_qua','hop_mat','van_nghe','tuyen_truyen','khac')),
    starts_at   timestamptz,
    location    text,
    description text,
    gift_desc   text,                        -- mô tả quà / suất quà
    status      text NOT NULL DEFAULT 'sap_dien_ra'
                CHECK (status IN ('sap_dien_ra','da_dien_ra','da_huy')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,
    updated_by  uuid,
    deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS event_guest (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    resident_id   uuid NOT NULL REFERENCES resident(id) ON DELETE CASCADE,
    attended      boolean NOT NULL DEFAULT false,   -- đã điểm danh / có mặt
    gift_received boolean NOT NULL DEFAULT false,   -- đã nhận quà
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, resident_id)
);

CREATE INDEX IF NOT EXISTS ix_event_status ON event (status, starts_at)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_eguest_event ON event_guest (event_id);
CREATE INDEX IF NOT EXISTS ix_eguest_res   ON event_guest (resident_id);

DROP TRIGGER IF EXISTS trg_touch_event ON event;
CREATE TRIGGER trg_touch_event BEFORE UPDATE ON event
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO schema_migration (filename) VALUES ('011_su_kien.sql') ON CONFLICT DO NOTHING;
