const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token"))
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Fan control (gộp temp-fan + humi-fan) ────────────────────────────────

export async function publishFanControl(
  roomId: number,
  tempFan: 0 | 1,
  humiFan: 0 | 1
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/control/fan-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ roomId, tempFan, humiFan }),
    });
    if (!res.ok) console.error(`[publishFanControl] ${res.status}`);
  } catch (e) { console.error("[publishFanControl] fetch error:", e); }
}

// ── Device control mới: temp-fan + humi-fan + light ──────────────────────

export async function publishDeviceControl(
  roomId: number,
  tempFan: 0 | 1,
  humiFan: 0 | 1,
  light?: 0 | 1
): Promise<void> {
  try {
    const body: Record<string, number> = { roomId, tempFan, humiFan };
    if (light !== undefined) body.light = light;
    const res = await fetch(`${BASE_URL}/api/control/device-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[publishDeviceControl] ${res.status}`);
    else console.log(`[publishDeviceControl] OK → room${roomId} t=${tempFan} h=${humiFan} l=${light}`);
  } catch (e) { console.error("[publishDeviceControl] fetch error:", e); }
}

// ── Threshold (gộp temp + humi) ──────────────────────────────────────────

export async function publishThreshold(
  roomId: number,
  temp: number,
  humi: number
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/control/threshold`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ roomId, temp, humi }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[publishThreshold] ${res.status}:`, text);
    } else {
      console.log(`[publishThreshold] OK → r${roomId}:t=${temp},h=${humi}`);
    }
  } catch (e) {
    console.error("[publishThreshold] fetch error:", e);
  }
}

// ── Mode: 0=Manual, 1=Auto, 2=Schedule ──────────────────────────────────

export async function publishMode(mode: 0 | 1 | 2, roomId = 1): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/control/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ roomId, value: String(mode) }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[publishMode] ${res.status}:`, text);
    } else {
      console.log(`[publishMode] OK → mode=${mode}`);
    }
  } catch (e) {
    console.error("[publishMode] fetch error:", e);
  }
}

// ── Sensor status & history ──────────────────────────────────────────────

export async function getSensorStatus() {
  const res = await fetch(`${BASE_URL}/api/control/sensor-status`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to get sensor status");
  return res.json();
}

export interface HistoryPoint {
  value: number;
  recordedAt: string;
}

export async function getSensorHistory(
  feed: "temp" | "humi" | "light" | "motion",
  hours = 24,
  roomId?: number
): Promise<HistoryPoint[]> {
  const q = new URLSearchParams({ hours: String(hours) });
  if (roomId != null) q.set("roomId", String(roomId));
  const res = await fetch(`${BASE_URL}/api/sensor-history/${feed}?${q}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to get history");
  return res.json();
}
