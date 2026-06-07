"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordRules, validatePasswordRules } from "@/components/PasswordRules";
import { getErrorMessage } from "@/lib/errors";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token");
}

function ChangePasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordRules = useMemo(() => validatePasswordRules(newPassword), [newPassword]);
  const isResetFlow = Boolean(token);

  useEffect(() => {
    if (!isResetFlow && typeof window !== "undefined") {
      const stored = getStoredToken();
      if (!stored) {
        setError("Thiếu token hoặc phiên đăng nhập. Vui lòng đăng nhập lại.");
      }
    }
  }, [isResetFlow]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    if (!passwordRules.length || !passwordRules.hasDigit) {
      setError("Mật khẩu phải dài ít nhất 8 ký tự và có ít nhất 1 chữ số");
      return;
    }
    if (!isResetFlow && !currentPassword.trim()) {
      setError("Mật khẩu hiện tại là bắt buộc");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = { newPassword };
      if (isResetFlow) {
        body.token = token;
      } else {
        body.currentPassword = currentPassword;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!isResetFlow) {
        const stored = getStoredToken();
        if (stored) headers.Authorization = `Bearer ${stored}`;
      }

      const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Đổi mật khẩu thất bại");
      setSuccess(json.message ?? "Đổi mật khẩu thành công");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(getErrorMessage(err, "Đổi mật khẩu thất bại"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <LockKeyhole className="w-5 h-5 text-primary" />
            Đổi mật khẩu
          </CardTitle>
          <CardDescription>
            {isResetFlow
              ? "Đặt mật khẩu mới từ liên kết trong email"
              : "Đổi mật khẩu khi đang đăng nhập"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isResetFlow && (
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
            )}

            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                  autoComplete={isResetFlow ? "new-password" : "new-password"}
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

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-emerald-400">{success}</p>}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Đang lưu..." : "Lưu mật khẩu mới"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background p-4" />}>
      <ChangePasswordContent />
    </Suspense>
  );
}
