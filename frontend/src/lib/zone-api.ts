const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Zone {
  areaId: number;
  areaName: string;
  location: string;
}

export interface Room {
  roomId: number;
  areaId?: number;
  name: string;
  maxVolume?: number;
  currentVolume?: number;
}

export interface SensorDevice {
  deviceId: number;
  name: string;
  connectKey: string;
  status: string;
  temperature: number | null;
  humidity: number | null;
  lastUpdated: string | null;
  roomId: number | null;
  installDate: string | null;
}

export interface MonitorDevice {
  deviceId: number;
  name: string;
  connectKey: string;
  status: string;
  mode: string;
  value: number | null;
  roomId: number | null;
  installDate: string | null;
  deviceCategory: string | null;
}

// ── Zones ──────────────────────────────────────────────────────────────────

export async function getZones(token: string): Promise<Zone[]> {
  const r = await fetch(`${BASE}/api/zones`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error("Không thể tải khu vực");
  return r.json();
}

export async function createZone(token: string, data: { areaName: string; location?: string }): Promise<Zone> {
  const r = await fetch(`${BASE}/api/zones`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Tạo khu vực thất bại");
  return j;
}

export async function updateZone(token: string, id: number, data: Partial<Zone>): Promise<Zone> {
  const r = await fetch(`${BASE}/api/zones/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Cập nhật thất bại");
  return j;
}

export async function deleteZone(token: string, id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/zones/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!r.ok) throw new Error("Xóa khu vực thất bại");
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function getRooms(token: string, areaId?: number): Promise<Room[]> {
  const q = areaId != null ? `?areaId=${areaId}` : "";
  const r = await fetch(`${BASE}/api/rooms${q}`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error("Không thể tải phòng");
  return r.json();
}

export async function createRoom(token: string, data: { name: string; maxVolume?: number; currentVolume?: number; areaId?: number }): Promise<Room> {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Tạo phòng thất bại");
  return j;
}

export async function updateRoom(token: string, id: number, data: Partial<Room>): Promise<Room> {
  const r = await fetch(`${BASE}/api/rooms/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Cập nhật thất bại");
  return j;
}

export async function deleteRoom(token: string, id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/rooms/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!r.ok) throw new Error("Xóa phòng thất bại");
}

// ── Sensors ────────────────────────────────────────────────────────────────

export async function getSensors(token: string, roomId?: number): Promise<SensorDevice[]> {
  const q = roomId != null ? `?roomId=${roomId}` : "";
  const r = await fetch(`${BASE}/api/sensors${q}`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error("Không thể tải cảm biến");
  return r.json();
}

export async function createSensor(token: string, data: Partial<SensorDevice>): Promise<SensorDevice> {
  const r = await fetch(`${BASE}/api/sensors`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Thêm cảm biến thất bại");
  return j;
}

export async function updateSensor(token: string, id: number, data: Partial<SensorDevice>): Promise<SensorDevice> {
  const r = await fetch(`${BASE}/api/sensors/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Cập nhật thất bại");
  return j;
}

export async function deleteSensor(token: string, id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/sensors/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!r.ok) throw new Error("Xóa cảm biến thất bại");
}

// ── Monitor Devices ────────────────────────────────────────────────────────

export async function getMonitorDevices(token: string, roomId?: number): Promise<MonitorDevice[]> {
  const q = roomId != null ? `?roomId=${roomId}` : "";
  const r = await fetch(`${BASE}/api/devices${q}`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error("Không thể tải thiết bị");
  return r.json();
}

export async function createMonitorDevice(token: string, data: Partial<MonitorDevice>): Promise<MonitorDevice> {
  const r = await fetch(`${BASE}/api/devices`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Thêm thiết bị thất bại");
  return j;
}

export async function updateMonitorDevice(token: string, id: number, data: Partial<MonitorDevice>): Promise<MonitorDevice> {
  const r = await fetch(`${BASE}/api/devices/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Cập nhật thất bại");
  return j;
}

export async function deleteMonitorDevice(token: string, id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/devices/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!r.ok) throw new Error("Xóa thiết bị thất bại");
}

// ── Schedules ───────────────────────────────────────────────────────────────

export interface CreateSchedulePayload {
  name: string;
  scope_type: "single" | "multiple" | "all";
  room_id?: number;
  room_ids?: number[];
  area_id?: number;
  priority?: number;
  mode?: string;
  set_point?: number;
  set_humid?: number;
  hysteresis?: number;
  start_time: string;
  end_time?: string;
  duration?: number;
  schedule_type?: "recurring" | "one_time";
  recurrence_rule?: Record<string, unknown>;
  status?: boolean;
  description?: string;
  timezone?: string;
  food_id?: number;
}

export interface ScheduleResponse {
  [key: string]: unknown;
}

export async function getSchedules(token: string, roomId?: number): Promise<ScheduleResponse[]> {
  const q = roomId != null ? `?roomId=${roomId}` : "";
  const r = await fetch(`${BASE}/api/schedules${q}`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error("Không thể tải lịch trình");
  return r.json() as Promise<ScheduleResponse[]>;
}

export async function createSchedule(token: string, payload: CreateSchedulePayload): Promise<ScheduleResponse> {
  const r = await fetch(`${BASE}/api/schedules`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const j = await r.json() as ScheduleResponse;
  if (!r.ok) throw new Error(String(j.error ?? "Tạo lịch trình thất bại"));
  return j;
}
