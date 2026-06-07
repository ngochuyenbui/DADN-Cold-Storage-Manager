"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getUsers, createUser, updateUser, deleteUser, UserDto } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { PasswordRules, UsernameRules, validateEmailFormat, validatePasswordRules, validateUsernameRules } from "@/components/PasswordRules";

const ROLE_LABEL: Record<string, string> = {
  STAFF: "Nhân viên",
  MAINTENANCE: "Bảo trì",
  ADMIN: "Quản trị",
};

const ROLE_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  ADMIN: "destructive",
  MAINTENANCE: "default",
  STAFF: "secondary",
};

type FormData = {
  username: string; password: string; role: string;
  firstName: string; lastName: string; email: string;
};

type UpdateUserPayload = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  password?: string;
};

const emptyForm: FormData = { username: "", password: "", role: "STAFF", firstName: "", lastName: "", email: "" };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function UsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setUsers(await getUsers(token));
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Khong the tai danh sach user"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm(emptyForm); setFormError(""); setShowCreate(true); }
  function openEdit(u: UserDto) {
    setForm({ username: u.username, password: "", role: u.role, firstName: u.firstName, lastName: u.lastName, email: u.email });
    setFormError("");
    setEditTarget(u);
  }

  async function handleCreate() {
    if (!token) return;
    const usernameRules = validateUsernameRules(form.username);
    const passwordRules = validatePasswordRules(form.password);
    const email = form.email.trim();
    if (!usernameRules.length || !usernameRules.firstNotNumber) {
      setFormError("Username phải dài ít nhất 8 ký tự và ký tự đầu tiên không được là số");
      return;
    }
    if (!passwordRules.length || !passwordRules.hasDigit) {
      setFormError("Mật khẩu phải dài ít nhất 8 ký tự và có ít nhất 1 chữ số");
      return;
    }
    if (!email) {
      setFormError("Email là bắt buộc để gửi thông tin đăng nhập");
      return;
    }
    if (!validateEmailFormat(email)) {
      setFormError("Email không đúng định dạng");
      return;
    }
    setSubmitting(true); setFormError("");
    try {
      await createUser(token, form);
      setShowCreate(false);
      load();
    } catch (error: unknown) { setFormError(getErrorMessage(error, "Tao user that bai")); }
    finally { setSubmitting(false); }
  }

  async function handleEdit() {
    if (!token || !editTarget) return;
    if (form.email.trim() && !validateEmailFormat(form.email)) {
      setFormError("Email không đúng định dạng");
      return;
    }
    if (form.password) {
      const passwordRules = validatePasswordRules(form.password);
      if (!passwordRules.length || !passwordRules.hasDigit) {
        setFormError("Mật khẩu phải dài ít nhất 8 ký tự và có ít nhất 1 chữ số");
        return;
      }
    }
    setSubmitting(true); setFormError("");
    try {
      const payload: UpdateUserPayload = { firstName: form.firstName, lastName: form.lastName, email: form.email, role: form.role };
      if (form.password) payload.password = form.password;
      await updateUser(token, editTarget.userId, payload);
      setEditTarget(null);
      load();
    } catch (error: unknown) { setFormError(getErrorMessage(error, "Cap nhat user that bai")); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteUser(token, deleteTarget.userId);
      setDeleteTarget(null);
      load();
    } catch (error: unknown) { setError(getErrorMessage(error, "Xoa user that bai")); }
    finally { setSubmitting(false); }
  }

  if (user?.role !== "ADMIN") {
    return <div className="p-6 text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Quản lý người dùng</h1>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="w-4 h-4" /> Thêm tài khoản
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm">Đang tải...</p>
      ) : (
        <div className="grid gap-3">
          {users.map((u) => (
            <Card key={u.userId}>
              <CardContent className="flex items-center justify-between py-4 px-5">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                    {(u.firstName?.[0] ?? u.username[0]).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-muted-foreground">@{u.username} · {u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={ROLE_VARIANT[u.role] ?? "secondary"}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(u)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && <p className="text-sm text-muted-foreground">Chưa có tài khoản nào.</p>}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tạo tài khoản mới</DialogTitle></DialogHeader>
          <UserForm form={form} setForm={setForm} isCreate error={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Đang tạo..." : "Tạo tài khoản"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chỉnh sửa tài khoản</DialogTitle></DialogHeader>
          <UserForm form={form} setForm={setForm} isCreate={false} error={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Hủy</Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận xóa</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bạn có chắc muốn xóa tài khoản <span className="font-medium text-foreground">@{deleteTarget?.username}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Hủy</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? "Đang xóa..." : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserForm({ form, setForm, isCreate, error }: {
  form: FormData;
  setForm: (f: FormData) => void;
  isCreate: boolean;
  error: string;
}) {
  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3 py-2">
      {isCreate && (
        <div className="space-y-1.5">
          <Label>Tên đăng nhập</Label>
          <Input value={form.username} onChange={set("username")} placeholder="username" required />
          <UsernameRules username={form.username} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Họ</Label>
          <Input value={form.lastName} onChange={set("lastName")} placeholder="Nguyễn" />
        </div>
        <div className="space-y-1.5">
          <Label>Tên</Label>
          <Input value={form.firstName} onChange={set("firstName")} placeholder="Văn A" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={set("email")} placeholder="email@example.com" />
        {form.email && !validateEmailFormat(form.email) && (
          <p className="text-xs text-muted-foreground">Email phải đúng định dạng, ví dụ: name@example.com</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>{isCreate ? "Mật khẩu" : "Mật khẩu mới (để trống nếu không đổi)"}</Label>
        <Input type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
        {form.password && <PasswordRules password={form.password} />}
      </div>
      <div className="space-y-1.5">
        <Label>Vai trò</Label>
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Quản trị viên (ADMIN)</SelectItem>
            <SelectItem value="STAFF">Nhân viên (STAFF)</SelectItem>
            <SelectItem value="MAINTENANCE">Bảo trì (MAINTENANCE)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
