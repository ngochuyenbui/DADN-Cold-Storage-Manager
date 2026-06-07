"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface DeviceLogEntry {
  logId: number;
  deviceId: number | null;
  deviceName: string;
  typeAction: string;
  description: string;
  timestamp: string;
}

interface LogPage {
  content: DeviceLogEntry[];
  totalElements: number;
  totalPages: number;
  page: number;
}

const ACTION_LABEL: Record<string, string> = {
  SENSOR_TEMP: "Đo nhiệt độ",
  SENSOR_HUMI: "Đo độ ẩm",
  COMMAND:     "Lệnh điều khiển",
  ALERT:       "Cảnh báo",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SENSOR_TEMP: "secondary",
  SENSOR_HUMI: "secondary",
  COMMAND:     "default",
  ALERT:       "destructive",
};

const PAGE_SIZE = 30;

export default function DeviceLogsPage() {
  const { token } = useAuth();
  const [data, setData]         = useState<LogPage | null>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(0);
  const [filterType, setFilterType] = useState("ALL");
  const [search, setSearch]     = useState("");

  const load = useCallback(async (p = 0) => {
    if (!token) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), size: String(PAGE_SIZE) });
      if (filterType !== "ALL") q.set("typeAction", filterType);
      const res = await fetch(`${BASE}/api/device-logs?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setData(await res.json()); setPage(p); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, filterType]);

  useEffect(() => { load(0); }, [load]);
  useEffect(() => {
    const intervalId = setInterval(() => load(page), 60000);
    return () => clearInterval(intervalId);
  }, [load, page]);

  function formatTime(ts: string) {
    return new Date(ts).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
  }

  const filtered = search
    ? (data?.content ?? []).filter(l =>
        l.deviceName?.toLowerCase().includes(search.toLowerCase()) ||
        l.description?.toLowerCase().includes(search.toLowerCase()))
    : (data?.content ?? []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Lịch sử thiết bị</h1>
            <p className="text-xs text-muted-foreground">{data?.totalElements ?? 0} bản ghi</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Tìm theo tên thiết bị, mô tả..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="max-w-xs text-sm" />
        <Select value={filterType} onValueChange={v => setFilterType(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Loại hành động" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            <SelectItem value="SENSOR_TEMP">Đo nhiệt độ</SelectItem>
            <SelectItem value="SENSOR_HUMI">Đo độ ẩm</SelectItem>
            <SelectItem value="COMMAND">Lệnh điều khiển</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-40">Thời gian</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">Thiết bị</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-36">Loại</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mô tả</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Không có dữ liệu</td></tr>
            ) : filtered.map((log, i) => (
              <tr key={log.logId} className={`border-t border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium truncate">{log.deviceName}</span>
                  </div>
                  {log.deviceId && (
                    <p className="text-[10px] text-muted-foreground ml-5">ID: {log.deviceId}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={ACTION_VARIANT[log.typeAction] ?? "outline"} className="text-xs">
                    {ACTION_LABEL[log.typeAction] ?? log.typeAction}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{log.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Trang {page + 1} / {data?.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={page >= (data?.totalPages ?? 1) - 1 || loading}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
