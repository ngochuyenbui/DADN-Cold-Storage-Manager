"use client";
import { useState, useEffect, useCallback } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { getAlerts, getAlertCount, AlertItem } from "@/lib/alerts";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8080/ws";

export function useAlerts() {
  const [alerts, setAlerts]     = useState<AlertItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const [data, count] = await Promise.all([getAlerts("ALL", 50), getAlertCount()]);
      setAlerts(data);
      setActiveCount(count);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();

    const intervalId = setInterval(() => {
      load();
    }, 60000);

    // WebSocket: nhận alert realtime
    let stompClient: Client | null = null;
    (async () => {
      try {
        const token = typeof window !== "undefined"
          ? (localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token"))
          : null;
        let pushEnabled = true;

        if (token) {
          const settingsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/settings/notifications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            pushEnabled = settings.alertPushEnabled !== false;
          }
        }

        if (!pushEnabled) return;

        const { default: SockJS } = await import("sockjs-client");
        const { Client } = await import("@stomp/stompjs");

        const client = new Client({
          webSocketFactory: () => new SockJS(WS_URL),
          reconnectDelay: 5000,
          onConnect: () => {
            client.subscribe("/topic/alerts", (msg: IMessage) => {
              const alert = JSON.parse(msg.body) as AlertItem;
              setAlerts(prev => [alert, ...prev]);
              setActiveCount(prev => prev + 1);
            });
          },
        });
        stompClient = client;
        client.activate();
      } catch {
        // Keep UI usable even when settings/ws initialization fails.
      }
    })();

    return () => {
      clearInterval(intervalId);
      stompClient?.deactivate();
    };
  }, [load]);

  return { alerts, activeCount, loading, reload: load };
}
