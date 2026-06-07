"use client";

import { Check, X } from "lucide-react";

export function validateUsernameRules(username: string) {
  const value = username.trim();
  return {
    length: value.length >= 8,
    firstNotNumber: value.length > 0 ? !/^[0-9]/.test(value) : false,
  };
}

export function validatePasswordRules(password: string) {
  return {
    length: password.length >= 8,
    hasDigit: /\d/.test(password),
  };
}

export function validateEmailFormat(email: string) {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

export function PasswordRules({ password }: { password: string }) {
  if (!password) return null;
  const rules = validatePasswordRules(password);

  const items = [
    { ok: rules.length, text: "Ít nhất 8 ký tự" },
    { ok: rules.hasDigit, text: "Ít nhất 1 ký tự số" },
  ];

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <p className="font-medium text-foreground">Checklist mật khẩu</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.text} className={`flex items-center gap-2 ${item.ok ? "text-emerald-400" : "text-muted-foreground"}`}>
            {item.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsernameRules({ username }: { username: string }) {
  if (!username.trim()) return null;
  const rules = validateUsernameRules(username);

  const items = [
    { ok: rules.length, text: "Ít nhất 8 ký tự" },
    { ok: rules.firstNotNumber, text: "Ký tự đầu tiên không phải số" },
  ];

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <p className="font-medium text-foreground">Checklist username</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.text} className={`flex items-center gap-2 ${item.ok ? "text-emerald-400" : "text-muted-foreground"}`}>
            {item.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
