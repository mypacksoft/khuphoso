-- ============================================================================
-- CỔNG THÔNG TIN CƯ DÂN — cấu hình & biểu mẫu
--
-- Nội dung hiển thị trên trang công khai của khu phố: lời giới thiệu, danh bạ ban
-- điều hành, và danh mục biểu mẫu để dân tải về. Nằm trong DB của khu phố.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_config (
    id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    gioi_thieu  text,
    -- Danh bạ ban điều hành: [{"chuc_vu","ho_ten","sdt"}]
    lien_he     jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid
);
INSERT INTO portal_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS bieu_mau (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ten        text NOT NULL,
    mo_ta      text,
    nhom       text NOT NULL DEFAULT 'khac'
               CHECK (nhom IN ('cu_tru','kinh_doanh','dan_chu','khac')),
    url        text,                 -- link tải (nguồn chính thức, hoặc file khu phố tự tải lên)
    sort_order int NOT NULL DEFAULT 0,
    is_public  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid
);

-- Biểu mẫu cư trú thường dùng (Thông tư 66/2023/TT-BCA). Link tới nguồn chính thức
-- để luôn cập nhật; cán bộ có thể sửa/thay bằng file của khu phố.
INSERT INTO bieu_mau (ten, mo_ta, nhom, url, sort_order) VALUES
 ('Tờ khai thay đổi thông tin cư trú (CT01)',
  'Dùng cho đăng ký thường trú, tạm trú, gia hạn tạm trú, tách hộ, điều chỉnh thông tin, xác nhận cư trú.',
  'cu_tru',
  'https://xaydungchinhsach.chinhphu.vn/mau-to-khai-thay-doi-thong-tin-cu-tru-xac-nhan-thong-tin-ve-cu-tru-119231124101042745.htm', 1),
 ('Giấy xác nhận thông tin về cư trú (CT07)',
  'Mẫu xác nhận thông tin về cư trú, có giá trị 01 năm kể từ ngày cấp.',
  'cu_tru',
  'https://xaydungchinhsach.chinhphu.vn/mau-to-khai-thay-doi-thong-tin-cu-tru-xac-nhan-thong-tin-ve-cu-tru-119231124101042745.htm', 2),
 ('Cổng Dịch vụ công Quốc gia — thủ tục cư trú',
  'Đăng ký thường trú, tạm trú, khai báo tạm vắng trực tuyến.',
  'cu_tru', 'https://dichvucong.gov.vn', 3)
ON CONFLICT DO NOTHING;

INSERT INTO schema_migration (filename) VALUES ('013_cong_thong_tin.sql') ON CONFLICT DO NOTHING;
