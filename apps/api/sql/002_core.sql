-- KhuPhoSo — schema lõi SaaS: tenant, người dùng, phân quyền, audit
-- Chạy sau 001_payments.sql

-- ============================================================
-- 1. THEO DÕI MIGRATION
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migration (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. GÓI DỊCH VỤ & TENANT
-- ============================================================
CREATE TABLE IF NOT EXISTS plan (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text UNIQUE NOT NULL,
    name            text NOT NULL,
    price_monthly   numeric(12,0) NOT NULL DEFAULT 0,
    limits          jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order      int NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE plan IS 'Mức đóng góp duy trì — không phải bảng giá thương mại (xem B.5)';

CREATE TABLE IF NOT EXISTS tenant (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                    text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    name                    text NOT NULL,
    full_name               text,
    ward                    text,
    district                text,
    province                text,
    custom_domain           text UNIQUE,
    custom_domain_verified_at timestamptz,
    plan_id                 uuid REFERENCES plan(id),
    status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
    trial_ends_at           timestamptz,
    logo_url                text,
    settings                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
CREATE INDEX IF NOT EXISTS ix_tenant_slug ON tenant (slug) WHERE deleted_at IS NULL;

-- ============================================================
-- 3. DANH TÍNH TOÀN CỤC
-- ============================================================
CREATE TABLE IF NOT EXISTS app_user (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               text UNIQUE,
    phone               text UNIQUE,
    username            text UNIQUE,
    password_hash       text NOT NULL,
    full_name           text NOT NULL,
    avatar_url          text,
    is_platform_admin   boolean NOT NULL DEFAULT false,
    is_active           boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT false,
    last_login_at       timestamptz,
    failed_login_count  int NOT NULL DEFAULT 0,
    locked_until        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    CHECK (email IS NOT NULL OR phone IS NOT NULL OR username IS NOT NULL)
);

-- ============================================================
-- 4. VAI TRÒ & QUYỀN
-- ============================================================
CREATE TABLE IF NOT EXISTS role (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = vai trò hệ thống
    code        text NOT NULL,
    name        text NOT NULL,
    level       int  NOT NULL DEFAULT 10,   -- càng cao càng nhiều quyền
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS permission (
    code        text PRIMARY KEY,           -- 'resident:write'
    module      text NOT NULL,
    action      text NOT NULL,
    description text NOT NULL,
    is_sensitive boolean NOT NULL DEFAULT false  -- quyền chạm dữ liệu nhạy cảm (PHẦN G)
);

CREATE TABLE IF NOT EXISTS role_permission (
    role_id         uuid REFERENCES role(id) ON DELETE CASCADE,
    permission_code text REFERENCES permission(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS membership (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    role_id     uuid NOT NULL REFERENCES role(id),
    position    text,
    unit        text,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
    invited_by  uuid REFERENCES app_user(id),
    joined_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS ix_membership_tenant ON membership (tenant_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 5. PHIÊN ĐĂNG NHẬP
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_token (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash  text UNIQUE NOT NULL,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    replaced_by uuid REFERENCES refresh_token(id),
    ip          inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rt_user ON refresh_token (user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- 6. NHẬT KÝ KIỂM TOÁN
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id            bigserial PRIMARY KEY,
    tenant_id     uuid,
    actor_user_id uuid,
    actor_name    text,
    action        text NOT NULL,      -- create | update | delete | export | login | view_pii
    module        text,
    entity_type   text,
    entity_id     text,
    changes       jsonb,
    ip            inet,
    user_agent    text,
    request_id    text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_tenant_time ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log (entity_type, entity_id);

-- ============================================================
-- 7. HÀM TIỆN ÍCH
-- ============================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;
COMMENT ON FUNCTION current_tenant_id() IS
    'Đọc tenant hiện tại từ biến phiên. Mọi policy RLS đều dựa vào hàm này.';

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant','app_user'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;

INSERT INTO schema_migration (filename) VALUES ('002_core.sql')
ON CONFLICT DO NOTHING;
