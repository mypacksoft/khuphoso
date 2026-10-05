-- KhuPhoSo — Sổ quỹ CỦA TỪNG KHU PHỐ (tenant-scoped, có RLS)
--
-- Phân biệt rõ hai thứ hoàn toàn khác nhau:
--   platform_ledger : Quỹ 1 — quỹ phát triển NỀN TẢNG. Chung cho cả hệ thống,
--                     công khai tại minhbach.khuphoso.vn. KHÔNG thuộc khu phố nào.
--   fund / fund_*   : quỹ CỦA KHU PHỐ. Mỗi khu phố một sổ riêng, RLS chặn đọc chéo.

CREATE TABLE IF NOT EXISTS fund (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    fund_type       text NOT NULL DEFAULT 'hoat_dong'
                    CHECK (fund_type IN ('hoat_dong','vi_nguoi_ngheo','den_on_dap_nghia',
                                         'phong_chong_thien_tai','van_dong_dot_xuat','khac')),
    description     text,
    -- Tài khoản nhận riêng cho quỹ này (nếu có). Chiến dịch vận động BẮT BUỘC
    -- phải có tài khoản riêng theo Nghị định 93/2021.
    bank_name       text,
    bank_account    text,
    bank_holder     text,
    opening_balance numeric(16,0) NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    deleted_at      timestamptz,
    UNIQUE (tenant_id, code)
);

-- Đợt thu (ví dụ: "Quỹ hoạt động 2026", "Vận động Tết 2026")
CREATE TABLE IF NOT EXISTS fund_campaign (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    fund_id             uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    name                text NOT NULL,
    period              text,                       -- 2026 | 2026-Q1 | 2026-TET
    per_household_amount numeric(14,0),             -- mức chuẩn mỗi hộ
    target_amount       numeric(16,0),
    start_date          date,
    end_date            date,
    status              text NOT NULL DEFAULT 'dang_thu'
                        CHECK (status IN ('nhap','dang_thu','da_dong','quyet_toan')),
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    deleted_at          timestamptz
);

-- Phiếu thu theo hộ
CREATE TABLE IF NOT EXISTS fund_receipt (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    fund_id         uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    campaign_id     uuid REFERENCES fund_campaign(id) ON DELETE SET NULL,
    household_id    uuid REFERENCES household(id) ON DELETE SET NULL,
    resident_id     uuid REFERENCES resident(id) ON DELETE SET NULL,
    payer_name      text,
    amount          numeric(14,0) NOT NULL DEFAULT 0,
    method          text NOT NULL DEFAULT 'tien_mat'
                    CHECK (method IN ('tien_mat','chuyen_khoan','vietqr')),
    status          text NOT NULL DEFAULT 'da_dong'
                    CHECK (status IN ('chua_dong','da_dong','mien_giam')),
    exempt_reason   text,
    receipt_number  text,
    bank_tx_id      bigint REFERENCES bank_transaction(id),
    paid_at         timestamptz,
    collected_by    text,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid
);

-- Phiếu chi — bắt buộc có người duyệt
CREATE TABLE IF NOT EXISTS fund_expense (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    fund_id         uuid NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
    amount          numeric(14,0) NOT NULL CHECK (amount > 0),
    category        text,
    description     text NOT NULL,
    payee           text,
    voucher_number  text,
    approved_by     text,
    approved_at     timestamptz,
    paid_at         timestamptz NOT NULL DEFAULT now(),
    attachment_id   uuid,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid
);

CREATE INDEX IF NOT EXISTS ix_fund_tenant   ON fund (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_fcamp_fund    ON fund_campaign (tenant_id, fund_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_frec_fund     ON fund_receipt (tenant_id, fund_id);
CREATE INDEX IF NOT EXISTS ix_frec_camp     ON fund_receipt (campaign_id, status);
CREATE INDEX IF NOT EXISTS ix_frec_hh       ON fund_receipt (household_id);
CREATE INDEX IF NOT EXISTS ix_fexp_fund     ON fund_expense (tenant_id, fund_id, paid_at DESC);

-- ============================================================
-- RLS — sổ quỹ khu phố này KHÔNG được lộ sang khu phố khác
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fund','fund_campaign','fund_receipt','fund_expense'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id())
       WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_touch_fund ON fund;
CREATE TRIGGER trg_touch_fund BEFORE UPDATE ON fund
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON fund, fund_campaign, fund_receipt, fund_expense TO kp_app;

-- ============================================================
-- Bốn quỹ mặc định cho mỗi khu phố
-- ============================================================
INSERT INTO fund (tenant_id, code, name, fund_type, description, sort_order)
SELECT t.id, v.code, v.name, v.ftype, v.mota, v.so
FROM tenant t
CROSS JOIN (VALUES
  ('hoat_dong',   'Quỹ hoạt động khu phố', 'hoat_dong',
   'Chi cho hoạt động thường xuyên của Ban điều hành', 1),
  ('vi_nguoi_ngheo', 'Quỹ Vì người nghèo', 'vi_nguoi_ngheo',
   'Vận động theo đợt, hỗ trợ hộ nghèo và cận nghèo', 2),
  ('den_on_dap_nghia', 'Quỹ Đền ơn đáp nghĩa', 'den_on_dap_nghia',
   'Chăm lo gia đình chính sách, người có công', 3),
  ('phong_chong_thien_tai', 'Quỹ Phòng chống thiên tai', 'phong_chong_thien_tai',
   'Theo quy định của địa phương', 4)
) AS v(code, name, ftype, mota, so)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

COMMENT ON TABLE fund IS 'Quỹ của TỪNG khu phố — khác hoàn toàn platform_ledger (quỹ nền tảng)';

INSERT INTO schema_migration (filename) VALUES ('006_funds.sql') ON CONFLICT DO NOTHING;
