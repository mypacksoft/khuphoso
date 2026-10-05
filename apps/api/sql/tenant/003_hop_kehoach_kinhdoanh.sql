-- ============================================================================
-- LỊCH HỌP · KẾ HOẠCH KHU PHỐ · CƠ SỞ KINH DOANH
--
-- Ba phân hệ còn thiếu so với phần mềm cũ. Cùng nằm trong database của khu phố,
-- không có `tenant_id` (xem 001_khoi_tao.sql).
-- ============================================================================

-- ============================================================
-- LỊCH HỌP
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text NOT NULL,
    -- Thời điểm họp. Lưu kèm múi giờ vì biên bản ghi giờ, sai giờ là sai giấy tờ.
    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz,
    location     text,
    -- Cơ quan chủ trì, dùng chung bảng mã với văn bản: Đảng · Chính quyền ·
    -- Mặt trận · Đoàn thể. Cán bộ lọc theo đây để chuẩn bị đúng đầu mối.
    co_quan      text CHECK (co_quan IN ('dang','chinh_quyen','mat_tran','doan_the')),
    status       text NOT NULL DEFAULT 'sap_dien_ra'
                 CHECK (status IN ('sap_dien_ra','da_dien_ra','da_huy')),
    thanh_phan   text,                       -- Thành phần mời, ghi tự do
    noi_dung     text,                       -- Nội dung dự kiến
    bien_ban     text,                       -- Biên bản, điền sau khi họp xong
    so_nguoi_du  int,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    deleted_at   timestamptz
);

-- Chuông thông báo hỏi "cuộc họp nào sắp tới" mỗi lần mở app
CREATE INDEX IF NOT EXISTS meeting_sap_toi_idx
    ON meeting (starts_at)
    WHERE deleted_at IS NULL AND status = 'sap_dien_ra';

DROP TRIGGER IF EXISTS meeting_touch ON meeting;
CREATE TRIGGER meeting_touch BEFORE UPDATE ON meeting
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- KẾ HOẠCH KHU PHỐ
-- ============================================================
CREATE TABLE IF NOT EXISTS plan (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title         text NOT NULL,
    -- Hạn hoàn thành là `date` chứ không phải `timestamptz`: kế hoạch khu phố
    -- tính theo ngày, không ai giao việc "xong lúc 14:30".
    deadline      date,
    status        text NOT NULL DEFAULT 'chua_bat_dau'
                  CHECK (status IN ('chua_bat_dau','dang_thuc_hien','hoan_thanh','tam_dung')),
    tien_do       int NOT NULL DEFAULT 0 CHECK (tien_do BETWEEN 0 AND 100),
    uu_tien       text NOT NULL DEFAULT 'binh_thuong'
                  CHECK (uu_tien IN ('thap','binh_thuong','cao','khan')),
    phu_trach     text,                      -- Người/bộ phận phụ trách
    noi_dung      text,
    ket_qua       text,                      -- Ghi lại khi đóng kế hoạch
    started_at    timestamptz,
    done_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    deleted_at    timestamptz
);

-- Chuông thông báo hỏi "việc nào sắp tới hạn hoặc đã quá hạn"
CREATE INDEX IF NOT EXISTS plan_con_han_idx
    ON plan (deadline)
    WHERE deleted_at IS NULL AND status <> 'hoan_thanh';

DROP TRIGGER IF EXISTS plan_touch ON plan;
CREATE TRIGGER plan_touch BEFORE UPDATE ON plan
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- CƠ SỞ KINH DOANH
-- ============================================================
CREATE TABLE IF NOT EXISTS business (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    -- Chủ cơ sở: nếu là nhân khẩu trong khu phố thì trỏ thẳng vào hồ sơ, còn
    -- người ngoài địa bàn thì chỉ ghi tên. Có cả hai để không mất dữ liệu.
    owner_resident_id   uuid REFERENCES resident(id) ON DELETE SET NULL,
    owner_name          text,
    household_id        uuid REFERENCES household(id) ON DELETE SET NULL,
    group_id            uuid REFERENCES neighborhood_group(id),
    nganh_nghe          text,
    address             text,
    address_search      text GENERATED ALWAYS AS (kp_unaccent(coalesce(address,''))) STORED,
    phone               text,

    -- Giấy tờ. Ngày hết hạn để nhắc trước khi giấy hết hiệu lực.
    so_gpkd             text,
    ngay_cap_gpkd       date,
    so_attp             text,                -- Giấy chứng nhận an toàn thực phẩm
    ngay_cap_attp       date,
    ngay_het_han_attp   date,
    so_pccc             text,                -- Phương án phòng cháy chữa cháy
    ngay_cap_pccc       date,

    trang_thai          text NOT NULL DEFAULT 'dang_hoat_dong'
                        CHECK (trang_thai IN ('dang_hoat_dong','tam_nghi','da_dong_cua')),
    so_lao_dong         int,
    note                text,

    -- Cùng cách định vị với hộ: dò sơ bộ rồi cán bộ xác minh tại chỗ
    geom                geography(Point,4326),
    geo_status          text NOT NULL DEFAULT 'pending'
                        CHECK (geo_status IN ('pending','auto','verified','manual','failed')),
    geo_source          text,
    geo_accuracy_m      numeric(8,1),
    geo_updated_at      timestamptz,
    geo_updated_by      uuid,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS business_ten_idx
    ON business USING gin (kp_unaccent(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS business_dia_chi_idx
    ON business USING gin (address_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS business_geom_idx ON business USING gist (geom);
CREATE INDEX IF NOT EXISTS business_attp_het_han_idx
    ON business (ngay_het_han_attp)
    WHERE deleted_at IS NULL AND ngay_het_han_attp IS NOT NULL;

DROP TRIGGER IF EXISTS business_touch ON business;
CREATE TRIGGER business_touch BEFORE UPDATE ON business
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO schema_migration (filename)
VALUES ('003_hop_kehoach_kinhdoanh.sql') ON CONFLICT DO NOTHING;
