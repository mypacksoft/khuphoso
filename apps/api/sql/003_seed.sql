-- KhuPhoSo — dữ liệu khởi tạo: quyền, vai trò hệ thống, mức đóng góp, tenant đầu tiên

-- ============================================================
-- QUYỀN
-- ============================================================
INSERT INTO permission (code, module, action, description, is_sensitive) VALUES
 ('resident:read',           'residents','read',  'Xem danh sách cư dân', false),
 ('resident:write',          'residents','write', 'Thêm/sửa cư dân', false),
 ('resident:delete',         'residents','delete','Xoá cư dân', false),
 ('resident:read_pii',       'residents','read',  'Xem số CCCD đầy đủ', true),
 ('resident:read_party',     'residents','read',  'Xem thông tin đảng viên', true),
 ('resident:export',         'residents','export','Xuất danh sách cư dân', true),
 ('household:read',          'households','read', 'Xem hộ khẩu', false),
 ('household:write',         'households','write','Thêm/sửa hộ khẩu', false),
 ('household:read_location', 'households','read', 'Xem toạ độ nhà', true),
 ('business:read',           'businesses','read', 'Xem cơ sở kinh doanh', false),
 ('business:write',          'businesses','write','Thêm/sửa cơ sở kinh doanh', false),
 ('org:read',                'organizations','read', 'Xem tổ chức đoàn thể', false),
 ('org:write',               'organizations','write','Thêm/sửa tổ chức đoàn thể', false),
 ('meeting:read',            'meetings','read', 'Xem lịch họp, biên bản', false),
 ('meeting:write',           'meetings','write','Tạo họp, ghi biên bản', false),
 ('plan:read',               'plans','read', 'Xem kế hoạch công tác', false),
 ('plan:write',              'plans','write','Tạo/sửa kế hoạch', false),
 ('document:read',           'documents','read', 'Xem văn bản', false),
 ('document:write',          'documents','write','Soạn/nhập văn bản', false),
 ('gis:read',                'gis','read', 'Xem bản đồ', false),
 ('gis:write',               'gis','write','Thêm/sửa ghim bản đồ', false),
 ('gis:delete',              'gis','delete','Xoá ghim bản đồ', false),
 ('fund:read',               'funds','read', 'Xem sổ quỹ', false),
 ('fund:write',              'funds','write','Ghi thu chi quỹ', true),
 ('fund:approve',            'funds','approve','Duyệt chi quỹ', true),
 ('campaign:read',           'campaigns','read', 'Xem chiến dịch thiện nguyện', false),
 ('campaign:write',          'campaigns','write','Tạo/sửa chiến dịch', true),
 ('democracy:read',          'democracy','read', 'Xem hội nghị nhân dân', false),
 ('democracy:write',         'democracy','write','Tổ chức hội nghị, biểu quyết', false),
 ('report:read',             'reports','read', 'Xem phản ánh hiện trường', false),
 ('report:write',            'reports','write','Tạo/xử lý phản ánh', false),
 ('user:read',               'users','read', 'Xem danh sách tài khoản', false),
 ('user:write',              'users','write','Thêm/sửa tài khoản', true),
 ('role:write',              'users','write','Cấu hình phân quyền', true),
 ('audit:read',              'audit','read', 'Xem nhật ký kiểm toán', true),
 ('backup:manage',           'system','manage','Sao lưu, phục hồi dữ liệu', true),
 ('settings:write',          'system','write','Cấu hình hệ thống', true)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- ============================================================
-- VAI TRÒ HỆ THỐNG (tenant_id NULL — dùng làm khuôn cho mọi khu phố)
-- ============================================================
INSERT INTO role (tenant_id, code, name, level, is_system) VALUES
 (NULL, 'quan_tri',    'Quản trị hệ thống',   100, true),
 (NULL, 'ban_dieu_hanh','Ban điều hành',       80, true),
 (NULL, 'to_truong',   'Tổ trưởng dân phố',    50, true),
 (NULL, 'can_bo',      'Cán bộ phụ trách',     30, true),
 (NULL, 'chi_xem',     'Chỉ xem',              10, true)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Quản trị hệ thống: toàn quyền
INSERT INTO role_permission (role_id, permission_code)
SELECT r.id, p.code FROM role r CROSS JOIN permission p
WHERE r.tenant_id IS NULL AND r.code = 'quan_tri'
ON CONFLICT DO NOTHING;

-- Ban điều hành: mọi thứ trừ cấu hình hệ thống và phân quyền
INSERT INTO role_permission (role_id, permission_code)
SELECT r.id, p.code FROM role r CROSS JOIN permission p
WHERE r.tenant_id IS NULL AND r.code = 'ban_dieu_hanh'
  AND p.code NOT IN ('role:write','settings:write','backup:manage')
ON CONFLICT DO NOTHING;

-- Tổ trưởng dân phố: nghiệp vụ địa bàn, không chạm quỹ và tài khoản
INSERT INTO role_permission (role_id, permission_code)
SELECT r.id, p.code FROM role r CROSS JOIN permission p
WHERE r.tenant_id IS NULL AND r.code = 'to_truong'
  AND p.code IN ('resident:read','resident:write','household:read','household:write',
                 'household:read_location','business:read','org:read','meeting:read',
                 'plan:read','document:read','gis:read','gis:write','fund:read',
                 'campaign:read','democracy:read','report:read','report:write')
ON CONFLICT DO NOTHING;

-- Cán bộ phụ trách: đọc nhiều, ghi ở mảng được giao
INSERT INTO role_permission (role_id, permission_code)
SELECT r.id, p.code FROM role r CROSS JOIN permission p
WHERE r.tenant_id IS NULL AND r.code = 'can_bo'
  AND p.code IN ('resident:read','household:read','business:read','business:write',
                 'org:read','meeting:read','meeting:write','plan:read','plan:write',
                 'document:read','document:write','gis:read','fund:read',
                 'campaign:read','democracy:read','report:read','report:write')
ON CONFLICT DO NOTHING;

-- Chỉ xem
INSERT INTO role_permission (role_id, permission_code)
SELECT r.id, p.code FROM role r CROSS JOIN permission p
WHERE r.tenant_id IS NULL AND r.code = 'chi_xem' AND p.action = 'read'
  AND p.is_sensitive = false
ON CONFLICT DO NOTHING;

-- ============================================================
-- MỨC ĐÓNG GÓP DUY TRÌ
-- ============================================================
INSERT INTO plan (code, name, price_monthly, sort_order, limits) VALUES
 ('dong_hanh', 'Đồng hành',   0,
  1, '{"max_residents":null,"max_users":5,"gis":false,"funds":false,"ai":false,"zalo":false,"custom_domain":false}'),
 ('duy_tri',   'Duy trì',     150000,
  2, '{"max_residents":null,"max_users":30,"gis":true,"funds":true,"ai":true,"zalo":true,"custom_domain":false}'),
 ('chung_tay', 'Chung tay',   300000,
  3, '{"max_residents":null,"max_users":null,"gis":true,"funds":true,"ai":true,"zalo":true,"custom_domain":true,"democracy":true}'),
 ('bao_tro',   'Bảo trợ',     0,
  4, '{"max_residents":null,"max_users":null,"gis":true,"funds":true,"ai":true,"zalo":true,"custom_domain":true,"democracy":true}')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, limits = EXCLUDED.limits;

-- ============================================================
-- TENANT ĐẦU TIÊN — Khu phố 3, Phường An Phú
-- ============================================================
INSERT INTO tenant (slug, name, full_name, ward, province, plan_id, status, settings)
SELECT 'kp3-anphu', 'Khu phố 3', 'Khu phố 3, Phường An Phú',
       'An Phú', 'TP. Hồ Chí Minh',
       (SELECT id FROM plan WHERE code = 'chung_tay'), 'active',
       '{"quoc_hieu":"CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM","tieu_ngu":"Độc lập - Tự do - Hạnh phúc"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM tenant WHERE slug = 'kp3-anphu');

-- Nhân bản 5 vai trò hệ thống cho tenant này
INSERT INTO role (tenant_id, code, name, level, is_system)
SELECT t.id, r.code, r.name, r.level, false
FROM tenant t CROSS JOIN role r
WHERE t.slug = 'kp3-anphu' AND r.tenant_id IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO role_permission (role_id, permission_code)
SELECT tr.id, rp.permission_code
FROM role tr
JOIN tenant t ON t.id = tr.tenant_id AND t.slug = 'kp3-anphu'
JOIN role sr ON sr.tenant_id IS NULL AND sr.code = tr.code
JOIN role_permission rp ON rp.role_id = sr.id
ON CONFLICT DO NOTHING;

INSERT INTO schema_migration (filename) VALUES ('003_seed.sql') ON CONFLICT DO NOTHING;
