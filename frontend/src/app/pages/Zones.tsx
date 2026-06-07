"use client";

import { useState, useEffect, useCallback } from "react";
import { Thermometer, MapPin, ChevronRight, Plus, Pencil, Trash2, Save, Power, DoorOpen, LayoutGrid } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getZones, createZone, updateZone, deleteZone,
  getRooms, createRoom, updateRoom, deleteRoom,
  getSensors, getMonitorDevices,
} from "@/lib/zone-api";

interface AreaData { id: string; name: string; description: string; }
interface RoomData {
  id: string; areaId: string; name: string; foodType: string;
  temp: number; targetTemp: number; humidity: number;
  status: "online" | "warning" | "offline";
  devices: number; alerts: number; maxVolume: number; currentVolume: number;
}
interface DeviceInfo {
  id: string; name: string; type: "sensor" | "controller";
  status: "online" | "offline" | "warning"; value?: string; unit?: string;
}

const BRANCH_OPTIONS = ["Thuận An", "Long An", "Cát Lái"] as const;
const CUSTOM_BRANCH_VALUE = "__custom_branch__";
const ROOM_VOLUME_OPTIONS = [50, 70, 100] as const;
const CUSTOM_VOLUME_VALUE = "__custom_volume__";

type BranchValue = (typeof BRANCH_OPTIONS)[number] | typeof CUSTOM_BRANCH_VALUE;
type AreaFormState = {
  areaName: string;
  mainFood: string;
  branch: BranchValue;
  customBranch: string;
};

const lettersToIndex = (letters: string): number => {
  let idx = 0;
  for (const c of letters.toUpperCase()) {
    idx = idx * 26 + (c.charCodeAt(0) - 64);
  }
  return idx;
};

const indexToLetters = (index: number): string => {
  if (index <= 0) return "A";
  let n = index;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
};

const getNextAreaName = (list: AreaData[]): string => {
  const maxIndex = list.reduce((max, area) => {
    const match = area.name.match(/^\s*Khu\s+([A-Z]+)\b/i);
    if (!match) return max;
    return Math.max(max, lettersToIndex(match[1]));
  }, 0);
  return `Khu ${indexToLetters(maxIndex + 1)}`;
};

const splitAreaDisplayName = (value: string): { areaName: string; mainFood: string } => {
  const [left, ...rest] = value.split(" - ");
  const areaName = left?.trim() || value.trim();
  const mainFood = rest.join(" - ").trim();
  return { areaName, mainFood };
};

const getNextRoomName = (list: RoomData[], areaId: string): string => {
  const maxIndex = list.reduce((max, room) => {
    if (room.areaId !== areaId) return max;
    const match = room.name.match(/^\s*Phòng\s+(\d+)\b/i);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `Phòng ${maxIndex + 1}`;
};

/* ── Helpers ── */
const getStatusBadge = (status: string) => {
  if (status === "online")  return <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Hoạt động</Badge>;
  if (status === "warning") return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Cảnh báo</Badge>;
  return <Badge className="bg-muted text-muted-foreground text-[10px]">Trống</Badge>;
};
const statusDot = (s: string) => {
  if (s === "online")  return <div className="w-1.5 h-1.5 rounded-full bg-success" />;
  if (s === "warning") return <div className="w-1.5 h-1.5 rounded-full bg-warning" />;
  return <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />;
};

export default function Zones() {
  const router = useRouter();
  const { token } = useAuth();

  const [areas, setAreas] = useState<AreaData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [roomDevices, setRoomDevices] = useState<Record<string, DeviceInfo[]>>({});


  // Area form
  const [areaFormOpen, setAreaFormOpen]   = useState(false);
  const [editingArea, setEditingArea]     = useState<AreaData | null>(null);
  const [areaForm, setAreaForm]           = useState<AreaFormState>({ areaName: "", mainFood: "", branch: BRANCH_OPTIONS[0], customBranch: "" });
  const [areaDeleteOpen, setAreaDeleteOpen] = useState(false);
  const [deletingAreaId, setDeletingAreaId] = useState<string | null>(null);

  // Room form
  const [roomFormOpen, setRoomFormOpen]   = useState(false);
  const [editingRoom, setEditingRoom]     = useState<RoomData | null>(null);
  const [roomDeleteOpen, setRoomDeleteOpen] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState({
    name: "",
    foodType: "",
    maxVolume: String(ROOM_VOLUME_OPTIONS[0]),
    customMaxVolume: "",
    status: "online" as "online" | "offline",
  });

  const currentArea   = areas.find(a => a.id === selectedArea);
  const filteredRooms = rooms.filter(r => r.areaId === selectedArea);

  const deriveRoomStatus = (statuses: string[]): RoomData["status"] => {
    if (statuses.some((s) => s === "warning")) return "warning";
    if (statuses.some((s) => s === "offline")) return "offline";
    return "online";
  };

  const toDeviceStatus = (status: string): DeviceInfo["status"] => {
    const normalized = status.toLowerCase();
    if (normalized === "warning") return "warning";
    if (normalized === "on" || normalized === "online") return "online";
    return "offline";
  };

  const loadFromDb = useCallback(async () => {
    if (!token) {
      setAreas([]);
      setRooms([]);
      setSelectedArea("");
      setRoomDevices({});
      return;
    }

    try {
      const zones = await getZones(token);

      // Lấy alert count theo phòng từ API
      const alertCountByRoom: Record<number, number> = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/alerts/count-by-room`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.ok ? r.json() : {}).catch(() => ({}));

      const areaData: AreaData[] = zones.map((z) => ({
        id: `db-${z.areaId}`,
        name: z.areaName,
        description: z.location ?? "",
      }));

      const roomData: RoomData[] = [];
      const deviceData: Record<string, DeviceInfo[]> = {};

      await Promise.all(
        zones.map(async (zone) => {
          const zoneRooms = await getRooms(token, zone.areaId).catch(() => []);

          await Promise.all(
            zoneRooms.map(async (room) => {
              const roomKey = `db-room-${room.roomId}`;
              const [sensors, monitors] = await Promise.all([
                getSensors(token, room.roomId).catch(() => []),
                getMonitorDevices(token, room.roomId).catch(() => []),
              ]);

              const sensorDevices: DeviceInfo[] = sensors.map((s) => ({
                id: `sensor-${s.deviceId}`,
                name: s.name,
                type: "sensor",
                status: toDeviceStatus(s.status),
                value: typeof s.temperature === "number" ? s.temperature.toFixed(1) : undefined,
                unit: "°C",
              }));

              const monitorDevices: DeviceInfo[] = monitors.map((m) => ({
                id: `monitor-${m.deviceId}`,
                name: m.name,
                type: "controller",
                status: toDeviceStatus(m.status),
              }));

              const allDevices = [...sensorDevices, ...monitorDevices];
              deviceData[roomKey] = allDevices;

              const firstSensor = sensors.find((s) => typeof s.temperature === "number" || typeof s.humidity === "number");
              const statuses = allDevices.map((d) => d.status);
              roomData.push({
                id: roomKey,
                areaId: `db-${zone.areaId}`,
                name: room.name,
                foodType: "",
                temp: typeof firstSensor?.temperature === "number" ? firstSensor.temperature : 0,
                targetTemp: typeof firstSensor?.temperature === "number" ? firstSensor.temperature : 0,
                humidity: typeof firstSensor?.humidity === "number" ? firstSensor.humidity : 0,
                status: deriveRoomStatus(statuses),
                devices: allDevices.length,
                alerts: alertCountByRoom[room.roomId] ?? 0,
                maxVolume: room.maxVolume ?? 0,
                currentVolume: room.currentVolume ?? 0,
              });
            }),
          );
        }),
      );

      setAreas(areaData);
      setRooms(roomData);
      setRoomDevices(deviceData);
      setSelectedArea((prev) => {
        if (prev && areaData.some((a) => a.id === prev)) return prev;
        return areaData[0]?.id ?? "";
      });
    } catch {
      setAreas([]);
      setRooms([]);
      setSelectedArea("");
      setRoomDevices({});
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadFromDb();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadFromDb]);

  /* ── Area CRUD ── */
  const openAddArea = () => {
    setEditingArea(null);
    setAreaForm({
      areaName: getNextAreaName(areas),
      mainFood: "",
      branch: BRANCH_OPTIONS[0],
      customBranch: "",
    });
    setAreaFormOpen(true);
  };
  const openEditArea = () => {
    if (!currentArea) return;
    setEditingArea(currentArea);
    const { areaName, mainFood } = splitAreaDisplayName(currentArea.name);
    const currentBranch = currentArea.description?.trim() || "";
    const isPredefinedBranch = BRANCH_OPTIONS.some((b) => b === currentBranch);
    setAreaForm({
      areaName,
      mainFood,
      branch: isPredefinedBranch ? (currentBranch as BranchValue) : CUSTOM_BRANCH_VALUE,
      customBranch: isPredefinedBranch ? "" : currentBranch,
    });
    setAreaFormOpen(true);
  };
  const saveArea = async () => {
    if (!token) return;

    const branch = areaForm.branch === CUSTOM_BRANCH_VALUE ? areaForm.customBranch.trim() : areaForm.branch;
    const displayName = `${areaForm.areaName.trim()} - ${areaForm.mainFood.trim()}`;

    if (editingArea && editingArea.id.startsWith("db-")) {
      const dbId = parseInt(editingArea.id.replace("db-", ""), 10);
      await updateZone(token, dbId, { areaName: displayName, location: branch }).catch(() => {});
    } else {
      await createZone(token, { areaName: displayName, location: branch }).catch(() => {});
    }

    await loadFromDb();
    setAreaFormOpen(false);
  };
  const openDeleteArea = () => { setDeletingAreaId(selectedArea); setAreaDeleteOpen(true); };
  const confirmDeleteArea = async () => {
    if (!deletingAreaId || !token) return;

    if (deletingAreaId.startsWith("db-")) {
      await deleteZone(token, parseInt(deletingAreaId.replace("db-", ""), 10)).catch(() => {});
      await loadFromDb();
    }

    setAreaDeleteOpen(false);
    setDeletingAreaId(null);
  };

  /* ── Room CRUD ── */
  const openAddRoom = () => {
    setEditingRoom(null);
    setRoomForm({
      name: getNextRoomName(rooms, selectedArea),
      foodType: "",
      maxVolume: String(ROOM_VOLUME_OPTIONS[0]),
      customMaxVolume: "",
      status: "online",
    });
    setRoomFormOpen(true);
  };
  const openEditRoom = (r: RoomData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRoom(r);
    const isPresetVolume = ROOM_VOLUME_OPTIONS.some((v) => v === r.maxVolume);
    setRoomForm({
      name: r.name,
      foodType: r.foodType,
      maxVolume: isPresetVolume ? String(r.maxVolume) : CUSTOM_VOLUME_VALUE,
      customMaxVolume: isPresetVolume ? "" : String(r.maxVolume),
      status: r.status === "offline" ? "offline" : "online",
    });
    setRoomFormOpen(true);
  };
  const saveRoom = async () => {
    if (!token) return;

    const parsedMaxVolume = roomForm.maxVolume === CUSTOM_VOLUME_VALUE
      ? Number(roomForm.customMaxVolume)
      : Number(roomForm.maxVolume);
    const maxVolume = Number.isFinite(parsedMaxVolume) ? parsedMaxVolume : 0;
    let savedRoomId = "";

    if (editingRoom && editingRoom.id.startsWith("db-room-")) {
      savedRoomId = editingRoom.id;
      await updateRoom(token, parseInt(editingRoom.id.replace("db-room-", ""), 10), { name: roomForm.name.trim(), maxVolume }).catch(() => {});
    } else {
      const areaId = selectedArea.startsWith("db-") ? parseInt(selectedArea.replace("db-", ""), 10) : undefined;
      const created = await createRoom(token, { name: roomForm.name.trim(), maxVolume, currentVolume: 0, areaId }).catch(() => null);
      if (created) {
        savedRoomId = `db-room-${created.roomId}`;
      }
    }

    await loadFromDb();
    if (savedRoomId) {
      setRooms((prev) => prev.map((room) => (
        room.id === savedRoomId
          ? { ...room, foodType: roomForm.foodType.trim(), status: roomForm.status }
          : room
      )));
    }
    setRoomFormOpen(false);
  };
  const openDeleteRoom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); setDeletingRoomId(id); setRoomDeleteOpen(true);
  };
  const confirmDeleteRoom = async () => {
    if (!deletingRoomId || !token) return;
    if (deletingRoomId.startsWith("db-room-")) {
      await deleteRoom(token, parseInt(deletingRoomId.replace("db-room-", ""), 10)).catch(() => {});
      await loadFromDb();
    }
    setRoomDeleteOpen(false);
    setDeletingRoomId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Khu vực & Phòng bảo quản</h1>
          <p className="text-sm text-muted-foreground">Quản lý khu vực bảo quản và các phòng — bấm vào phòng để xem chi tiết</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openAddRoom}>
          <Plus className="w-3.5 h-3.5" /> Thêm phòng
        </Button>
      </div>

      {/* Area selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Khu vực:</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-full sm:w-[320px] bg-secondary/30 border-border/30">
              <SelectValue placeholder="Chọn khu vực..." />
            </SelectTrigger>
            <SelectContent>
              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={openAddArea} title="Thêm khu vực">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          {currentArea && (<>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={openEditArea}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={openDeleteArea}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>)}
        </div>
      </div>

      {/* Area info bar */}
      {currentArea && (
        <Card className="glass-card border-border/30">
          <CardContent className="p-4 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{currentArea.description}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-mono text-primary font-medium">{filteredRooms.length} phòng</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-accent font-medium">{filteredRooms.reduce((s, r) => s + r.devices, 0)} thiết bị</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-warning font-medium">{filteredRooms.reduce((s, r) => s + r.alerts, 0)} cảnh báo</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredRooms.map(room => {
          const devs = roomDevices[room.id] || [];
          const online = devs.filter(d => d.status === "online");
          const volumePercent = room.maxVolume > 0 ? Math.min(100, (room.currentVolume / room.maxVolume) * 100) : 0;
          return (
            <Card key={room.id}
              className="glass-card border-border/30 cursor-pointer transition-all hover:border-primary/40 hover:glow-primary group"
              onClick={() => router.push(`/zones/${room.id.replace("db-room-", "")}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <DoorOpen className="w-4 h-4 text-primary" />
                      <h3 className="text-base font-semibold group-hover:text-primary transition-colors">{room.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{room.foodType}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => openEditRoom(room, e)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      onClick={e => openDeleteRoom(room.id, e)}><Trash2 className="w-3 h-3" /></Button>
                    {getStatusBadge(room.status)}
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                    <p className="text-lg font-bold font-mono text-accent">{room.temp}°C</p>
                    <p className="text-[10px] text-muted-foreground">Nhiệt độ</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                    <p className="text-lg font-bold font-mono text-primary">{room.humidity}%</p>
                    <p className="text-[10px] text-muted-foreground">Độ ẩm</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                    <p className="text-lg font-bold font-mono text-warning">{room.alerts}</p>
                    <p className="text-[10px] text-muted-foreground">Cảnh báo</p>
                  </div>
                </div>

                {devs.length > 0 && (
                  <div className="mb-3 p-2.5 rounded-lg bg-secondary/20 border border-border/20">
                    <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                      Thiết bị ({online.length}/{devs.length} hoạt động)
                    </p>
                    <div className="space-y-1.5">
                      {devs.map(dev => (
                        <div key={dev.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {statusDot(dev.status)}
                            {dev.type === "sensor"
                              ? <Thermometer className="w-3 h-3 text-muted-foreground shrink-0" />
                              : <Power className="w-3 h-3 text-muted-foreground shrink-0" />}
                            <span className="truncate">{dev.name}</span>
                          </div>
                          {dev.type === "sensor" && dev.value && (
                            <span className="font-mono text-primary font-medium shrink-0 ml-2">{dev.value}{dev.unit}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-muted-foreground">
                      Sức chứa: {room.currentVolume.toFixed(1)} / {room.maxVolume.toFixed(1)} m3
                    </span>
                    <span className="text-[10px] text-muted-foreground">{room.devices} thiết bị</span>
                  </div>
                  <Progress value={volumePercent} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredRooms.length === 0 && (
          <div className="lg:col-span-2 text-center py-12 text-muted-foreground">
            <p className="text-sm">Chưa có phòng bảo quản nào trong khu vực này.</p>
            <Button size="sm" variant="outline" className="mt-3 text-xs gap-1.5" onClick={openAddRoom}>
              <Plus className="w-3 h-3" /> Thêm phòng đầu tiên
            </Button>
          </div>
        )}
      </div>

      {/* Area Add/Edit Dialog */}
      <Dialog open={areaFormOpen} onOpenChange={setAreaFormOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader><DialogTitle>{editingArea ? "Chỉnh sửa khu vực" : "Thêm khu vực mới"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tên khu vực (tự động)</Label>
              <Input
                value={areaForm.areaName}
                readOnly
                className="bg-secondary/30 border-border/30 text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Thực phẩm chính</Label>
              <Input
                value={areaForm.mainFood}
                onChange={e => setAreaForm(f => ({ ...f, mainFood: e.target.value }))}
                placeholder="VD: Chân gà"
                className="bg-secondary/30 border-border/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Vị trí</Label>
              <Select value={areaForm.branch} onValueChange={(v) => setAreaForm(f => ({ ...f, branch: v as BranchValue }))}>
                <SelectTrigger className="bg-secondary/30 border-border/30">
                  <SelectValue placeholder="Chọn chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_OPTIONS.map((branch) => (
                    <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_BRANCH_VALUE}>Thêm mới...</SelectItem>
                </SelectContent>
              </Select>
              {areaForm.branch === CUSTOM_BRANCH_VALUE && (
                <Input
                  value={areaForm.customBranch}
                  onChange={e => setAreaForm(f => ({ ...f, customBranch: e.target.value }))}
                  placeholder="Nhập tên chi nhánh"
                  className="bg-secondary/30 border-border/30"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaFormOpen(false)} className="text-xs">Hủy</Button>
            <Button
              onClick={saveArea}
              disabled={!areaForm.mainFood.trim() || (areaForm.branch === CUSTOM_BRANCH_VALUE && !areaForm.customBranch.trim())}
              className="text-xs gap-1.5"
            >
              <Save className="w-3 h-3" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Area Delete */}
      <AlertDialog open={areaDeleteOpen} onOpenChange={setAreaDeleteOpen}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa khu vực</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc muốn xóa khu vực này? Tất cả phòng bảo quản và dữ liệu liên quan sẽ bị xóa.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteArea} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Room Add/Edit Dialog */}
      <Dialog open={roomFormOpen} onOpenChange={setRoomFormOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader><DialogTitle>{editingRoom ? "Chỉnh sửa phòng bảo quản" : "Thêm phòng bảo quản mới"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Số phòng (tự động)</Label>
              <Input
                value={roomForm.name}
                readOnly
                className="bg-secondary/30 border-border/30 text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Thực phẩm chính (optional)</Label>
              <Input value={roomForm.foodType} onChange={e => setRoomForm(f => ({ ...f, foodType: e.target.value }))}
                placeholder="VD: Hải sản" className="bg-secondary/30 border-border/30" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Sức chứa tối đa (m3)</Label>
                <Select value={roomForm.maxVolume} onValueChange={(v) => setRoomForm(f => ({ ...f, maxVolume: v }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOM_VOLUME_OPTIONS.map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_VOLUME_VALUE}>Khác</SelectItem>
                  </SelectContent>
                </Select>
                {roomForm.maxVolume === CUSTOM_VOLUME_VALUE && (
                  <Input
                    type="number"
                    min={1}
                    value={roomForm.customMaxVolume}
                    onChange={e => setRoomForm(f => ({ ...f, customMaxVolume: e.target.value }))}
                    placeholder="Nhập thể tích tối đa"
                    className="bg-secondary/30 border-border/30"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Trạng thái</Label>
                <Select value={roomForm.status} onValueChange={(v: "online" | "offline") => setRoomForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-secondary/30 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Hoạt động</SelectItem>
                    <SelectItem value="offline">Trống</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomFormOpen(false)} className="text-xs">Hủy</Button>
            <Button
              onClick={saveRoom}
              disabled={roomForm.maxVolume === CUSTOM_VOLUME_VALUE && !roomForm.customMaxVolume.trim()}
              className="text-xs gap-1.5"
            >
              <Save className="w-3 h-3" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room Delete */}
      <AlertDialog open={roomDeleteOpen} onOpenChange={setRoomDeleteOpen}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa phòng bảo quản</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc muốn xóa phòng bảo quản này? Tất cả lịch trình và thực phẩm trong phòng sẽ bị xóa.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRoom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
