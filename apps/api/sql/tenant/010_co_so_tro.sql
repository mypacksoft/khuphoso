-- ============================================================================
-- CƠ SỞ TRỌ / NHÀ CHO THUÊ / KIOT
--
-- Một "cơ sở trọ" là một địa điểm cho thuê ở (nhà trọ, nhà cho thuê, kiot…) có
-- CHỦ cơ sở và ĐỊA CHỈ. Các hộ (thường trú lẫn tạm trú) ở cùng địa chỉ được gom
-- về cơ sở qua cột `household.lodging_id`. Gán theo gợi ý địa chỉ trùng, hoặc tay.
--
-- Vì sao cần: quản lý tạm trú theo đầu cơ sở (chủ trọ chịu trách nhiệm khai báo),
-- nắm nhanh một địa chỉ đang có bao nhiêu hộ / bao nhiêu người, ai sắp hết hạn
-- tạm trú, và theo dõi riêng cơ sở có người nước ngoài theo quy định.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lodging (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code           text UNIQUE,                       -- để trống thì tự sinh CST-001…
    name           text NOT NULL,                     -- tên cơ sở (vd "Nhà trọ Bà Tư")
    owner_name     text,                              -- chủ cơ sở
    owner_phone    text,
    address        text,
    address_search text GENERATED ALWAYS AS (kp_unaccent(coalesce(address,''))) STORED,
    loai           text NOT NULL DEFAULT 'nha_tro'
                   CHECK (loai IN ('nha_tro','nha_cho_thue','kiot','khach_san','khac')),
    has_foreigner  boolean NOT NULL DEFAULT false,    -- cơ sở có người nước ngoài
    total_rooms    int,                               -- tổng số phòng (để tính phòng trống)
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    deleted_at     timestamptz
);

-- Hộ thuộc cơ sở trọ nào. ON DELETE SET NULL: xoá cứng cơ sở thì hộ chỉ mất liên
-- kết chứ không mất hộ. Thêm cột số phòng của hộ trong cơ sở (tuỳ chọn).
ALTER TABLE household ADD COLUMN IF NOT EXISTS lodging_id uuid REFERENCES lodging(id) ON DELETE SET NULL;
ALTER TABLE household ADD COLUMN IF NOT EXISTS room_no text;

CREATE INDEX IF NOT EXISTS ix_hh_lodging  ON household (lodging_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_lodging_addr ON lodging USING gin (address_search gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_touch_lodging ON lodging;
CREATE TRIGGER trg_touch_lodging BEFORE UPDATE ON lodging
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO schema_migration (filename) VALUES ('010_co_so_tro.sql') ON CONFLICT DO NOTHING;
