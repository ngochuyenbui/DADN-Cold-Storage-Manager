"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAlerts } from "@/hooks/use-alerts";
import { getAlertActionPath } from "@/lib/alerts";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Quản trị viên",
  STAFF: "Nhân viên",
  MAINTENANCE: "Bảo trì",
};

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { theme, setTheme } = useTheme();
  const [alertOpen, setAlertOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { alerts, activeCount, loading: alertsLoading, reload } = useAlerts();
  const publicRoutes = ["/login", "/forgot-password", "/change-password"];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (alertOpen) reload();
  }, [alertOpen, reload]);

  // Auth guard
  useEffect(() => {
    if (!loading && !user && !isPublicRoute) {
      router.replace("/login");
    }
  }, [loading, user, isPublicRoute, router]);

  const isDark = theme === "dark";
  const recentAlerts = alerts.slice(0, 5);

  function formatTime(ts: string) {
    return new Date(ts).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  }

  function openAlertsPage() {
    setAlertOpen(false);
    router.push("/alerts");
  }

  function openAlertTarget(path: string) {
    setAlertOpen(false);
    router.push(path);
  }

  // Show public auth pages without guarding them behind login.
  if (isPublicRoute) return <>{children}</>;
  if (loading || !user) return null;

  const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || user.username[0].toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/50 px-4 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Toggle theme"
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <Popover open={alertOpen} onOpenChange={setAlertOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
                    aria-label="Cảnh báo"
                  >
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    {activeCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                        {activeCount > 99 ? "99+" : activeCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 p-0">
                  <div className="border-b border-border/60 px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Thông báo</p>
                      <p className="text-[11px] text-muted-foreground">
                        {activeCount > 0 ? `${activeCount} cảnh báo chưa xử lý` : "Không có cảnh báo mới"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openAlertsPage}>
                      Xem tất cả
                    </Button>
                  </div>

                  <div className="max-h-80 overflow-auto p-1.5 space-y-1">
                    {alertsLoading && recentAlerts.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-6 text-center">Đang tải thông báo...</p>
                    )}

                    {!alertsLoading && recentAlerts.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-6 text-center">Chưa có thông báo nào.</p>
                    )}

                    {recentAlerts.map((alert) => (
                      <button
                        key={alert.alertId}
                        type="button"
                        onClick={() => openAlertTarget(getAlertActionPath(alert))}
                        className="w-full text-left rounded-md border border-border/40 px-2.5 py-2 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs leading-5 line-clamp-2">{alert.message}</p>
                          {alert.status === "ACTIVE" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium shrink-0">
                              Mới
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatTime(alert.time)}</p>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/60 transition-colors text-left"
                aria-label="Xem thông tin tài khoản"
                title="Xem thông tin tài khoản"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                  {initials}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-medium">{user.firstName} {user.lastName || user.username}</p>
                  <p className="text-[10px] text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</p>
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { logout(); router.replace("/login"); }}
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
