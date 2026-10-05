-- ============================================================================
-- TỔ TRƯỞNG DÂN PHỐ NỐI VỚI HỒ SƠ NHÂN KHẨU
--
-- Trước đây `leader_name` chỉ là một ô chữ gõ tay. Mỗi người viết một kiểu
-- ("Nguyễn Văn A", "Nguyen Van A", "N.V.A") nên không có đường nào nối tổ trưởng
-- với hồ sơ nhân khẩu của chính người đó — không tra được ông ấy ở hộ nào, số
-- điện thoại đổi thì phải sửa hai chỗ, và danh sách "Tổ trưởng dân phố" bên khối
-- Chính quyền không khớp với danh sách tổ.
--
-- Giống `household.head_resident_id`: trỏ thẳng vào `resident`.
--
-- `leader_name` GIỮ LẠI chứ không xoá: tổ trưởng có thể là người chưa có hồ sơ
-- nhân khẩu trong khu phố (mới chuyển về, hoặc hộ khẩu ở phường khác). Lúc đó
-- vẫn phải ghi được tên. Đọc thì ưu tiên tên từ hồ sơ, thiếu mới lấy ô chữ.
--
-- ON DELETE SET NULL: xoá hồ sơ nhân khẩu thì tổ mất tổ trưởng chứ không mất tổ.
-- ============================================================================

ALTER TABLE neighborhood_group
    ADD COLUMN IF NOT EXISTS leader_resident_id uuid
        REFERENCES resident(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS group_leader_idx
    ON neighborhood_group (leader_resident_id)
    WHERE leader_resident_id IS NOT NULL;

INSERT INTO schema_migration (filename) VALUES ('005_to_truong.sql') ON CONFLICT DO NOTHING;
