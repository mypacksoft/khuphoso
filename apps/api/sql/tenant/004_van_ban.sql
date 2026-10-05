-- ============================================================================
-- VĂN BẢN ĐẾN VÀ VĂN BẢN ĐI
--
-- Một bảng cho cả hai chiều, phân biệt bằng `loai`. Cùng số hiệu, cùng cơ quan
-- ban hành, cùng cách tra cứu — tách hai bảng chỉ nhân đôi mã mà không được gì.
--
-- Văn bản ĐI do khu phố soạn nên có thêm phần thể thức (nơi nhận, người ký,
-- chức vụ) để in ra đúng quy định. Văn bản ĐẾN thì các cột đó để trống.
-- ============================================================================

CREATE TABLE IF NOT EXISTS official_document (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    loai          text NOT NULL CHECK (loai IN ('den','di')),
    -- Số và ký hiệu văn bản, vd "12/TB-KP3". Không đặt UNIQUE: văn bản đến từ
    -- nhiều cơ quan khác nhau hoàn toàn có thể trùng số.
    so_ky_hieu    text,
    title         text NOT NULL,
    title_search  text GENERATED ALWAYS AS (kp_unaccent(title)) STORED,

    -- Cơ quan ban hành, dùng chung bảng mã với lịch họp
    co_quan       text CHECK (co_quan IN ('dang','chinh_quyen','mat_tran','doan_the')),
    -- Tên đơn vị cụ thể: "UBND Phường An Phú", "Chi bộ Khu phố 3"…
    don_vi        text,

    ngay_van_ban  date,                       -- ngày ghi trên văn bản
    ngay_nhan     date,                       -- văn bản đến: ngày khu phố nhận
    trich_yeu     text,                       -- tóm tắt nội dung

    -- Thể thức, chỉ dùng cho văn bản ĐI
    noi_nhan      text,
    nguoi_ky      text,
    chuc_vu_ky    text,
    noi_dung      text,                       -- nội dung soạn thảo đầy đủ

    -- Xử lý: văn bản đến cần theo dõi ai xử lý, xong chưa
    trang_thai    text NOT NULL DEFAULT 'moi'
                  CHECK (trang_thai IN ('nhap','moi','dang_xu_ly','da_xu_ly','luu')),
    nguoi_xu_ly   text,
    han_xu_ly     date,
    ket_qua       text,

    do_khan       text NOT NULL DEFAULT 'thuong'
                  CHECK (do_khan IN ('thuong','khan','thuong_khan','hoa_toc')),

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS doc_loai_ngay_idx
    ON official_document (loai, ngay_van_ban DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS doc_tim_idx
    ON official_document USING gin (title_search gin_trgm_ops);
-- Chuông nhắc văn bản đến quá hạn xử lý
CREATE INDEX IF NOT EXISTS doc_han_xu_ly_idx
    ON official_document (han_xu_ly)
    WHERE deleted_at IS NULL AND loai = 'den' AND trang_thai IN ('moi','dang_xu_ly');

DROP TRIGGER IF EXISTS doc_touch ON official_document;
CREATE TRIGGER doc_touch BEFORE UPDATE ON official_document
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TỆP ĐÍNH KÈM
--
-- Tệp nằm trên đĩa máy chủ, KHÔNG đưa lên CDN công khai: văn bản khu phố có thể
-- chứa họ tên, địa chỉ, hoàn cảnh gia đình của bà con. Muốn tải phải đăng nhập
-- và đúng khu phố. Bảng này chỉ giữ đường dẫn và siêu dữ liệu.
--
-- `ten_luu` là tên do hệ thống sinh (uuid + đuôi), `ten_goc` là tên người dùng
-- đặt. Không bao giờ dùng tên gốc để ghi đĩa — người dùng đặt tên kiểu
-- "../../.env" là đọc được tệp ngoài thư mục.
-- ============================================================
CREATE TABLE IF NOT EXISTS document_file (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  uuid NOT NULL REFERENCES official_document(id) ON DELETE CASCADE,
    ten_goc      text NOT NULL,
    ten_luu      text NOT NULL UNIQUE,
    kieu         text,                        -- content type
    kich_thuoc   bigint NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid
);

CREATE INDEX IF NOT EXISTS document_file_doc_idx ON document_file (document_id);

INSERT INTO schema_migration (filename) VALUES ('004_van_ban.sql') ON CONFLICT DO NOTHING;
