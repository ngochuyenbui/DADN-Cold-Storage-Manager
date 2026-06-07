"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ClipboardList, Plus, Send, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { getRooms, getZones, type Zone, type Room } from "@/lib/zone-api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const CATEGORIES = [
  { value: "SENSOR",      label: "Cảm biến" },
  { value: "FAN",         label: "Quạt" },
  { value: "TEMPERATURE", label: "Nhiệt độ" },
  { value: "HUMIDITY",    label: "Độ ẩm" },
  { value: "DOOR",        label: "Cửa" },
  { value: "CAMERA",      label: "Camera" },
  { value: "OTHER",       label: "Khác" },
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Chờ xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã xử lý",
};

interface IssueReport {
  reportId: number; title: string; description: string;
  category: string; roomId: number | null; roomName: string;
  status: string; createdAt: string; resolvedAt: string | null;
  reportedBy: string; note: string | null;
}

export default function IssueReportPage() {
  const { token, user } = useAuth();
  const [reports, setReports]   = useState<IssueReport[]>([]);
  const [zones, setZones]       = useState<Zone[]>([]);
  const [rooms, setRooms]       = useState<Room[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const [form, setForm] = useState({
    title: "", description: "", category: "OTHER",
    zoneId: "" as string | number,
    roomId: "" as string | number,
  });

  const isMaintOrAdmin = user?.role === "ADMIN" || user?.role === "MAINTENANCE";

  useEffect(() => {
    if (!token) return;
    getZones(token).then(setZones).catch(() => {});
    load();
  }, [token]);

  useEffect(() => {
    if (!token || form.zoneId === "") { setRooms([]); return; }
    getRooms(token, Number(form.zoneId)).then(setRooms).catch(() => {});
  }, [token, form.zoneId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/issue-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setReports(await r.json());
    } finally { setLoading(false); }
  }

  async function submit() {
    if (!token) return;
    if (!form.title.trim() || !form.description.trim()) {
      setError("Vui lòng điền tiêu đề và mô tả."); return;
    }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
      };
      if (form.roomId !== "") body.roomId = Number(form.roomId);

      const r = await fetch(`${BASE}/api/issue-reports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Gửi báo cáo thất bại");
      setSuccess("Báo cáo đã được gửi. Bộ phận bảo trì sẽ xử lý sớm.");
      setForm({ title: "", description: "", category: "OTHER", zoneId: "", roomId: "" });
      setShowForm(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally { setSubmitting(false); }
  }

  async function updateStatus(id: number, status: string, note?: string) {
    if (!token) return;
    await fetch(`${BASE}/api/issue-reports/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    load();
  }

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const statusVariant = (s: string) =>
    s === "RESOLVED" ? "default" : s === "IN_PROGRESS" ? "secondary" : "destructive";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Báo cáo lỗi</h1>
            <p className="text-xs text-muted-foreground">Gửi báo cáo sự cố — bộ phận bảo trì sẽ nhận được ngay qua email</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Làm mới
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Gửi báo cáo
          </Button>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {/* Form gửi báo cáo */}
      {showForm && (
        <Card className="glass-card border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Gửi báo cáo lỗi mới
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tiêu đề *</Label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="VD: Quạt phòng 1 không hoạt động"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Danh mục</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Khu vực</Label>
                <select value={form.zoneId}
                  onChange={e => setForm(f => ({ ...f, zoneId: e.target.value, roomId: "" }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground">
                  <option value="">Chọn khu</option>
                  {zones.map(z => <option key={z.areaId} value={z.areaId}>{z.areaName}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phòng</Label>
                <select value={form.roomId} onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}
                  disabled={form.zoneId === ""}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground disabled:opacity-50">
                  <option value="">Chọn phòng</option>
                  {rooms.map(r => <option key={r.roomId} value={r.roomId}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mô tả chi tiết *</Label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả sự cố, thời điểm xảy ra, ảnh hưởng..."
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground resize-none" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Hủy</Button>
              <Button size="sm" onClick={submit} disabled={submitting} className="gap-1.5">
                <Send className="w-3.5 h-3.5" /> {submitting ? "Đang gửi..." : "Gửi báo cáo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danh sách báo cáo */}
      <div className="space-y-2">
        {reports.length === 0 && !loading && (
          <Card className="glass-card border-border/30">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              Chưa có báo cáo lỗi nào.
            </CardContent>
          </Card>
        )}
        {reports.map(r => (
          <Card key={r.reportId} className="glass-card border-border/30">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleExpand(r.reportId)}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {expanded.has(r.reportId) ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.createdAt} · {r.reportedBy} · {r.roomName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {CATEGORIES.find(c => c.value === r.category)?.label ?? r.category}
                  </span>
                  <Badge variant={statusVariant(r.status)} className="text-[10px]">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            {expanded.has(r.reportId) && (
              <CardContent className="space-y-3 pt-0">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
                {r.note && (
                  <div className="rounded-lg bg-secondary/20 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Ghi chú xử lý: </span>{r.note}
                  </div>
                )}
                {r.resolvedAt && (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Đã xử lý lúc {r.resolvedAt}
                  </p>
                )}

                {/* Nút xử lý cho MAINTENANCE/ADMIN */}
                {isMaintOrAdmin && r.status !== "RESOLVED" && (
                  <div className="flex gap-2 pt-1">
                    {r.status === "OPEN" && (
                      <Button size="sm" variant="outline" className="text-xs gap-1"
                        onClick={() => updateStatus(r.reportId, "IN_PROGRESS")}>
                        <Clock className="w-3 h-3" /> Nhận xử lý
                      </Button>
                    )}
                    <Button size="sm" className="text-xs gap-1"
                      onClick={() => updateStatus(r.reportId, "RESOLVED", "Đã kiểm tra và khắc phục")}>
                      <CheckCircle2 className="w-3 h-3" /> Đánh dấu đã xử lý
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
