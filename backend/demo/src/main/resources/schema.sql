-- Initialize database schema for FreshGuard
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permission (
    permission_id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    UNIQUE (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT UNIQUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    alert_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    alert_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    role_id INTEGER REFERENCES roles(role_id)
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS alert_email_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS alert_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS schedule (
    schedule_id SERIAL PRIMARY KEY,
    name TEXT,
    area_id INTEGER,
    scope_type TEXT DEFAULT 'single',
    priority INTEGER DEFAULT 0,
    mode TEXT,
    set_point NUMERIC(6, 2),
    set_humid NUMERIC(6, 2),
    hysteresis NUMERIC(6, 2) DEFAULT 0,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    schedule_type TEXT DEFAULT 'recurring',
    recurrence_rule JSONB,
    status BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE schedule
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS area_id INTEGER,
    ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'single',
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mode TEXT,
    ADD COLUMN IF NOT EXISTS set_point NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS set_humid NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS hysteresis NUMERIC(6, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration INTEGER,
    ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'recurring',
    ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
    ADD COLUMN IF NOT EXISTS status BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE schedule
    ALTER COLUMN scope_type TYPE TEXT USING scope_type::text;

ALTER TABLE schedule
    ALTER COLUMN schedule_type TYPE TEXT USING schedule_type::text;

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_duration_positive;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_duration_positive CHECK (duration IS NULL OR duration > 0);

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_set_point_range;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_set_point_range CHECK (set_point IS NULL OR (set_point >= -50 AND set_point <= 20));

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_hysteresis_non_negative;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_hysteresis_non_negative CHECK (hysteresis IS NULL OR hysteresis >= 0);

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_start_before_end;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_start_before_end CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time);

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_scope_type_check;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_scope_type_check CHECK (scope_type IN ('single', 'multiple', 'all'));

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS schedule_type_check;

ALTER TABLE schedule
    ADD CONSTRAINT schedule_type_check CHECK (schedule_type IN ('recurring', 'one_time'));

CREATE TABLE IF NOT EXISTS public.storage_zone
(
    area_id SERIAL PRIMARY KEY,
    location TEXT NOT NULL,
	area_name TEXT NOT NULL
);

ALTER TABLE storage_zone
    ADD COLUMN IF NOT EXISTS area_name TEXT;

ALTER TABLE storage_zone
    DROP COLUMN IF EXISTS name;

ALTER TABLE storage_zone
    DROP COLUMN IF EXISTS main_food;

ALTER TABLE schedule
    DROP CONSTRAINT IF EXISTS fk_schedule_area;

ALTER TABLE schedule
    ADD CONSTRAINT fk_schedule_area
    FOREIGN KEY (area_id) REFERENCES storage_zone(area_id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS storage_room (
    room_id SERIAL PRIMARY KEY,
    area_id INTEGER,
    max_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
    current_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
    name TEXT NOT NULL
);

ALTER TABLE storage_room
    DROP COLUMN IF EXISTS capacity;

ALTER TABLE storage_room
    ADD COLUMN IF NOT EXISTS area_id INTEGER;

ALTER TABLE storage_room
    ADD COLUMN IF NOT EXISTS max_volume DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE storage_room
    ADD COLUMN IF NOT EXISTS current_volume DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE storage_room
    DROP CONSTRAINT IF EXISTS fk_storage_room_area;

ALTER TABLE storage_room
    ADD CONSTRAINT fk_storage_room_area
    FOREIGN KEY (area_id) REFERENCES storage_zone(area_id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_storage_room_area_id ON storage_room(area_id);

DROP TABLE IF EXISTS storage_has;

CREATE TABLE IF NOT EXISTS food (
    food_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    expire_date DATE,
    imported_date DATE,
    description TEXT,
    min_humid FLOAT,
    max_humid FLOAT,
    min_temper FLOAT,
    max_temper FLOAT,
    weight FLOAT
);

CREATE TABLE IF NOT EXISTS sensor_device (
    device_id SERIAL PRIMARY KEY,
    connect_key TEXT NOT NULL,
    name TEXT,
    install_date DATE,
    status TEXT,
    temperature FLOAT,
    humidity FLOAT,
    last_updated TIMESTAMP DEFAULT NOW(),
    room_id INTEGER REFERENCES storage_room(room_id)
);

CREATE TABLE IF NOT EXISTS monitor_device (
    device_id SERIAL PRIMARY KEY,
    connect_key TEXT NOT NULL,
    name TEXT,
    install_date DATE,
    status TEXT,
    mode TEXT,
    speed INTEGER,
    value FLOAT,
    room_id INTEGER REFERENCES storage_room(room_id)
);

CREATE TABLE IF NOT EXISTS threshold (
    threshold_id SERIAL PRIMARY KEY,
    min_value FLOAT,
    max_value FLOAT,
    unit TEXT,
    created_time TIMESTAMP DEFAULT NOW(),
    device_id INTEGER
);

CREATE TABLE IF NOT EXISTS monitor_control_by (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    device_id INTEGER REFERENCES monitor_device(device_id),
    command_type TEXT,
    time TIMESTAMP DEFAULT NOW(),
    value FLOAT,
    PRIMARY KEY (user_id, device_id, time)
);

CREATE TABLE IF NOT EXISTS schedule_rooms (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedule(schedule_id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES storage_room(room_id) ON DELETE CASCADE,
    UNIQUE (schedule_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_rooms_room_id ON schedule_rooms(room_id);

CREATE TABLE IF NOT EXISTS sched_has (
    food_id INTEGER REFERENCES food(food_id),
    sched_id INTEGER REFERENCES schedule(schedule_id),
    room_id INTEGER REFERENCES storage_room(room_id),
    PRIMARY KEY (food_id, sched_id, room_id)
);

-- Backfill mapping mới từ bảng liên kết cũ để chạy 1 file schema vẫn không mất tương thích.
INSERT INTO schedule_rooms (schedule_id, room_id)
SELECT DISTINCT sh.sched_id, sh.room_id
FROM sched_has sh
ON CONFLICT (schedule_id, room_id) DO NOTHING;

UPDATE schedule s
SET scope_type = CASE
    WHEN x.room_count <= 1 THEN 'single'
    ELSE 'multiple'
END
FROM (
    SELECT schedule_id, COUNT(*) AS room_count
    FROM schedule_rooms
    GROUP BY schedule_id
) x
WHERE s.schedule_id = x.schedule_id
  AND (s.scope_type IS NULL OR s.scope_type = 'single');

CREATE TABLE IF NOT EXISTS food_has (
    food_id INTEGER REFERENCES food(food_id),
    room_id INTEGER REFERENCES storage_room(room_id),
    PRIMARY KEY (food_id, room_id)
);

CREATE TABLE IF NOT EXISTS inventory_transaction (
    transaction_id SERIAL PRIMARY KEY,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN', 'OUT')),
    area_id INTEGER NOT NULL REFERENCES storage_zone(area_id),
    room_id INTEGER NOT NULL REFERENCES storage_room(room_id),
    note TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS box_type (
    box_type_id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    length_m NUMERIC(10, 3) NOT NULL CHECK (length_m > 0),
    width_m NUMERIC(10, 3) NOT NULL CHECK (width_m > 0),
    height_m NUMERIC(10, 3) NOT NULL CHECK (height_m > 0),
    volume_m3 NUMERIC(12, 6) NOT NULL CHECK (volume_m3 > 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO box_type (name, length_m, width_m, height_m, volume_m3)
VALUES
    ('Thung S', 0.400, 0.300, 0.250, 0.030000),
    ('Thung M', 0.600, 0.400, 0.350, 0.084000),
    ('Thung L', 0.800, 0.600, 0.500, 0.240000)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS inventory_transaction_item (
    item_id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES inventory_transaction(transaction_id) ON DELETE CASCADE,
    food_name TEXT NOT NULL,
    food_type TEXT,
    box_type_id INTEGER REFERENCES box_type(box_type_id) ON DELETE SET NULL,
    box_count INTEGER NOT NULL CHECK (box_count > 0),
    unit_volume NUMERIC(12, 6) NOT NULL CHECK (unit_volume > 0),
    total_volume NUMERIC(14, 6) NOT NULL CHECK (total_volume > 0)
);

ALTER TABLE inventory_transaction_item
    ADD COLUMN IF NOT EXISTS box_type_id INTEGER REFERENCES box_type(box_type_id) ON DELETE SET NULL;

ALTER TABLE inventory_transaction_item
    ALTER COLUMN unit_volume TYPE NUMERIC(12, 6),
    ALTER COLUMN total_volume TYPE NUMERIC(14, 6);

CREATE INDEX IF NOT EXISTS idx_inventory_transaction_area_id ON inventory_transaction(area_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transaction_room_id ON inventory_transaction(room_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transaction_created_at ON inventory_transaction(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transaction_item_box_type_id ON inventory_transaction_item(box_type_id);

CREATE TABLE IF NOT EXISTS scheduled_by (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES schedule(schedule_id),
    PRIMARY KEY (user_id, schedule_id)
);

CREATE TABLE IF NOT EXISTS setup_by (
    threshold_id INTEGER REFERENCES threshold(threshold_id),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (threshold_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_log (
    log_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    type_action TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    description TEXT
);

CREATE TABLE IF NOT EXISTS device_log (
    dlog_id SERIAL PRIMARY KEY,
    device_id INTEGER,
    description TEXT,
    type_action TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert (
    alert_id SERIAL PRIMARY KEY,
    message TEXT,
    status TEXT,
    time TIMESTAMP DEFAULT NOW(),
    threshold_id INTEGER REFERENCES threshold(threshold_id)
);

CREATE TABLE IF NOT EXISTS report (
    report_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    report_type TEXT,
    created_date DATE DEFAULT CURRENT_DATE,
    start_period DATE,
    end_period DATE,
    url TEXT
);

-- Alert: thêm các cột mới cho báo cáo lỗi và auto-resolve
ALTER TABLE alert ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS room_id INTEGER;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS resolved_by TEXT;

-- MonitorDevice: thêm device_category
ALTER TABLE monitor_device ADD COLUMN IF NOT EXISTS device_category TEXT DEFAULT 'OTHER';

-- Bảng báo cáo lỗi do người dùng gửi
CREATE TABLE IF NOT EXISTS user_issue_report (
    report_id   SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'OTHER',
    room_id     INTEGER REFERENCES storage_room(room_id) ON DELETE SET NULL,
    reported_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    note        TEXT
);

-- Lịch bật/tắt thiết bị theo thời gian
CREATE TABLE IF NOT EXISTS device_schedule (
    id          SERIAL PRIMARY KEY,
    device_id   INTEGER NOT NULL REFERENCES monitor_device(device_id) ON DELETE CASCADE,
    room_id     INTEGER NOT NULL REFERENCES storage_room(room_id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'repeat',
    one_time_at TIMESTAMP,
    action      TEXT NOT NULL DEFAULT 'ON',
    temperature_threshold FLOAT,
    days_of_week TEXT NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI,SAT,SUN',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'repeat';
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS one_time_at TIMESTAMP;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'ON';
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS temperature_threshold FLOAT;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP;
