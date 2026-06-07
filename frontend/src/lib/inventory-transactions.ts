const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function storedToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fg_token") || sessionStorage.getItem("fg_token");
}

function resolveToken(token: string) {
  const currentToken = token?.trim();
  return currentToken || storedToken() || "";
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resolveToken(token)}`,
  };
}

async function assertOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) return;

  if (response.status === 401) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  let message = fallbackMessage;
  try {
    const body = (await response.clone().json()) as { error?: string };
    message = body.error ?? message;
  } catch {
    // keep fallback message
  }
  throw new Error(message);
}

export type TransactionType = "ALL" | "IN" | "OUT";

export interface InventoryTransactionItem {
  itemId?: number;
  foodName: string;
  foodType?: string;
  boxTypeId?: number;
  boxTypeName?: string;
  boxLengthM?: number;
  boxWidthM?: number;
  boxHeightM?: number;
  boxCount: number;
  unitVolume: number;
  totalVolume?: number;
}

export interface InventoryTransaction {
  transactionId: number;
  transactionType: Exclude<TransactionType, "ALL">;
  areaId: number;
  areaName: string;
  roomId: number;
  roomName: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
  items: InventoryTransactionItem[];
}

export interface InventorySummary {
  totalInBoxes: number;
  totalOutBoxes: number;
  estimatedStockBoxes: number;
  totalInVolume: number;
  totalOutVolume: number;
  estimatedStockVolume: number;
}

export interface BoxType {
  boxTypeId: number;
  name: string;
  lengthM: number;
  widthM: number;
  heightM: number;
  volumeM3: number;
  createdAt?: string;
}

export interface CreateInventoryTransactionPayload {
  transactionType: "IN" | "OUT";
  areaId: number;
  roomId: number;
  note?: string;
  items: Array<{
    foodName: string;
    foodType?: string;
    boxCount: number;
    boxTypeId: number;
  }>;
}

export async function getInventoryTransactions(
  token: string,
  params: { type?: TransactionType; areaId?: number; query?: string } = {}
): Promise<InventoryTransaction[]> {
  const q = new URLSearchParams();
  q.set("type", params.type ?? "ALL");
  if (params.areaId != null) q.set("areaId", String(params.areaId));
  if (params.query) q.set("query", params.query);

  const response = await fetch(`${BASE}/api/inventory-transactions?${q.toString()}`, {
    headers: authHeaders(token),
  });
  await assertOk(response, "Không thể tải danh sách giao dịch");
  return response.json();
}

export async function getInventorySummary(token: string, areaId?: number): Promise<InventorySummary> {
  const q = new URLSearchParams();
  if (areaId != null) q.set("areaId", String(areaId));

  const response = await fetch(`${BASE}/api/inventory-transactions/summary?${q.toString()}`, {
    headers: authHeaders(token),
  });
  await assertOk(response, "Không thể tải thống kê giao dịch");
  return response.json();
}

export async function createInventoryTransaction(
  token: string,
  payload: CreateInventoryTransactionPayload
): Promise<void> {
  const response = await fetch(`${BASE}/api/inventory-transactions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  await assertOk(response, "Tạo giao dịch thất bại");
}

export async function getBoxTypes(token: string): Promise<BoxType[]> {
  const response = await fetch(`${BASE}/api/box-types`, {
    headers: authHeaders(token),
  });
  await assertOk(response, "Không thể tải danh sách loại thùng");
  return response.json();
}

export async function createBoxType(
  token: string,
  payload: { name: string; lengthM: number; widthM: number; heightM: number }
): Promise<BoxType> {
  const response = await fetch(`${BASE}/api/box-types`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  await assertOk(response, "Tạo loại thùng thất bại");
  return response.json();
}

export async function updateBoxType(
  token: string,
  id: number,
  payload: { name: string; lengthM: number; widthM: number; heightM: number }
): Promise<BoxType> {
  const response = await fetch(`${BASE}/api/box-types/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  await assertOk(response, "Cập nhật loại thùng thất bại");
  return response.json();
}

export async function deleteBoxType(token: string, id: number): Promise<void> {
  const response = await fetch(`${BASE}/api/box-types/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await assertOk(response, "Xóa loại thùng thất bại");
}
