const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface LogEntry {
  logId: number;
  typeAction: string;
  description: string;
  timestamp: string;
  userId?: string;
  username?: string;
  fullName?: string;
  role?: string;
}

export interface LogPage {
  content: LogEntry[];
  totalElements: number;
  totalPages: number;
  page: number;
}

export async function fetchLogs(
  token: string,
  params: { page?: number; size?: number; userId?: string; typeActions?: string[] } = {}
): Promise<LogPage> {
  const q = new URLSearchParams();
  if (params.page    !== undefined) q.set("page",       String(params.page));
  if (params.size    !== undefined) q.set("size",       String(params.size));
  if (params.userId)                q.set("userId",     params.userId);
  if (params.typeActions && params.typeActions.length > 0) {
    for (const action of params.typeActions) {
      q.append("typeAction", action);
    }
  }

  const res = await fetch(`${BASE_URL}/api/logs?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Không thể tải lịch sử hoạt động");
  return res.json();
}
