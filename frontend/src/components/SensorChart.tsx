"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { getSensorHistory, type HistoryPoint } from "@/lib/api";

interface Props {
  feed: "temp" | "humi" | "light" | "motion";
  label: string;
  unit: string;
  color: string;
  threshold?: number;
  roomId?: number;
  latestPoint?: { value: number; timestamp: string };
}

type Range = 1 | 6 | 24;

export function SensorChart({ feed, label, unit, color, threshold, roomId, latestPoint }: Props) {
  const [data, setData] = useState<{ time: string; value: number }[]>([]);
  const [range, setRange] = useState<Range>(24);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const history = await getSensorHistory(feed, range, roomId);
      setData(history.map((h: HistoryPoint) => ({
        time: new Date(h.recordedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        }),
        value: h.value,
      })));
    } catch {
      // backend chưa sẵn sàng, giữ data cũ
    } finally {
      setLoading(false);
    }
  }, [feed, range, roomId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh mỗi 10 giây để cập nhật realtime
  useEffect(() => {
    const timer = setInterval(() => { load(); }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  // Append realtime point khi WebSocket hoặc poll push về
  useEffect(() => {
    if (!latestPoint) return;
    setData(prev => {
      const last = prev[prev.length - 1];
      const newTime = new Date(latestPoint.timestamp).toLocaleTimeString("vi-VN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      if (last && last.time === newTime && last.value === latestPoint.value) return prev;
      return [...prev.slice(-199), { time: newTime, value: latestPoint.value }];
    });
  }, [latestPoint]);

  const values = data.map(d => d.value);
  const min = values.length ? Math.min(...values).toFixed(1) : "--";
  const max = values.length ? Math.max(...values).toFixed(1) : "--";
  const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "--";

  return (
    <Card className="glass-card border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label}</CardTitle>
          <div className="flex gap-1">
            {([1, 6, 24] as Range[]).map(h => (
              <Button
                key={h}
                variant={range === h ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setRange(h)}
              >
                {h}h
              </Button>
            ))}
          </div>
        </div>
        {/* Mini stats */}
        <div className="flex gap-4 mt-1">
          <span className="text-[10px] text-muted-foreground">Min: <span className="font-mono text-foreground">{min}{unit}</span></span>
          <span className="text-[10px] text-muted-foreground">Max: <span className="font-mono text-foreground">{max}{unit}</span></span>
          <span className="text-[10px] text-muted-foreground">TB: <span className="font-mono text-foreground">{avg}{unit}</span></span>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {loading && data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            Đang tải dữ liệu...
          </div>
        ) : data.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            Đang chờ thêm dữ liệu... ({data.length} điểm)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                domain={([min, max]: [number, number]) => {
                  const padding = Math.max((max - min) * 0.1, 2);
                  return [Math.floor(min - padding), Math.ceil(max + padding)];
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(v: number) => [`${v}${unit}`, label]}
              />
              {threshold !== undefined && (
                <ReferenceLine
                  y={threshold}
                  stroke="#f87171"
                  strokeDasharray="4 4"
                  label={{ value: `Ngưỡng ${threshold}${unit}`, fontSize: 9, fill: "#f87171" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
