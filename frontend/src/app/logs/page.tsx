"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchLogs, LogEntry } from "@/lib/activity-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

const ACTION_LABEL: Record<string, string> = {
  LOGIN:          "Đăng nhập",
  LOGOUT:         "Đăng xuất",
  CONTROL:        "Điều khiển",
  SET_THRESHOLD:  "Đặt ngưỡng",
  CREATE_USER:    "Tạo tài khoản",
  UPDATE_USER:    "Cập nhật tài khoản",
  DELETE_USER:    "Xóa tài khoản",
  CREATE_ZONE:    "Tạo khu vực",
  UPDATE_ZONE:    "Cập nhật khu vực",
  DELETE_ZONE:    "Xóa khu vực",
  CREATE_ROOM:    "Tạo phòng",
  UPDATE_ROOM:    "Cập nhật phòng",
  DELETE_ROOM:    "Xóa phòng",
  CREATE_SENSOR:  "Thêm cảm biến",
  UPDATE_SENSOR:  "Cập nhật cảm biến",
  DELETE_SENSOR:  "Xóa cảm biến",
  CREATE_DEVICE:  "Thêm thiết bị",
  UPDATE_DEVICE:  "Cập nhật thiết bị",
  DELETE_DEVICE:  "Xóa thiết bị",
  UPDATE_ROLE_PERMISSION: "Cập nhật phân quyền",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOGIN:          "default",
  LOGOUT:         "outline",
  CONTROL:        "secondary",
  SET_THRESHOLD:  "secondary",
  CREATE_USER:    "default",
  UPDATE_USER:    "outline",
  DELETE_USER:    "destructive",
  CREATE_ZONE:    "default",
  UPDATE_ZONE:    "outline",
  DELETE_ZONE:    "destructive",
  CREATE_ROOM:    "default",
  UPDATE_ROOM:    "outline",
  DELETE_ROOM:    "destructive",
  CREATE_SENSOR:  "default",
  UPDATE_SENSOR:  "outline",
  DELETE_SENSOR:  "destructive",
  CREATE_DEVICE:  "default",
  UPDATE_DEVICE:  "outline",
  DELETE_DEVICE:  "destructive",
  UPDATE_ROLE_PERMISSION: "secondary",
};

const ACTION_GROUPS: Array<{ key: string; label: string; actions: string[] }> = [
  { key: "AUTH", label: "Xác thực", actions: ["LOGIN", "LOGOUT"] },
  { key: "OPS", label: "Vận hành", actions: ["CONTROL", "SET_THRESHOLD"] },
  { key: "USER", label: "Người dùng", actions: ["CREATE_USER", "UPDATE_USER", "DELETE_USER"] },
  { key: "ZONE_ROOM", label: "Khu vực/Phòng", actions: ["CREATE_ZONE", "UPDATE_ZONE", "DELETE_ZONE", "CREATE_ROOM", "UPDATE_ROOM", "DELETE_ROOM"] },
  { key: "DEVICE", label: "Thiết bị", actions: ["CREATE_SENSOR", "UPDATE_SENSOR", "DELETE_SENSOR", "CREATE_DEVICE", "UPDATE_DEVICE", "DELETE_DEVICE"] },
  { key: "PERMISSION", label: "Phân quyền", actions: ["UPDATE_ROLE_PERMISSION"] },
];

const ROLE_COLOR: Record<string, string> = {
  ADMIN:       "text-red-400",
  STAFF:       "text-blue-400",
  MAINTENANCE: "text-yellow-400",
};

const PAGE_SIZE = 20;

export default function LogsPage() {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterActionGroup, setFilterActionGroup] = useState("ALL");
  const [filterUser, setFilterUser] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const visibleActionGroups = ACTION_GROUPS.filter(
    (group) => group.key !== "PERMISSION" || user?.role === "ADMIN"
  );

  const load = useCallback(async (p = 0) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchLogs(token, {
        page: p,
        size: PAGE_SIZE,
        typeActions: filterActionGroup !== "ALL"
          ? (ACTION_GROUPS.find((g) => g.key === filterActionGroup)?.actions ?? [])
          : undefined,
        userId: filterUser || undefined,
      });
      setLogs(res.content);
      setTotal(res.totalElements);
      setTotalPages(res.totalPages);
      setPage(p);
    } catch (e) {
      setError(getErrorMessage(e, "Không thể tải lịch sử hoạt động"));
    } finally {
      setLoading(false);
    }
  }, [token, filterActionGroup, filterUser]);

  useEffect(() => { load(0); }, [load]);
  useEffect(() => {
    const intervalId = setInterval(() => load(page), 60000);
    return () => clearInterval(intervalId);
  }, [load, page]);

  useEffect(() => {
    if (user?.role !== "ADMIN" && filterActionGroup === "PERMISSION") {
      setFilterActionGroup("ALL");
    }
  }, [user, filterActionGroup]);

  function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
  }

  const filtered = searchInput
    ? logs.filter(l =>
        l.description?.toLowerCase().includes(searchInput.toLowerCase()) ||
        l.username?.toLowerCase().includes(searchInput.toLowerCase()) ||
        l.fullName?.toLowerCase().includes(searchInput.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Lịch sử hoạt động</h1>
            <p className="text-xs text-muted-foreground">{total} bản ghi</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Tìm theo mô tả, tên người dùng..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="max-w-xs text-sm"
        />
        <Select value={filterActionGroup} onValueChange={v => { setFilterActionGroup(v); }}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Nhóm hành động" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {visibleActionGroups.map((group) => (
              <SelectItem key={group.key} value={group.key}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-40">Thời gian</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-36">Người dùng</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-32">Vai trò</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-36">Hành động</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mô tả</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-muted-foreground">Đang tải...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-muted-foreground">Không có dữ liệu</td>
              </tr>
            ) : (
              filtered.map((log, i) => (
                <tr key={log.logId} className={`border-t border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-xs">{log.fullName?.trim() || log.username}</div>
                    <div className="text-[10px] text-muted-foreground">@{log.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${ROLE_COLOR[log.role ?? ""] ?? "text-muted-foreground"}`}>
                      {log.role === "ADMIN" ? "Quản trị" : log.role === "STAFF" ? "Nhân viên" : log.role === "MAINTENANCE" ? "Bảo trì" : log.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_VARIANT[log.typeAction] ?? "outline"} className="text-xs">
                      {ACTION_LABEL[log.typeAction] ?? log.typeAction}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{log.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Trang {page + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={page >= totalPages - 1 || loading}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
