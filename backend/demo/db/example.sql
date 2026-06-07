-- Dữ liệu mẫu cho schema hiện tại
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dọn dữ liệu cũ để script có thể chạy lại nhiều lần
TRUNCATE TABLE
	inventory_transaction_item,
	inventory_transaction,
	box_type,
	role_permission,
	monitor_control_by,
	schedule_rooms,
	sched_has,
	food_has,
	scheduled_by,
	setup_by,
	report,
	alert,
	device_log,
	user_log,
	threshold,
	monitor_device,
	sensor_device,
	food,
	schedule,
	storage_room,
	storage_zone,
	users,
	roles
RESTART IDENTITY CASCADE;

-- 1. roles
INSERT INTO roles (role_name) VALUES
('ADMIN'),
('STAFF'),
('MAINTENANCE');

-- 2. role_permission
INSERT INTO role_permission (role_id, permission_key) VALUES
((SELECT role_id FROM roles WHERE role_name = 'ADMIN'), 'USER_MANAGE'),
((SELECT role_id FROM roles WHERE role_name = 'ADMIN'), 'DEVICE_MANAGE'),
((SELECT role_id FROM roles WHERE role_name = 'ADMIN'), 'ZONE_MANAGE'),
((SELECT role_id FROM roles WHERE role_name = 'ADMIN'), 'REPORT_VIEW'),
((SELECT role_id FROM roles WHERE role_name = 'STAFF'), 'DEVICE_VIEW'),
((SELECT role_id FROM roles WHERE role_name = 'STAFF'), 'ALERT_VIEW'),
((SELECT role_id FROM roles WHERE role_name = 'MAINTENANCE'), 'DEVICE_MANAGE'),
((SELECT role_id FROM roles WHERE role_name = 'MAINTENANCE'), 'THRESHOLD_MANAGE');

-- 3. users
INSERT INTO users (
	username, password, first_name, last_name, email,
	must_change_password, alert_email_enabled, alert_push_enabled, role_id
) VALUES
('admin', crypt('admin123', gen_salt('bf')), 'Quản trị', 'Hệ thống', 'admin@freshguard.vn', FALSE, TRUE, TRUE,
	(SELECT role_id FROM roles WHERE role_name = 'ADMIN')),
('staff01', crypt('staff123', gen_salt('bf')), 'Nguyễn', 'Văn An', 'staff01@freshguard.vn', FALSE, TRUE, TRUE,
	(SELECT role_id FROM roles WHERE role_name = 'STAFF')),
('maintain01', crypt('maintain123', gen_salt('bf')), 'Trần', 'Thị Bình', 'maintain01@freshguard.vn', TRUE, TRUE, TRUE,
	(SELECT role_id FROM roles WHERE role_name = 'MAINTENANCE'));
-- 4. box_type
INSERT INTO box_type (name, length_m, width_m, height_m, volume_m3) VALUES
('Thung S', 0.400, 0.300, 0.250, 0.030000),
('Thung M', 0.600, 0.400, 0.350, 0.084000),
('Thung L', 0.800, 0.600, 0.500, 0.240000);

-- 5. storage_zone
INSERT INTO storage_zone (location, area_name) VALUES
('Tầng 1 - Kho đông', 'Khu A - Hải sản'),
('Tầng 1 - Kho lạnh', 'Khu B - Thịt'),
('Tầng 2 - Kho mát', 'Khu C - Rau củ');

-- 6. storage_room
INSERT INTO storage_room (area_id, max_volume, current_volume, name) VALUES
((SELECT area_id FROM storage_zone WHERE area_name = 'Khu A - Hải sản' LIMIT 1), 403.2, 330.0, 'Phòng 1 - Hải sản tươi sống'),
((SELECT area_id FROM storage_zone WHERE area_name = 'Khu B - Thịt' LIMIT 1), 352.8, 248.0, 'Phòng 2 - Thịt bò và heo'),
((SELECT area_id FROM storage_zone WHERE area_name = 'Khu C - Rau củ' LIMIT 1), 313.6, 205.0, 'Phòng 3 - Rau củ quả');

-- 7. food
INSERT INTO food (name, type, expire_date, imported_date, description, min_humid, max_humid, min_temper, max_temper, weight) VALUES
('Cá hồi Na Uy', 'Hải sản', '2026-05-15', '2026-04-18', 'Phi lê đông lạnh', 70.0, 90.0, -2.0, 2.0, 120.0),
('Thịt bò Úc', 'Thịt đỏ', '2026-05-01', '2026-04-18', 'Thịt bò cao cấp', 40.0, 70.0, 0.0, 4.0, 150.0),
('Cải thìa hữu cơ', 'Rau lá', '2026-04-28', '2026-04-19', 'Rau sạch', 60.0, 95.0, 5.0, 10.0, 35.0);

-- 8. sensor_device
INSERT INTO sensor_device (connect_key, name, install_date, status, temperature, humidity, room_id) VALUES
('SENSOR-001-A', 'Cảm biến nhiệt độ A1', '2026-01-10', 'online', 1.2, 84.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1)),
('SENSOR-002-A', 'Cảm biến nhiệt độ B1', '2026-01-12', 'online', 3.5, 68.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1)),
('SENSOR-003-A', 'Cảm biến nhiệt độ C1', '2026-01-14', 'warning', 10.5, 89.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 3 - Rau củ quả' LIMIT 1));

-- 9. monitor_device (mode dùng MANUAL/AUTO để đồng bộ backend)
INSERT INTO monitor_device (connect_key, name, install_date, status, mode, speed, value, room_id) VALUES
('CTRL-001-A', 'Máy nén lạnh A1', '2026-01-15', 'online', 'MANUAL', 4, 1.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1)),
('CTRL-002-A', 'Quạt thông gió B1', '2026-01-16', 'online', 'AUTO', 3, 0.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1)),
('CTRL-003-A', 'Máy làm mát C1', '2026-01-17', 'offline', 'MANUAL', 0, 0.0,
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 3 - Rau củ quả' LIMIT 1));

-- 10. threshold
INSERT INTO threshold (min_value, max_value, unit, device_id) VALUES
(-1.0, 2.0, 'C', (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-001-A' LIMIT 1)),
(0.0, 4.0, 'C', (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-002-A' LIMIT 1)),
(5.0, 10.0, 'C', (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-003-A' LIMIT 1));

-- 11. monitor_control_by
INSERT INTO monitor_control_by (user_id, device_id, command_type, time, value) VALUES
((SELECT user_id FROM users WHERE username = 'admin'),
	(SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-001-A' LIMIT 1),
	'SET_MODE', NOW() - INTERVAL '1 hour', 1.0),
((SELECT user_id FROM users WHERE username = 'maintain01'),
	(SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-002-A' LIMIT 1),
	'SET_SPEED', NOW() - INTERVAL '30 minutes', 3.0);

-- 15. schedule (mở rộng theo schema mới)
INSERT INTO schedule (
	name, area_id, scope_type, priority, mode, set_point, set_humid, hysteresis,
	start_time, end_time, duration, schedule_type, recurrence_rule, status, description, timezone
) VALUES
(
	'Lịch phòng hải sản ca sáng',
	(SELECT area_id FROM storage_zone WHERE area_name = 'Khu A - Hải sản' LIMIT 1),
	'single', 1, 'Cooling', -1.5, 84.0, 0.5,
	'2026-04-20 08:00:00', '2026-04-20 17:00:00', 540,
	'recurring',
	'{"type":"weekly","days_of_week":["MON","WED","FRI"],"timezone":"Asia/Ho_Chi_Minh"}',
	TRUE,
	'Giữ lạnh tiêu chuẩn cho hải sản tươi sống',
	'Asia/Ho_Chi_Minh'
),
(
	'Lịch khu thịt ca tối',
	(SELECT area_id FROM storage_zone WHERE area_name = 'Khu B - Thịt' LIMIT 1),
	'all', 2, 'Eco', 2.0, 68.0, 1.0,
	'2026-04-20 18:00:00', '2026-04-20 22:00:00', 240,
	'recurring',
	'{"type":"daily","timezone":"Asia/Ho_Chi_Minh"}',
	TRUE,
	'Tối ưu điện năng cho khu thịt vào buổi tối',
	'Asia/Ho_Chi_Minh'
),
(
	'Lịch một lần cho rau củ',
	(SELECT area_id FROM storage_zone WHERE area_name = 'Khu C - Rau củ' LIMIT 1),
	'multiple', 3, 'Defrost', 7.0, 89.0, 0.3,
	'2026-04-21 06:00:00', '2026-04-21 20:00:00', 840,
	'one_time',
	'{"type":"one_time","timezone":"Asia/Ho_Chi_Minh"}',
	TRUE,
	'Xử lý đá bám tạm thời cho kho rau củ',
	'Asia/Ho_Chi_Minh'
);

-- 16. schedule_rooms
INSERT INTO schedule_rooms (schedule_id, room_id) VALUES
(
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch phòng hải sản ca sáng' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1)
),
(
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch khu thịt ca tối' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1)
),
(
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch một lần cho rau củ' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 3 - Rau củ quả' LIMIT 1)
);

-- 17. scheduled_by
INSERT INTO scheduled_by (user_id, schedule_id) VALUES
(
	(SELECT user_id FROM users WHERE username = 'staff01'),
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch phòng hải sản ca sáng' LIMIT 1)
),
(
	(SELECT user_id FROM users WHERE username = 'admin'),
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch khu thịt ca tối' LIMIT 1)
);

-- 18. setup_by
INSERT INTO setup_by (threshold_id, user_id) VALUES
(
	(SELECT threshold_id FROM threshold WHERE device_id = (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-001-A' LIMIT 1) LIMIT 1),
	(SELECT user_id FROM users WHERE username = 'admin')
),
(
	(SELECT threshold_id FROM threshold WHERE device_id = (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-002-A' LIMIT 1) LIMIT 1),
	(SELECT user_id FROM users WHERE username = 'maintain01')
);

-- 19. user_log
INSERT INTO user_log (user_id, type_action, timestamp, description) VALUES
((SELECT user_id FROM users WHERE username = 'admin'), 'LOGIN', NOW(), 'Đăng nhập hệ thống'),
((SELECT user_id FROM users WHERE username = 'staff01'), 'VIEW_DASHBOARD', NOW() - INTERVAL '2 hours', 'Theo dõi nhiệt độ và độ ẩm');

-- 20. sched_has (giữ tương thích luồng dữ liệu cũ: food + schedule + room)
INSERT INTO sched_has (food_id, sched_id, room_id) VALUES
(
	(SELECT food_id FROM food WHERE name = 'Cá hồi Na Uy' LIMIT 1),
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch phòng hải sản ca sáng' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1)
),
(
	(SELECT food_id FROM food WHERE name = 'Thịt bò Úc' LIMIT 1),
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch khu thịt ca tối' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1)
),
(
	(SELECT food_id FROM food WHERE name = 'Cải thìa hữu cơ' LIMIT 1),
	(SELECT schedule_id FROM schedule WHERE name = 'Lịch một lần cho rau củ' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 3 - Rau củ quả' LIMIT 1)
);

-- 21. food_has
INSERT INTO food_has (food_id, room_id) VALUES
(
	(SELECT food_id FROM food WHERE name = 'Cá hồi Na Uy' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1)
),
(
	(SELECT food_id FROM food WHERE name = 'Thịt bò Úc' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1)
),
(
	(SELECT food_id FROM food WHERE name = 'Cải thìa hữu cơ' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 3 - Rau củ quả' LIMIT 1)
);

-- 22. device_log
INSERT INTO device_log (device_id, description, type_action, timestamp) VALUES
((SELECT device_id FROM sensor_device WHERE connect_key = 'SENSOR-001-A' LIMIT 1), 'Nhiệt độ vượt ngưỡng tối đa', 'ALERT', NOW() - INTERVAL '45 minutes'),
((SELECT device_id FROM sensor_device WHERE connect_key = 'SENSOR-003-A' LIMIT 1), 'Cảm biến cần bảo trì', 'WARNING', NOW() - INTERVAL '20 minutes');

-- 23. alert
INSERT INTO alert (message, status, time, threshold_id) VALUES
('Nhiệt độ phòng hải sản vượt ngưỡng', 'ACTIVE', NOW() - INTERVAL '30 minutes',
	(SELECT threshold_id FROM threshold WHERE device_id = (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-001-A' LIMIT 1) LIMIT 1)),
('Nhiệt độ phòng rau củ trở lại bình thường', 'RESOLVED', NOW() - INTERVAL '10 minutes',
	(SELECT threshold_id FROM threshold WHERE device_id = (SELECT device_id FROM monitor_device WHERE connect_key = 'CTRL-003-A' LIMIT 1) LIMIT 1));

-- 24. report
INSERT INTO report (user_id, report_type, start_period, end_period, url) VALUES
((SELECT user_id FROM users WHERE username = 'admin'), 'Temperature Summary', '2026-04-01', '2026-04-19', '/reports/temp_2026-04.pdf'),
((SELECT user_id FROM users WHERE username = 'staff01'), 'Humidity Summary', '2026-04-01', '2026-04-19', '/reports/humi_2026-04.pdf');

-- 25. inventory_transaction
INSERT INTO inventory_transaction (transaction_type, area_id, room_id, note, created_by, created_at) VALUES
(
	'IN',
	(SELECT area_id FROM storage_zone WHERE area_name = 'Khu A - Hải sản' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 1 - Hải sản tươi sống' LIMIT 1),
	'Nhập bổ sung cá hồi đông lạnh',
	(SELECT user_id FROM users WHERE username = 'staff01' LIMIT 1),
	NOW() - INTERVAL '6 hours'
),
(
	'OUT',
	(SELECT area_id FROM storage_zone WHERE area_name = 'Khu B - Thịt' LIMIT 1),
	(SELECT room_id FROM storage_room WHERE name = 'Phòng 2 - Thịt bò và heo' LIMIT 1),
	'Xuất lô thịt bò theo đơn giao buổi sáng',
	(SELECT user_id FROM users WHERE username = 'staff01' LIMIT 1),
	NOW() - INTERVAL '2 hours'
);

-- 26. inventory_transaction_item
INSERT INTO inventory_transaction_item (transaction_id, food_name, food_type, box_type_id, box_count, unit_volume, total_volume) VALUES
(
	(SELECT transaction_id FROM inventory_transaction WHERE note = 'Nhập bổ sung cá hồi đông lạnh' LIMIT 1),
	'Cá hồi Na Uy',
	'Hải sản',
	(SELECT box_type_id FROM box_type WHERE name = 'Thung L' LIMIT 1),
	12,
	0.240000,
	2.880000
),
(
	(SELECT transaction_id FROM inventory_transaction WHERE note = 'Nhập bổ sung cá hồi đông lạnh' LIMIT 1),
	'Cá ngừ cắt khúc',
	'Hải sản',
	(SELECT box_type_id FROM box_type WHERE name = 'Thung M' LIMIT 1),
	8,
	0.084000,
	0.672000
),
(
	(SELECT transaction_id FROM inventory_transaction WHERE note = 'Xuất lô thịt bò theo đơn giao buổi sáng' LIMIT 1),
	'Thịt bò Úc',
	'Thịt đỏ',
	(SELECT box_type_id FROM box_type WHERE name = 'Thung M' LIMIT 1),
	6,
	0.084000,
	0.504000
);

COMMIT;
