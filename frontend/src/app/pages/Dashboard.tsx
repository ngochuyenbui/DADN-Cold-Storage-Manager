"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  DoorOpen,
  Gauge,
  PlugZap,
  Snowflake,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { getMonitorDevices, getRooms, getSensors, getZones, type MonitorDevice, type SensorDevice } from "@/lib/zone-api";
import { getAlerts, type AlertItem as ApiAlert } from "@/lib/alerts";
import { getSensorHistory, type HistoryPoint } from "@/lib/api";
import { getInventoryTransactions, type InventoryTransaction } from "@/lib/inventory-transactions";

type AlertLevel = "safe" | "warning" | "danger";

type FoodRow = {
  foodId: number;
  name: string;
  type?: string;
  expireDate?: string;
  minTemper?: number;
  maxTemper?: number;
  roomId?: number;
};

type RoomSnapshot = {
  id: string;
  roomId: number;
  zoneId: string;
  zoneName: string;
  name: string;
  maxVolume: number;
  currentVolume: number;
  temperature: number;
  humidity: number;
  targetMin: number;
  targetMax: number;
  stabilityScore: number;
};

type ZoneSnapshot = {
  id: string;
  areaId: number;
  name: string;
  rooms: RoomSnapshot[];
};

type AlertView = {
  id: string;
  zoneId: string;
  roomId: number | null;
  roomName: string;
  type: string;
  message: string;
  at: string;
  severity: AlertLevel;
};

type FlowPoint = {
  period: string;
  inFlow: number;
  outFlow: number;
};

type DeviceStatusSummary = {
  totalDevices: number;
  onlineDevices: number;
  manualDevices: number;
  autoDevices: number;
  scheduledDevices: number;
  windowSchedules: number;
  onlyOnSchedules: number;
  onlyOffSchedules: number;
  activeSchedules: number;
  nextScheduleAt: string;
  nextScheduleRoom: string;
  nextScheduleAction: string;
};

type DeviceScheduleRow = {
  id: number;
  deviceId: number;
  roomId: number;
  name: string;
  scheduleType?: "one_time" | "repeat";
  oneTimeAt?: string | null;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
  action?: string | null;
  active: boolean;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const EMPTY_ZONE: ZoneSnapshot = { id: "", areaId: 0, name: "", rooms: [] };

function numberValue(input: unknown, fallback = 0): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toDate(input?: string): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyTemperature(temp: number, min: number, max: number): AlertLevel {
  if (temp < min - 1 || temp > max + 1) return "danger";
  if (temp < min || temp > max) return "warning";
  return "safe";
}

function levelColor(level: AlertLevel): string {
  if (level === "safe") return "text-emerald-400";
  if (level === "warning") return "text-amber-400";
  return "text-rose-400";
}

function levelLabel(level: AlertLevel): string {
  if (level === "safe") return "An toàn";
  if (level === "warning") return "Cảnh báo";
  return "Nguy hiểm";
}

function normalizeControllerMode(mode?: string | null): "Manual" | "Auto" | "Schedule" {
  const text = String(mode ?? "").trim().toUpperCase();
  if (text.includes("AUTO")) return "Auto";
  if (text.includes("SCHEDULE") || text.includes("SCHED")) return "Schedule";
  return "Manual";
}

function normalizeScheduleAction(action?: string | null): "window" | "only_on" | "only_off" {
  const text = String(action ?? "WINDOW").trim().toUpperCase();
  if (text === "ONLY_ON" || text === "ON") return "only_on";
  if (text === "ONLY_OFF" || text === "OFF") return "only_off";
  return "window";
}

function parseTimeToMinutes(value: string): number {
  const [hourText = "0", minuteText = "0"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    hour12: false,
  });
}

function getNextScheduleOccurrence(schedule: DeviceScheduleRow, now: Date): Date | null {
  if (!schedule.active) return null;

  if (schedule.scheduleType === "one_time") {
    const oneTimeAt = schedule.oneTimeAt ? new Date(schedule.oneTimeAt) : null;
    if (oneTimeAt && !Number.isNaN(oneTimeAt.getTime()) && oneTimeAt.getTime() >= now.getTime()) {
      return oneTimeAt;
    }
    return null;
  }

  const days = schedule.daysOfWeek
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
  const startMinutes = parseTimeToMinutes(schedule.startTime);
  const searchDays = days.length > 0 ? days : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(0, 0, 0, 0);
    const dayCode = weekDays[candidate.getDay()];
    if (!searchDays.includes(dayCode)) continue;

    candidate.setMinutes(startMinutes);
    if (offset > 0 || candidate.getTime() >= now.getTime()) {
      return candidate;
    }
  }

  return null;
}

// function getNextScheduleLabel(schedule: DeviceScheduleRow): string {
//   const action = normalizeScheduleAction(schedule.action);
//   if (action === "only_on") return "Chỉ BẬT";
//   if (action === "only_off") return "Chỉ TẮT";
//   return "Khung giờ";
// }

function buildFlowFromTransactions(transactions: InventoryTransaction[]): FlowPoint[] {
  const labels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const today = new Date();
  const buckets: Array<{ dateKey: string; period: string; inFlow: number; outFlow: number }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const dateKey = d.toISOString().slice(0, 10);
    buckets.push({
      dateKey,
      period: labels[d.getDay()],
      inFlow: 0,
      outFlow: 0,
    });
  }

  const indexByDate = new Map<string, number>();
  buckets.forEach((b, idx) => indexByDate.set(b.dateKey, idx));

  for (const transaction of transactions) {
    const ts = typeof transaction.createdAt === "string" ? transaction.createdAt : "";
    const d = toDate(ts);
    if (!d) continue;

    const dateKey = d.toISOString().slice(0, 10);
    const idx = indexByDate.get(dateKey);
    if (idx == null) continue;

    const totalBoxes = (transaction.items ?? []).reduce((sum, item) => sum + (item.boxCount ?? 0), 0);
    if (totalBoxes <= 0) continue;

    if (transaction.transactionType === "IN") {
      buckets[idx].inFlow += totalBoxes;
    } else if (transaction.transactionType === "OUT") {
      buckets[idx].outFlow += totalBoxes;
    }
  }

  return buckets.map((b) => ({ period: b.period, inFlow: b.inFlow, outFlow: b.outFlow }));
}

export default function Dashboard() {
  const { token, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zonesData, setZonesData] = useState<ZoneSnapshot[]>([]);
  const [alertsData, setAlertsData] = useState<AlertView[]>([]);
  const [envSeries, setEnvSeries] = useState<Array<{ time: string; temp: number; humi: number }>>([]);
  const [flowArea, setFlowArea] = useState<FlowPoint[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusSummary>({
    totalDevices: 0,
    onlineDevices: 0,
    manualDevices: 0,
    autoDevices: 0,
    scheduledDevices: 0,
    windowSchedules: 0,
    onlyOnSchedules: 0,
    onlyOffSchedules: 0,
    activeSchedules: 0,
    nextScheduleAt: "--",
    nextScheduleRoom: "--",
    nextScheduleAction: "--",
  });

  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [showAlerts, setShowAlerts] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!token) {
        if (!authLoading) {
          setLoading(false);
          setError("Không tìm thấy phiên đăng nhập để tải dashboard.");
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const zones = await getZones(token);

        const roomsByZone = await Promise.all(
          zones.map(async (zone) => ({
            zone,
            rooms: await getRooms(token, zone.areaId),
          }))
        );

        const allRoomsFlat = roomsByZone.flatMap((entry) => entry.rooms);
        const roomIds = allRoomsFlat.map((r) => r.roomId);
        const roomNameById = new Map(allRoomsFlat.map((room) => [room.roomId, room.name] as const));

        const [sensors, apiAlerts, tempHistory, humiHistory, transactions] = await Promise.all([
          getSensors(token),
          getAlerts("ALL", 100),
          getSensorHistory("temp", 24).catch(() => [] as HistoryPoint[]),
          getSensorHistory("humi", 24).catch(() => [] as HistoryPoint[]),
          getInventoryTransactions(token, { type: "ALL" }).catch(() => [] as InventoryTransaction[]),
        ]);

        const [monitorEntries, deviceScheduleEntries] = await Promise.all([
          Promise.all(
            roomIds.map(async (roomId) => ({
              roomId,
              devices: await getMonitorDevices(token, roomId).catch(() => [] as MonitorDevice[]),
            }))
          ),
          Promise.all(
            roomIds.map(async (roomId) => {
              const response = await fetch(`${BASE_URL}/api/device-schedules?roomId=${roomId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) return { roomId, schedules: [] as DeviceScheduleRow[] };
              return { roomId, schedules: (await response.json()) as DeviceScheduleRow[] };
            })
          ),
        ]);

        const foodsByRoomEntries = await Promise.all(
          roomIds.map(async (roomId) => {
            const response = await fetch(`${BASE_URL}/api/foods?roomId=${roomId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return { roomId, foods: [] as FoodRow[] };
            const foods = (await response.json()) as FoodRow[];
            return { roomId, foods };
          })
        );

        const foodsByRoom = new Map<number, FoodRow[]>();
        foodsByRoomEntries.forEach((entry) => foodsByRoom.set(entry.roomId, entry.foods));

  const monitorByRoom = new Map<number, MonitorDevice[]>();
  monitorEntries.forEach((entry) => monitorByRoom.set(entry.roomId, entry.devices));

  const scheduleByRoom = new Map<number, DeviceScheduleRow[]>();
  deviceScheduleEntries.forEach((entry) => scheduleByRoom.set(entry.roomId, entry.schedules));

        const sensorByRoom = new Map<number, SensorDevice>();
        for (const sensor of sensors) {
          if (typeof sensor.roomId === "number" && !sensorByRoom.has(sensor.roomId)) {
            sensorByRoom.set(sensor.roomId, sensor);
          }
        }

        const zoneSnapshots: ZoneSnapshot[] = roomsByZone.map(({ zone, rooms }) => {
          const mappedRooms: RoomSnapshot[] = rooms.map((roomRaw) => {
            const room = roomRaw as { roomId: number; name: string; maxVolume?: number; currentVolume?: number };
            const sensor = sensorByRoom.get(room.roomId);
            const foods = foodsByRoom.get(room.roomId) ?? [];

            const minCandidates = foods
              .map((f) => numberValue(f.minTemper, NaN))
              .filter((v) => Number.isFinite(v));
            const maxCandidates = foods
              .map((f) => numberValue(f.maxTemper, NaN))
              .filter((v) => Number.isFinite(v));

            const targetMin = minCandidates.length > 0
              ? minCandidates.reduce((a, b) => a + b, 0) / minCandidates.length
              : 0;
            const targetMax = maxCandidates.length > 0
              ? maxCandidates.reduce((a, b) => a + b, 0) / maxCandidates.length
              : 4;

            const maxVolume = numberValue(room.maxVolume, 0);
            const currentVolume = numberValue(room.currentVolume, 0);
            const temperature = numberValue(sensor?.temperature, 0);
            const humidity = numberValue(sensor?.humidity, 0);
            const center = (targetMin + targetMax) / 2;
            const deviation = Math.abs(temperature - center);
            const stabilityScore = Math.max(30, Math.min(98, Math.round(100 - deviation * 18)));

            return {
              id: `room-${room.roomId}`,
              roomId: room.roomId,
              zoneId: `zone-${zone.areaId}`,
              zoneName: zone.areaName,
              name: room.name,
              maxVolume,
              currentVolume,
              temperature,
              humidity,
              targetMin,
              targetMax,
              stabilityScore,
            };
          });

          return {
            id: `zone-${zone.areaId}`,
            areaId: zone.areaId,
            name: zone.areaName,
            rooms: mappedRooms,
          };
        });

        const roomToZone = new Map<number, ZoneSnapshot>();
        const roomToName = new Map<number, string>();
        zoneSnapshots.forEach((z) => {
          z.rooms.forEach((r) => {
            roomToZone.set(r.roomId, z);
            roomToName.set(r.roomId, r.name);
          });
        });

        const mappedAlerts: AlertView[] = apiAlerts.map((alert: ApiAlert) => {
          const roomId = typeof alert.roomId === "number" ? alert.roomId : null;
          const zone = roomId != null ? roomToZone.get(roomId) : undefined;
          const marker = `${alert.type ?? ""} ${alert.message}`.toUpperCase();

          let severity: AlertLevel = "warning";
          if (alert.status === "RESOLVED") severity = "safe";
          if (marker.includes("TEMP") || marker.includes("MẤT") || marker.includes("POWER")) severity = "danger";

          return {
            id: `alert-${alert.alertId}`,
            zoneId: zone?.id ?? "",
            roomId,
            roomName: roomId != null ? (roomToName.get(roomId) ?? `Phòng ${roomId}`) : "Toàn kho",
            type: alert.type ?? "Alert",
            message: alert.message,
            at: toDate(alert.time)?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--",
            severity,
          };
        });

        const tempSeries = tempHistory.map((x) => ({
          time: toDate(x.recordedAt)?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--",
          temp: numberValue(x.value, 0),
        }));
        const humiSeries = humiHistory.map((x) => ({
          time: toDate(x.recordedAt)?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--",
          humi: numberValue(x.value, 0),
        }));

        const envMap = new Map<string, { time: string; temp?: number; humi?: number }>();
        for (const p of tempSeries) {
          envMap.set(p.time, { ...(envMap.get(p.time) ?? { time: p.time }), temp: p.temp });
        }
        for (const p of humiSeries) {
          envMap.set(p.time, { ...(envMap.get(p.time) ?? { time: p.time }), humi: p.humi });
        }

        const env = Array.from(envMap.values())
          .map((p) => ({ time: p.time, temp: numberValue(p.temp, 0), humi: numberValue(p.humi, 0) }))
          .slice(-12);

        const flow = buildFlowFromTransactions(transactions);

        const allMonitorDevices = Array.from(monitorByRoom.values()).flat();
        const allDeviceSchedules = Array.from(scheduleByRoom.entries()).flatMap(([roomId, schedules]) =>
          schedules.map((schedule) => ({ ...schedule, roomId }))
        );
        const scheduleNow = new Date();
        const nextSchedule = allDeviceSchedules
          .map((schedule) => ({
            schedule,
            nextAt: getNextScheduleOccurrence(schedule, scheduleNow),
          }))
          .filter((item): item is { schedule: DeviceScheduleRow; nextAt: Date } => item.nextAt != null)
          .sort((a, b) => a.nextAt.getTime() - b.nextAt.getTime())[0];

        const controllerModeCounts = allMonitorDevices.reduce(
          (acc, device) => {
            const mode = normalizeControllerMode(device.mode);
            acc.totalDevices += 1;
            if (String(device.status ?? "").toLowerCase() === "online") acc.onlineDevices += 1;
            if (mode === "Manual") acc.manualDevices += 1;
            if (mode === "Auto") acc.autoDevices += 1;
            if (mode === "Schedule") acc.scheduledDevices += 1;
            return acc;
          },
          {
            totalDevices: 0,
            onlineDevices: 0,
            manualDevices: 0,
            autoDevices: 0,
            scheduledDevices: 0,
          }
        );

        const scheduleModeCounts = allDeviceSchedules.reduce(
          (acc, schedule) => {
            if (!schedule.active) return acc;
            const action = normalizeScheduleAction(schedule.action);
            acc.activeSchedules += 1;
            if (action === "window") acc.windowSchedules += 1;
            if (action === "only_on") acc.onlyOnSchedules += 1;
            if (action === "only_off") acc.onlyOffSchedules += 1;
            return acc;
          },
          {
            windowSchedules: 0,
            onlyOnSchedules: 0,
            onlyOffSchedules: 0,
            activeSchedules: 0,
          }
        );

        if (!active) return;
        setZonesData(zoneSnapshots);
        setAlertsData(mappedAlerts);
        setEnvSeries(env);
        setFlowArea(flow);
        setDeviceStatus({
          totalDevices: controllerModeCounts.totalDevices,
          onlineDevices: controllerModeCounts.onlineDevices,
          manualDevices: controllerModeCounts.manualDevices,
          autoDevices: controllerModeCounts.autoDevices,
          scheduledDevices: controllerModeCounts.scheduledDevices,
          windowSchedules: scheduleModeCounts.windowSchedules,
          onlyOnSchedules: scheduleModeCounts.onlyOnSchedules,
          onlyOffSchedules: scheduleModeCounts.onlyOffSchedules,
          activeSchedules: scheduleModeCounts.activeSchedules,
          nextScheduleAt: nextSchedule ? formatDateTime(nextSchedule.nextAt) : "--",
          nextScheduleRoom: nextSchedule ? (roomNameById.get(nextSchedule.schedule.roomId) ?? `Phòng ${nextSchedule.schedule.roomId}`) : "--",
          nextScheduleAction: nextSchedule ? getNextScheduleLabel(nextSchedule.schedule) : "--",
        });

        if (zoneSnapshots.length > 0) {
          setSelectedZoneId((prev) => (zoneSnapshots.some((z) => z.id === prev) ? prev : zoneSnapshots[0].id));
        }
      } catch {
        if (!active) return;
        setError("Không thể tải dữ liệu dashboard từ API.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [token, authLoading]);

  const selectedZone = useMemo(
    () => zonesData.find((z) => z.id === selectedZoneId) ?? zonesData[0] ?? EMPTY_ZONE,
    [zonesData, selectedZoneId]
  );

  const allRooms = useMemo(() => zonesData.flatMap((z) => z.rooms), [zonesData]);

  const totalUsable = useMemo(
    () => allRooms.reduce((sum, room) => sum + numberValue(room.maxVolume, 0), 0),
    [allRooms]
  );

  const totalCurrent = useMemo(
    () => allRooms.reduce((sum, room) => sum + numberValue(room.currentVolume, 0), 0),
    [allRooms]
  );

  const volumePercent = totalUsable > 0 ? (totalCurrent / totalUsable) * 100 : 0;

  const roomConditions = useMemo(
    () => allRooms.map((room) => ({ roomId: room.id, roomName: room.name, level: classifyTemperature(room.temperature, room.targetMin, room.targetMax) })),
    [allRooms]
  );

  const safeCount = roomConditions.filter((x) => x.level === "safe").length;
  const warningCount = roomConditions.filter((x) => x.level === "warning").length;
  const dangerCount = roomConditions.filter((x) => x.level === "danger").length;

  const zoneVolumeData = useMemo(
    () =>
      zonesData.map((zone) => {
        const used = zone.rooms.reduce((sum, room) => sum + numberValue(room.currentVolume, 0), 0);
        const usable = zone.rooms.reduce((sum, room) => sum + numberValue(room.maxVolume, 0), 0);
        return {
          zoneId: zone.id,
          zoneName: zone.name,
          used,
          free: Math.max(usable - used, 0),
        };
      }),
    [zonesData]
  );

  const roomVolumeData = useMemo(
    () =>
      selectedZone.rooms.map((room) => {
        const usable = numberValue(room.maxVolume, 0);
        const used = numberValue(room.currentVolume, 0);
        return {
          roomId: room.id,
          roomName: room.name,
          used,
          free: Math.max(usable - used, 0),
          usedPct: usable > 0 ? (used / usable) * 100 : 0,
        };
      }),
    [selectedZone]
  );

  const zoneHeatmap = useMemo(
    () =>
      selectedZone.rooms.map((room) => ({
        roomId: room.id,
        roomName: room.name,
        score: room.stabilityScore,
      })),
    [selectedZone]
  );

  const zoneAlerts = useMemo(
    () => alertsData.filter((a) => !a.zoneId || a.zoneId === selectedZone.id),
    [alertsData, selectedZone.id]
  );

  const heatColor = (score: number) => {
    if (score >= 85) return "bg-emerald-500/70";
    if (score >= 70) return "bg-lime-500/70";
    if (score >= 55) return "bg-amber-500/70";
    return "bg-rose-600/70";
  };

  return (
    <div
      className="space-y-6"
      style={{
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
      }}
    >
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,.2),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(52,211,153,.22),transparent_35%),linear-gradient(135deg,rgba(15,23,42,.88),rgba(10,14,29,.95))] p-5 shadow-[0_20px_50px_rgba(2,6,23,.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/90">Cold Storage Ops Center</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Dashboard Quản Lý Kho Đông Lạnh</h1>
            <p className="mt-2 text-sm text-slate-300">
              Theo dõi vận hành toàn kho, drill-down từ Khu xuống từng Phòng để phát hiện sớm rủi ro.
            </p>
            {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          </div>
          {/* Zone selector removed per UX request */}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-emerald-500/30 bg-emerald-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-emerald-200">
                <Building2 className="h-4 w-4" /> Tổng Khu/Phòng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-white">Khu: {zonesData.length} | Phòng: {allRooms.length}</p>
              <p className="mt-1 text-xs text-emerald-100/80">Dữ liệu tổng hợp toàn hệ thống</p>
            </CardContent>
          </Card>

          <Card className="border-cyan-500/30 bg-cyan-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-cyan-200">
                <Snowflake className="h-4 w-4" /> Trạng thái nhiệt độ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white">
                <span className="text-emerald-300">An toàn</span>
                <span>{safeCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-white">
                <span className="text-amber-300">Cảnh báo</span>
                <span>{warningCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-white">
                <span className="text-rose-300">Nguy hiểm</span>
                <span>{dangerCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4" /> Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() => setShowAlerts((v) => !v)}
                className="text-left"
              >
                <p className="text-2xl font-semibold text-white">{alertsData.length} sự cố</p>
                <p className="mt-1 text-xs text-amber-100/80">Nhấn để xem chi tiết theo phòng</p>
              </button>
            </CardContent>
          </Card>

          <Card className="border-fuchsia-500/30 bg-fuchsia-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-fuchsia-200">
                <Gauge className="h-4 w-4" /> Công suất kho hiện tại
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-white">{volumePercent.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        {showAlerts && (
          <div className="mt-4 grid gap-2 rounded-xl border border-amber-400/30 bg-slate-900/50 p-3">
            {zoneAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {alert.type.toUpperCase().includes("DOOR") && <DoorOpen className="h-4 w-4 text-amber-300" />}
                  {alert.type.toUpperCase().includes("POWER") && <PlugZap className="h-4 w-4 text-amber-300" />}
                  {!alert.type.toUpperCase().includes("DOOR") && !alert.type.toUpperCase().includes("POWER") && <Snowflake className="h-4 w-4 text-amber-300" />}
                  <div>
                    <p className="text-sm text-white">{alert.roomName} • {alert.type}</p>
                    <p className="text-xs text-slate-300">{alert.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={levelColor(alert.severity)}>{levelLabel(alert.severity)}</Badge>
                  <span className="text-xs text-slate-400">{alert.at}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(loading || authLoading) && (
        <Card className="border-slate-700 bg-slate-950/80">
          <CardContent className="p-4 text-sm text-slate-300">Đang tải dữ liệu từ API...</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-700 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Volume Analysis (Drill-down)</CardTitle>
            <p className="text-xs text-slate-400">Nhấn vào cột để chọn Khu, xem chi tiết đến từng Phòng.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
                <BarChart data={zoneVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="zoneName" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="used" stackId="volume" fill="#22d3ee" name="Đã dùng (m3)" onClick={(row) => setSelectedZoneId(String(row.zoneId))} />
                  <Bar dataKey="free" stackId="volume" fill="#1e293b" name="Còn trống (m3)" onClick={(row) => setSelectedZoneId(String(row.zoneId))} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-[250px] w-full rounded-lg border border-slate-700/80 bg-slate-900/70 p-2">
              <ResponsiveContainer>
                <BarChart data={roomVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="roomName" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="used" stackId="room" fill="#10b981" name="Đã dùng (m3)" />
                  <Bar dataKey="free" stackId="room" fill="#0f172a" name="Còn trống (m3)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-3">
              {roomVolumeData.map((room) => (
                <div key={room.roomId} className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-2">
                  <p className="font-medium text-slate-100">{room.roomName}</p>
                  <p>Công suất: {room.usedPct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Environment Monitoring</CardTitle>
            <p className="text-xs text-slate-400">Theo dõi biến thiên nhiệt độ/độ ẩm và heatmap độ ổn định của phòng.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
                <LineChart data={envSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="temp" stroke="#22d3ee" strokeWidth={2.4} dot={false} name="Nhiệt độ (°C)" />
                  <Line type="monotone" dataKey="humi" stroke="#f59e0b" strokeWidth={2.4} dot={false} name="Độ ẩm (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {zoneHeatmap.map((cell) => (
                <button
                  key={cell.roomId}
                  type="button"
                  className={`rounded-xl border border-white/10 p-3 text-left text-slate-100 transition hover:scale-[1.02] ${heatColor(cell.score)}`}
                >
                  <p className="text-xs text-slate-100/90">{cell.roomName}</p>
                  <p className="mt-2 text-xl font-semibold">{cell.score}</p>
                  <p className="text-[11px] text-slate-100/80">Stability Index</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-700 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Trạng thái thiết bị</CardTitle>
            <p className="text-xs text-slate-400">Tổng hợp thiết bị đang chạy theo manual, auto hoặc lịch và lịch kế tiếp.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-3">
                <p className="text-xs text-slate-400">Controller online</p>
                <p className="mt-1 text-2xl font-semibold text-white">{deviceStatus.onlineDevices}/{deviceStatus.totalDevices}</p>
                <p className="mt-1 text-xs text-slate-400">Thiết bị điều khiển đang kết nối</p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-3">
                <p className="text-xs text-slate-400">Manual / Auto / Schedule</p>
                <p className="mt-1 text-lg font-semibold text-white">{deviceStatus.manualDevices} / {deviceStatus.autoDevices} / {deviceStatus.scheduledDevices}</p>
                <p className="mt-1 text-xs text-slate-400">Trạng thái điều khiển hiện tại</p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-3">
                <p className="text-xs text-slate-400">Lịch đang hoạt động</p>
                <p className="mt-1 text-2xl font-semibold text-white">{deviceStatus.activeSchedules}</p>
                <p className="mt-1 text-xs text-slate-400">Khung giờ / Chỉ bật / Chỉ tắt</p>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                <p className="text-xs text-cyan-200">Khung giờ</p>
                <p className="mt-1 text-lg font-semibold text-white">{deviceStatus.windowSchedules}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-200">Chỉ BẬT</p>
                <p className="mt-1 text-lg font-semibold text-white">{deviceStatus.onlyOnSchedules}</p>
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="text-xs text-rose-200">Chỉ TẮT</p>
                <p className="mt-1 text-lg font-semibold text-white">{deviceStatus.onlyOffSchedules}</p>
              </div>
            </div>

            {/* <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs text-amber-200">Lịch sắp chạy tiếp theo</p>
              <p className="mt-1 text-base font-semibold text-white">{deviceStatus.nextScheduleAt}</p>
              <p className="mt-1 text-xs text-amber-100/80">
                {deviceStatus.nextScheduleRoom} · {deviceStatus.nextScheduleAction}
              </p>
            </div> */}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">In/Out Flow</CardTitle>
            <p className="text-xs text-slate-400">Lưu lượng nhập/xuất theo tuần để theo dõi nhịp vận hành kho.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
                <AreaChart data={flowArea}>
                  <defs>
                    <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.75} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="period" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="inFlow" stroke="#22d3ee" fill="url(#inGrad)" name="Nhập hàng" />
                  <Area type="monotone" dataKey="outFlow" stroke="#f59e0b" fill="url(#outGrad)" name="Xuất hàng" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                <p className="flex items-center gap-2 text-cyan-200"><ArrowDownToLine className="h-4 w-4" /> Tổng nhập tuần</p>
                <p className="mt-1 text-xl font-semibold text-white">{flowArea.reduce((s, x) => s + x.inFlow, 0)} chuyến</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-2 text-amber-200"><ArrowUpFromLine className="h-4 w-4" /> Tổng xuất tuần</p>
                <p className="mt-1 text-xl font-semibold text-white">{flowArea.reduce((s, x) => s + x.outFlow, 0)} chuyến</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* <Card className="border-slate-700 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">Logic Công Suất & Cập Nhật Tự Động</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-300">
          <p>V_usable = dài × rộng × cao × 0.7</p>
          <p>V_goods = tổng (số lượng nhập - số lượng xuất) × thể tích đơn vị sản phẩm</p>
          <p>Công suất phòng = (V_goods / V_usable) × 100%</p>
          <p>
            Dashboard đang dùng dữ liệu thật từ API zones/rooms/sensors/alerts/foods/logs và tự động tổng hợp cho các biểu đồ.
          </p>
        </CardContent>
      </Card> */}
    </div>
  );
}
