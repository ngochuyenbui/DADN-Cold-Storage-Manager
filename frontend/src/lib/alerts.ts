const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token"))
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface AlertItem {
  alertId: number;
  message: string;
  status: "ACTIVE" | "RESOLVED";
  time: string;
  type?: string;
  roomId?: number;
}

function getAlertTargetSection(alert: AlertItem): "sensor" | "fan" | null {
  const marker = `${alert.type ?? ""} ${alert.message}`.toUpperCase();

  if (marker.includes("FAN") || marker.includes("QUẠT")) {
    return "fan";
  }

  if (marker.includes("TEMP") || marker.includes("HUMI") || marker.includes("NHIỆT") || marker.includes("ẨM")) {
    return "sensor";
  }

  return null;
}

export function getAlertActionPath(alert: AlertItem): string {
  const section = getAlertTargetSection(alert);
  const query = new URLSearchParams();
  if (section) query.set("section", section);
  query.set("aid", String(alert.alertId));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  if (typeof alert.roomId === "number" && Number.isFinite(alert.roomId)) {
    return `/zones/room-${alert.roomId}${suffix}`;
  }

  const roomFromMessage = alert.message.match(/ph[oò]ng\s+(\d+)/i);
  if (roomFromMessage?.[1]) {
    return `/zones/room-${roomFromMessage[1]}${suffix}`;
  }

  return "/alerts";
}

export async function getAlerts(status = "ALL", size = 50): Promise<AlertItem[]> {
  const res = await fetch(`${BASE}/api/alerts?status=${status}&size=${size}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Không thể tải cảnh báo");
  return res.json();
}

export async function getAlertCount(): Promise<number> {
  const res = await fetch(`${BASE}/api/alerts/count`, { headers: authHeader() });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}

export async function resolveAlert(id: number): Promise<void> {
  await fetch(`${BASE}/api/alerts/${id}/resolve`, {
    method: "PUT", headers: authHeader(),
  });
}

export async function resolveAllAlerts(): Promise<void> {
  await fetch(`${BASE}/api/alerts/resolve-all`, {
    method: "PUT", headers: authHeader(),
  });
}
