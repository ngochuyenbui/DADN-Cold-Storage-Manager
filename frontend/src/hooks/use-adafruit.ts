"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getAllFeeds, publishFeedValue, type FeedKey } from "@/lib/adafruit";

export interface AdafruitState {
  temp: number;
  humi: number;
  tempFan: boolean;
  humiFan: boolean;
  tempThreshold: number;
  humiThreshold: number;
  autoMode: boolean;
  connected: boolean;
  lastUpdated: Date | null;
}

const POLL_INTERVAL = 5000; // 5 giây poll 1 lần

export function useAdafruit() {
  const [state, setState] = useState<AdafruitState>({
    temp: 0,
    humi: 0,
    tempFan: false,
    humiFan: false,
    tempThreshold: 35,
    humiThreshold: 60,
    autoMode: false,
    connected: false,
    lastUpdated: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const feeds = await getAllFeeds();
      setState({
        temp: feeds["temp"],
        humi: feeds["humi"],
        tempFan: feeds["temp-fan"] === 1,
        humiFan: feeds["humi-fan"] === 1,
        tempThreshold: feeds["temp-threshold"],
        humiThreshold: feeds["humi-threshold"],
        autoMode: feeds["auto-mode"] > 0,
        connected: true,
        lastUpdated: new Date(),
      });
      setError(null);
    } catch (e) {
      setError("Không thể kết nối Adafruit IO");
      setState((prev) => ({ ...prev, connected: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  const setTempFan = useCallback(async (on: boolean) => {
    setState((prev) => ({ ...prev, tempFan: on }));
    await publishFeedValue("temp-fan", on ? 1 : 0);
  }, []);

  const setHumiFan = useCallback(async (on: boolean) => {
    setState((prev) => ({ ...prev, humiFan: on }));
    await publishFeedValue("humi-fan", on ? 1 : 0);
  }, []);

  const setTempThreshold = useCallback(async (val: number) => {
    setState((prev) => ({ ...prev, tempThreshold: val }));
    await publishFeedValue("temp-threshold", val);
  }, []);

  const setHumiThreshold = useCallback(async (val: number) => {
    setState((prev) => ({ ...prev, humiThreshold: val }));
    await publishFeedValue("humi-threshold", val);
  }, []);

  const setAutoMode = useCallback(async (on: boolean) => {
    setState((prev) => ({ ...prev, autoMode: on }));
    await publishFeedValue("auto-mode", on ? 1 : 0);
  }, []);

  return {
    state,
    loading,
    error,
    refresh: fetchAll,
    setTempFan,
    setHumiFan,
    setTempThreshold,
    setHumiThreshold,
    setAutoMode,
  };
}
