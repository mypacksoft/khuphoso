-- ============================================================================
-- PHẢN ÁNH HIỆN TRƯỜNG
--
-- Cán bộ đi trên đường thấy nắp cống vỡ, bãi rác tự phát, đèn đường hỏng — chụp
-- một tấm, máy tự gắn toạ độ, gửi luôn. Việc nào vượt thẩm quyền khu phố thì
-- chuyển phường và theo dõi cho tới khi phường trả lời.
--
-- VÌ SAO GHI TOẠ ĐỘ CHỨ KHÔNG CHỈ GHI ĐỊA CHỈ
-- "Cống vỡ ở đường An Phú 13" thì đội sửa chữa vẫn phải đi dò cả con đường.
-- Toạ độ lấy tại chỗ đưa họ tới đúng cái nắp cống.
--
-- ĐỘ CHÍNH XÁC GPS ĐƯỢC GHI LẠI (`do_chinh_xac_m`). Điện thoại trong hẻm sâu có
-- thể lệch 50m; biết sai số thì người đi sửa còn liệu, không thì họ tin tưởng
-- một cái ghim sai rồi đi tìm nhầm chỗ.
-- ============================================================================

CREATE TABLE IF NOT EXISTS phan_anh (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    title         text NOT NULL,
    title_search  text GENERATED ALWAYS AS (kp_unaccent(title)) STORED,
    mo_ta         text,

    loai          text NOT NULL DEFAULT 'khac'
                  CHECK (loai IN ('ha_tang','ve_sinh','an_ninh','trat_tu',
                                  'cay_xanh','chieu_sang','ngap_nuoc','khac')),
    muc_do        text NOT NULL DEFAULT 'binh_thuong'
                  CHECK (muc_do IN ('binh_thuong','can_som','khan_cap')),

    -- Vị trí. Địa chỉ để đọc, toạ độ để đi tới.
    dia_chi       text,
    geom          geography(Point,4326),
    do_chinh_xac_m numeric(8,1),
    group_id      uuid REFERENCES neighborhood_group(id),
    -- Phản ánh gắn với một hộ cụ thể (vd tranh chấp, xây dựng sai phép)
    household_id  uuid REFERENCES household(id) ON DELETE SET NULL,

    -- Ai báo. Cán bộ ghi hộ bà con thì điền tên và số điện thoại người báo.
    nguoi_bao     text,
    dien_thoai    text,

    trang_thai    text NOT NULL DEFAULT 'moi'
                  CHECK (trang_thai IN ('moi','dang_xu_ly','da_chuyen_phuong',
                                        'da_xong','khong_xu_ly')),
    -- Vì sao không xử lý, hoặc phường trả lời thế nào
    ly_do         text,

    nguoi_xu_ly   text,
    han_xu_ly     date,
    ngay_xong     date,
    ket_qua       text,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS phan_anh_trang_thai_idx
    ON phan_anh (trang_thai, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS phan_anh_tim_idx
    ON phan_anh USING gin (title_search gin_trgm_ops);
-- Bản đồ điểm nóng quét theo toạ độ
CREATE INDEX IF NOT EXISTS phan_anh_geom_idx
    ON phan_anh USING gist (geom) WHERE deleted_at IS NULL AND geom IS NOT NULL;
-- Chuông nhắc việc quá hạn
CREATE INDEX IF NOT EXISTS phan_anh_han_idx
    ON phan_anh (han_xu_ly)
    WHERE deleted_at IS NULL AND trang_thai IN ('moi','dang_xu_ly','da_chuyen_phuong');

DROP TRIGGER IF EXISTS phan_anh_touch ON phan_anh;
CREATE TRIGGER phan_anh_touch BEFORE UPDATE ON phan_anh
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ── ẢNH HIỆN TRƯỜNG ──────────────────────────────────────────────────────────
--
-- Cùng cách làm với tệp đính kèm văn bản: ảnh nằm trên đĩa máy chủ, sau lớp đăng
-- nhập. Ảnh hiện trường có thể lọt vào nhà dân, biển số xe, mặt người — không
-- đưa lên CDN công khai.
--
-- `ten_luu` do hệ thống sinh (uuid + đuôi). Không bao giờ dùng tên người dùng đặt
-- để ghi đĩa: tên kiểu "../../.env" là đọc được tệp ngoài thư mục.
CREATE TABLE IF NOT EXISTS phan_anh_anh (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phan_anh_id  uuid NOT NULL REFERENCES phan_anh(id) ON DELETE CASCADE,
    ten_goc      text NOT NULL,
    ten_luu      text NOT NULL UNIQUE,
    kieu         text,
    kich_thuoc   bigint NOT NULL,
    -- Ảnh chụp sau khi đã xử lý xong, để đối chứng trước/sau
    la_sau_xu_ly boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid
);

CREATE INDEX IF NOT EXISTS phan_anh_anh_idx ON phan_anh_anh (phan_anh_id);

INSERT INTO schema_migration (filename) VALUES ('008_phan_anh.sql') ON CONFLICT DO NOTHING;
