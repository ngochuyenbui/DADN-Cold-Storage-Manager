'use client';
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Thermometer, 
  Cpu, 
  Boxes,
  ScrollText,
  History,
  FileText,
  Users, 
  ShieldCheck,
  Settings,
  Snowflake,
  AlertTriangle,
  ClipboardList,
  Wifi,
  WifiOff
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/context/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const mainItems = [
  { title: "Dashboard",        url: "/",            icon: LayoutDashboard, roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
  { title: "Khu vực",          url: "/zones",        icon: Thermometer,     roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
  { title: "Thiết bị",         url: "/devices",      icon: Cpu,             roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
  { title: "Nhập / Xuất hàng", url: "/in-out",       icon: Boxes,           roles: ["ADMIN", "STAFF"] },
  { title: "Cảnh báo",         url: "/alerts",       icon: AlertTriangle,   roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
  { title: "Lịch sử thiết bị", url: "/device-logs",  icon: History,         roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
  { title: "Nhật ký",          url: "/logs",         icon: ScrollText,  roles: ["ADMIN", "STAFF"] },
  { title: "Báo cáo",          url: "/reports",      icon: FileText,    roles: ["ADMIN", "STAFF"] },
  { title: "Báo cáo lỗi",      url: "/issue-report", icon: ClipboardList, roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
];

const adminItems = [
  { title: "Người dùng", url: "/users", icon: Users, roles: ["ADMIN"] },
  { title: "Phân quyền", url: "/roles", icon: ShieldCheck, roles: ["ADMIN"] },
  { title: "Cài đặt", url: "/settings", icon: Settings, roles: ["ADMIN", "STAFF", "MAINTENANCE"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, token } = useAuth();
  const collapsed = state === "collapsed";
  const [mqttConnected, setMqttConnected] = useState<boolean | null>(null);
  const isAdmin = user?.role === "ADMIN";
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function checkMqtt() {
      try {
        const r = await fetch(`${BASE}/api/control/mqtt-status`);
        if (r.ok) {
          const data = await r.json();
          setMqttConnected(data.connected === true);
        } else {
          setMqttConnected(false);
        }
      } catch {
        setMqttConnected(false);
      }
    }
    checkMqtt();
    const interval = setInterval(checkMqtt, 15000); // check mỗi 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center glow-primary shrink-0">
            <Snowflake className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="animate-slide-in min-w-0">
              <h1 className="text-sm font-semibold text-foreground">FreshGuard</h1>
              <p className="text-[10px] text-muted-foreground">Cold Storage Manager</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 text-center">
            <p className="text-xl font-bold font-mono text-primary tracking-widest">
              {now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">
            {!collapsed && "Chính"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.filter(item => item.roles.includes(user?.role ?? "")).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="w-4 h-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">
            {!collapsed && "Quản trị"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.filter(item => item.roles.includes(user?.role ?? "")).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="w-4 h-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="glass-card p-3 animate-slide-in space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {mqttConnected === true
                  ? <Wifi className="w-3.5 h-3.5 text-success" />
                  : mqttConnected === false
                  ? <WifiOff className="w-3.5 h-3.5 text-destructive" />
                  : <Wifi className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />}
                <span className={`text-xs ${mqttConnected === true ? "text-success" : mqttConnected === false ? "text-destructive" : "text-muted-foreground"}`}>
                  {mqttConnected === true ? "Adafruit kết nối" : mqttConnected === false ? "Adafruit mất kết nối" : "Đang kiểm tra..."}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 status-online" />
              <span className="text-xs text-success">Hệ thống hoạt động</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            {mqttConnected === true
              ? <Wifi className="w-4 h-4 text-success" />
              : mqttConnected === false
              ? <WifiOff className="w-4 h-4 text-destructive" />
              : <Wifi className="w-4 h-4 text-muted-foreground animate-pulse" />}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
