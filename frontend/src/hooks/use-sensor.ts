"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { publishDeviceControl, publishThreshold, publishMode } from "@/lib/api";
import { getAllFeedValues } from "@/lib/adafruit";

export type ModeType = 0 | 1 | 2; // 0=Manual, 1=Auto, 2=Schedule

export interface SensorState {
  temp: number;
  humi: number;
  tempFan: boolean;
  humiFan: boolean;
  light: number;   // 0=tắt, 1=bật
  tempThreshold: number;
  humiThreshold: number;
  mode: ModeType;
  connected: boolean;
  lastUpdated: Date | null;
}

const WS_URL        = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8080/ws";
const POLL_INTERVAL = 15000;

interface SensorDataWsMessage {
  feed: "temp" | "humi" | "light" | "motion";
  value: number;
  timestamp: string;
  roomId: number;
}

interface DeviceStateWsMessage {
  feed: string;
  value: string;
  roomId?: number;
}

/**
 * useSensor(roomId?)
 * - roomId: phòng cần theo dõi. Mặc định = 1 (backward compat).
 * - Tất cả lệnh điều khiển đều gửi đúng roomId này.
 */
export function useSensor(roomId = 1) {
  const [state, setState] = useState<SensorState>({
    temp: 0, humi: 0,
    tempFan: false, humiFan: false,
    light: 0,
    tempThreshold: 35, humiThreshold: 60,
    mode: 0, connected: false, lastUpdated: null,
  });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const stompRef                = useRef<Client | null>(null);
  const [latestTemp, setLatestTemp] = useState<{ value: number; timestamp: string } | undefined>();
  const [latestHumi, setLatestHumi] = useState<{ value: number; timestamp: string } | undefined>();
  const lastManualRef = useRef<{ time?: number }>({});

  // ── Polling Adafruit REST (fallback) ──────────────────────────────────────
  const pollAdafruit = useCallback(async () => {
    try {
      const vals = await getAllFeedValues(roomId);
      const now  = new Date().toISOString();
      const recentManual = lastManualRef.current.time &&
        Date.now() - lastManualRef.current.time < 30000;

      setState(prev => ({
        ...prev,
        temp:          vals.temp,
        humi:          vals.humi,
        tempFan:       vals.tempFan,
        humiFan:       vals.humiFan,
        mode:          vals.mode as ModeType,
        tempThreshold: recentManual ? prev.tempThreshold : vals.tempThreshold,
        humiThreshold: recentManual ? prev.humiThreshold : vals.humiThreshold,
        connected:     true,
        lastUpdated:   new Date(),
      }));
      setLatestTemp({ value: vals.temp, timestamp: now });
      setLatestHumi({ value: vals.humi, timestamp: now });
      setError(null);
    } catch (e) {
      console.warn("[useSensor] poll failed:", e);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await pollAdafruit();
  }, [pollAdafruit]);

  // ── WebSocket STOMP ───────────────────────────────────────────────────────
  useEffect(() => {
    refresh();
    const pollTimer = setInterval(pollAdafruit, POLL_INTERVAL);

    let stompClient: Client | null = null;
    import("sockjs-client").then(({ default: SockJS }) =>
      import("@stomp/stompjs").then(({ Client }) => {
        const client = new Client({
          webSocketFactory: () => new SockJS(WS_URL),
          reconnectDelay: 5000,
          onConnect: () => {
            setState(prev => ({ ...prev, connected: true }));

            // sensor-data: lọc theo roomId
            client.subscribe("/topic/sensor-data", (msg: IMessage) => {
              const data = JSON.parse(msg.body) as SensorDataWsMessage;
              if (data.roomId !== roomId) return;
              const point = { value: data.value, timestamp: data.timestamp };
              setState(prev => ({
                ...prev,
                temp: data.feed === "temp" ? data.value : prev.temp,
                humi: data.feed === "humi" ? data.value : prev.humi,
                lastUpdated: new Date(data.timestamp),
                connected: true,
              }));
              if (data.feed === "temp") setLatestTemp(point);
              if (data.feed === "humi") setLatestHumi(point);
            });

            // device-state: lọc theo roomId (mode roomId=0 là global)
            client.subscribe("/topic/device-state", (msg: IMessage) => {
              const data = JSON.parse(msg.body) as DeviceStateWsMessage;
              if (data.roomId && data.roomId !== 0 && data.roomId !== roomId) return;
              if (data.feed === "temp-threshold" || data.feed === "humi-threshold") {
                lastManualRef.current = {};
              }
              setState(prev => {
                switch (data.feed) {
                  case "temp-fan":       return { ...prev, tempFan: data.value === "1" };
                  case "humi-fan":       return { ...prev, humiFan: data.value === "1" };
                  case "light":          return { ...prev, light: parseInt(data.value) };
                  case "mode":           return { ...prev, mode: parseInt(data.value) as ModeType };
                  case "temp-threshold": return { ...prev, tempThreshold: parseFloat(data.value) };
                  case "humi-threshold": return { ...prev, humiThreshold: parseFloat(data.value) };
                  default:               return prev;
                }
              });
            });
          },
          onDisconnect: () => setState(prev => ({ ...prev, connected: false })),
          onStompError: () => {},
        });
        stompClient = client;
        client.activate();
        stompRef.current = client;
      })
    );

    return () => {
      clearInterval(pollTimer);
      stompClient?.deactivate();
    };
  }, [refresh, pollAdafruit, roomId]);

  // ── Actions — tất cả dùng roomId từ param ────────────────────────────────

  const setTempFan = useCallback(async (on: boolean) => {
    const val: 0 | 1 = on ? 1 : 0;
    setState(prev => ({ ...prev, tempFan: on }));
    await publishDeviceControl(roomId, val, state.humiFan ? 1 : 0, state.light as 0 | 1);
  }, [roomId, state.humiFan, state.light]);

  const setHumiFan = useCallback(async (on: boolean) => {
    const val: 0 | 1 = on ? 1 : 0;
    setState(prev => ({ ...prev, humiFan: on }));
    await publishDeviceControl(roomId, state.tempFan ? 1 : 0, val, state.light as 0 | 1);
  }, [roomId, state.tempFan, state.light]);

  const setLight = useCallback(async (on: boolean) => {
    const val: 0 | 1 = on ? 1 : 0;
    setState(prev => ({ ...prev, light: val }));
    await publishDeviceControl(roomId, state.tempFan ? 1 : 0, state.humiFan ? 1 : 0, val);
  }, [roomId, state.tempFan, state.humiFan]);

  const setMode = useCallback(async (mode: ModeType) => {
    setState(prev => ({ ...prev, mode }));
    await publishMode(mode, roomId);
  }, [roomId]);

  const setTempThreshold = useCallback(async (val: number) => {
    setState(prev => ({ ...prev, tempThreshold: val }));
    lastManualRef.current = { time: Date.now() };
    await publishThreshold(roomId, val, state.humiThreshold);
  }, [roomId, state.humiThreshold]);

  const setHumiThreshold = useCallback(async (val: number) => {
    setState(prev => ({ ...prev, humiThreshold: val }));
    lastManualRef.current = { time: Date.now() };
    await publishThreshold(roomId, state.tempThreshold, val);
  }, [roomId, state.tempThreshold]);

  return {
    state, loading, error, refresh,
    latestTemp, latestHumi,
    setTempFan, setHumiFan, setLight, setMode,
    setTempThreshold, setHumiThreshold,
  };
}
