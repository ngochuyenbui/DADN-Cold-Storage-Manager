const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface AuthUser {
  username: string;
  role: "ADMIN" | "STAFF" | "MAINTENANCE";
  firstName: string;
  lastName: string;
  email?: string;
}

export interface LoginResponse extends AuthUser {
  token: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Đăng nhập thất bại");
  return data as LoginResponse;
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Phiên đăng nhập hết hạn");
  return res.json();
}

export async function updateMyEmail(token: string, email: string): Promise<AuthUser> {
  return updateMyProfile(token, { email });
}

export async function updateMyProfile(
  token: string,
  data: Partial<Pick<AuthUser, "firstName" | "lastName" | "email">>
): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Không thể cập nhật hồ sơ");
  return json as AuthUser;
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Đổi mật khẩu thất bại");
  return json as { message: string };
}

// Admin: quản lý user
export interface UserDto {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export async function getUsers(token: string): Promise<UserDto[]> {
  const res = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Không thể tải danh sách user");
  return res.json();
}

export async function createUser(token: string, data: {
  username: string; password: string; role: string;
  firstName?: string; lastName?: string; email?: string;
}): Promise<UserDto> {
  const res = await fetch(`${BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Tạo user thất bại");
  return json;
}

export async function updateUser(token: string, id: string, data: Partial<{
  firstName: string; lastName: string; email: string; password: string; role: string;
}>): Promise<UserDto> {
  const res = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Cập nhật thất bại");
  return json;
}

export async function deleteUser(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Xóa user thất bại");
}

export interface PermissionCatalogItem {
  key: string;
  label: string;
  group: string;
}

export interface RolePermissionItem {
  roleName: string;
  permissions: string[];
}

export interface RolePermissionOverview {
  permissionCatalog: PermissionCatalogItem[];
  roles: RolePermissionItem[];
}

export interface NotificationSettings {
  alertEmailEnabled: boolean;
  alertPushEnabled: boolean;
}

export async function getRolePermissions(token: string): Promise<RolePermissionOverview> {
  const res = await fetch(`${BASE_URL}/api/admin/roles/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Không thể tải phân quyền role");
  return json as RolePermissionOverview;
}

export async function updateRolePermissions(
  token: string,
  roleName: string,
  permissions: string[]
): Promise<RolePermissionItem> {
  const res = await fetch(`${BASE_URL}/api/admin/roles/${roleName}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ permissions }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Cập nhật phân quyền thất bại");
  return json as RolePermissionItem;
}

export async function getNotificationSettings(token: string): Promise<NotificationSettings> {
  const res = await fetch(`${BASE_URL}/api/settings/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Không thể tải cài đặt thông báo");
  return json as NotificationSettings;
}

export async function updateNotificationSettings(
  token: string,
  data: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const res = await fetch(`${BASE_URL}/api/settings/notifications`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Không thể cập nhật cài đặt thông báo");
  return json as NotificationSettings;
}
