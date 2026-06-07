"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getRolePermissions,
  updateRolePermissions,
  PermissionCatalogItem,
  RolePermissionItem,
} from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Save, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export default function RolesPage() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [roles, setRoles] = useState<RolePermissionItem[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await getRolePermissions(token);
      setCatalog(data.permissionCatalog);
      setRoles(data.roles);

      const role = selectedRole || data.roles[0]?.roleName || "";
      setSelectedRole(role);

      const roleData = data.roles.find((r) => r.roleName === role);
      setSelectedPermissions(roleData?.permissions ?? []);
    } catch (e) {
      setError(getErrorMessage(e, "Không thể tải dữ liệu phân quyền"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  function handleRoleChange(roleName: string) {
    setSelectedRole(roleName);
    const roleData = roles.find((r) => r.roleName === roleName);
    setSelectedPermissions(roleData?.permissions ?? []);
    setSuccess("");
  }

  function togglePermission(key: string, enabled: boolean) {
    setSelectedPermissions((prev) => {
      if (enabled) {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      }
      return prev.filter((k) => k !== key);
    });
    setSuccess("");
  }

  async function savePermissions() {
    if (!token || !selectedRole) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await updateRolePermissions(token, selectedRole, selectedPermissions);
      setRoles((prev) => prev.map((r) => (r.roleName === selectedRole ? updated : r)));
      setSuccess(`Đã cập nhật quyền cho role ${selectedRole}.`);
    } catch (e) {
      setError(getErrorMessage(e, "Không thể cập nhật phân quyền"));
    } finally {
      setSaving(false);
    }
  }

  const groupedCatalog = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const item of catalog) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return Array.from(map.entries());
  }, [catalog]);

  if (user?.role !== "ADMIN") {
    return <div className="p-6 text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Quản lý phân quyền role</h1>
            <p className="text-xs text-muted-foreground">Admin có thể bật/tắt quyền cho từng role</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || saving} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-500">{success}</p>}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between gap-3">
            <span>Thiết lập quyền</span>
            <div className="w-64">
              <Select value={selectedRole} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.roleName} value={r.roleName}>
                      {r.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách quyền...</p>
          ) : (
            groupedCatalog.map(([group, items]) => (
              <div key={group} className="rounded-lg border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{group}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {items.filter((i) => selectedPermissions.includes(i.key)).length}/{items.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {items.map((item) => {
                    const enabled = selectedPermissions.includes(item.key);
                    return (
                      <div key={item.key} className="flex items-center justify-between rounded-md bg-secondary/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.key}</p>
                        </div>
                        <Switch checked={enabled} onCheckedChange={(v) => togglePermission(item.key, v)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <div className="flex justify-end">
            <Button onClick={savePermissions} disabled={loading || saving || !selectedRole} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Đang lưu..." : "Lưu phân quyền"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
