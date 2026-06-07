/**
 * Adafruit IO — gọi qua backend proxy để tránh CORS.
 * Backend proxy: GET/POST /api/adafruit/feeds/{feedKey}/last
 */

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token"))
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type FeedKey =
  | "sensor-data"
  | "fan-control"
  | "threshold"
  | "mode"
  | "temp"
  | "humi"
  | "temp-fan"
  | "humi-fan"
  | "temp-threshold"
  | "humi-threshold"
  | "auto-mode";

export interface RoomPayload { roomId: number; t: number; h: number; }

/** Parse "r1:t=25,h=50" → { roomId:1, t:25, h:50 } */
export function parseRoomPayload(raw: string): RoomPayload | null {
  try {
    const colonIdx = raw.indexOf(":");
    const roomId = parseInt(raw.substring(1, colonIdx));
    const rest = raw.substring(colonIdx + 1);
    const parts = rest.split(",");
    const t = parseFloat(parts[0].split("=")[1]);
    const h = parseFloat(parts[1].split("=")[1]);
    if (isNaN(roomId) || isNaN(t) || isNaN(h)) return null;
    return { roomId, t, h };
  } catch {
    return null;
  }
}

async function getLastValue(feedKey: FeedKey): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/api/adafruit/feeds/${feedKey}/last`, {
      headers: authHeader(),
    });
    if (!res.ok) {
      // console.warn(`[Adafruit proxy] ${feedKey} → ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.value ?? null;
  } catch (e) {
    // console.warn(`[Adafruit proxy] ${feedKey} error:`, e);
    return null;
  }
}

export async function publishFeedValue(feedKey: FeedKey, value: number | string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/adafruit/feeds/${feedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Failed to publish ${feedKey}`);
}

function parseModeValue(raw: string | null): number {
  if (!raw) return 0;
  const value = raw.includes(":") ? raw.substring(raw.indexOf(":") + 1).trim() : raw.trim();
  const mode = parseInt(value);
  return isNaN(mode) ? 0 : mode;
}

export interface AllFeedValues {
  temp: number;
  humi: number;
  tempFan: boolean;
  humiFan: boolean;
  tempThreshold: number;
  humiThreshold: number;
  mode: number; // 0=Manual, 1=Auto, 2=Schedule
}

export async function getAllFeedValues(roomId = 1): Promise<AllFeedValues> {
  const [sensorRaw, fanRaw, thrRaw, modeRaw] = await Promise.all([
    getLastValue("sensor-data"),
    getLastValue("fan-control"),
    getLastValue("threshold"),
    getLastValue("mode"),
  ]);

  const sensor = sensorRaw ? parseRoomPayload(sensorRaw) : null;
  const fan    = fanRaw    ? parseRoomPayload(fanRaw)    : null;
  const thr    = thrRaw    ? parseRoomPayload(thrRaw)    : null;
  const mode   = parseModeValue(modeRaw);

  return {
    temp:          sensor?.t ?? 0,
    humi:          sensor?.h ?? 0,
    tempFan:       fan?.t === 1,
    humiFan:       fan?.h === 1,
    tempThreshold: thr?.t ?? 35,
    humiThreshold: thr?.h ?? 60,
    mode,
  };
}

export async function getAllFeeds(): Promise<Record<FeedKey, number>> {
  const values = await getAllFeedValues();
  return {
    "sensor-data": values.temp,
    "fan-control": values.tempFan || values.humiFan ? 1 : 0,
    threshold: values.tempThreshold,
    mode: values.mode,
    temp: values.temp,
    humi: values.humi,
    "temp-fan": values.tempFan ? 1 : 0,
    "humi-fan": values.humiFan ? 1 : 0,
    "temp-threshold": values.tempThreshold,
    "humi-threshold": values.humiThreshold,
    "auto-mode": values.mode === 1 ? 1 : 0,
  };
}
