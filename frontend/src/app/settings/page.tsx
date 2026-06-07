"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Smartphone, RefreshCw, Save, User, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { changePassword, getNotificationSettings, updateMyProfile, updateNotificationSettings } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasswordRules, validatePasswordRules } from "@/components/PasswordRules";
import { validateEmailFormat } from "@/components/PasswordRules";
import { getErrorMessage } from "@/lib/errors";

export default function SettingsPage() {
  const { token, user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [alertEmailEnabled, setAlertEmailEnabled] = useState(true);
  const [alertPushEnabled, setAlertPushEnabled] = useState(true);

  const passwordRules = useMemo(() => validatePasswordRules(newPassword), [newPassword]);

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  async function loadSettings() {
    if (!token) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const settings = await getNotificationSettings(token);
      setAlertEmailEnabled(settings.alertEmailEnabled);
      setAlertPushEnabled(settings.alertPushEnabled);
    } catch (e) {
      setError(getErrorMessage(e, "Không thể tải cài đặt"));
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!token) return;
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim();
    if (!normalizedFirstName) {
      setError("Họ là bắt buộc");
      return;
    }
    if (!normalizedLastName) {
      setError("Tên là bắt buộc");
      return;
    }
    if (!validateEmailFormat(normalizedEmail)) {
      setError("Email không đúng định dạng");
      return;
    }

    setSavingProfile(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateMyProfile(token, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail,
      });
      setFirstName(updated.firstName ?? "");
      setLastName(updated.lastName ?? "");
      setEmail(updated.email ?? "");
      await refreshUser();
      setSuccess("Đã cập nhật thông tin tài khoản");
    } catch (e) {
      setError(getErrorMessage(e, "Không thể cập nhật thông tin tài khoản"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (!token) return;
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu nhập lại không khớp");
      return;
    }
    if (!passwordRules.length || !passwordRules.hasDigit) {
      setPasswordError("Mật khẩu phải dài ít nhất 8 ký tự và có ít nhất 1 chữ số");
      return;
    }
    if (!currentPassword.trim()) {
      setPasswordError("Mật khẩu hiện tại là bắt buộc");
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await changePassword(token, currentPassword, newPassword);
      setPasswordSuccess(result.message ?? "Đổi mật khẩu thành công");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordOpen(false), 400);
    } catch (e) {
      setPasswordError(getErrorMessage(e, "Đổi mật khẩu thất bại"));
    } finally {
      setPasswordLoading(false);
    }
  }

  async function saveSettings() {
    if (!token) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const settings = await updateNotificationSettings(token, {
        alertEmailEnabled,
        alertPushEnabled,
      });
      setAlertEmailEnabled(settings.alertEmailEnabled);
      setAlertPushEnabled(settings.alertPushEnabled);
      setSuccess("Đã lưu cài đặt thông báo");
    } catch (e) {
      setError(getErrorMessage(e, "Không thể lưu cài đặt"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tài khoản & Cài đặt</h1>
            <p className="text-xs text-muted-foreground">Xem thông tin tài khoản và tuỳ chỉnh cách nhận thông báo</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadSettings} disabled={loading || saving} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-500">{success}</p>}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Thông tin tài khoản</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)} className="gap-2">
              <LockKeyhole className="w-4 h-4" />
              Đổi mật khẩu
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tên đăng nhập</Label>
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                {user?.username ?? "-"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vai trò</Label>
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                {user?.role ?? "-"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Họ</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Họ"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Tên</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Tên"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountEmail">Email nhận thông báo</Label>
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                id="accountEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="md:max-w-md"
              />
              <Button onClick={saveProfile} disabled={loading || savingProfile} className="gap-2 md:self-start">
                <Save className="w-4 h-4" />
                {savingProfile ? "Đang lưu..." : "Lưu thông tin"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Email này sẽ được dùng cho thông báo hệ thống và các luồng gửi email khác.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="w-5 h-5 text-primary" />
              Đổi mật khẩu
            </DialogTitle>
            <DialogDescription>
              Đặt mật khẩu mới khi đang đăng nhập.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void savePassword();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showCurrent ? "Ẩn mật khẩu hiện tại" : "Hiện mật khẩu hiện tại"}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNew ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordRules password={newPassword} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Nhập lại mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-emerald-400">{passwordSuccess}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" className="gap-2" disabled={passwordLoading}>
                <RefreshCw className={`w-4 h-4 ${passwordLoading ? "animate-spin" : ""}`} />
                {passwordLoading ? "Đang lưu..." : "Lưu mật khẩu mới"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cảnh báo & Thông báo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/60 p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Thông báo qua email</p>
                <p className="text-xs text-muted-foreground">
                  Nhận email khi có cảnh báo quan trọng hoặc sự kiện bất thường.
                </p>
              </div>
            </div>
            <Switch
              checked={alertEmailEnabled}
              onCheckedChange={setAlertEmailEnabled}
              disabled={loading || saving}
            />
          </div>

          <div className="rounded-lg border border-border/60 p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Smartphone className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Push notification</p>
                <p className="text-xs text-muted-foreground">
                  Bật/tắt thông báo realtime trên ứng dụng cho mục Cảnh báo & Thông báo.
                </p>
              </div>
            </div>
            <Switch
              checked={alertPushEnabled}
              onCheckedChange={setAlertPushEnabled}
              disabled={loading || saving}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={loading || saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
