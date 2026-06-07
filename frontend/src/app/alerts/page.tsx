"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, RefreshCw, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAlerts } from "@/hooks/use-alerts";
import { getAlertActionPath, resolveAlert, resolveAllAlerts } from "@/lib/alerts";

const TYPE_LABEL: Record<string, string> = {
  TEMP_HIGH: "Nhiệt độ cao",
  HUMI_HIGH: "Độ ẩm cao",
  TEMP_LOW:  "Nhiệt độ thấp",
  HUMI_LOW:  "Độ ẩm thấp",
};

export default function AlertsPage() {
  const router = useRouter();
  const { alerts, activeCount, loading, reload } = useAlerts();
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ALL");
  const [resolving, setResolving] = useState(false);

  const filtered = alerts.filter(a => filter === "ALL" || a.status === filter);

  async function handleResolve(id: number) {
    await resolveAlert(id);
    reload();
  }

  async function handleResolveAll() {
    setResolving(true);
    await resolveAllAlerts();
    await reload();
    setResolving(false);
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <div>
            <h1 className="text-2xl font-bold">Cảnh báo</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount > 0
                ? <span className="text-destructive font-medium">{activeCount} cảnh báo chưa xử lý</span>
                : "Không có cảnh báo mới"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          {activeCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleResolveAll} disabled={resolving} className="gap-1.5 text-success border-success/30 hover:bg-success/10">
              <CheckCheck className="w-3.5 h-3.5" />
              Xử lý tất cả
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-lg overflow-hidden border border-border/50 w-fit text-xs">
        {(["ALL", "ACTIVE", "RESOLVED"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 font-medium transition-colors
              ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"}`}>
            {f === "ALL" ? "Tất cả" : f === "ACTIVE" ? "Chưa xử lý" : "Đã xử lý"}
            {f === "ACTIVE" && activeCount > 0 && (
              <span className="ml-1.5 bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                {activeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-success/50" />
          <p className="text-sm">Không có cảnh báo nào</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => (
            <Card key={alert.alertId}
              className={`border-l-4 ${alert.status === "ACTIVE" ? "border-l-destructive" : "border-l-success/50"} glass-card`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
                  ${alert.status === "ACTIVE" ? "bg-destructive/10" : "bg-success/10"}`}>
                  <AlertTriangle className={`w-4 h-4 ${alert.status === "ACTIVE" ? "text-destructive" : "text-success"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => router.push(getAlertActionPath(alert))}
                    className="text-sm font-medium text-left hover:underline underline-offset-2"
                  >
                    {alert.message}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{formatTime(alert.time)}</span>
                    {alert.type && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {TYPE_LABEL[alert.type] ?? alert.type}
                      </Badge>
                    )}
                    {alert.roomId && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Phòng {alert.roomId}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={alert.status === "ACTIVE" ? "destructive" : "secondary"} className="text-[10px]">
                    {alert.status === "ACTIVE" ? "Chưa xử lý" : "Đã xử lý"}
                  </Badge>
                  {alert.status === "ACTIVE" && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                      onClick={() => handleResolve(alert.alertId)}>
                      <CheckCircle className="w-3 h-3" /> Xử lý
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
