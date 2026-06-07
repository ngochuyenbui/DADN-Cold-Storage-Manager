"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AuthUser, login as apiLogin, fetchMe } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()));

  // Restore session from browser storage
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      fetchMe(stored)
        .then((u) => { setUser(u); setToken(stored); })
        .catch(() => {
          localStorage.removeItem("fg_token");
          sessionStorage.removeItem("fg_token");
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const res = await apiLogin(username, password);
    if (remember) {
      localStorage.setItem("fg_token", res.token);
      sessionStorage.removeItem("fg_token");
    } else {
      sessionStorage.setItem("fg_token", res.token);
      localStorage.removeItem("fg_token");
    }
    setToken(res.token);
    setUser({ username: res.username, role: res.role, firstName: res.firstName, lastName: res.lastName, email: res.email });
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) return;
    const nextUser = await fetchMe(currentToken);
    setToken(currentToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    // Gọi API logout để ghi log
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("fg_token");
    sessionStorage.removeItem("fg_token");
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
