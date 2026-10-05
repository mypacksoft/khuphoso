-- KhuPhoSo — Phân hệ cư dân, hộ khẩu, tổ dân phố
-- Mọi bảng đều có tenant_id và bật RLS (xem C.2, PHẦN G)

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent phải IMMUTABLE mới dùng được trong cột sinh và index
CREATE OR REPLACE FUNCTION kp_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT lower(public.unaccent('public.unaccent', $1)) $$;

-- ============================================================
-- TỔ DÂN PHỐ
-- ============================================================
CREATE TABLE IF NOT EXISTS neighborhood_group (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    code        text NOT NULL,
    name        text NOT NULL,
    leader_name text,
    phone       text,
    note        text,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (tenant_id, code)
);

-- ============================================================
-- HỘ GIA ĐÌNH
-- ============================================================
CREATE TABLE IF NOT EXISTS household (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    code            text NOT NULL,                -- 3-012 : tổ 3, hộ 12
    group_id        uuid REFERENCES neighborhood_group(id),
    head_resident_id uuid,                        -- FK thêm sau khi có bảng resident
    address         text,
    address_search  text GENERATED ALWAYS AS (kp_unaccent(coalesce(address,''))) STORED,
    addr_house_no   text,
    addr_alley      text,
    addr_street     text,
    phone           text,
    residence_type  text,                          -- so_huu | thue | o_nho
    note            text,
    -- ĐỊNH VỊ (xem PHẦN F)
    geom            geography(Point,4326),
    geo_status      text NOT NULL DEFAULT 'pending'
                    CHECK (geo_status IN ('pending','auto','verified','manual','failed')),
    geo_source      text,
    geo_accuracy_m  numeric(8,1),
    geo_confidence  numeric(4,3),
    geo_updated_at  timestamptz,
    geo_updated_by  uuid,
    geo_note        text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    UNIQUE (tenant_id, code)
);

-- ============================================================
-- CƯ DÂN
-- ============================================================
CREATE TABLE IF NOT EXISTS resident (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    household_id      uuid REFERENCES household(id) ON DELETE SET NULL,
    group_id          uuid REFERENCES neighborhood_group(id),

    full_name         text NOT NULL,
    full_name_search  text GENERATED ALWAYS AS (kp_unaccent(full_name)) STORED,
    dob               date,
    gender            text CHECK (gender IN ('nam','nu','khac')),

    -- CCCD: mã hoá, chỉ giữ 4 số cuối dạng rõ để tra cứu (PHẦN G.4)
    id_card_enc       bytea,
    id_card_last4     text,
    id_card_hash      text,                        -- SHA-256, để phát hiện trùng

    relation_to_head  text,                        -- chu_ho | vo_chong | con | cha_me | khac
    residence_status  text NOT NULL DEFAULT 'thuong_tru'
                      CHECK (residence_status IN ('thuong_tru','tam_tru','tam_vang','vang_lai')),
    phone             text,
    email             text,
    occupation        text,
    ethnicity         text,                        -- nhạy cảm — mặc định không thu
    religion          text,                        -- nhạy cảm — mặc định không thu
    education_level   text,
    note              text,
    is_head           boolean NOT NULL DEFAULT false,

    -- Công tác Đảng (dữ liệu nhạy cảm: quan điểm chính trị — quyền riêng)
    party_join_date     date,
    party_official_date date,
    party_position      text,
    party_status        text,
    -- Đoàn thể
    org_join_date     date,
    org_position      text,
    org_status        text,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    deleted_at        timestamptz
);

ALTER TABLE household
    DROP CONSTRAINT IF EXISTS household_head_fk,
    ADD CONSTRAINT household_head_fk
        FOREIGN KEY (head_resident_id) REFERENCES resident(id) ON DELETE SET NULL;

-- ============================================================
-- PHÂN LOẠI (thay cho mảng classifications[] của bản cũ)
-- ============================================================
CREATE TABLE IF NOT EXISTS classification (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,   -- NULL = danh mục hệ thống
    code        text NOT NULL,
    name        text NOT NULL,
    category    text,                                            -- dang|chinh_sach|doan_the|khac
    color       text,
    icon        text,
    is_sensitive boolean NOT NULL DEFAULT false,
    sort_order  int NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS resident_classification (
    resident_id       uuid NOT NULL REFERENCES resident(id) ON DELETE CASCADE,
    classification_id uuid NOT NULL REFERENCES classification(id) ON DELETE CASCADE,
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    valid_from        date,
    valid_to          date,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (resident_id, classification_id)
);

-- ============================================================
-- TẶNG QUÀ / CHĂM LO (thay cho giftHistory jsonb của bản cũ)
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_record (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    resident_id   uuid REFERENCES resident(id) ON DELETE CASCADE,
    household_id  uuid REFERENCES household(id) ON DELETE CASCADE,
    period        text NOT NULL,                  -- 2026-01 hoặc 2026-TET
    gift_type     text,
    description   text,
    amount        numeric(14,0),
    source        text,
    delivered_at  timestamptz,
    delivered_by  text,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_res_tenant     ON resident (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_group      ON resident (tenant_id, group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_household  ON resident (household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_dob        ON resident (tenant_id, dob) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_status     ON resident (tenant_id, residence_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_name_trgm  ON resident USING gin (full_name_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_res_idhash     ON resident (tenant_id, id_card_hash) WHERE id_card_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_hh_tenant      ON household (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_hh_group       ON household (tenant_id, group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_hh_geom        ON household USING gist (geom);
CREATE INDEX IF NOT EXISTS ix_hh_geostatus   ON household (tenant_id, geo_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_hh_addr_trgm   ON household USING gin (address_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rc_class       ON resident_classification (tenant_id, classification_id);
CREATE INDEX IF NOT EXISTS ix_gift_period    ON gift_record (tenant_id, period);

-- ============================================================
-- ROW-LEVEL SECURITY — lớp phòng thủ cuối cùng
-- Kể cả khi lập trình viên quên WHERE tenant_id, Postgres vẫn chặn.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['neighborhood_group','household','resident',
                           'resident_classification','gift_record'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id())
       WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- classification có hàng hệ thống (tenant_id NULL) nên policy khác một chút
ALTER TABLE classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON classification;
CREATE POLICY tenant_isolation ON classification
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- TRIGGER updated_at
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['neighborhood_group','household','resident'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- DANH MỤC PHÂN LOẠI MẶC ĐỊNH
-- ============================================================
INSERT INTO classification (tenant_id, code, name, category, color, is_sensitive, sort_order) VALUES
 (NULL,'dang_vien',        'Đảng viên',              'dang',       '#ef4444', true,  1),
 (NULL,'cuu_chien_binh',   'Cựu chiến binh',         'doan_the',   '#f59e0b', false, 2),
 (NULL,'nguoi_cao_tuoi',   'Người cao tuổi',         'chinh_sach', '#8b5cf6', false, 3),
 (NULL,'phu_nu',           'Hội Phụ nữ',             'doan_the',   '#ec4899', false, 4),
 (NULL,'doan_thanh_nien',  'Đoàn Thanh niên',        'doan_the',   '#06b6d4', false, 5),
 (NULL,'ho_ngheo',         'Hộ nghèo',               'chinh_sach', '#dc2626', true,  6),
 (NULL,'ho_can_ngheo',     'Hộ cận nghèo',           'chinh_sach', '#f97316', true,  7),
 (NULL,'nguoi_co_cong',    'Người có công',          'chinh_sach', '#eab308', true,  8),
 (NULL,'gia_dinh_chinh_sach','Gia đình chính sách',  'chinh_sach', '#84cc16', true,  9),
 (NULL,'khuyet_tat',       'Người khuyết tật',       'chinh_sach', '#0ea5e9', true, 10),
 (NULL,'tre_em',           'Trẻ em',                 'chinh_sach', '#22d3ee', false,11),
 (NULL,'me_viet_nam_ah',   'Mẹ Việt Nam Anh hùng',   'chinh_sach', '#f43f5e', true, 12)
ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

-- Nhân bản danh mục cho tenant đã có
INSERT INTO classification (tenant_id, code, name, category, color, is_sensitive, sort_order)
SELECT t.id, c.code, c.name, c.category, c.color, c.is_sensitive, c.sort_order
FROM tenant t CROSS JOIN classification c
WHERE c.tenant_id IS NULL AND t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO schema_migration (filename) VALUES ('004_residents.sql') ON CONFLICT DO NOTHING;
