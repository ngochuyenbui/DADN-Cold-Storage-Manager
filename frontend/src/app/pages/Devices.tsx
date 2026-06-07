'use client';
import { useEffect, useMemo, useState, useCallback } from "react";
import { Thermometer, Power, Activity, Eye, Plus, Pencil, Trash2, Save, MapPin, Clock, AlertTriangle, TrendingUp, TrendingDown, Zap, BarChart3, ArrowLeft, Wind, Lightbulb, Camera, DoorOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import {
  getSensors, createSensor, updateSensor, deleteSensor,
  getMonitorDevices, createMonitorDevice, updateMonitorDevice, deleteMonitorDevice,
  SensorDevice as ApiSensor, MonitorDevice as ApiMonitor,
} from "@/lib/zone-api";

type DeviceType = "sensor" | "controller";

interface Device {
  id: string;
  backendId?: number;
  roomId?: number;
  connectKey?: string;
  installDate?: string;
  name: string;
  type: DeviceType;
  zone: string;
  status: "online" | "offline" | "warning";
  lastSeen: string;
  value?: string;
  unit?: string;
  controllable?: boolean;
  isOn?: boolean;
  deviceCategory?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
const CONNECT_KEY_OPTIONS = ["humi-fan", "temp-fan", "auto-mode", "sensor-data", "threshold", "ai-warning"] as const;
type ConnectKey = (typeof CONNECT_KEY_OPTIONS)[number];

const DEVICE_CATEGORIES = [
  { value: "FAN_TEMP",  label: "Quạt nhiệt độ" },
  { value: "FAN_HUMI",  label: "Quạt độ ẩm" },
  { value: "LIGHT",     label: "Đèn" },
  { value: "CAMERA",    label: "Camera" },
  { value: "DOOR",      label: "Cửa" },
  { value: "OTHER",     label: "Khác" },
] as const;

type DeviceCategory = (typeof DEVICE_CATEGORIES)[number]["value"];

interface DeviceFormState {
  name: string;
  type: DeviceType;
  roomId: string;
  connectKey: string;
  installDate: string;
  unit: string;
  deviceCategory: string;
}

const mapBackendStatus = (status: string): Device["status"] => {
  const normalized = status.toLowerCase();
  if (normalized === "on" || normalized === "online") return "online";
  if (normalized === "warning") return "warning";
  return "offline";
};

const formatLastSeen = (lastUpdated?: string) => {
  if (!lastUpdated) return "Chưa cập nhật";
  const timestamp = Date.parse(lastUpdated);
  if (Number.isNaN(timestamp)) return lastUpdated;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes <= 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ trước`;
};

function DeviceCard({ device, isSelected, onSelect, onToggle, deviceOn, onEdit, onDelete }: {
  device: Device;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  deviceOn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusIcon = (status: string) => {
    if (status === "online") return <div className="w-2 h-2 status-online" />;
    if (status === "warning") return <div className="w-2 h-2 status-warning" />;
    return <div className="w-2 h-2 status-offline" />;
  };

  const categoryIcon = (cat?: string) => {
    switch (cat) {
      case "FAN_TEMP": case "FAN_HUMI": return <Wind className="w-3.5 h-3.5 text-primary" />;
      case "LIGHT":    return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />;
      case "CAMERA":   return <Camera className="w-3.5 h-3.5 text-blue-400" />;
      case "DOOR":     return <DoorOpen className="w-3.5 h-3.5 text-green-400" />;
      default:         return <Power className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Card
      className={`glass-card cursor-pointer transition-all hover:border-primary/30 ${isSelected ? "border-primary/50 glow-primary" : "border-border/30"}`}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {statusIcon(device.status)}
            {device.type === "controller" && categoryIcon(device.deviceCategory ?? undefined)}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{device.name}</p>
              <p className="text-[10px] text-muted-foreground">{device.lastSeen}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {device.type === "sensor" && device.value && (
              <span className="text-sm font-mono font-bold text-primary">{device.value}{device.unit}</span>
            )}
            {device.type === "controller" && device.controllable && (
              <Switch
                checked={deviceOn}
                onCheckedChange={onToggle}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Devices() {
  const { token, loading: authLoading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Device | null>(null);
  const [detailView, setDetailView] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");
  const [deviceStates, setDeviceStates] = useState<Record<string, boolean>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<DeviceFormState>({
    name: "",
    type: "sensor" as DeviceType,
    roomId: "",
    connectKey: CONNECT_KEY_OPTIONS[0],
    installDate: new Date().toISOString().slice(0, 10),
    unit: "°C",
    deviceCategory: "OTHER",
  });

  useEffect(() => {
    if (authLoading) return;

    const loadDevices = async () => {
      setLoading(true);

      if (!token) {
        setApiError("Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.");
        setLoading(false);
        return;
      }

      try {
        const [sensorList, monitorList] = await Promise.all([
          getSensors(token),
          getMonitorDevices(token),
        ]);

        const sensorDevices: Device[] = sensorList.map((item: ApiSensor) => ({
          id: `sensor-${item.deviceId}`,
          backendId: item.deviceId,
          roomId: item.roomId ?? undefined,
          connectKey: item.connectKey,
          installDate: item.installDate ?? undefined,
          name: item.name,
          type: "sensor",
          zone: item.roomId ? `Phòng ${item.roomId}` : "Phòng chưa gán",
          status: mapBackendStatus(item.status),
          lastSeen: formatLastSeen(item.lastUpdated ?? undefined),
          value: typeof item.temperature === "number" ? item.temperature.toFixed(1) : "--",
          unit: "°C",
        }));

        const monitorDevices: Device[] = monitorList.map((item: ApiMonitor) => ({
          id: `monitor-${item.deviceId}`,
          backendId: item.deviceId,
          roomId: item.roomId ?? undefined,
          connectKey: item.connectKey,
          installDate: item.installDate ?? undefined,
          name: item.name,
          type: "controller",
          zone: item.roomId ? `Phòng ${item.roomId}` : "Phòng chưa gán",
          status: mapBackendStatus(item.status),
          lastSeen: "Vừa xong",
          controllable: true,
          isOn: item.status?.toLowerCase() === "on" || item.status?.toLowerCase() === "online",
          deviceCategory: item.deviceCategory,
        }));

        const merged = [...sensorDevices, ...monitorDevices];
        setDevices(merged);
        setDeviceStates(
          Object.fromEntries(
            monitorDevices.map((d) => [d.id, d.isOn ?? false]),
          ),
        );
        setApiError(null);
      } catch {
        setApiError("Không kết nối được backend.");
      } finally {
        setLoading(false);
      }
    };

    loadDevices();
  }, [token, authLoading]);

  // Get unique zones from devices
  const zones = useMemo(() => {
    const zoneSet = new Set(devices.map(d => d.zone));
    return Array.from(zoneSet).sort();
  }, [devices]);

  const filteredDevices = useMemo(() => {
    if (zoneFilter === "all") return devices;
    return devices.filter(d => d.zone === zoneFilter);
  }, [devices, zoneFilter]);

  const sensorHistoryMap = useMemo<Record<string, Array<{ time: string; value: number }>>>(() => {
    const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return Object.fromEntries(
      devices
        .filter((d) => d.type === "sensor")
        .map((d) => {
          const value = Number.parseFloat(d.value ?? "");
          return [d.id, Number.isFinite(value) ? [{ time: now, value }] : []];
        }),
    );
  }, [devices]);

  const toggleDevice = async (id: string) => {
    const device = devices.find((d) => d.id === id);
    const nextState = !deviceStates[id];

    setDeviceStates(prev => ({ ...prev, [id]: nextState }));

    if (!device || device.type !== "controller" || !device.backendId) return;

    if (!token) {
      setDeviceStates(prev => ({ ...prev, [id]: !nextState }));
      setApiError("Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.");
      return;
    }

    try {
      await updateMonitorDevice(token, device.backendId, {
        mode: "MANUAL",
        status: nextState ? "ON" : "OFF",
        value: nextState ? 1 : 0,
      });
    } catch {
      setDeviceStates(prev => ({ ...prev, [id]: !nextState }));
      setApiError("Gửi lệnh điều khiển thất bại.");
    }
  };

  const statusIcon = (status: string) => {
    if (status === "online") return <div className="w-2 h-2 status-online" />;
    if (status === "warning") return <div className="w-2 h-2 status-warning" />;
    return <div className="w-2 h-2 status-offline" />;
  };

  const openAdd = () => {
    setEditingDevice(null);
    setForm({
      name: "",
      type: "sensor",
      roomId: "",
      connectKey: CONNECT_KEY_OPTIONS[0],
      installDate: new Date().toISOString().slice(0, 10),
      unit: "°C",
      deviceCategory: "OTHER",
    });
    setFormOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditingDevice(d);
    setForm({
      name: d.name,
      type: d.type,
      roomId: d.roomId?.toString() || "",
      connectKey: CONNECT_KEY_OPTIONS.includes((d.connectKey || "") as ConnectKey)
        ? (d.connectKey as ConnectKey)
        : CONNECT_KEY_OPTIONS[0],
      installDate: d.installDate || new Date().toISOString().slice(0, 10),
      unit: d.unit || "°C",
      deviceCategory: d.deviceCategory || "OTHER",
    });
    setFormOpen(true);
  };

  const saveDevice = async () => {
    const parsedRoomId = Number(form.roomId);
    if (!Number.isFinite(parsedRoomId) || parsedRoomId <= 0) {
      setApiError("Room ID phải là số dương.");
      return;
    }

    if (!CONNECT_KEY_OPTIONS.includes(form.connectKey as ConnectKey)) {
      setApiError("Connect key không hợp lệ.");
      return;
    }

    setIsSaving(true);
    if (editingDevice) {
      // Gọi API update
      if (token) {
        const backendId = editingDevice.backendId ?? Number(editingDevice.id.replace(/\D+/g, ""));
        if (form.type === "sensor") {
          await updateSensor(token, backendId, {
            name: form.name,
            roomId: parsedRoomId,
            connectKey: form.connectKey.trim(),
          }).catch(() => {});
        } else {
          await updateMonitorDevice(token, backendId, {
            name: form.name,
            roomId: parsedRoomId,
            connectKey: form.connectKey.trim(),
          }).catch(() => {});
        }
      }
      setDevices(prev => prev.map(d => d.id === editingDevice.id ? {
        ...d,
        name: form.name,
        type: form.type,
        roomId: parsedRoomId,
        connectKey: form.connectKey.trim(),
        installDate: form.installDate,
        zone: `Phòng ${parsedRoomId}`,
        unit: form.unit,
        controllable: form.type === "controller", value: form.type === "sensor" ? "0" : undefined,
      } : d));
      if (selected?.id === editingDevice.id) {
        setSelected(prev => prev ? {
          ...prev,
          name: form.name,
          type: form.type,
          roomId: parsedRoomId,
          connectKey: form.connectKey.trim(),
          installDate: form.installDate,
          zone: `Phòng ${parsedRoomId}`,
          unit: form.unit,
        } : null);
      }
    } else {
      // Gọi API create
      if (token) {
        if (form.type === "sensor") {
          await createSensor(token, {
            name: form.name,
            status: "offline",
            roomId: parsedRoomId,
            connectKey: form.connectKey.trim(),
          }).catch(() => {});
        } else {
          await createMonitorDevice(token, {
            name: form.name,
            status: "offline",
            roomId: parsedRoomId,
            connectKey: form.connectKey.trim(),
            deviceCategory: form.deviceCategory,
          }).catch(() => {});
        }
      }
      const newDevice: Device = {
        id: `dev-${Date.now()}`,
        name: form.name,
        type: form.type,
        zone: `Phòng ${parsedRoomId}`,
        status: "offline",
        lastSeen: "Chưa kết nối",
        value: form.type === "sensor" ? "0" : undefined,
        unit: form.type === "sensor" ? form.unit : undefined,
        controllable: form.type === "controller",
        isOn: false,
        deviceCategory: form.type === "controller" ? form.deviceCategory : undefined,
      };
      setDevices(prev => [...prev, newDevice]);
      if (form.type === "controller") {
        setDeviceStates(prev => ({ ...prev, [newDevice.id]: false }));
      }
    }

    setIsSaving(false);
    setFormOpen(false);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      // Gọi API delete
      if (token) {
        const dev = devices.find(d => d.id === deletingId);
        const numId = dev?.backendId ?? Number(deletingId.replace(/\D+/g, ""));
        if (dev?.type === "sensor") {
          await deleteSensor(token, numId).catch(() => {});
        } else {
          await deleteMonitorDevice(token, numId).catch(() => {});
        }
      }
      setDevices(prev => prev.filter(d => d.id !== deletingId));
      if (selected?.id === deletingId) setSelected(null);
      setDeletingId(null);
    }
    setDeleteOpen(false);
  };

  const openDelete = (id: string) => {
    setDeletingId(id);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quản lý thiết bị</h1>
          <p className="text-sm text-muted-foreground">Giám sát, điều khiển thiết bị theo từng khu vực</p>
          {loading && <p className="text-xs text-muted-foreground mt-1">Đang đồng bộ dữ liệu từ backend...</p>}
          {apiError && <p className="text-xs text-amber-400 mt-1">{apiError}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs"
            onClick={async () => {
              if (!token) return;
              const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/sensors/seed-all`, {
                method: "POST", headers: { Authorization: `Bearer ${token}` }
              });
              const d = await r.json();
              setApiError(null);
              alert(d.message ?? "Done");
              // Reload devices
              const [sl, ml] = await Promise.all([getSensors(token), getMonitorDevices(token)]);
              const sd = sl.map((item: ApiSensor) => ({
                id: `sensor-${item.deviceId}`, backendId: item.deviceId, roomId: item.roomId ?? undefined,
                connectKey: item.connectKey, installDate: item.installDate ?? undefined, name: item.name,
                type: "sensor" as const, zone: item.roomId ? `Phòng ${item.roomId}` : "Phòng chưa gán",
                status: mapBackendStatus(item.status), lastSeen: formatLastSeen(item.lastUpdated ?? undefined),
                value: typeof item.temperature === "number" ? item.temperature.toFixed(1) : "--", unit: "°C",
              }));
              const md = ml.map((item: ApiMonitor) => ({
                id: `monitor-${item.deviceId}`, backendId: item.deviceId, roomId: item.roomId ?? undefined,
                connectKey: item.connectKey, installDate: item.installDate ?? undefined, name: item.name,
                type: "controller" as const, zone: item.roomId ? `Phòng ${item.roomId}` : "Phòng chưa gán",
                status: mapBackendStatus(item.status), lastSeen: "Vừa xong", controllable: true,
                isOn: item.status?.toLowerCase() === "on" || item.status?.toLowerCase() === "online",
              }));
              setDevices([...sd, ...md]);
            }}>
            Seed cảm biến
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" /> Thêm thiết bị
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Device list grouped by zone */}
        <div className="xl:col-span-1 space-y-2">
          <div className="space-y-3">
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Lọc theo khu vực" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả ({devices.length})</SelectItem>
                {zones.map(zone => (
                  <SelectItem key={zone} value={zone}>
                    {zone} ({devices.filter(d => d.zone === zone).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {zoneFilter === "all" ? (
              zones.map(zone => {
                const zoneDevices = devices.filter(d => d.zone === zone);
                return (
                  <div key={zone}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <MapPin className="w-3 h-3 text-primary" />
                      <span className="text-xs font-medium text-primary">{zone}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">{zoneDevices.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {zoneDevices.map(device => (
                        <DeviceCard
                          key={device.id}
                          device={device}
                          isSelected={selected?.id === device.id}
                          onSelect={() => setSelected(device)}
                          onToggle={() => toggleDevice(device.id)}
                          deviceOn={deviceStates[device.id] ?? false}
                          onEdit={() => openEdit(device)}
                          onDelete={() => openDelete(device.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="space-y-1.5">
                {filteredDevices.map(device => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    isSelected={selected?.id === device.id}
                    onSelect={() => setSelected(device)}
                    onToggle={() => toggleDevice(device.id)}
                    deviceOn={deviceStates[device.id] ?? false}
                    onEdit={() => openEdit(device)}
                    onDelete={() => openDelete(device.id)}
                  />
                ))}
                {filteredDevices.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-4">Không có thiết bị trong khu vực này.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Device detail */}
        <div className="xl:col-span-2">
          {selected ? (
            <Card className="glass-card glow-primary border-border/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {detailView && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDetailView(false); setDetailTab("overview"); }}>
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    )}
                    <div className="p-3 rounded-xl bg-primary/10">
                      {selected.type === "sensor" ? (
                        <Thermometer className="w-6 h-6 text-primary" />
                      ) : (
                        <Power className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">{selected.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{selected.zone}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{selected.type === "sensor" ? "Cảm biến" : "Điều khiển"}</Badge>
                        {statusIcon(selected.status)}
                        <span className="text-[10px] text-muted-foreground">{selected.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!detailView && (
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setDetailView(true)}>
                        <BarChart3 className="w-3 h-3" /> Chi tiết
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openEdit(selected)}>
                      <Pencil className="w-3 h-3" /> Sửa
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1 text-destructive hover:text-destructive" onClick={() => openDelete(selected.id)}>
                      <Trash2 className="w-3 h-3" /> Xóa
                    </Button>
                    {selected.type === "controller" && selected.controllable && (
                      <Switch
                        checked={deviceStates[selected.id]}
                        onCheckedChange={() => toggleDevice(selected.id)}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Info cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-[10px] text-muted-foreground">ID thiết bị</p>
                    <p className="text-xs font-mono mt-1">{selected.id}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-[10px] text-muted-foreground">Lần cuối kết nối</p>
                    <p className="text-xs mt-1">{selected.lastSeen}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-[10px] text-muted-foreground">Loại</p>
                    <p className="text-xs mt-1">{selected.type === "sensor" ? "Cảm biến" : "Thiết bị điều khiển"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-[10px] text-muted-foreground">Khu vực</p>
                    <p className="text-xs mt-1">{selected.zone}</p>
                  </div>
                </div>

                {/* Detail view with tabs */}
                {detailView ? (
                  <Tabs value={detailTab} onValueChange={setDetailTab}>
                    <TabsList className="bg-secondary/50 w-full">
                      <TabsTrigger value="overview" className="text-xs flex-1">Tổng quan</TabsTrigger>
                      {selected.type === "sensor" && <TabsTrigger value="chart" className="text-xs flex-1">Biểu đồ</TabsTrigger>}
                      {selected.type === "sensor" && <TabsTrigger value="stats" className="text-xs flex-1">Thống kê</TabsTrigger>}
                      {selected.type === "controller" && <TabsTrigger value="control" className="text-xs flex-1">Điều khiển</TabsTrigger>}
                      <TabsTrigger value="logs" className="text-xs flex-1">Nhật ký</TabsTrigger>
                    </TabsList>

                    {/* Overview tab */}
                    <TabsContent value="overview" className="mt-3 space-y-3">
                      {selected.type === "sensor" && (() => {
                        const history = sensorHistoryMap[selected.id] || [];
                        const values = history.map(h => h.value);
                        const current = selected.value !== "--" ? parseFloat(selected.value || "0") : null;
                        const min = values.length ? Math.min(...values) : 0;
                        const max = values.length ? Math.max(...values) : 0;
                        const avg = values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0;
                        return (
                          <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                                <p className="text-[10px] text-muted-foreground mb-1">Hiện tại</p>
                                <p className="text-2xl font-bold text-primary font-mono">{current ?? "--"}</p>
                                <p className="text-[10px] text-muted-foreground">{selected.unit}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-secondary/40 text-center">
                                <p className="text-[10px] text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> Thấp nhất</p>
                                <p className="text-lg font-bold font-mono">{min.toFixed(1)}</p>
                                <p className="text-[10px] text-muted-foreground">{selected.unit}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-secondary/40 text-center">
                                <p className="text-[10px] text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" /> Cao nhất</p>
                                <p className="text-lg font-bold font-mono">{max.toFixed(1)}</p>
                                <p className="text-[10px] text-muted-foreground">{selected.unit}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-secondary/40 text-center">
                                <p className="text-[10px] text-muted-foreground mb-1">Trung bình</p>
                                <p className="text-lg font-bold font-mono">{avg}</p>
                                <p className="text-[10px] text-muted-foreground">{selected.unit}</p>
                              </div>
                            </div>
                            {/* Mini chart */}
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={history.slice(-24)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={selected.unit || "Giá trị"} />
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        );
                      })()}
                      {selected.type === "controller" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">Trạng thái</p>
                              <p className={`text-lg font-bold ${deviceStates[selected.id] ? "text-green-400" : "text-muted-foreground"}`}>
                                {deviceStates[selected.id] ? "Đang bật" : "Đã tắt"}
                              </p>
                            </div>
                            <div className="p-4 rounded-lg bg-secondary/40 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">Thời gian hoạt động</p>
                              <p className="text-lg font-bold font-mono">12h 35m</p>
                            </div>
                            <div className="p-4 rounded-lg bg-secondary/40 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">Số lần bật/tắt hôm nay</p>
                              <p className="text-lg font-bold font-mono">4</p>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg bg-secondary/20 border border-border/30">
                            <h4 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                              <Zap className="w-3 h-3 text-primary" /> Điều khiển nhanh
                            </h4>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Bật / Tắt thiết bị</span>
                              <Switch checked={deviceStates[selected.id]} onCheckedChange={() => toggleDevice(selected.id)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Chart tab (sensor only) */}
                    {selected.type === "sensor" && (
                      <TabsContent value="chart" className="mt-3 space-y-3">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" />
                          Dữ liệu cảm biến (24h gần nhất)
                        </h3>
                        <ResponsiveContainer width="100%" height={350}>
                          <LineChart data={sensorHistoryMap[selected.id] || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={selected.unit || "Giá trị"} />
                          </LineChart>
                        </ResponsiveContainer>
                      </TabsContent>
                    )}

                    {/* Stats tab (sensor only) */}
                    {selected.type === "sensor" && (
                      <TabsContent value="stats" className="mt-3 space-y-3">
                        {(() => {
                          const history = sensorHistoryMap[selected.id] || [];
                          const values = history.map(h => h.value);
                          const min = values.length ? Math.min(...values) : 0;
                          const max = values.length ? Math.max(...values) : 0;
                          const avg = values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0;
                          const warningCount = values.filter(v => v > max * 0.9 || v < min * 0.9).length;
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-lg bg-secondary/40">
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Giá trị thấp nhất</p>
                                  <p className="text-xl font-bold font-mono mt-1">{min.toFixed(1)} <span className="text-xs text-muted-foreground">{selected.unit}</span></p>
                                </div>
                                <div className="p-4 rounded-lg bg-secondary/40">
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Giá trị cao nhất</p>
                                  <p className="text-xl font-bold font-mono mt-1">{max.toFixed(1)} <span className="text-xs text-muted-foreground">{selected.unit}</span></p>
                                </div>
                                <div className="p-4 rounded-lg bg-secondary/40">
                                  <p className="text-[10px] text-muted-foreground">Giá trị trung bình</p>
                                  <p className="text-xl font-bold font-mono mt-1">{avg} <span className="text-xs text-muted-foreground">{selected.unit}</span></p>
                                </div>
                                <div className="p-4 rounded-lg bg-secondary/40">
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cảnh báo</p>
                                  <p className="text-xl font-bold font-mono mt-1">{warningCount} <span className="text-xs text-muted-foreground">lần</span></p>
                                </div>
                              </div>
                              <div className="p-4 rounded-lg bg-secondary/20 border border-border/30">
                                <h4 className="text-xs font-medium mb-2">Số điểm dữ liệu</h4>
                                <p className="text-sm text-muted-foreground">{values.length} mẫu trong 24 giờ qua (mỗi 30 phút / lần)</p>
                              </div>
                            </div>
                          );
                        })()}
                      </TabsContent>
                    )}

                    {/* Control tab (controller only) */}
                    {selected.type === "controller" && (
                      <TabsContent value="control" className="mt-3 space-y-3">
                        <div className="p-4 rounded-lg bg-secondary/20 border border-border/30 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Bật / Tắt thiết bị</p>
                              <p className="text-[10px] text-muted-foreground">Điều khiển trạng thái hoạt động</p>
                            </div>
                            <Switch checked={deviceStates[selected.id]} onCheckedChange={() => toggleDevice(selected.id)} />
                          </div>
                          <div className="border-t border-border/30 pt-3 grid grid-cols-2 gap-3">
                            <Button variant="outline" size="sm" className="text-xs gap-1.5">
                              <Power className="w-3 h-3" /> Khởi động lại
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs gap-1.5">
                              <Activity className="w-3 h-3" /> Kiểm tra trạng thái
                            </Button>
                          </div>
                        </div>
                      </TabsContent>
                    )}

                    {/* Logs tab */}
                    <TabsContent value="logs" className="mt-3">
                      <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                        <div className="p-3 rounded-lg bg-secondary/20 text-xs text-muted-foreground">
                          Chưa có dữ liệu nhật ký cho thiết bị này.
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  /* Quick preview when not in detail view */
                  <div className="space-y-3">
                    {selected.type === "sensor" && selected.value && (
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Giá trị hiện tại</p>
                          <p className="text-3xl font-bold text-primary font-mono">{selected.value}<span className="text-sm ml-1">{selected.unit}</span></p>
                        </div>
                      </div>
                    )}
                    {selected.type === "controller" && (
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground">Trạng thái</p>
                          <p className={`text-lg font-bold ${deviceStates[selected.id] ? "text-green-400" : "text-muted-foreground"}`}>
                            {deviceStates[selected.id] ? "Đang hoạt động" : "Đã tắt"}
                          </p>
                        </div>
                        <Switch checked={deviceStates[selected.id]} onCheckedChange={() => toggleDevice(selected.id)} />
                      </div>
                    )}
                    <p className="text-xs text-center text-muted-foreground">Bấm &quot;Chi tiết&quot; để xem đầy đủ số liệu, biểu đồ và nhật ký</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card border-border/30 flex items-center justify-center min-h-[400px]">
              <div className="text-center text-muted-foreground">
                <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chọn thiết bị để xem chi tiết</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>{editingDevice ? "Chỉnh sửa thiết bị" : "Thêm thiết bị mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tên thiết bị</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Cảm biến nhiệt độ A3" className="bg-secondary/30 border-border/30" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Connect key</Label>
                <Select value={form.connectKey} onValueChange={(v) => setForm(f => ({ ...f, connectKey: v as ConnectKey }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONNECT_KEY_OPTIONS.map((feedId) => (
                      <SelectItem key={feedId} value={feedId}>{feedId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Ngày lắp đặt</Label>
                <Input
                  type="date"
                  value={form.installDate}
                  onChange={e => setForm(f => ({ ...f, installDate: e.target.value }))}
                  className="bg-secondary/30 border-border/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Loại thiết bị</Label>
                <Select
                  value={form.type}
                  onValueChange={(v: DeviceType) => setForm(f => ({
                    ...f,
                    type: v,
                    connectKey: CONNECT_KEY_OPTIONS.includes(f.connectKey as ConnectKey)
                      ? f.connectKey
                      : CONNECT_KEY_OPTIONS[0],
                  }))}
                >
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sensor">Cảm biến</SelectItem>
                    <SelectItem value="controller">Điều khiển</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Room ID</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.roomId}
                  onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}
                  placeholder="VD: 1"
                  className="bg-secondary/30 border-border/30"
                />
              </div>
            </div>
            {form.type === "sensor" && (
              <div className="space-y-2">
                <Label className="text-xs">Đơn vị đo</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="°C">°C (Nhiệt độ)</SelectItem>
                    <SelectItem value="%">% (Độ ẩm)</SelectItem>
                    <SelectItem value="ppm">ppm (CO2)</SelectItem>
                    <SelectItem value="lux">lux (Ánh sáng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === "controller" && (
              <div className="space-y-2">
                <Label className="text-xs">Loại thiết bị điều khiển</Label>
                <Select value={form.deviceCategory} onValueChange={v => setForm(f => ({ ...f, deviceCategory: v }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="text-xs">Hủy</Button>
            <Button
              onClick={saveDevice}
              disabled={!form.name.trim() || !form.connectKey.trim() || !form.roomId.trim() || !form.installDate || isSaving}
              className="text-xs gap-1.5"
            >
              <Save className="w-3 h-3" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa thiết bị</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa thiết bị này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
