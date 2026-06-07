BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_scope_type') THEN
        CREATE TYPE schedule_scope_type AS ENUM ('single', 'multiple', 'all');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_type_enum') THEN
        CREATE TYPE schedule_type_enum AS ENUM ('recurring', 'one_time');
    END IF;
END $$;

ALTER TABLE schedule
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS area_id INTEGER,
    ADD COLUMN IF NOT EXISTS scope_type schedule_scope_type DEFAULT 'single',
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mode TEXT,
    ADD COLUMN IF NOT EXISTS set_point NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS set_humid NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS hysteresis NUMERIC(6, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration INTEGER,
    ADD COLUMN IF NOT EXISTS schedule_type schedule_type_enum DEFAULT 'recurring',
    ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
    ADD COLUMN IF NOT EXISTS status BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_schedule_area') THEN
        ALTER TABLE schedule
            ADD CONSTRAINT fk_schedule_area
            FOREIGN KEY (area_id) REFERENCES storage_zone(area_id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_duration_positive') THEN
        ALTER TABLE schedule
            ADD CONSTRAINT schedule_duration_positive CHECK (duration IS NULL OR duration > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_set_point_range') THEN
        ALTER TABLE schedule
            ADD CONSTRAINT schedule_set_point_range CHECK (set_point IS NULL OR (set_point >= -50 AND set_point <= 20));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_hysteresis_non_negative') THEN
        ALTER TABLE schedule
            ADD CONSTRAINT schedule_hysteresis_non_negative CHECK (hysteresis IS NULL OR hysteresis >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_start_before_end') THEN
        ALTER TABLE schedule
            ADD CONSTRAINT schedule_start_before_end CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS schedule_rooms (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedule(schedule_id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES storage_room(room_id) ON DELETE CASCADE,
    UNIQUE (schedule_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_rooms_room_id ON schedule_rooms(room_id);

INSERT INTO schedule_rooms (schedule_id, room_id)
SELECT DISTINCT sh.sched_id, sh.room_id
FROM sched_has sh
ON CONFLICT (schedule_id, room_id) DO NOTHING;

UPDATE schedule s
SET scope_type = CASE
    WHEN x.room_count <= 1 THEN 'single'::schedule_scope_type
    ELSE 'multiple'::schedule_scope_type
END
FROM (
    SELECT schedule_id, COUNT(*) AS room_count
    FROM schedule_rooms
    GROUP BY schedule_id
) x
WHERE s.schedule_id = x.schedule_id
  AND (s.scope_type IS NULL OR s.scope_type = 'single');

-- Nếu muốn enforce "mỗi phòng chỉ 1 lịch tại 1 thời điểm" ở DB layer,
-- có thể thêm EXCLUDE constraint dựa trên tstzrange + room_id ở một bảng slot chuẩn hóa.
-- Với mô hình hiện tại, rule conflict nên kiểm tra ở tầng service trước khi insert/update.

COMMIT;
