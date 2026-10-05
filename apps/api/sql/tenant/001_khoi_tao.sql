-- ============================================================================
-- LƯỢC ĐỒ CỦA MỘT KHU PHỐ
--
-- File này chạy trên database `kp_<slug>` — mỗi khu phố một database riêng.
-- Vì vậy ở đây KHÔNG có cột `tenant_id` và KHÔNG cần RLS: dữ liệu khu phố khác
-- nằm ở database khác, truy vấn viết sai cũng không chạm tới được.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS schema_migration (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION kp_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT lower(public.unaccent('public.unaccent', $1)) $$;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============================================================
-- TỔ DÂN PHỐ
-- ============================================================
CREATE TABLE IF NOT EXISTS neighborhood_group (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE NOT NULL,
    name        text NOT NULL,
    leader_name text,
    phone       text,
    note        text,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

-- ============================================================
-- HỘ GIA ĐÌNH
-- ============================================================
CREATE TABLE IF NOT EXISTS household (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text UNIQUE NOT NULL,          -- 3-012
    group_id         uuid REFERENCES neighborhood_group(id),
    head_resident_id uuid,
    address          text,
    address_search   text GENERATED ALWAYS AS (kp_unaccent(coalesce(address,''))) STORED,
    addr_house_no    text,
    addr_alley       text,
    addr_street      text,
    phone            text,
    -- Diện cư trú của HỘ: hộ khẩu thường trú hay hộ tạm trú
    household_type   text NOT NULL DEFAULT 'thuong_tru'
                     CHECK (household_type IN ('thuong_tru','tam_tru')),
    residence_type   text,                           -- so_huu | thue | o_nho
    note             text,
    geom             geography(Point,4326),
    geo_status       text NOT NULL DEFAULT 'pending'
                     CHECK (geo_status IN ('pending','auto','verified','manual','failed')),
    geo_source       text,
    geo_accuracy_m   numeric(8,1),
    geo_confidence   numeric(4,3),
    geo_updated_at   timestamptz,
    geo_updated_by   uuid,
    geo_note         text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    deleted_at       timestamptz
);

-- ============================================================
-- CƯ DÂN
-- ============================================================
CREATE TABLE IF NOT EXISTS resident (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id      uuid REFERENCES household(id) ON DELETE SET NULL,
    group_id          uuid REFERENCES neighborhood_group(id),

    full_name         text NOT NULL,
    full_name_search  text GENERATED ALWAYS AS (kp_unaccent(full_name)) STORED,
    dob               date,
    gender            text CHECK (gender IN ('nam','nu','khac')),

    id_card_enc       bytea,      -- số CCCD, mã hoá pgcrypto
    id_card_last4     text,
    id_card_hash      text,

    relation_to_head  text,
    residence_status  text NOT NULL DEFAULT 'thuong_tru'
                      CHECK (residence_status IN ('thuong_tru','tam_tru','tam_vang','vang_lai')),
    phone             text,
    email             text,
    occupation        text,
    ethnicity         text,
    religion          text,
    education_level   text,
    note              text,
    is_head           boolean NOT NULL DEFAULT false,

    party_join_date     date,
    party_official_date date,
    party_position      text,
    party_status        text,
    org_join_date     date,
    org_position      text,
    org_status        text,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    deleted_at        timestamptz
);

ALTER TABLE household DROP CONSTRAINT IF EXISTS household_head_fk;
ALTER TABLE household ADD CONSTRAINT household_head_fk
    FOREIGN KEY (head_resident_id) REFERENCES resident(id) ON DELETE SET NULL;

-- ============================================================
-- PHÂN LOẠI / DIỆN CHÍNH SÁCH
-- ============================================================
CREATE TABLE IF NOT EXISTS classification (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code         text UNIQUE NOT NULL,
    name         text NOT NULL,
    khoi         text,       -- chi_bo | chinh_quyen | doan_the | chinh_sach | nhom_khac
    color        text,
    icon         text,
    is_sensitive boolean NOT NULL DEFAULT false,
    sort_order   int NOT NULL DEFAULT 0,
    is_active    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS resident_classification (
    resident_id       uuid NOT NULL REFERENCES resident(id) ON DELETE CASCADE,
    classification_id uuid NOT NULL REFERENCES classification(id) ON DELETE CASCADE,
    valid_from        date,
    valid_to          date,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (resident_id, classification_id)
);

CREATE TABLE IF NOT EXISTS gift_record (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id   uuid REFERENCES resident(id) ON DELETE CASCADE,
    household_id  uuid REFERENCES household(id) ON DELETE CASCADE,
    period        text NOT NULL,
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
-- SỔ QUỸ CỦA KHU PHỐ
-- ============================================================
CREATE TABLE IF NOT EXISTS fund (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text UNIQUE NOT NULL,
    name            text NOT NULL,
    fund_type       text NOT NULL DEFAULT 'hoat_dong',
    description     text,
    bank_name       text,
    bank_account    text,
    bank_holder     text,
    opening_balance numeric(16,0) NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    deleted_at      timestamptz
);

CREATE TABLE IF NOT EXISTS fund_campaign (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id              uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    name                 text NOT NULL,
    period               text,
    per_household_amount numeric(14,0),
    target_amount        numeric(16,0),
    start_date           date,
    end_date             date,
    status               text NOT NULL DEFAULT 'dang_thu'
                         CHECK (status IN ('nhap','dang_thu','da_dong','quyet_toan')),
    note                 text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    deleted_at           timestamptz
);

CREATE TABLE IF NOT EXISTS fund_receipt (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id        uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    campaign_id    uuid REFERENCES fund_campaign(id) ON DELETE SET NULL,
    household_id   uuid REFERENCES household(id) ON DELETE SET NULL,
    resident_id    uuid REFERENCES resident(id) ON DELETE SET NULL,
    payer_name     text,
    amount         numeric(14,0) NOT NULL DEFAULT 0,
    method         text NOT NULL DEFAULT 'tien_mat'
                   CHECK (method IN ('tien_mat','chuyen_khoan','vietqr')),
    status         text NOT NULL DEFAULT 'da_dong'
                   CHECK (status IN ('chua_dong','da_dong','mien_giam')),
    exempt_reason  text,
    receipt_number text,
    paid_at        timestamptz,
    collected_by   text,
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid
);

CREATE TABLE IF NOT EXISTS fund_expense (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id        uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    amount         numeric(14,0) NOT NULL CHECK (amount > 0),
    category       text,
    description    text NOT NULL,
    payee          text,
    voucher_number text,
    approved_by    text,
    approved_at    timestamptz,
    paid_at        timestamptz NOT NULL DEFAULT now(),
    attachment_id  uuid,
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid
);

-- ============================================================
-- NHẬT KÝ KIỂM TOÁN — của chính khu phố này
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id            bigserial PRIMARY KEY,
    actor_user_id uuid,           -- id ở CSDL nền tảng
    actor_name    text,
    ho_tro        boolean NOT NULL DEFAULT false,  -- người của nền tảng vào hỗ trợ
    action        text NOT NULL,
    module        text,
    entity_type   text,
    entity_id     text,
    changes       jsonb,
    ip            inet,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_res_group     ON resident (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_household ON resident (household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_dob       ON resident (dob) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_status    ON resident (residence_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_res_name      ON resident USING gin (full_name_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_res_idhash    ON resident (id_card_hash) WHERE id_card_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_hh_group      ON household (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_hh_geom       ON household USING gist (geom);
CREATE INDEX IF NOT EXISTS ix_hh_geostatus  ON household (geo_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_hh_addr       ON household USING gin (address_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_hh_type       ON household (household_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_rc_class      ON resident_classification (classification_id);
CREATE INDEX IF NOT EXISTS ix_gift_period   ON gift_record (period);
CREATE INDEX IF NOT EXISTS ix_frec_fund     ON fund_receipt (fund_id);
CREATE INDEX IF NOT EXISTS ix_frec_camp     ON fund_receipt (campaign_id, status);
CREATE INDEX IF NOT EXISTS ix_fexp_fund     ON fund_expense (fund_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_time    ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_actor   ON audit_log (actor_user_id, created_at DESC);

-- ============================================================
-- TRIGGER
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['neighborhood_group','household','resident','fund'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- DỮ LIỆU KHỞI TẠO
-- ============================================================
INSERT INTO classification (code, name, khoi, color, is_sensitive, sort_order) VALUES
 ('dang_vien',          'Đảng viên',              'chi_bo',     '#ef4444', true,  1),
 ('ban_dieu_hanh',      'Ban điều hành khu phố',  'chinh_quyen','#2563eb', false, 2),
 ('to_truong',          'Tổ trưởng dân phố',      'chinh_quyen','#1d4ed8', false, 3),
 ('ban_cong_tac',       'Ban Công tác Mặt trận',  'doan_the',   '#059669', false, 4),
 ('phu_nu',             'Hội Phụ nữ',             'doan_the',   '#ec4899', false, 5),
 ('doan_thanh_nien',    'Đoàn Thanh niên',        'doan_the',   '#0891b2', false, 6),
 ('cuu_chien_binh',     'Hội Cựu chiến binh',     'doan_the',   '#d97706', false, 7),
 ('nguoi_cao_tuoi',     'Hội Người cao tuổi',     'doan_the',   '#7c3aed', false, 8),
 ('nguoi_co_cong',      'Người có công',          'chinh_sach', '#ca8a04', true,  9),
 ('gia_dinh_chinh_sach','Gia đình chính sách',    'chinh_sach', '#65a30d', true, 10),
 ('me_viet_nam_ah',     'Mẹ Việt Nam Anh hùng',   'chinh_sach', '#e11d48', true, 11),
 ('ho_ngheo',           'Hộ nghèo',               'chinh_sach', '#dc2626', true, 12),
 ('ho_can_ngheo',       'Hộ cận nghèo',           'chinh_sach', '#ea580c', true, 13),
 ('khuyet_tat',         'Người khuyết tật',       'chinh_sach', '#0284c7', true, 14),
 ('tre_em',             'Trẻ em',                 'chinh_sach', '#06b6d4', false,15),
 ('to_lien_gia_pccc',   'Tổ liên gia PCCC',       'nhom_khac',  '#b91c1c', false,16),
 ('to_dan_phong',       'Tổ dân phòng',           'nhom_khac',  '#4338ca', false,17),
 ('to_hoa_giai',        'Tổ hoà giải',            'nhom_khac',  '#0d9488', false,18)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, khoi = EXCLUDED.khoi;

INSERT INTO fund (code, name, fund_type, description, sort_order) VALUES
 ('hoat_dong',             'Quỹ hoạt động khu phố',   'hoat_dong',
  'Chi cho hoạt động thường xuyên của Ban điều hành', 1),
 ('vi_nguoi_ngheo',        'Quỹ Vì người nghèo',      'vi_nguoi_ngheo',
  'Vận động theo đợt, hỗ trợ hộ nghèo và cận nghèo', 2),
 ('den_on_dap_nghia',      'Quỹ Đền ơn đáp nghĩa',    'den_on_dap_nghia',
  'Chăm lo gia đình chính sách, người có công', 3),
 ('phong_chong_thien_tai', 'Quỹ Phòng chống thiên tai','phong_chong_thien_tai',
  'Theo quy định của địa phương', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migration (filename) VALUES ('001_khoi_tao.sql') ON CONFLICT DO NOTHING;
