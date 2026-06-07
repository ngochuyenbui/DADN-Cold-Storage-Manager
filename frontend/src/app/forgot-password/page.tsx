"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validateEmailFormat } from "@/components/PasswordRules";
import { getErrorMessage } from "@/lib/errors";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateEmailFormat(email)) {
      setError("Email không đúng định dạng");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gửi email thất bại");
      setSuccess(json.message ?? "Đã gửi email đặt lại mật khẩu");
    } catch (err) {
      setError(getErrorMessage(err, "Gửi email thất bại"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl text-center">Quên mật khẩu</CardTitle>
          <CardDescription className="text-center">Nhập email để nhận liên kết đặt lại mật khẩu</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
              {email && !validateEmailFormat(email) && (
                <p className="text-xs text-muted-foreground">Email phải đúng định dạng, ví dụ: name@example.com</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-emerald-400">{success}</p>}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              <Send className="w-4 h-4" />
              {loading ? "Đang gửi..." : "Gửi email đặt lại mật khẩu"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Quay lại đăng nhập
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
