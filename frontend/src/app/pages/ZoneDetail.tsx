"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Thermometer, Droplets, Clock, AlertTriangle,
  Settings, Plus, Trash2, Save, Cpu, Pencil, Apple, Package,
  Power, DoorOpen, Play, Zap, Wind, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSensor, ModeType } from "@/hooks/use-sensor";
import { useAuth } from "@/context/AuthContext";
import { SensorChart } from "@/components/SensorChart";
import { useToast } from "@/hooks/use-toast";
import { createSchedule, getRooms, getSchedules, getSensors, getMonitorDevices, getZones } from "@/lib/zone-api";

/* ── Types ── */
interface FoodItem {
  id: string; name: string; quantity: string; unit: string;
  storageTemp: number; storageHumidity: number; expiryDate: string; note: string;
}
interface Schedule {
  id: string;
  name: string;
  scopeType: "single" | "all" | "multiple";
  targetRoomIds: number[];
  targetRoomLabels: string[];
  scheduleType: "recurring" | "one_time";
  recurrence: "daily" | "weekly" | "interval_hours";
  intervalHours: number | null;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  useDuration: boolean;
  durationMinutes: number | null;
  mode: "Cooling" | "Defrost" | "Eco";
  setPoint: number;
  setHumid: number;
  hysteresis: number;
  timezone: string;
  description: string;
  foodId?: number | null;
  deviceActions?: Record<string, "ON" | "OFF" | "AUTO">;
}
interface DeviceItem {
  id: string; name: string; type: "sensor" | "controller";
  status: "online" | "offline" | "warning"; value?: string; unit?: string; isOn: boolean;
  roomId?: number;
  connectKey?: string;
}

interface DeviceScheduleRow {
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
}

interface DeviceScheduleFormState {
  name: string;
  scheduleType: "one_time" | "repeat";
  actionMode: "window" | "only_on" | "only_off";
  oneTimeDate: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string[];
  deviceIds: string[];
}

interface RoomDetail {
  name: string; foodType: string; temp: number; targetTemp: number;
  humidity: number; status: string; areaName: string;
  alertThreshold: { tempMin: number; tempMax: number; humidityMin: number; humidityMax: number };
}

const MODE_LABELS: Record<ModeType, string> = { 0: "Manual", 1: "Auto", 2: "Schedule" };
const MODES: ModeType[] = [0, 1, 2];
const DAYS_OF_WEEK = [
  { value: "MON", label: "Thứ 2" },
  { value: "TUE", label: "Thứ 3" },
  { value: "WED", label: "Thứ 4" },
  { value: "THU", label: "Thứ 5" },
  { value: "FRI", label: "Thứ 6" },
  { value: "SAT", label: "Thứ 7" },
  { value: "SUN", label: "Chủ nhật" },
] as const;
const DEVICE_ACTION_MODE_OPTIONS = [
  { value: "window", label: "Khung giờ (Bật → Tắt)" },
  { value: "only_on", label: "Chỉ Bật" },
  { value: "only_off", label: "Chỉ Tắt" },
] as const;

interface AreaRooms {
  areaId: number;
  areaName: string;
  rooms: { roomId: number; name: string }[];
}

interface ScheduleFormState {
  name: string;
  scopeType: "single" | "all" | "multiple";
  multiAreaId: string;
  selectedRoomIds: number[];
  scheduleType: "recurring" | "one_time";
  recurrence: "daily" | "weekly" | "interval_hours";
  intervalHours: string;
  startTime: string;
  endTime: string;
  useDuration: boolean;
  durationMinutes: string;
  daysOfWeek: string[];
  mode: "Cooling" | "Defrost" | "Eco";
  setPoint: string;
  setHumid: string;
  hysteresis: string;
  timezone: string;
  description: string;
  foodId: string;
  deviceActions: Record<string, "ON" | "OFF" | "AUTO">;
}

interface SensorSnapshot {
  temperature?: number | null;
  humidity?: number | null;
}

interface SensorDataWsMessage {
  feed: "temp" | "humi" | "light" | "motion";
  value: number;
  roomId: number;
}

interface DeviceStateWsMessage {
  feed: "temp-fan" | "humi-fan" | "light" | "mode" | string;
  value: string;
  roomId?: number;
}

const TIME_24_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isTime24 = (value: string): boolean => TIME_24_PATTERN.test(value);

const normalizeTime24Input = (value: string, fallback = "00:00"): string => {
  if (isTime24(value)) return value;

  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return fallback;

  const rawHour = digits.length <= 2 ? digits : digits.slice(0, 2);
  const rawMinute = digits.length <= 2 ? "0" : digits.slice(2, 4).padEnd(2, "0");
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const TIME_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const TIME_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function Time24Input({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeTime24Input(value);
  const [selectedHour, selectedMinute] = normalizedValue.split(":");
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minuteRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      hourRefs.current[selectedHour]?.scrollIntoView({ block: "center" });
      minuteRefs.current[selectedMinute]?.scrollIntoView({ block: "center" });
    }, 0);
  }, [open, selectedHour, selectedMinute]);

  const selectTimePart = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  const renderColumn = (
    label: string,
    values: string[],
    selected: string,
    refs: MutableRefObject<Record<string, HTMLButtonElement | null>>,
    onSelect: (value: string) => void,
  ) => (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ScrollArea
        className="h-44 rounded-md border border-border/30 bg-secondary/20"
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const direction = e.deltaY > 0 ? 1 : -1;
          const currentIndex = Math.max(0, values.indexOf(selected));
          const nextIndex = (currentIndex + direction + values.length) % values.length;
          onSelect(values[nextIndex]);
        }}
      >
        <div className="p-1">
          {values.map(item => (
            <button
              key={item}
              type="button"
              ref={(node) => { refs.current[item] = node; }}
              onClick={() => onSelect(item)}
              className={`mb-1 flex h-8 w-full items-center justify-center rounded text-sm font-mono transition-colors ${
                selected === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-between bg-secondary/30 font-mono text-sm ${className ?? ""}`}
        >
          <span>{normalizedValue}</span>
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="grid grid-cols-2 gap-3">
          {renderColumn("Giờ", TIME_HOURS, selectedHour, hourRefs, hour => selectTimePart(hour, selectedMinute))}
          {renderColumn("Phút", TIME_MINUTES, selectedMinute, minuteRefs, minute => selectTimePart(selectedHour, minute))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
            Xong
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const parseTimeToMinutes = (value: string): number | null => {
  if (!isTime24(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (total: number): string => {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60).toString().padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

const localDateInputValue = (date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const createDefaultDeviceScheduleForm = (): DeviceScheduleFormState => ({
  name: "",
  scheduleType: "repeat",
  actionMode: "window",
  oneTimeDate: localDateInputValue(),
  startTime: "08:00",
  endTime: "17:00",
  daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
  deviceIds: [],
});

const getNormalizedIntervals = (start: number, end: number): Array<[number, number]> => {
  if (end > start) return [[start, end]];
  return [
    [start, 24 * 60],
    [0, end],
  ];
};

const hasTimeOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
  const sA = parseTimeToMinutes(startA);
  const eA = parseTimeToMinutes(endA);
  const sB = parseTimeToMinutes(startB);
  const eB = parseTimeToMinutes(endB);
  if (sA == null || eA == null || sB == null || eB == null) return false;

  const slotsA = getNormalizedIntervals(sA, eA);
  const slotsB = getNormalizedIntervals(sB, eB);
  return slotsA.some(([sa, ea]) => slotsB.some(([sb, eb]) => sa < eb && sb < ea));
};

const toTimeHHmm = (value: unknown): string => {
  if (!value) return "";
  const s = String(value);
  const match = s.match(/(\d{1,2}):(\d{1,2})/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  return "";
};

const statusDot = (s: string) => {
  if (s === "online")  return <div className="w-2 h-2 rounded-full bg-success" />;
  if (s === "warning") return <div className="w-2 h-2 rounded-full bg-warning" />;
  return <div className="w-2 h-2 rounded-full bg-muted-foreground" />;
};

/* ── Sensor Detail Panel ── */
function SensorDetailPanel({
  device, onClose,
}: { device: DeviceItem; onClose: () => void }) {
  const {
    state, setTempFan, setHumiFan, setLight, setTempThreshold, setHumiThreshold,
  } = useSensor();
  // Lấy nhiệt độ/độ ẩm thật từ device (đã được cập nhật qua WebSocket theo roomId)
  const [localTemp, setLocalTemp] = useState<number | null>(null);
  const [localHumi, setLocalHumi] = useState<number | null>(null);
  const [localLight, setLocalLight] = useState<number | null>(null);
  const [localMotion, setLocalMotion] = useState<number | null>(null);

  // Lấy data hiện tại từ API ngay khi panel mở
  useEffect(() => {
    if (!device.roomId) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token")) : null;
    if (!token) return;

    fetch(`${BASE}/api/sensors?roomId=${device.roomId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : []).then((sensors: SensorSnapshot[]) => {
      if (sensors.length > 0) {
        const s = sensors[0];
        if (s.temperature != null) setLocalTemp(s.temperature);
        if (s.humidity != null) setLocalHumi(s.humidity);
      }
    }).catch(() => {});
  }, [device.roomId]);

  // Subscribe WebSocket lọc theo roomId của device này
  useEffect(() => {
    const BASE_WS = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8080/ws";
    let stompClient: Client | null = null;
    import("sockjs-client").then(({ default: SockJS }) =>
      import("@stomp/stompjs").then(({ Client }) => {
        const client = new Client({
          webSocketFactory: () => new SockJS(BASE_WS),
          reconnectDelay: 5000,
          onConnect: () => {
            client.subscribe("/topic/sensor-data", (msg: IMessage) => {
              const data = JSON.parse(msg.body) as SensorDataWsMessage;
              if (data.roomId !== device.roomId) return;
              if (data.feed === "temp") setLocalTemp(data.value);
              if (data.feed === "humi") setLocalHumi(data.value);
              if (data.feed === "light") setLocalLight(data.value);
              if (data.feed === "motion") setLocalMotion(data.value);
            });
          },
        });
        stompClient = client;
        client.activate();
      })
    );
    return () => { stompClient?.deactivate(); };
  }, [device.roomId]);

  const displayTemp = localTemp ?? 0;
  const displayHumi = localHumi ?? 0;

  const [tempSlider, setTempSlider] = useState<number | null>(null);
  const [humiSlider, setHumiSlider] = useState<number | null>(null);
  const tempDisplay = tempSlider ?? state.tempThreshold;
  const humiDisplay = humiSlider ?? state.humiThreshold;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card border-border/50">
        <CardHeader className="pb-3 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Thermometer className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{device.name}</CardTitle>
                <p className="text-xs text-muted-foreground">Cảm biến · {device.status === "online" ? "Đang hoạt động" : "Ngắt kết nối"}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pb-6">
          {/* Realtime readings */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-4 rounded-xl border text-center ${displayTemp > state.tempThreshold ? "border-destructive/50 bg-destructive/5" : "border-border/30 bg-secondary/30"}`}>
              <Thermometer className="w-4 h-4 text-accent mx-auto mb-1" />
              <p className={`text-3xl font-bold font-mono ${displayTemp > state.tempThreshold ? "text-destructive" : "text-accent"}`}>
                {localTemp === null ? "--" : `${displayTemp.toFixed(1)}°C`}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Ngưỡng: {state.tempThreshold}°C</p>
            </div>
            <div className={`p-4 rounded-xl border text-center ${displayHumi > state.humiThreshold ? "border-destructive/50 bg-destructive/5" : "border-border/30 bg-secondary/30"}`}>
              <Droplets className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className={`text-3xl font-bold font-mono ${displayHumi > state.humiThreshold ? "text-destructive" : "text-primary"}`}>
                {localHumi === null ? "--" : `${displayHumi.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Ngưỡng: {state.humiThreshold}%</p>
            </div>
          </div>

          {/* Fan controls + Đèn */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs font-medium">Quạt nhiệt</p>
                  <p className="text-[10px] text-muted-foreground">{state.tempFan ? "Bật" : "Tắt"}</p>
                </div>
              </div>
              <Switch checked={state.tempFan} onCheckedChange={setTempFan} disabled={state.mode !== 0} />
            </div>
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs font-medium">Quạt ẩm</p>
                  <p className="text-[10px] text-muted-foreground">{state.humiFan ? "Bật" : "Tắt"}</p>
                </div>
              </div>
              <Switch checked={state.humiFan} onCheckedChange={setHumiFan} disabled={state.mode !== 0} />
            </div>
            <div className={`p-3 rounded-lg border flex items-center justify-between ${state.light === 1 ? "bg-amber-400/10 border-amber-400/30" : "bg-secondary/20 border-border/30"}`}>
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <div>
                  <p className="text-xs font-medium">Đèn</p>
                  <p className="text-[10px] text-muted-foreground">{state.light === 1 ? "Bật" : "Tắt"}</p>
                </div>
              </div>
              <Switch checked={state.light === 1} onCheckedChange={setLight} disabled={state.mode !== 0} />
            </div>
          </div>

          {/* Ánh sáng & Chuyển động */}
          {(localLight !== null || localMotion !== null) && (
            <div className="grid grid-cols-2 gap-3">
              {localLight !== null && (
                <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 text-center">
                  <p className="text-xs font-medium mb-1">💡 Ánh sáng</p>
                  <p className="text-2xl font-bold font-mono text-amber-400">{localLight.toFixed(0)}%</p>
                </div>
              )}
              {localMotion !== null && (
                <div className={`p-3 rounded-lg border text-center ${localMotion === 1 ? "bg-green-500/10 border-green-500/30" : "bg-secondary/20 border-border/30"}`}>
                  <p className="text-xs font-medium mb-1">🚶 Chuyển động</p>
                  <p className={`text-2xl font-bold ${localMotion === 1 ? "text-green-400" : "text-muted-foreground"}`}>
                    {localMotion === 1 ? "Có người" : "Không có"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 space-y-2">
              <p className="text-xs font-medium">Ngưỡng nhiệt độ</p>
              <p className="text-xl font-bold font-mono text-primary">{tempDisplay}°C</p>
              <Slider min={0} max={60} step={1} value={[tempDisplay]}
                onValueChange={([v]) => setTempSlider(v)}
                onValueCommit={([v]) => { setTempSlider(null); setTempThreshold(v); }} />
            </div>
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 space-y-2">
              <p className="text-xs font-medium">Ngưỡng độ ẩm</p>
              <p className="text-xl font-bold font-mono text-primary">{humiDisplay}%</p>
              <Slider min={0} max={100} step={1} value={[humiDisplay]}
                onValueChange={([v]) => setHumiSlider(v)}
                onValueCommit={([v]) => { setHumiSlider(null); setHumiThreshold(v); }} />
            </div>
          </div>

          {/* Charts */}
          <div className="space-y-3">
            <SensorChart feed="temp" label="Biểu đồ nhiệt độ" unit="°C"
              color="#2dd4bf" threshold={state.tempThreshold} roomId={device.roomId} />
            <SensorChart feed="humi" label="Biểu đồ độ ẩm" unit="%"
              color="#38bdf8" threshold={state.humiThreshold} roomId={device.roomId} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main Component ── */
export default function ZoneDetail() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { toast } = useToast();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);

  const [devices, setDevices]   = useState<DeviceItem[]>([]);
  const [monitors, setMonitors] = useState<import("@/lib/zone-api").MonitorDevice[]>([]);
  const [sensorList, setSensorList] = useState<import("@/lib/zone-api").SensorDevice[]>([]);
  const [deviceStates, setDeviceStates] = useState<Record<string, boolean>>({});
  const [foods, setFoods]       = useState<FoodItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  // Dữ liệu thật từ Adafruit (chỉ room-1 có sensor thật)
  const { state: sensorState, setMode, setTempFan, setHumiFan, setLight } = useSensor();
  const isRoom1 = zoneId === "room-1";

  // Mode: luôn dùng từ Adafruit (sensorState) cho tất cả phòng
  const roomMode = sensorState.mode;
  const handleSetMode = (m: ModeType) => {
    setMode(m, currentRoomId ?? 1);
  };

  // Realtime temp/humi cho phòng hiện tại (lọc theo roomId)
  const [realtimeTemp, setRealtimeTemp] = useState<number | null>(null);
  const [realtimeHumi, setRealtimeHumi] = useState<number | null>(null);
  const [realtimeLight, setRealtimeLight] = useState<number | null>(null);

  const sensorSectionRef = useRef<HTMLDivElement | null>(null);
  const fanSectionRef = useRef<HTMLDivElement | null>(null);
  const focusHandledRef = useRef<string>("");

  // Sensor detail panel
  const [selectedSensor, setSelectedSensor] = useState<DeviceItem | null>(null);
  // Light detail panel
  const [selectedLight, setSelectedLight] = useState<DeviceItem | null>(null);

  // Food form
  const [foodFormOpen, setFoodFormOpen]     = useState(false);
  const [editingFood, setEditingFood]       = useState<FoodItem | null>(null);
  const [foodDeleteOpen, setFoodDeleteOpen] = useState(false);
  const [deletingFoodId, setDeletingFoodId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState({ name: "", quantity: "", unit: "kg", storageTemp: "0", storageHumidity: "85", expiryDate: "", note: "" });

  // Schedule form
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule]   = useState<Schedule | null>(null);
  const [areaRooms, setAreaRooms] = useState<AreaRooms[]>([]);
  const [currentAreaId, setCurrentAreaId] = useState<number | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [roomFoods, setRoomFoods] = useState<Array<{ foodId: number; name: string; type: string }>>([]);

  // Device schedule
  const [deviceSchedules, setDeviceSchedules] = useState<DeviceScheduleRow[]>([]);
  const [devSchedFormOpen, setDevSchedFormOpen] = useState(false);
  const [devSchedForm, setDevSchedForm] = useState<DeviceScheduleFormState>(() => createDefaultDeviceScheduleForm());
  const BASE_URL_DS = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  // Realtime WebSocket lọc theo phòng hiện tại
  useEffect(() => {
    if (!currentRoomId) return;
    const BASE_WS = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8080/ws";
    let stompClient: Client | null = null;
    import("sockjs-client").then(({ default: SockJS }) =>
      import("@stomp/stompjs").then(({ Client }) => {
        const client = new Client({
          webSocketFactory: () => new SockJS(BASE_WS),
          reconnectDelay: 5000,
          onConnect: () => {
            // Nhận sensor data theo phòng
            client.subscribe("/topic/sensor-data", (msg: IMessage) => {
              const data = JSON.parse(msg.body) as SensorDataWsMessage;
              if (data.roomId !== currentRoomId) return;
              if (data.feed === "temp") setRealtimeTemp(data.value);
              if (data.feed === "humi") setRealtimeHumi(data.value);
            });
            // Nhận device-state theo phòng → cập nhật trạng thái thiết bị
            client.subscribe("/topic/device-state", (msg: IMessage) => {
              const data = JSON.parse(msg.body) as DeviceStateWsMessage;
              if (data.roomId && data.roomId !== currentRoomId) return;
              // Cập nhật trạng thái quạt/đèn trong devices list
              if (data.feed === "temp-fan" || data.feed === "humi-fan" || data.feed === "light") {
                const connectKey = data.feed;
                const isOn = data.value === "1";
                setDevices(prev => prev.map(d => {
                  const mon = (monitors ?? []).find(m => `monitor-${m.deviceId}` === d.id);
                  if (mon?.connectKey === connectKey) return { ...d, isOn, status: isOn ? "online" : "offline" };
                  return d;
                }));
              }
            });
          },
        });
        stompClient = client;
        client.activate();
      })
    );
    return () => { stompClient?.deactivate(); };
  }, [currentRoomId]);

  const DAY_OPTIONS = [
    { value: "MON", label: "T2" }, { value: "TUE", label: "T3" },
    { value: "WED", label: "T4" }, { value: "THU", label: "T5" },
    { value: "FRI", label: "T6" }, { value: "SAT", label: "T7" },
    { value: "SUN", label: "CN" },
  ];

  // Device form
  const [deviceFormOpen, setDeviceFormOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    name: "", category: "FAN_TEMP", connectKey: "temp-fan",
  });
  const DEVICE_CATEGORY_OPTIONS = [
    { value: "FAN_TEMP",  label: "Quạt nhiệt độ", key: "temp-fan" },
    { value: "FAN_HUMI",  label: "Quạt độ ẩm",    key: "humi-fan" },
    { value: "LIGHT",     label: "Đèn",            key: "light" },
    { value: "CAMERA",    label: "Camera",          key: "camera" },
    { value: "DOOR",      label: "Cửa",             key: "door" },
    { value: "OTHER",     label: "Khác",            key: "other" },
  ];
  const createDefaultScheduleForm = (baseTemp: number, roomId: number | null, areaId: number | null): ScheduleFormState => ({
    name: "",
    scopeType: "single",
    multiAreaId: areaId != null ? String(areaId) : "all",
    selectedRoomIds: roomId != null ? [roomId] : [],
    scheduleType: "recurring",
    recurrence: "daily",
    intervalHours: "",
    startTime: "08:00",
    endTime: "17:00",
    useDuration: false,
    durationMinutes: "",
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    mode: "Cooling",
    setPoint: String(baseTemp),
    setHumid: "85",
    hysteresis: "0",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh",
    description: "",
    foodId: "",
    deviceActions: {},
  });

  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() =>
    createDefaultScheduleForm(0, null, null)
  );

  const mapApiSchedule = (item: Record<string, unknown>, allRooms: Array<{ roomId: number; name: string; areaName: string }>): Schedule => {
    const roomIds = Array.isArray(item.roomIds)
      ? item.roomIds.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x))
      : [];

    let recurrence: "daily" | "weekly" | "interval_hours" = "daily";
    let daysOfWeek: string[] = [];
    let intervalHours: number | null = null;
    let recurrenceRuleObj: Record<string, unknown> = {};

    try {
      recurrenceRuleObj = typeof item.recurrenceRule === "string"
        ? JSON.parse(item.recurrenceRule || "{}") as Record<string, unknown>
        : (item.recurrenceRule ?? {}) as Record<string, unknown>;
    } catch {
      recurrenceRuleObj = {};
    }

    if (recurrenceRuleObj?.type === "weekly") recurrence = "weekly";
    if (recurrenceRuleObj?.type === "interval_hours") recurrence = "interval_hours";
    if (Array.isArray(recurrenceRuleObj?.days_of_week)) daysOfWeek = recurrenceRuleObj.days_of_week;
    if (typeof recurrenceRuleObj?.interval_hours === "number") intervalHours = recurrenceRuleObj.interval_hours;

    return {
      id: String(item.scheduleId),
      name: String(item.name ?? "Lịch trình"),
      scopeType: (String(item.scopeType ?? "single") as "single" | "all" | "multiple"),
      targetRoomIds: roomIds,
      targetRoomLabels: allRooms
        .filter((r) => roomIds.includes(r.roomId))
        .map((r) => `${r.areaName} / ${r.name}`),
      scheduleType: String(item.scheduleType ?? "recurring") === "one_time" ? "one_time" : "recurring",
      recurrence,
      intervalHours,
      daysOfWeek,
      startTime: toTimeHHmm(item.startTime),
      endTime: toTimeHHmm(item.endTime),
      useDuration: item.duration != null,
      durationMinutes: item.duration != null ? Number(item.duration) : null,
      mode: (String(item.mode ?? "Cooling") as "Cooling" | "Defrost" | "Eco"),
      setPoint: Number(item.setPoint ?? 0),
      setHumid: Number(item.setHumid ?? 0),
      hysteresis: Number(item.hysteresis ?? 0),
      timezone: String(item.timezone ?? "Asia/Ho_Chi_Minh"),
      description: String(item.description ?? ""),
    };
  };

  useEffect(() => {
    const parseRoomId = (value?: string): number | null => {
      if (!value) return null;
      const m = value.match(/\d+/);
      if (!m) return null;
      const n = Number.parseInt(m[0], 10);
      return Number.isFinite(n) ? n : null;
    };

    const roomId = parseRoomId(zoneId);
    if (!token || roomId == null) {
      setRoom(null);
      setDevices([]);
      setFoods([]);
      setSchedules([]);
      setAreaRooms([]);
      setCurrentAreaId(null);
      setCurrentRoomId(null);
      setRoomLoading(false);
      return;
    }

    const normalizeStatus = (status?: string): DeviceItem["status"] => {
      const s = (status ?? "").toLowerCase();
      if (s === "warning") return "warning";
      if (s === "online" || s === "on") return "online";
      return "offline";
    };

    const loadRoom = async () => {
      setRoomLoading(true);
      try {
        const [rooms, sensors, monitors, zones] = await Promise.all([
          getRooms(token),
          getSensors(token, roomId),
          getMonitorDevices(token, roomId),
          getZones(token),
        ]);

        const areasWithRooms = await Promise.all(
          zones.map(async (zone) => {
            const zoneRooms = await getRooms(token, zone.areaId);
            return {
              areaId: zone.areaId,
              areaName: zone.areaName,
              rooms: zoneRooms.map((zr) => ({ roomId: zr.roomId, name: zr.name })),
            };
          })
        );

        setAreaRooms(areasWithRooms);
        setCurrentRoomId(roomId);

        const activeArea = areasWithRooms.find((a) => a.rooms.some((r) => r.roomId === roomId));
        setCurrentAreaId(activeArea?.areaId ?? null);

        const currentRoom = rooms.find((r) => r.roomId === roomId);
        if (!currentRoom) {
          setRoom(null);
          setDevices([]);
          return;
        }

        const sensorDevices: DeviceItem[] = sensors.map((s) => ({
          id: `sensor-${s.deviceId}`,
          name: s.name,
          type: "sensor",
          status: normalizeStatus(s.status),
          value: typeof s.temperature === "number" ? s.temperature.toFixed(1) : undefined,
          unit: "°C",
          isOn: true,
          roomId: roomId,
          connectKey: s.connectKey,
        }));

        const monitorDevices: DeviceItem[] = monitors.map((m) => ({
          id: `monitor-${m.deviceId}`,
          name: m.name,
          type: "controller",
          status: normalizeStatus(m.status),
          isOn: normalizeStatus(m.status) === "online",
        }));

        const allDevices = [...sensorDevices, ...monitorDevices];
        const firstSensor = sensors.find((s) => typeof s.temperature === "number" || typeof s.humidity === "number");
        const hasWarning = allDevices.some((d) => d.status === "warning");

        setRoom({
          name: currentRoom.name,
          foodType: "",
          temp: typeof firstSensor?.temperature === "number" ? firstSensor.temperature : 0,
          targetTemp: typeof firstSensor?.temperature === "number" ? firstSensor.temperature : 0,
          humidity: typeof firstSensor?.humidity === "number" ? firstSensor.humidity : 0,
          status: hasWarning ? "warning" : "online",
          areaName: activeArea?.areaName ?? `Phòng ${roomId}`,
          alertThreshold: { tempMin: 0, tempMax: 60, humidityMin: 0, humidityMax: 100 },
        });
        setDevices(allDevices);
        setMonitors(monitors);
        setSensorList(sensors);

        // Auto-seed quạt nếu phòng chưa có temp-fan hoặc humi-fan
        const hasTempFan = monitors.some(m => m.connectKey === "temp-fan");
        const hasHumiFan = monitors.some(m => m.connectKey === "humi-fan");
        if (!hasTempFan || !hasHumiFan) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/devices/seed-fans?roomId=${roomId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).then(async r => {
            if (r.ok) {
              // Reload devices sau khi seed
              const newMonitors = await getMonitorDevices(token, roomId).catch(() => []);
              const newMonitorDevices: DeviceItem[] = newMonitors.map((m) => ({
                id: `monitor-${m.deviceId}`,
                name: m.name,
                type: "controller",
                status: normalizeStatus(m.status),
                isOn: normalizeStatus(m.status) === "online",
              }));
              setMonitors(newMonitors);
              setDevices(prev => [
                ...prev.filter(d => d.type === "sensor"),
                ...newMonitorDevices,
              ]);
            }
          }).catch(() => {});
        }

        // Load hàng hóa từ giao dịch nhập/xuất
        try {
          const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
          const txRes = await fetch(
            `${BASE_URL}/api/inventory-transactions?type=ALL&roomId=${roomId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (txRes.ok) {
            const txList = await txRes.json();
            const stockMap: Record<string, { name: string; type: string; boxTypeName: string; boxes: number }> = {};
            for (const tx of txList) {
              for (const item of tx.items ?? []) {
                const key = `${item.foodName}|${item.foodType ?? ""}|${item.boxTypeId ?? item.boxTypeName ?? ""}`;
                if (!stockMap[key]) {
                  stockMap[key] = {
                    name: item.foodName,
                    type: item.foodType ?? "",
                    boxTypeName: item.boxTypeName ?? "",
                    boxes: 0,
                  };
                }
                if (tx.transactionType === "IN") stockMap[key].boxes += item.boxCount ?? 0;
                else stockMap[key].boxes -= item.boxCount ?? 0;
              }
            }
            const foodItems = Object.values(stockMap)
              .filter(f => f.boxes > 0)
              .map((f, i) => ({
                id: `inv-${i}`,
                name: f.name,
                quantity: String(f.boxes),
                unit: "thùng",
                storageTemp: 0,
                storageHumidity: 0,
                expiryDate: "",
                note: [f.type, f.boxTypeName].filter(Boolean).join(" / "),
              }));
            setFoods(foodItems);
          } else {
            setFoods([]);
          }
        } catch {
          setFoods([]);
        }

        try {
          const scheduleRows = await getSchedules(token, roomId);
          const roomLookup = areasWithRooms.flatMap((a) => a.rooms.map((r) => ({
            roomId: r.roomId,
            name: r.name,
            areaName: a.areaName,
          })));
          setSchedules(scheduleRows.map((item) => mapApiSchedule(item, roomLookup)));
        } catch {
          setSchedules([]);
        }

        // Load device schedules
        try {
          const dsRes = await fetch(`${BASE_URL_DS}/api/device-schedules?roomId=${roomId}`,
            { headers: { Authorization: `Bearer ${token}` } });
          if (dsRes.ok) setDeviceSchedules(await dsRes.json());
        } catch { setDeviceSchedules([]); }
      } catch {
        setRoom(null);
        setDevices([]);
        setAreaRooms([]);
        setCurrentAreaId(null);
        setCurrentRoomId(null);
      } finally {
        setRoomLoading(false);
      }
    };

    loadRoom();
  }, [token, zoneId]);

  const tempHistory = room
    ? [{
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
        temp: realtimeTemp ?? room.temp,
        humidity: realtimeHumi ?? room.humidity,
      }]
    : [];

  const onlineDevices    = devices.filter(d => d.status === "online").length;
  const sensorDevices    = devices.filter(d => d.type === "sensor");
  const controllerDevices = devices.filter(d => d.type === "controller");

  useEffect(() => {
    if (!zoneId) return;

    const section = searchParams.get("section");
    if (!section) return;

    const key = `${zoneId}:${section}:${searchParams.get("aid") ?? ""}`;
    if (focusHandledRef.current === key) return;
    focusHandledRef.current = key;

    const timer = window.setTimeout(() => {
      if (section === "sensor") {
        sensorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (sensorDevices.length > 0) {
          setSelectedSensor(sensorDevices[0]);
        }
      }

      if (section === "fan") {
        if (isRoom1 && sensorDevices.length > 0) {
          sensorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setSelectedSensor(sensorDevices[0]);
          return;
        }

        fanSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [searchParams, zoneId, isRoom1, sensorDevices]);

  const allRoomOptions = useMemo(
    () => areaRooms.flatMap((area) => area.rooms.map((roomItem) => ({ ...roomItem, areaId: area.areaId, areaName: area.areaName }))),
    [areaRooms]
  );

  const currentAreaRooms = useMemo(() => {
    if (currentAreaId == null) return [];
    return areaRooms.find((a) => a.areaId === currentAreaId)?.rooms ?? [];
  }, [areaRooms, currentAreaId]);

  const multipleAreaRooms = useMemo(() => {
    if (scheduleForm.multiAreaId === "all") return allRoomOptions;
    const areaId = Number(scheduleForm.multiAreaId);
    if (!Number.isFinite(areaId)) return allRoomOptions;
    return allRoomOptions.filter((r) => r.areaId === areaId);
  }, [allRoomOptions, scheduleForm.multiAreaId]);

  const targetRoomIds = useMemo(() => {
    if (scheduleForm.scopeType === "single") {
      return currentRoomId != null ? [currentRoomId] : [];
    }
    if (scheduleForm.scopeType === "all") {
      return currentAreaRooms.map((r) => r.roomId);
    }
    return scheduleForm.selectedRoomIds;
  }, [scheduleForm.scopeType, currentRoomId, currentAreaRooms, scheduleForm.selectedRoomIds]);

  const targetRooms = useMemo(
    () => allRoomOptions.filter((r) => targetRoomIds.includes(r.roomId)),
    [allRoomOptions, targetRoomIds]
  );

  const previewLabel = useMemo(() => {
    if (targetRooms.length === 0) return "Áp dụng cho: 0 phòng";
    const names = targetRooms.map((r) => r.name);
    const short = names.slice(0, 3).join(", ");
    const more = names.length > 3 ? `, +${names.length - 3}` : "";
    return `Áp dụng cho: ${names.length} phòng (${short}${more})`;
  }, [targetRooms]);

  const computedEndTime = useMemo(() => {
    if (!scheduleForm.useDuration) return scheduleForm.endTime;
    const start = parseTimeToMinutes(scheduleForm.startTime);
    const duration = Number(scheduleForm.durationMinutes);
    if (start == null || !Number.isFinite(duration) || duration <= 0) return "";
    return minutesToTime(start + duration);
  }, [scheduleForm.useDuration, scheduleForm.endTime, scheduleForm.startTime, scheduleForm.durationMinutes]);

  const scheduleValidation = useMemo(() => {
    const errors: string[] = [];
    if (!scheduleForm.name.trim()) errors.push("Schedule Name là bắt buộc.");

    const start = parseTimeToMinutes(scheduleForm.startTime);
    const end = parseTimeToMinutes(computedEndTime);

    if (start == null) errors.push("Start Time không hợp lệ.");
    if (!scheduleForm.useDuration && end == null) errors.push("End Time không hợp lệ.");

    if (scheduleForm.useDuration) {
      const duration = Number(scheduleForm.durationMinutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        errors.push("Duration phải lớn hơn 0.");
      }
    } else if (start != null && end != null && start >= end) {
      errors.push("Start time phải nhỏ hơn End time.");
    }

    const setPoint = Number(scheduleForm.setPoint);
    if (!Number.isFinite(setPoint) || setPoint < -50 || setPoint > 20) {
      errors.push("Set-point phải trong khoảng -50 đến 20°C.");
    }

    const hysteresis = Number(scheduleForm.hysteresis);
    if (!Number.isFinite(hysteresis) || hysteresis < 0) {
      errors.push("Hysteresis phải lớn hơn hoặc bằng 0.");
    }

    if (scheduleForm.scopeType === "multiple" && targetRoomIds.length === 0) {
      errors.push("Cần chọn ít nhất 1 phòng khi scope là Multiple Rooms.");
    }

    if (scheduleForm.scheduleType === "recurring" && scheduleForm.recurrence === "weekly" && scheduleForm.daysOfWeek.length === 0) {
      errors.push("Weekly recurring cần chọn ít nhất 1 ngày trong tuần.");
    }

    if (scheduleForm.scheduleType === "recurring" && scheduleForm.recurrence === "interval_hours") {
      const interval = Number(scheduleForm.intervalHours);
      if (!Number.isFinite(interval) || interval <= 0) {
        errors.push("Interval Hours phải lớn hơn 0.");
      }
    }

    const conflictedSchedules =
      start != null && end != null
        ? schedules.filter((s) => {
            if (editingSchedule && s.id === editingSchedule.id) return false;
            const sharesRoom = s.targetRoomIds.some((id) => targetRoomIds.includes(id));
            return sharesRoom && hasTimeOverlap(scheduleForm.startTime, computedEndTime, s.startTime, s.endTime);
          })
        : [];

    return {
      errors,
      hasConflict: conflictedSchedules.length > 0,
      conflictSchedules: conflictedSchedules,
      canSave: errors.length === 0 && conflictedSchedules.length === 0,
    };
  }, [
    scheduleForm,
    computedEndTime,
    targetRoomIds,
    schedules,
    editingSchedule,
  ]);

  const reloadDeviceSchedules = async () => {
    if (!token || !currentRoomId) return;
    try {
      const r = await fetch(`${BASE_URL_DS}/api/device-schedules?roomId=${currentRoomId}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setDeviceSchedules(await r.json());
    } catch { /* ignore */ }
  };

  // Auto-refresh lịch thiết bị mỗi 30 giây (để nhận schedule từ mạch gửi lên)
  useEffect(() => {
    if (!currentRoomId) return;
    const timer = setInterval(reloadDeviceSchedules, 30000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId, token]);

  if (roomLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Đang tải dữ liệu phòng bảo quản...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Không tìm thấy phòng bảo quản</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/zones")}>
          <ArrowLeft className="w-3 h-3 mr-1" /> Quay lại
        </Button>
      </div>
    );
  }

  const toggleDevice = (devId: string) => {
    setDevices(prev => prev.map(d =>
      d.id !== devId ? d : { ...d, isOn: !d.isOn, status: !d.isOn ? "online" : "offline" }
    ));
  };

  const saveDeviceSchedule = async () => {
    if (!token || !currentRoomId || devSchedForm.deviceIds.length === 0 || !devSchedForm.name.trim()) return;
    const isWindowMode = devSchedForm.actionMode === "window";
    const selectedTime = devSchedForm.actionMode === "only_off" ? devSchedForm.endTime : devSchedForm.startTime;
    const startTime = selectedTime;
    const endTime = isWindowMode ? devSchedForm.endTime : "23:59";
    if (!isTime24(selectedTime) || (isWindowMode && !isTime24(devSchedForm.endTime))) {
      toast({ title: "Giờ không hợp lệ", description: "Vui lòng nhập giờ theo định dạng 24 giờ: 00:00 - 23:59." });
      return;
    }
    try {
      const oneTimeAt = `${devSchedForm.oneTimeDate}T${selectedTime}`;
      const r = await fetch(`${BASE_URL_DS}/api/device-schedules`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceIds: devSchedForm.deviceIds.map(Number),
          roomId: currentRoomId,
          name: devSchedForm.name.trim(),
          scheduleType: devSchedForm.scheduleType,
          action: devSchedForm.actionMode === "window" ? "WINDOW" : devSchedForm.actionMode === "only_on" ? "ONLY_ON" : "ONLY_OFF",
          oneTimeAt: devSchedForm.scheduleType === "one_time" ? oneTimeAt : null,
          startTime,
          endTime,
          daysOfWeek: devSchedForm.scheduleType === "repeat" ? devSchedForm.daysOfWeek : [],
        }),
      });
      if (r.ok) {
        const created = await r.json();
        const rows = Array.isArray(created) ? created : [created];
        setDeviceSchedules(prev => [...prev, ...rows]);
        setDevSchedFormOpen(false);
        setDevSchedForm(createDefaultDeviceScheduleForm());
        toast({ title: "Đã tạo lịch thiết bị" });
      }
    } catch { /* ignore */ }
  };

  const deleteDeviceSchedule = async (id: number) => {
    if (!token) return;
    await fetch(`${BASE_URL_DS}/api/device-schedules/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    setDeviceSchedules(prev => prev.filter(s => s.id !== id));
  };

  const toggleDeviceSchedule = async (id: number, active: boolean) => {
    if (!token) return;
    await fetch(`${BASE_URL_DS}/api/device-schedules/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setDeviceSchedules(prev => prev.map(s => s.id === id ? { ...s, active } : s));
  };

  const saveDevice = async () => {
    if (!token || !currentRoomId || !deviceForm.name.trim()) return;
    const cat = DEVICE_CATEGORY_OPTIONS.find(c => c.value === deviceForm.category);
    try {
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/devices`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: deviceForm.name.trim(),
            connectKey: cat?.key ?? deviceForm.category.toLowerCase(),
            status: "offline", mode: "MANUAL",
            roomId: currentRoomId,
            deviceCategory: deviceForm.category,
          }),
        }
      );
      if (r.ok) {
        const created = await r.json();
        setDevices(prev => [...prev, {
          id: `monitor-${created.deviceId}`,
          name: created.name,
          type: "controller",
          status: "offline",
          isOn: false,
        }]);
        setDeviceFormOpen(false);
        setDeviceForm({ name: "", category: "FAN_TEMP", connectKey: "temp-fan" });
        toast({ title: "Đã thêm thiết bị", description: created.name });
      }
    } catch { /* ignore */ }
  };

  // Food CRUD
  const openAddFood = () => {
    setEditingFood(null);
    setFoodForm({ name: "", quantity: "", unit: "kg", storageTemp: String(room.targetTemp), storageHumidity: "85", expiryDate: "", note: "" });
    setFoodFormOpen(true);
  };
  const openEditFood = (f: FoodItem) => {
    setEditingFood(f);
    setFoodForm({ name: f.name, quantity: f.quantity, unit: f.unit, storageTemp: String(f.storageTemp), storageHumidity: String(f.storageHumidity), expiryDate: f.expiryDate, note: f.note });
    setFoodFormOpen(true);
  };
  const saveFood = () => {
    if (editingFood) {
      setFoods(prev => prev.map(f => f.id === editingFood.id
        ? { ...f, ...foodForm, storageTemp: Number(foodForm.storageTemp), storageHumidity: Number(foodForm.storageHumidity) } : f));
    } else {
      setFoods(prev => [...prev, { id: `f-${Date.now()}`, ...foodForm, storageTemp: Number(foodForm.storageTemp), storageHumidity: Number(foodForm.storageHumidity) }]);
    }
    setFoodFormOpen(false);
  };

  // Schedule CRUD
  const openAddSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(createDefaultScheduleForm(room.targetTemp, currentRoomId, currentAreaId));
    setScheduleFormOpen(true);
  };
  const openEditSchedule = (s: Schedule) => {
    setEditingSchedule(s);
    setScheduleForm({
      name: s.name,
      scopeType: s.scopeType,
      multiAreaId: currentAreaId != null ? String(currentAreaId) : "all",
      selectedRoomIds: s.targetRoomIds,
      scheduleType: s.scheduleType,
      recurrence: s.recurrence,
      intervalHours: s.intervalHours != null ? String(s.intervalHours) : "",
      startTime: s.startTime,
      endTime: s.endTime,
      useDuration: s.useDuration,
      durationMinutes: s.durationMinutes != null ? String(s.durationMinutes) : "",
      daysOfWeek: s.daysOfWeek,
      mode: s.mode,
      setPoint: String(s.setPoint),
      setHumid: String(s.setHumid),
      hysteresis: String(s.hysteresis),
      timezone: s.timezone,
      description: s.description,
      foodId: s.foodId != null ? String(s.foodId) : "",
      deviceActions: s.deviceActions ?? {},
    });
    setScheduleFormOpen(true);
  };
  const saveSchedule = async () => {
    if (!scheduleValidation.canSave) return;

    const payload: Omit<Schedule, "id"> = {
      name: scheduleForm.name.trim(),
      scopeType: scheduleForm.scopeType,
      targetRoomIds,
      targetRoomLabels: targetRooms.map((r) => `${r.areaName} / ${r.name}`),
      scheduleType: scheduleForm.scheduleType,
      recurrence: scheduleForm.recurrence,
      intervalHours: scheduleForm.recurrence === "interval_hours" ? Number(scheduleForm.intervalHours) : null,
      daysOfWeek: scheduleForm.daysOfWeek,
      startTime: scheduleForm.startTime,
      endTime: computedEndTime,
      useDuration: scheduleForm.useDuration,
      durationMinutes: scheduleForm.useDuration ? Number(scheduleForm.durationMinutes) : null,
      mode: scheduleForm.mode,
      setPoint: Number(scheduleForm.setPoint),
      setHumid: Number(scheduleForm.setHumid),
      hysteresis: Number(scheduleForm.hysteresis),
      timezone: scheduleForm.timezone,
      description: scheduleForm.description.trim(),
    };

    if (editingSchedule) {
      setSchedules(prev => prev.map(s => s.id === editingSchedule.id
        ? { ...s, ...payload }
        : s));
      toast({
        title: "Đã cập nhật local",
        description: "Hiện API cập nhật schedule đầy đủ chưa hoàn tất, reload sẽ lấy dữ liệu từ backend.",
      });
    } else {
      if (!token) {
        toast({ title: "Thiếu đăng nhập", description: "Không thể lưu lịch trình lên backend." });
        return;
      }

      try {
        const today = new Date().toISOString().slice(0, 10);
        const recurrenceRule: Record<string, unknown> = {
          type: payload.recurrence,
          timezone: payload.timezone,
        };
        if (payload.recurrence === "weekly") {
          recurrenceRule.days_of_week = payload.daysOfWeek;
        }
        if (payload.recurrence === "interval_hours" && payload.intervalHours != null) {
          recurrenceRule.interval_hours = payload.intervalHours;
        }

        await createSchedule(token, {
          name: payload.name,
          scope_type: payload.scopeType,
          room_id: currentRoomId ?? undefined,
          room_ids: payload.scopeType === "multiple" ? payload.targetRoomIds : undefined,
          area_id: currentAreaId ?? undefined,
          mode: payload.mode,
          set_point: payload.setPoint,
          set_humid: payload.setHumid,
          hysteresis: payload.hysteresis,
          start_time: `${today}T${payload.startTime}:00`,
          end_time: payload.endTime ? `${today}T${payload.endTime}:00` : undefined,
          duration: payload.durationMinutes ?? undefined,
          schedule_type: payload.scheduleType,
          recurrence_rule: recurrenceRule,
          status: true,
          description: payload.description,
          timezone: payload.timezone,
        });

        const roomId = currentRoomId;
        if (roomId != null) {
          const scheduleRows = await getSchedules(token, roomId);
          const roomLookup = allRoomOptions.map((r) => ({
            roomId: r.roomId,
            name: r.name,
            areaName: r.areaName,
          }));
          setSchedules(scheduleRows.map((item) => mapApiSchedule(item, roomLookup)));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Tạo lịch trình thất bại";
        toast({ title: "Lưu lịch trình thất bại", description: message });
        return;
      }
    }

    toast({
      title: editingSchedule ? "Cập nhật lịch trình thành công" : "Tạo lịch trình thành công",
      description: `${payload.name} · ${payload.startTime} - ${payload.endTime}`,
    });

    setScheduleFormOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Sensor detail panel overlay */}
      {selectedSensor && (
        <SensorDetailPanel device={selectedSensor} onClose={() => setSelectedSensor(null)} />
      )}

      {/* Header */}
      {selectedLight && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto glass-card border-border/50">
            <CardHeader className="pb-3 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <span className="text-xl">💡</span>
                  </div>
                  <div>
                    <CardTitle className="text-base">{selectedLight.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedLight.connectKey === "sensor-light" ? "Cảm biến ánh sáng" : "Đèn"} · 
                      {realtimeLight !== null ? ` ${realtimeLight.toFixed(0)}%` : " --"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedLight(null)}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              {/* Trạng thái */}
              {selectedLight.connectKey === "sensor-light" ? (
                // Cảm biến ánh sáng — hiển thị giá trị %
                <div className={`p-4 rounded-xl border text-center ${(realtimeLight ?? 0) > 50 ? "border-amber-400/50 bg-amber-400/5" : "border-border/30 bg-secondary/30"}`}>
                  <span className="text-4xl">☀ï¸</span>
                  <p className="text-3xl font-bold font-mono text-amber-400 mt-2">
                    {realtimeLight !== null ? `${realtimeLight.toFixed(0)}%` : "--"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Độ sáng môi trường</p>
                </div>
              ) : (
                // Đèn — hiển thị bật/tắt
                <>
                  <div className={`p-4 rounded-xl border text-center ${sensorState.light === 1 ? "border-amber-400/50 bg-amber-400/5" : "border-border/30 bg-secondary/30"}`}>
                    <span className="text-4xl">{sensorState.light === 1 ? "💡" : "🔦"}</span>
                    <p className={`text-xl font-bold mt-2 ${sensorState.light === 1 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {sensorState.light === 1 ? "Đang bật" : "Đã tắt"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/30">
                    <p className="text-sm font-medium">Bật / Tắt đèn</p>
                    <Switch checked={sensorState.light === 1} onCheckedChange={setLight} disabled={sensorState.mode !== 0} />
                  </div>
                </>
              )}
              {/* Biểu đồ ánh sáng */}
              <SensorChart feed="light" label="Biểu đồ ánh sáng" unit="%"
                color="#fbbf24" roomId={selectedLight.roomId} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/zones")} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">{room.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{room.areaName} · {room.foodType}</p>
        </div>
        <Badge className={`ml-auto text-xs ${room.status === "online" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}`}>
          {room.status === "online" ? "Hoạt động" : "Cảnh báo"}
        </Badge>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="glass-card border-border/30">
          <CardContent className="p-4 text-center">
            <Thermometer className="w-5 h-5 text-accent mx-auto mb-1" />
            <p className="text-2xl font-bold font-mono text-accent">
              {realtimeTemp !== null ? `${realtimeTemp.toFixed(1)}°C` : `${room.temp}°C`}
            </p>
            <p className="text-[10px] text-muted-foreground">Mục tiêu: {room.targetTemp}°C</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/30">
          <CardContent className="p-4 text-center">
            <Droplets className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold font-mono text-primary">
              {realtimeHumi !== null ? `${realtimeHumi.toFixed(1)}%` : `${room.humidity}%`}
            </p>
            <p className="text-[10px] text-muted-foreground">Độ ẩm</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/30">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-warning mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground mt-1">Ngưỡng nhiệt độ</p>
            <p className="text-xs font-mono">{room.alertThreshold.tempMin}°C ~ {room.alertThreshold.tempMax}°C</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/30">
          <CardContent className="p-4 text-center">
            <Settings className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground mt-1">Ngưỡng độ ẩm</p>
            <p className="text-xs font-mono">{room.alertThreshold.humidityMin}% ~ {room.alertThreshold.humidityMax}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Mode selector */}
      <Card className="glass-card border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium">Chế độ hoạt động:</span>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-border/50 text-xs">
              {MODES.map(m => (
                <button key={m} onClick={() => handleSetMode(m)}
                  className={`px-5 py-2 font-medium transition-colors
                    ${roomMode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"}`}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {roomMode === 0 && "Điều khiển thủ công"}
              {roomMode === 1 && "Tự động theo ngưỡng"}
              {roomMode === 2 && "Theo lịch trình đặt sẵn"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Devices */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              Thiết bị trong phòng ({onlineDevices}/{devices.length} hoạt động)
            </CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setDeviceFormOpen(true)}>
              <Plus className="w-3 h-3" /> Thêm thiết bị
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sensors — click để xem chi tiết */}
          {sensorDevices.length > 0 && (
            <div ref={sensorSectionRef} className="scroll-mt-20">
              <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                Cảm biến — bấm để xem chi tiết & điều khiển
              </p>
              <div className="space-y-2">
                {sensorDevices.map(dev => {
                  const isLightSensor = dev.connectKey === "sensor-light";
                  return (
                  <div key={dev.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/30 cursor-pointer hover:border-primary/40 hover:bg-secondary/40 transition-all group"
                    onClick={() => isLightSensor ? setSelectedLight(dev) : setSelectedSensor(dev)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Thermometer className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {statusDot(dev.status)}
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{dev.name}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {dev.status === "online" ? "Bấm để xem biểu đồ & điều khiển" : "Ngắt kết nối"}
                      </p>
                    </div>
                    {dev.value && (
                      <span className="font-mono text-lg font-bold text-primary shrink-0">
                        {dev.value}<span className="text-xs text-muted-foreground ml-0.5">{dev.unit}</span>
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30 shrink-0 hidden group-hover:flex">
                      Chi tiết →
                    </Badge>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Controllers */}
          {controllerDevices.length > 0 && (
            <div ref={fanSectionRef} className="scroll-mt-20">
              <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">Thiết bị điều khiển</p>
              <div className="space-y-2">
                {controllerDevices.map(dev => {
                  // Quạt nhiệt/ẩm: dùng trạng thái thật từ Adafruit
                  const isTempFan = dev.id.includes("monitor-") &&
                    (monitors ?? []).find(m => `monitor-${m.deviceId}` === dev.id)?.connectKey === "temp-fan";
                  const isHumiFan = dev.id.includes("monitor-") &&
                    (monitors ?? []).find(m => `monitor-${m.deviceId}` === dev.id)?.connectKey === "humi-fan";
                  const isLight = dev.id.includes("monitor-") &&
                    (monitors ?? []).find(m => `monitor-${m.deviceId}` === dev.id)?.connectKey === "light";

                  const adaOn = isTempFan ? sensorState.tempFan
                              : isHumiFan ? sensorState.humiFan
                              : isLight   ? sensorState.light === 1
                              : deviceStates[dev.id] ?? dev.isOn;

                  const isAdaFan = isTempFan || isHumiFan;

                  return (
                  <div key={dev.id} className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/30`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${adaOn ? (isLight ? "bg-amber-400/10" : "bg-success/10") : "bg-muted/30"}`}>
                      {isLight
                        ? <span className={`text-base ${adaOn ? "" : "opacity-40"}`}>💡</span>
                        : isAdaFan
                        ? <Wind className={`w-4 h-4 ${adaOn ? "text-success" : "text-muted-foreground"}`} />
                        : <Power className={`w-4 h-4 ${adaOn ? "text-success" : "text-muted-foreground"}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {statusDot(dev.status)}
                        <p className="text-sm font-medium truncate">{dev.name}</p>
                        {(isAdaFan || isLight) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Adafruit</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{adaOn ? "Đang bật" : "Đã tắt"}</p>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] ${adaOn ? (isLight ? "bg-amber-400/10 text-amber-400 border-amber-400/20" : "bg-success/10 text-success border-success/20") : ""}`}>
                      {adaOn ? "ON" : "OFF"}
                    </Badge>
                    <div className="flex flex-col items-end gap-0.5">
                      <Switch
                        checked={adaOn}
                        onCheckedChange={v => {
                          if (isTempFan) setTempFan(v);
                          else if (isHumiFan) setHumiFan(v);
                          else if (isLight) setLight(v);
                          else toggleDevice(dev.id);
                        }}
                        disabled={sensorState.mode !== 0}
                      />
                      {sensorState.mode !== 0 && (
                        <span className="text-[9px] text-muted-foreground">
                          {sensorState.mode === 1 ? "Auto" : "Schedule"}
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart tổng quan phòng */}
      <div className="space-y-3">
        <SensorChart feed="temp" label="Biểu đồ nhiệt độ 24 giờ" unit="°C"
          color="#2dd4bf" threshold={sensorState.tempThreshold} roomId={currentRoomId ?? undefined} />
        <SensorChart feed="humi" label="Biểu đồ độ ẩm 24 giờ" unit="%"
          color="#38bdf8" threshold={sensorState.humiThreshold} roomId={currentRoomId ?? undefined} />
        {/* <SensorChart feed="light" label="Biểu đồ ánh sáng 24 giờ" unit="%"
          color="#fbbf24" roomId={currentRoomId ?? undefined} /> */}
      </div>

      {/* Food Items */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-success" /> Thực phẩm ({foods.length})
            </CardTitle>
            <Button size="sm" className="gap-1.5 text-xs" onClick={openAddFood}>
              <Plus className="w-3 h-3" /> Thêm
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {foods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có thực phẩm nào.</p>
          ) : (
            <div className="space-y-2">
              {foods.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/30">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <Apple className="w-4 h-4 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{f.name}</p>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{f.quantity} {f.unit}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {f.storageTemp}°C · {f.storageHumidity}% · HSD: {f.expiryDate}
                      {f.note && ` · ${f.note}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFood(f)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { setDeletingFoodId(f.id); setFoodDeleteOpen(true); }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

     {/* Schedules */}
      {/* <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Lịch trình ({schedules.length})
            </CardTitle>
            <Button size="sm" className="gap-1.5 text-xs" onClick={openAddSchedule}>
              <Plus className="w-3 h-3" /> Thêm
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có lịch trình nào.</p>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/30">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      <span className="font-mono">{s.startTime} - {s.endTime}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{s.mode}</Badge>
                      <span>{s.setPoint}°C · {s.setHumid}%</span>
                      <span>{s.targetRoomIds.length} phòng</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{s.targetRoomLabels.join(", ")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px] text-success border-success/30 hover:bg-success/10"
                      onClick={() => toast({ title: "Đã áp dụng lịch trình", description: `"${s.name}" (${s.startTime} - ${s.endTime})` })}>
                      <Play className="w-3 h-3" /> Áp dụng
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSchedule(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setSchedules(prev => prev.filter(x => x.id !== s.id))}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card> */}

      {/* Device Schedule Card */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Lịch bật/tắt thiết bị ({deviceSchedules.length})
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                onClick={async () => {
                  if (!token) return;
                  await fetch(`${BASE_URL_DS}/api/device-schedules/run`, {
                    method: "POST", headers: { Authorization: `Bearer ${token}` }
                  });
                  toast({ title: "Đã kích hoạt scheduler" });
                }}>
                <Zap className="w-3 h-3" /> Chạy ngay
              </Button>
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => {
                setDevSchedForm(createDefaultDeviceScheduleForm());
                setDevSchedFormOpen(true);
              }}>
                <Plus className="w-3 h-3" /> Thêm lịch
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {deviceSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Chưa có lịch nào. Thêm lịch để tự động bật/tắt thiết bị theo giờ.
            </p>
          ) : (
            <div className="space-y-2">
              {deviceSchedules.map(s => {
                const dev = controllerDevices.find(d => {
                  const id = d.id.replace("monitor-", "");
                  return Number(id) === s.deviceId;
                });
                // Trạng thái thật của thiết bị từ Adafruit
                const isTempFan = dev && (monitors ?? []).find(m => `monitor-${m.deviceId}` === dev.id)?.connectKey === "temp-fan";
                const isHumiFan = dev && (monitors ?? []).find(m => `monitor-${m.deviceId}` === dev.id)?.connectKey === "humi-fan";
                const deviceOn = isTempFan ? sensorState.tempFan : isHumiFan ? sensorState.humiFan : dev?.isOn ?? false;
                const action = (s.action ?? "WINDOW").toUpperCase();
                const isOnlyOn = action === "ONLY_ON";
                const isOnlyOff = action === "ONLY_OFF" || action === "OFF";
                const isWindowAction = !isOnlyOn && !isOnlyOff;

                // Kiểm tra có đang trong giờ lịch không
                const nowTime = new Date();
                const [sh, sm] = s.startTime.split(":").map(Number);
                const [eh, em] = s.endTime.split(":").map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;
                const curMin = nowTime.getHours() * 60 + nowTime.getMinutes();
                const dayCodes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
                const currentDay = dayCodes[nowTime.getDay()];
                const previousDay = dayCodes[(nowTime.getDay() + 6) % 7];
                const selectedDays = (s.daysOfWeek ?? "").split(",").filter(Boolean);
                const inRepeatWindow = startMin < endMin
                  ? selectedDays.includes(currentDay) && curMin >= startMin && curMin < endMin
                  : (selectedDays.includes(currentDay) && curMin >= startMin) || (selectedDays.includes(previousDay) && curMin < endMin);
                const oneTimeStart = s.oneTimeAt ? new Date(s.oneTimeAt) : null;
                const oneTimeEnd = oneTimeStart ? new Date(oneTimeStart) : null;
                if (oneTimeEnd) {
                  oneTimeEnd.setHours(eh, em, 0, 0);
                  if (oneTimeStart && oneTimeEnd <= oneTimeStart) oneTimeEnd.setDate(oneTimeEnd.getDate() + 1);
                }
                const inOneTimeWindow = Boolean(oneTimeStart && oneTimeEnd && nowTime >= oneTimeStart && nowTime < oneTimeEnd);
                const inSchedule = isWindowAction && s.active && (s.scheduleType === "one_time" ? inOneTimeWindow : inRepeatWindow);
                const timeLabel = s.scheduleType === "one_time" && oneTimeStart
                  ? `${oneTimeStart.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} · ${isOnlyOn ? `Bật ${s.startTime}` : isOnlyOff ? `Tắt ${s.startTime}` : `Bật ${s.startTime} → Tắt ${s.endTime}`}`
                  : isOnlyOn ? `Bật ${s.startTime}` : isOnlyOff ? `Tắt ${s.startTime}` : `Bật ${s.startTime} → Tắt ${s.endTime}`;

                return (
                  <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${s.active ? "bg-secondary/20 border-border/30" : "bg-muted/10 border-border/10 opacity-60"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${inSchedule ? "bg-green-500/10" : s.active ? "bg-amber-400/10" : "bg-muted/20"}`}>
                      <Zap className={`w-4 h-4 ${inSchedule ? "text-green-400" : s.active ? "text-amber-400" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{s.name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                          {s.scheduleType === "one_time" ? "One-time" : "Repeat"}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${isOnlyOff ? "bg-destructive/10 text-destructive" : isOnlyOn ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                          {isOnlyOn ? "Chỉ Bật" : isOnlyOff ? "Chỉ Tắt" : "Khung giờ"}
                        </span>
                        {inSchedule && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Đang bật theo lịch</span>}
                        {dev && <span className={`text-[9px] px-1.5 py-0.5 rounded ${deviceOn ? "bg-success/10 text-success" : "bg-muted/20 text-muted-foreground"}`}>
                          Hiện tại: {deviceOn ? "BẬT" : "TẮT"}
                        </span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap mt-0.5">
                        <span className="font-mono">{timeLabel}</span>
                        <span>·</span>
                        <span>{dev?.name ?? `Thiết bị #${s.deviceId}`}</span>
                        {s.scheduleType !== "one_time" && (
                          <>
                            <span>·</span>
                            <span>{s.daysOfWeek.split(",").map(d => DAY_OPTIONS.find(o => o.value === d)?.label ?? d).join(" ")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex flex-col items-center gap-0.5">
                        <Switch checked={s.active} onCheckedChange={v => toggleDeviceSchedule(s.id, v)} />
                        <span className="text-[9px] text-muted-foreground">Kích hoạt</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteDeviceSchedule(s.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Device Schedule Form Dialog */}
      <Dialog open={devSchedFormOpen} onOpenChange={setDevSchedFormOpen}>
        <DialogContent className="bg-card border-border/50 p-6 sm:max-w-2xl">
          <DialogHeader><DialogTitle>Thêm lịch bật/tắt thiết bị</DialogTitle></DialogHeader>
          <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tên lịch</Label>
              <Input value={devSchedForm.name} onChange={e => setDevSchedForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Đèn A1 bật 07:00, tắt 08:00" className="bg-secondary/30 border-border/30" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["one_time", "repeat"] as const).map(type => (
                <Button key={type} type="button" variant={devSchedForm.scheduleType === type ? "default" : "outline"}
                  className="text-xs" onClick={() => setDevSchedForm(f => ({ ...f, scheduleType: type }))}>
                  {type === "one_time" ? "One-time" : "Repeat"}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {DEVICE_ACTION_MODE_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  type="button"
                  variant={devSchedForm.actionMode === option.value ? "default" : "outline"}
                  className="h-auto min-h-12 whitespace-normal px-3 py-2 text-xs leading-tight"
                  onClick={() => setDevSchedForm(f => ({ ...f, actionMode: option.value }))}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {devSchedForm.scheduleType === "one_time" ? (
              <div className={`grid gap-3 ${devSchedForm.actionMode === "window" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ngày</Label>
                  <Input type="date" value={devSchedForm.oneTimeDate}
                    onChange={e => setDevSchedForm(f => ({ ...f, oneTimeDate: e.target.value }))}
                    className="bg-secondary/30 border-border/30" />
                </div>
                {devSchedForm.actionMode !== "only_off" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{devSchedForm.actionMode === "only_on" ? "Thời gian BẬT" : "Bật lúc"}</Label>
                    <Time24Input
                      value={devSchedForm.startTime}
                      onChange={(value) => setDevSchedForm(f => ({ ...f, startTime: value }))}
                      className="bg-secondary/30 border-border/30"
                    />
                  </div>
                )}
                {devSchedForm.actionMode !== "only_on" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{devSchedForm.actionMode === "only_off" ? "Thời gian TẮT" : "Tắt lúc"}</Label>
                    <Time24Input
                      value={devSchedForm.endTime}
                      onChange={(value) => setDevSchedForm(f => ({ ...f, endTime: value }))}
                      className="bg-secondary/30 border-border/30"
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Thứ trong tuần</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_OPTIONS.map(day => {
                      const selected = devSchedForm.daysOfWeek.includes(day.value);
                      return (
                        <button key={day.value} type="button"
                          className={`px-2.5 py-1 rounded text-xs border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:border-primary/40"}`}
                          onClick={() => {
                            const next = selected
                              ? devSchedForm.daysOfWeek.filter(d => d !== day.value)
                              : [...devSchedForm.daysOfWeek, day.value];
                            setDevSchedForm(f => ({ ...f, daysOfWeek: next }));
                          }}>
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={`grid gap-3 ${devSchedForm.actionMode === "window" ? "grid-cols-2" : "grid-cols-1"}`}>
                  {devSchedForm.actionMode !== "only_off" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{devSchedForm.actionMode === "only_on" ? "Thời gian BẬT" : "Bật lúc"}</Label>
                      <Time24Input
                        value={devSchedForm.startTime}
                        onChange={(value) => setDevSchedForm(f => ({ ...f, startTime: value }))}
                        className="bg-secondary/30 border-border/30"
                      />
                    </div>
                  )}
                  {devSchedForm.actionMode !== "only_on" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{devSchedForm.actionMode === "only_off" ? "Thời gian TẮT" : "Tắt lúc"}</Label>
                      <Time24Input
                        value={devSchedForm.endTime}
                        onChange={(value) => setDevSchedForm(f => ({ ...f, endTime: value }))}
                        className="bg-secondary/30 border-border/30"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {devSchedForm.actionMode === "window" && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bật</p>
                  <p className="font-mono text-sm text-primary">{devSchedForm.startTime}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="min-w-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tắt</p>
                  <p className="font-mono text-sm text-destructive">{devSchedForm.endTime}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Thiết bị áp dụng</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {controllerDevices.map(d => {
                  const deviceId = d.id.replace("monitor-", "");
                  const checked = devSchedForm.deviceIds.includes(deviceId);
                  return (
                    <label key={d.id} className="flex min-h-11 cursor-pointer items-center justify-between rounded-md border border-border/30 bg-secondary/20 px-3 py-2">
                      <span className="text-xs">{d.name}</span>
                      <Checkbox checked={checked} onCheckedChange={v => setDevSchedForm(f => ({
                        ...f,
                        deviceIds: Boolean(v) ? [...f.deviceIds, deviceId] : f.deviceIds.filter(id => id !== deviceId),
                      }))} />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevSchedFormOpen(false)} className="text-xs">Hủy</Button>
            <Button onClick={saveDeviceSchedule}
              disabled={!devSchedForm.name.trim() || devSchedForm.deviceIds.length === 0 || !isTime24(devSchedForm.actionMode === "only_off" ? devSchedForm.endTime : devSchedForm.startTime) || (devSchedForm.actionMode === "window" && !isTime24(devSchedForm.endTime)) || (devSchedForm.scheduleType === "repeat" && devSchedForm.daysOfWeek.length === 0)}
              className="text-xs gap-1.5">
              <Save className="w-3 h-3" /> Lưu lịch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Food Dialog */}
      <Dialog open={foodFormOpen} onOpenChange={setFoodFormOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader><DialogTitle>{editingFood ? "Chỉnh sửa thực phẩm" : "Thêm thực phẩm mới"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Tên thực phẩm</Label>
              <Input value={foodForm.name} onChange={e => setFoodForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Tôm sú" className="bg-secondary/30 border-border/30" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Số lượng</Label>
                <Input value={foodForm.quantity} onChange={e => setFoodForm(f => ({ ...f, quantity: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Đơn vị</Label>
                <Select value={foodForm.unit} onValueChange={v => setFoodForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["kg", "thùng", "hộp", "túi"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Nhiệt độ bảo quản (°C)</Label>
                <Input type="number" value={foodForm.storageTemp} onChange={e => setFoodForm(f => ({ ...f, storageTemp: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Độ ẩm bảo quản (%)</Label>
                <Input type="number" value={foodForm.storageHumidity} onChange={e => setFoodForm(f => ({ ...f, storageHumidity: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Hạn sử dụng</Label>
              <Input type="date" value={foodForm.expiryDate} onChange={e => setFoodForm(f => ({ ...f, expiryDate: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Ghi chú</Label>
              <Input value={foodForm.note} onChange={e => setFoodForm(f => ({ ...f, note: e.target.value }))} placeholder="Tùy chọn" className="bg-secondary/30 border-border/30" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFoodFormOpen(false)} className="text-xs">Hủy</Button>
            <Button onClick={saveFood} disabled={!foodForm.name.trim()} className="text-xs gap-1.5"><Save className="w-3 h-3" /> Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={foodDeleteOpen} onOpenChange={setFoodDeleteOpen}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader><AlertDialogTitle>Xác nhận xóa thực phẩm</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc muốn xóa thực phẩm này?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deletingFoodId) setFoods(p => p.filter(f => f.id !== deletingFoodId)); setFoodDeleteOpen(false); setDeletingFoodId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleFormOpen} onOpenChange={setScheduleFormOpen}>
        <DialogContent className="bg-card border-border/50 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingSchedule ? "Chỉnh sửa lịch trình" : "Thêm lịch trình mới"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Schedule Name</Label>
              <Input
                value={scheduleForm.name}
                onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Lịch bảo quản thủy sản ca sáng"
                className="bg-secondary/30 border-border/30"
              />
            </div>

            <div className="rounded-lg border border-border/30 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phạm vi áp dụng</p>
              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left ${scheduleForm.scopeType === "single" ? "border-primary bg-primary/10" : "border-border/40 bg-secondary/20"}`}
                  onClick={() => setScheduleForm(f => ({ ...f, scopeType: "single" }))}
                >
                  Chỉ phòng hiện tại
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left ${scheduleForm.scopeType === "all" ? "border-primary bg-primary/10" : "border-border/40 bg-secondary/20"}`}
                  onClick={() => setScheduleForm(f => ({ ...f, scopeType: "all" }))}
                >
                  Tất cả phòng trong khu
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left ${scheduleForm.scopeType === "multiple" ? "border-primary bg-primary/10" : "border-border/40 bg-secondary/20"}`}
                  onClick={() => setScheduleForm(f => ({
                    ...f,
                    scopeType: "multiple",
                    selectedRoomIds: currentRoomId != null
                      ? Array.from(new Set([currentRoomId, ...f.selectedRoomIds]))
                      : f.selectedRoomIds,
                  }))}
                >
                  Nhiều phòng tùy ý
                </button>
              </div>

              {scheduleForm.scopeType === "multiple" && (
                <div className="space-y-2 rounded-md border border-border/40 p-3 bg-secondary/10">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Khu vực hiển thị phòng</Label>
                    <Select
                      value={scheduleForm.multiAreaId}
                      onValueChange={value => setScheduleForm(f => ({ ...f, multiAreaId: value }))}
                    >
                      <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả khu</SelectItem>
                        {areaRooms.map(a => (
                          <SelectItem key={a.areaId} value={String(a.areaId)}>{a.areaName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-auto rounded-md border border-border/30 p-2">
                    {multipleAreaRooms.map(r => (
                      <label key={r.roomId} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleForm.selectedRoomIds.includes(r.roomId)}
                          onChange={(e) => {
                            setScheduleForm(f => ({
                              ...f,
                              selectedRoomIds: e.target.checked
                                ? Array.from(new Set([...f.selectedRoomIds, r.roomId]))
                                : f.selectedRoomIds.filter((id) => id !== r.roomId),
                            }));
                          }}
                        />
                        <span>{r.areaName} / {r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                {previewLabel}
              </div>
            </div>

            <div className="rounded-lg border border-border/30 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cấu hình thời gian</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Schedule Type</Label>
                  <Select
                    value={scheduleForm.scheduleType}
                    onValueChange={(v: "recurring" | "one_time") => setScheduleForm(f => ({ ...f, scheduleType: v }))}
                  >
                    <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {scheduleForm.scheduleType === "recurring" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Recurring Pattern</Label>
                    <Select
                      value={scheduleForm.recurrence}
                      onValueChange={(v: "daily" | "weekly" | "interval_hours") => setScheduleForm(f => ({ ...f, recurrence: v }))}
                    >
                      <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="interval_hours">Interval Hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {scheduleForm.scheduleType === "recurring" && scheduleForm.recurrence === "interval_hours" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Interval Hours</Label>
                  <Input
                    type="number"
                    min={1}
                    value={scheduleForm.intervalHours}
                    onChange={e => setScheduleForm(f => ({ ...f, intervalHours: e.target.value }))}
                    className="bg-secondary/30 border-border/30"
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Time24Input
                    value={scheduleForm.startTime}
                    onChange={(value) => setScheduleForm(f => ({ ...f, startTime: value }))}
                    className="bg-secondary/30 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kiểu kết thúc</Label>
                  <Select
                    value={scheduleForm.useDuration ? "duration" : "end_time"}
                    onValueChange={(v: "duration" | "end_time") => setScheduleForm(f => ({ ...f, useDuration: v === "duration" }))}
                  >
                    <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="end_time">End Time</SelectItem>
                      <SelectItem value="duration">Duration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{scheduleForm.useDuration ? "Duration (phút)" : "End Time"}</Label>
                  {scheduleForm.useDuration ? (
                    <Input type="number" min={1} value={scheduleForm.durationMinutes} onChange={e => setScheduleForm(f => ({ ...f, durationMinutes: e.target.value }))} className="bg-secondary/30 border-border/30" />
                  ) : (
                    <Time24Input
                      value={scheduleForm.endTime}
                      onChange={(value) => setScheduleForm(f => ({ ...f, endTime: value }))}
                      className="bg-secondary/30 border-border/30"
                    />
                  )}
                </div>
              </div>

              {scheduleForm.scheduleType === "recurring" && scheduleForm.recurrence === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Days of Week</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        type="button"
                        key={day.value}
                        onClick={() => setScheduleForm(f => ({
                          ...f,
                          daysOfWeek: f.daysOfWeek.includes(day.value)
                            ? f.daysOfWeek.filter((d) => d !== day.value)
                            : [...f.daysOfWeek, day.value],
                        }))}
                        className={`text-xs px-2.5 py-1.5 rounded border ${scheduleForm.daysOfWeek.includes(day.value) ? "border-primary bg-primary/10 text-primary" : "border-border/40 bg-secondary/20 text-muted-foreground"}`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/30 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thông số vận hành</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mode</Label>
                  <Select value={scheduleForm.mode} onValueChange={(v: "Cooling" | "Defrost" | "Eco") => setScheduleForm(f => ({ ...f, mode: v }))}>
                    <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cooling">Cooling</SelectItem>
                      <SelectItem value="Defrost">Defrost</SelectItem>
                      <SelectItem value="Eco">Eco</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Timezone</Label>
                  <Input value={scheduleForm.timezone} onChange={e => setScheduleForm(f => ({ ...f, timezone: e.target.value }))} className="bg-secondary/30 border-border/30" />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Set-point (°C)</Label>
                  <Input type="number" value={scheduleForm.setPoint} onChange={e => setScheduleForm(f => ({ ...f, setPoint: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Set-humid (%)</Label>
                  <Input type="number" value={scheduleForm.setHumid} onChange={e => setScheduleForm(f => ({ ...f, setHumid: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Hysteresis</Label>
                  <Input type="number" min={0} value={scheduleForm.hysteresis} onChange={e => setScheduleForm(f => ({ ...f, hysteresis: e.target.value }))} className="bg-secondary/30 border-border/30" /></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mô tả</Label>
                <Input value={scheduleForm.description} onChange={e => setScheduleForm(f => ({ ...f, description: e.target.value }))} placeholder="Tùy chọn" className="bg-secondary/30 border-border/30" />
              </div>
            </div>

            {scheduleValidation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1">
                {scheduleValidation.errors.map((err) => (
                  <p key={err}>• {err}</p>
                ))}
              </div>
            )}

            {scheduleValidation.hasConflict && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning space-y-1">
                <p className="font-medium">Conflict: Một số phòng đã có lịch trùng thời gian.</p>
                {scheduleValidation.conflictSchedules.slice(0, 3).map((s) => (
                  <p key={s.id}>• {s.name} ({s.startTime} - {s.endTime})</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleFormOpen(false)} className="text-xs">Hủy</Button>
            <Button onClick={saveSchedule} disabled={!scheduleValidation.canSave} className="text-xs gap-1.5"><Save className="w-3 h-3" /> Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={deviceFormOpen} onOpenChange={setDeviceFormOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>Thêm thiết bị vào phòng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Loại thiết bị</Label>
              <Select value={deviceForm.category} onValueChange={v => {
                const cat = DEVICE_CATEGORY_OPTIONS.find(c => c.value === v);
                setDeviceForm(f => ({ ...f, category: v, connectKey: cat?.key ?? v.toLowerCase() }));
              }}>
                <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVICE_CATEGORY_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tên thiết bị</Label>
              <Input
                value={deviceForm.name}
                onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))}
                placeholder={`VD: ${DEVICE_CATEGORY_OPTIONS.find(c => c.value === deviceForm.category)?.label} phòng ${currentRoomId}`}
                className="bg-secondary/30 border-border/30"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Connect key: <span className="font-mono text-primary">{DEVICE_CATEGORY_OPTIONS.find(c => c.value === deviceForm.category)?.key}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceFormOpen(false)} className="text-xs">Hủy</Button>
            <Button onClick={saveDevice} disabled={!deviceForm.name.trim()} className="text-xs gap-1.5">
              <Save className="w-3 h-3" /> Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
