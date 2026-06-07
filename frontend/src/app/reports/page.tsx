"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, BarChart3, Thermometer, Droplets,
  AlertTriangle, Cpu, Building2, DoorOpen, ChevronDown, ChevronRight,
  ArrowDownToLine, ArrowUpFromLine, Boxes
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { getZones, getRooms, type Zone, type Room } from "@/lib/zone-api";
import { getInventoryTransactions, getInventorySummary, type InventoryTransaction, type InventorySummary } from "@/lib/inventory-transactions";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ── Types ─────────────────────────────────────────────────────────────────

interface Summary {
  period: { from: string; to: string };
  sensors: { total: number; active: number; inactive: number };
  temperature: { count: number; min: number; max: number; avg: number };
  humidity: { count: number; min: number; max: number; avg: number };
  alerts: { total: number; active: number; resolved: number };
}

interface ZoneReport {
  areaId: number; areaName: string; location: string;
  roomCount: number; sensorCount: number; activeSensors: number;
  avgTemperature: number | null; avgHumidity: number | null;
}

interface SensorInfo {
  deviceId: number; name: string; status: string;
  temperature: number | null; humidity: number | null;
  lastUpdated: string | null; installDate: string | null;
}

interface RoomReport {
  roomId: number; name: string; maxVolume: number; currentVolume: number;
  sensorCount: number; activeSensors: number;
  temperature: { count: number; min: number; max: number; avg: number };
  humidity: { count: number; min: number; max: number; avg: number };
  sensors: SensorInfo[];
}

interface HistoryPoint { day: string; temp: number | null; humi: number | null; }

type Tab = "overview" | "by-zone" | "by-room" | "inventory";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];

// ── Main Component ────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { token, user } = useAuth();
  const today    = new Date().toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [tab, setTab]           = useState<Tab>("overview");
  const [from, setFrom]         = useState(monthAgo);
  const [to, setTo]             = useState(today);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const [summary, setSummary]         = useState<Summary | null>(null);
  const [zoneReports, setZoneReports] = useState<ZoneReport[]>([]);
  const [roomReports, setRoomReports] = useState<RoomReport[]>([]);
  const [history, setHistory]         = useState<HistoryPoint[]>([]);
  const [invTransactions, setInvTransactions] = useState<InventoryTransaction[]>([]);
  const [invSummary, setInvSummary]   = useState<InventorySummary | null>(null);

  const [zones, setZones]               = useState<Zone[]>([]);
  const [rooms, setRooms]               = useState<Room[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | "">("");
  const [selectedRoom, setSelectedRoom] = useState<number | "">("");
  const [expandedRooms, setExpandedRooms] = useState<Set<number>>(new Set());

  if (user?.role === "MAINTENANCE") {
    return <div className="p-6 text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { if (token) getZones(token).then(setZones).catch(() => {}); }, [token]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (token) getRooms(token, selectedZone !== "" ? selectedZone : undefined).then(setRooms).catch(() => {});
  }, [token, selectedZone]);

  async function load() {
    if (!token) return;
    setLoading(true); setError("");
    try {
      if (tab === "overview") {
        const [sumRes, histRes] = await Promise.all([
          fetch(`${BASE}/api/reports/summary?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BASE}/api/reports/chart-history?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!sumRes.ok) throw new Error("Không thể tải báo cáo");
        setSummary(await sumRes.json());
        setHistory(histRes.ok ? await histRes.json() : []);
      } else if (tab === "by-zone") {
        const r = await fetch(`${BASE}/api/reports/by-zone?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error("Không thể tải báo cáo theo khu");
        setZoneReports(await r.json());
      } else if (tab === "inventory") {
        const areaId = selectedZone !== "" ? Number(selectedZone) : undefined;
        const [txs, sum] = await Promise.all([
          getInventoryTransactions(token, { areaId }),
          getInventorySummary(token, areaId),
        ]);
        setInvTransactions(txs);
        setInvSummary(sum);
      } else {
        const q = selectedZone !== "" ? `&areaId=${selectedZone}` : "";
        const roomId = selectedRoom !== "" ? selectedRoom : undefined;
        const [roomRes, histRes] = await Promise.all([
          fetch(`${BASE}/api/reports/by-room?from=${from}&to=${to}${q}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BASE}/api/reports/chart-history?from=${from}&to=${to}${roomId ? `&roomId=${roomId}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!roomRes.ok) throw new Error("Không thể tải báo cáo theo phòng");
        setRoomReports(await roomRes.json());
        setHistory(histRes.ok ? await histRes.json() : []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally { setLoading(false); }
  }

  function download(type: "pdf" | "csv", csvType?: string) {
    if (!token) return;
    let url = `${BASE}/api/reports/export/${type}?from=${from}&to=${to}`;
    if (type === "pdf") {
      if (tab === "by-zone" && selectedZone !== "") url += `&scope=zone&areaId=${selectedZone}`;
      else if (tab === "by-room" && selectedRoom !== "") url += `&scope=room&roomId=${selectedRoom}`;
      else url += `&scope=all`;
    }
    if (type === "csv" && csvType) {
      url += `&type=${csvType}`;
      if (selectedZone !== "") url += `&areaId=${selectedZone}`;
      if (selectedRoom !== "") url += `&roomId=${selectedRoom}`;
    }
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = type === "pdf" ? `bao-cao-${from}-${to}.pdf` : `bao-cao-${csvType}-${from}-${to}.csv`;
        a.click(); URL.revokeObjectURL(a.href);
      });
  }

  function toggleRoom(id: number) {
    setExpandedRooms(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview",  label: "Tổng quát",    icon: <BarChart3 className="w-4 h-4" /> },
    { key: "by-zone",   label: "Theo khu",     icon: <Building2 className="w-4 h-4" /> },
    { key: "by-room",   label: "Theo phòng",   icon: <DoorOpen  className="w-4 h-4" /> },
    { key: "inventory", label: "Xuất nhập hàng", icon: <Boxes   className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold">Báo cáo</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors
              ${tab === t.key ? "bg-primary/10 text-primary border-b-2 border-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="glass-card border-border/30">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Từ ngày</Label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đến ngày</Label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground" />
            </div>
            {(tab === "by-zone" || tab === "by-room" || tab === "inventory") && (
              <div className="space-y-1">
                <Label className="text-xs">Khu vực</Label>
                <select value={selectedZone} onChange={e => { setSelectedZone(e.target.value === "" ? "" : Number(e.target.value)); setSelectedRoom(""); }}
                  className="px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground min-w-[160px]">
                  <option value="">Tất cả khu</option>
                  {zones.map(z => <option key={z.areaId} value={z.areaId}>{z.areaName}</option>)}
                </select>
              </div>
            )}
            {tab === "by-room" && (
              <div className="space-y-1">
                <Label className="text-xs">Phòng</Label>
                <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value === "" ? "" : Number(e.target.value))}
                  className="px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground min-w-[160px]">
                  <option value="">Tất cả phòng</option>
                  {rooms.map(r => <option key={r.roomId} value={r.roomId}>{r.name}</option>)}
                </select>
              </div>
            )}
            <Button onClick={load} disabled={loading} className="gap-2">
              <BarChart3 className="w-4 h-4" />
              {loading ? "Đang tải..." : "Xem báo cáo"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      {tab === "overview" && summary && <OverviewTab summary={summary} history={history} onDownload={download} />}
      {tab === "by-zone"  && zoneReports.length > 0 && <ZoneTab zones={zoneReports} onDownload={download} />}
      {tab === "by-room"  && roomReports.length > 0 && (
        <RoomTab rooms={roomReports} history={history} expanded={expandedRooms} onToggle={toggleRoom} onDownload={download} />
      )}
      {tab === "inventory" && invSummary && (
        <InventoryTab transactions={invTransactions} summary={invSummary} />
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────

function OverviewTab({ summary, history, onDownload }: {
  summary: Summary;
  history: HistoryPoint[];
  onDownload: (t: "pdf" | "csv", ct?: string) => void;
}) {
  const pieData = [
    { name: "Hoạt động", value: summary.sensors.active },
    { name: "Không HĐ",  value: summary.sensors.inactive },
  ];
  const alertPie = [
    { name: "Chưa xử lý", value: summary.alerts.active },
    { name: "Đã xử lý",   value: summary.alerts.resolved },
  ];
  const PIE_COLORS = ["#6366f1", "#f43f5e"];
  const ALERT_COLORS = ["#f59e0b", "#10b981"];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kỳ báo cáo: <span className="font-medium text-foreground">{summary.period.from} — {summary.period.to}</span>
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Cpu className="w-5 h-5 text-primary" />} title="Cảm biến">
          <p>Tổng: <b>{summary.sensors.total}</b></p>
          <p>Hoạt động: <b className="text-green-500">{summary.sensors.active}</b></p>
          <p>Không HĐ: <b className="text-destructive">{summary.sensors.inactive}</b></p>
        </StatCard>
        <StatCard icon={<Thermometer className="w-5 h-5 text-accent" />} title="Nhiệt độ">
          <p>Min: <b className="text-accent">{summary.temperature.min}°C</b></p>
          <p>Max: <b className="text-destructive">{summary.temperature.max}°C</b></p>
          <p>TB: <b className="text-primary">{summary.temperature.avg}°C</b></p>
          <p className="text-muted-foreground text-[10px]">{summary.temperature.count} mẫu</p>
        </StatCard>
        <StatCard icon={<Droplets className="w-5 h-5 text-blue-400" />} title="Độ ẩm">
          <p>Min: <b className="text-accent">{summary.humidity.min}%</b></p>
          <p>Max: <b className="text-destructive">{summary.humidity.max}%</b></p>
          <p>TB: <b className="text-primary">{summary.humidity.avg}%</b></p>
          <p className="text-muted-foreground text-[10px]">{summary.humidity.count} mẫu</p>
        </StatCard>
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-warning" />} title="Cảnh báo">
          <p>Tổng: <b>{summary.alerts.total}</b></p>
          <p>Chưa xử lý: <b className="text-destructive">{summary.alerts.active}</b></p>
          <p>Đã xử lý: <b className="text-green-500">{summary.alerts.resolved}</b></p>
        </StatCard>
      </div>

      {/* Charts row 1: Pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Trạng thái cảm biến">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Trạng thái cảnh báo">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={alertPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {alertPie.map((_, i) => <Cell key={i} fill={ALERT_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Chart row 2: Line chart lịch sử */}
      {history.length > 0 && (
        <ChartCard title="Xu hướng nhiệt độ & độ ẩm theo ngày">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="temp" orientation="left" tick={{ fontSize: 11, fill: "#f59e0b" }} unit="°C" />
              <YAxis yAxisId="humi" orientation="right" tick={{ fontSize: 11, fill: "#6366f1" }} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Line yAxisId="temp" type="monotone" dataKey="temp" name="Nhiệt độ (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="humi" type="monotone" dataKey="humi" name="Độ ẩm (%)" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ExportBar onDownload={onDownload} />
    </div>
  );
}

// ── Zone Tab ──────────────────────────────────────────────────────────────

function ZoneTab({ zones, onDownload }: { zones: ZoneReport[]; onDownload: (t: "pdf" | "csv", ct?: string) => void }) {
  const barData = zones.map(z => ({
    name: z.areaName.length > 12 ? z.areaName.slice(0, 12) + "…" : z.areaName,
    "Nhiệt độ TB": z.avgTemperature ?? 0,
    "Độ ẩm TB": z.avgHumidity ?? 0,
  }));

  const sensorBar = zones.map(z => ({
    name: z.areaName.length > 12 ? z.areaName.slice(0, 12) + "…" : z.areaName,
    "Hoạt động": z.activeSensors,
    "Không HĐ": z.sensorCount - z.activeSensors,
  }));

  return (
    <div className="space-y-4">
      {/* Zone cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zones.map((z, i) => (
          <Card key={z.areaId} className="glass-card border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {z.areaName}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{z.location}</p>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Số phòng</span><b>{z.roomCount}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cảm biến</span>
                <span><b className="text-green-500">{z.activeSensors}</b>/{z.sensorCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Nhiệt độ TB</span>
                <b className="text-amber-400">{z.avgTemperature != null ? `${z.avgTemperature}°C` : "—"}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Độ ẩm TB</span>
                <b className="text-blue-400">{z.avgHumidity != null ? `${z.avgHumidity}%` : "—"}</b></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart: nhiệt độ & độ ẩm */}
      <ChartCard title="So sánh nhiệt độ & độ ẩm trung bình theo khu">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis yAxisId="temp" orientation="left" tick={{ fontSize: 11, fill: "#f59e0b" }} unit="°C" />
            <YAxis yAxisId="humi" orientation="right" tick={{ fontSize: 11, fill: "#6366f1" }} unit="%" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            <Bar yAxisId="temp" dataKey="Nhiệt độ TB" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="humi" dataKey="Độ ẩm TB"   fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Bar chart: trạng thái cảm biến */}
      <ChartCard title="Trạng thái cảm biến theo khu">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={sensorBar} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="Hoạt động" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
            <Bar dataKey="Không HĐ"  fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ExportBar onDownload={onDownload} />
    </div>
  );
}

// ── Room Tab ──────────────────────────────────────────────────────────────

function RoomTab({ rooms, history, expanded, onToggle, onDownload }: {
  rooms: RoomReport[];
  history: HistoryPoint[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onDownload: (t: "pdf" | "csv", ct?: string) => void;
}) {
  // Bar chart: so sánh nhiệt độ TB giữa các phòng
  const compareData = rooms.map(r => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    "Nhiệt độ TB": r.temperature.avg,
    "Độ ẩm TB":   r.humidity.avg,
  }));

  return (
    <div className="space-y-4">
      {/* So sánh các phòng */}
      {rooms.length > 1 && (
        <ChartCard title="So sánh nhiệt độ & độ ẩm trung bình giữa các phòng">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={compareData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="temp" orientation="left"  tick={{ fontSize: 11, fill: "#f59e0b" }} unit="°C" />
              <YAxis yAxisId="humi" orientation="right" tick={{ fontSize: 11, fill: "#6366f1" }} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar yAxisId="temp" dataKey="Nhiệt độ TB" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="humi" dataKey="Độ ẩm TB"   fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Line chart lịch sử */}
      {history.length > 0 && (
        <ChartCard title="Xu hướng nhiệt độ & độ ẩm theo ngày">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="temp" orientation="left"  tick={{ fontSize: 11, fill: "#f59e0b" }} unit="°C" />
              <YAxis yAxisId="humi" orientation="right" tick={{ fontSize: 11, fill: "#6366f1" }} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Line yAxisId="temp" type="monotone" dataKey="temp" name="Nhiệt độ (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="humi" type="monotone" dataKey="humi" name="Độ ẩm (%)"    stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Room detail cards */}
      {rooms.map(room => (
        <Card key={room.roomId} className="glass-card border-border/30">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => onToggle(room.roomId)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-primary" />{room.name}
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge variant={room.activeSensors > 0 ? "default" : "destructive"} className="text-[10px]">
                  {room.activeSensors}/{room.sensorCount} cảm biến
                </Badge>
                {expanded.has(room.roomId) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </div>
          </CardHeader>

          {expanded.has(room.roomId) && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary/20 p-3 space-y-1 text-xs">
                  <p className="font-medium flex items-center gap-1"><Thermometer className="w-3 h-3 text-amber-400" /> Nhiệt độ</p>
                  <p>Min: <b className="text-accent">{room.temperature.count > 0 ? `${room.temperature.min}°C` : "—"}</b></p>
                  <p>Max: <b className="text-destructive">{room.temperature.count > 0 ? `${room.temperature.max}°C` : "—"}</b></p>
                  <p>TB: <b className="text-primary">{room.temperature.count > 0 ? `${room.temperature.avg}°C` : "—"}</b></p>
                  <p className="text-muted-foreground">{room.temperature.count} mẫu</p>
                </div>
                <div className="rounded-lg bg-secondary/20 p-3 space-y-1 text-xs">
                  <p className="font-medium flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-400" /> Độ ẩm</p>
                  <p>Min: <b className="text-accent">{room.humidity.count > 0 ? `${room.humidity.min}%` : "—"}</b></p>
                  <p>Max: <b className="text-destructive">{room.humidity.count > 0 ? `${room.humidity.max}%` : "—"}</b></p>
                  <p>TB: <b className="text-primary">{room.humidity.count > 0 ? `${room.humidity.avg}%` : "—"}</b></p>
                  <p className="text-muted-foreground">{room.humidity.count} mẫu</p>
                </div>
              </div>

              {/* Sensor table */}
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Danh sách cảm biến</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Tên</th>
                        <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Trạng thái</th>
                        <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Nhiệt độ</th>
                        <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Độ ẩm</th>
                        <th className="text-left py-1.5 text-muted-foreground font-medium">Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.sensors.map(s => (
                        <tr key={s.deviceId} className="border-b border-border/10">
                          <td className="py-1.5 pr-3">{s.name}</td>
                          <td className="py-1.5 pr-3">
                            <Badge variant={s.status === "online" ? "default" : "destructive"} className="text-[10px]">{s.status}</Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono">{s.temperature != null ? `${s.temperature}°C` : "—"}</td>
                          <td className="py-1.5 pr-3 text-right font-mono">{s.humidity != null ? `${s.humidity}%` : "—"}</td>
                          <td className="py-1.5 text-muted-foreground">{s.lastUpdated ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      <ExportBar onDownload={onDownload} />
    </div>
  );
}

// ── Inventory Tab ─────────────────────────────────────────────────────────

function InventoryTab({ transactions, summary }: {
  transactions: InventoryTransaction[];
  summary: InventorySummary;
}) {
  const numberValue = (n: number | string | undefined) => {
    if (typeof n === "number") return Number.isFinite(n) ? n : 0;
    if (typeof n === "string") { const p = Number(n); return Number.isFinite(p) ? p : 0; }
    return 0;
  };

  // Bar chart nhập/xuất theo khu
  const byArea: Record<string, { in: number; out: number }> = {};
  transactions.forEach(tx => {
    if (!byArea[tx.areaName]) byArea[tx.areaName] = { in: 0, out: 0 };
    const boxes = tx.items.reduce((s, i) => s + numberValue(i.boxCount), 0);
    if (tx.transactionType === "IN") byArea[tx.areaName].in += boxes;
    else byArea[tx.areaName].out += boxes;
  });
  const barData = Object.entries(byArea).map(([name, v]) => ({
    name: name.length > 14 ? name.slice(0, 14) + "…" : name,
    "Nhập": v.in, "Xuất": v.out,
  }));

  function formatDateTime(raw: string) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={<ArrowDownToLine className="w-5 h-5 text-green-500" />} title="Tổng nhập">
          <p className="text-2xl font-bold text-green-500">{numberValue(summary.totalInBoxes)}</p>
          <p className="text-muted-foreground">{numberValue(summary.totalInVolume).toFixed(3)} m³</p>
        </StatCard>
        <StatCard icon={<ArrowUpFromLine className="w-5 h-5 text-amber-400" />} title="Tổng xuất">
          <p className="text-2xl font-bold text-amber-400">{numberValue(summary.totalOutBoxes)}</p>
          <p className="text-muted-foreground">{numberValue(summary.totalOutVolume).toFixed(3)} m³</p>
        </StatCard>
        <StatCard icon={<Boxes className="w-5 h-5 text-primary" />} title="Tồn ước tính">
          <p className="text-2xl font-bold text-primary">{numberValue(summary.estimatedStockBoxes)}</p>
          <p className="text-muted-foreground">{numberValue(summary.estimatedStockVolume).toFixed(3)} m³</p>
        </StatCard>
      </div>

      {/* Bar chart nhập/xuất theo khu */}
      {barData.length > 0 && (
        <ChartCard title="Nhập / Xuất theo khu vực (số thùng)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Nhập" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Xuất" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Danh sách giao dịch */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" /> Danh sách giao dịch ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có giao dịch nào.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {transactions.map(tx => (
                <div key={tx.transactionId} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.transactionType === "IN" ? "default" : "destructive"} className="text-[10px]">
                        {tx.transactionType === "IN" ? "Nhập" : "Xuất"}
                      </Badge>
                      <span className="text-sm font-medium">{tx.areaName} · {tx.roomName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</span>
                  </div>
                  {tx.note && <p className="text-xs text-muted-foreground mb-2">{tx.note}</p>}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border/30">
                          <th className="py-1 pr-3">Thực phẩm</th>
                          <th className="py-1 pr-3">Loại</th>
                          <th className="py-1 pr-3 text-right">Thùng</th>
                          <th className="py-1 text-right">Tổng m³</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tx.items.map((item, idx) => (
                          <tr key={idx} className="border-t border-border/20">
                            <td className="py-1 pr-3">{item.foodName}</td>
                            <td className="py-1 pr-3 text-muted-foreground">{item.foodType ?? "—"}</td>
                            <td className="py-1 pr-3 text-right font-mono">{numberValue(item.boxCount)}</td>
                            <td className="py-1 text-right font-mono">{numberValue(item.totalVolume).toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────

function StatCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="glass-card border-border/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">{icon}<p className="text-xs text-muted-foreground">{title}</p></div>
        <div className="space-y-0.5 text-xs">{children}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="glass-card border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ExportBar({ onDownload }: { onDownload: (t: "pdf" | "csv", ct?: string) => void }) {
  return (
    <Card className="glass-card border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" /> Xuất file
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onDownload("pdf")}>
            <FileText className="w-3.5 h-3.5 text-destructive" /> Xuất PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onDownload("csv", "sensors")}>
            <Download className="w-3.5 h-3.5 text-green-500" /> CSV Cảm biến
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onDownload("csv", "temperature")}>
            <Download className="w-3.5 h-3.5 text-amber-400" /> CSV Nhiệt độ
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onDownload("csv", "humidity")}>
            <Download className="w-3.5 h-3.5 text-blue-400" /> CSV Độ ẩm
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onDownload("csv", "alerts")}>
            <Download className="w-3.5 h-3.5 text-warning" /> CSV Cảnh báo
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">PDF: báo cáo tổng hợp · CSV: dữ liệu thô theo bộ lọc đang chọn</p>
      </CardContent>
    </Card>
  );
}
