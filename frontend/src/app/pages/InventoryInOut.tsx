"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Filter,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getRooms, getZones, type Room, type Zone } from "@/lib/zone-api";
import {
  createBoxType,
  createInventoryTransaction,
  deleteBoxType,
  getBoxTypes,
  getInventorySummary,
  getInventoryTransactions,
  updateBoxType,
  type BoxType,
  type InventorySummary,
  type InventoryTransaction,
  type TransactionType,
} from "@/lib/inventory-transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DraftItem = {
  foodName: string;
  foodType: string;
  boxCount: number;
  boxTypeId: number | "";
};

type BoxTypeForm = {
  name: string;
  lengthM: string;
  widthM: string;
  heightM: string;
};

const FOOD_TYPES = ["Thịt", "Hải sản", "Rau củ", "Khác"];
const EMPTY_SUMMARY: InventorySummary = {
  totalInBoxes: 0,
  totalOutBoxes: 0,
  estimatedStockBoxes: 0,
  totalInVolume: 0,
  totalOutVolume: 0,
  estimatedStockVolume: 0,
};

const EMPTY_BOX_TYPE_FORM: BoxTypeForm = {
  name: "",
  lengthM: "",
  widthM: "",
  heightM: "",
};

function newDraftItem(boxTypeId: number | "" = ""): DraftItem {
  return { foodName: "", foodType: "Thịt", boxCount: 1, boxTypeId };
}

function formatDateTime(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function numberValue(n: number | string | null | undefined): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;
  if (typeof n === "string") {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function positiveNumber(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatVolume(value: number | string | null | undefined): string {
  return `${numberValue(value).toFixed(3)} m3`;
}

function boxTypeLabel(boxType: BoxType): string {
  return `${boxType.name} (${numberValue(boxType.volumeM3).toFixed(3)} m3)`;
}

function boxDimensions(boxType?: Pick<BoxType, "lengthM" | "widthM" | "heightM"> | null): string {
  if (!boxType) return "-";
  return `${numberValue(boxType.lengthM).toFixed(3)} x ${numberValue(boxType.widthM).toFixed(3)} x ${numberValue(boxType.heightM).toFixed(3)} m`;
}

export default function InventoryInOutPage() {
  const { token, user } = useAuth();

  const [zones, setZones] = useState<Zone[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [boxTypes, setBoxTypes] = useState<BoxType[]>([]);

  const [selectedAreaId, setSelectedAreaId] = useState<number | "">("");
  const [selectedRoomId, setSelectedRoomId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);

  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [summary, setSummary] = useState<InventorySummary>(EMPTY_SUMMARY);

  const [activeTab, setActiveTab] = useState<TransactionType>("ALL");
  const [tableAreaFilter, setTableAreaFilter] = useState<number | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const [boxTypeForm, setBoxTypeForm] = useState<BoxTypeForm>(EMPTY_BOX_TYPE_FORM);
  const [editingBoxTypeId, setEditingBoxTypeId] = useState<number | null>(null);
  const [savingBoxType, setSavingBoxType] = useState(false);

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingTable, setLoadingTable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultBoxTypeId = boxTypes[0]?.boxTypeId ?? "";

  useEffect(() => {
    if (!token) return;
    const authToken = token;
    let active = true;

    async function bootstrap() {
      setLoadingInit(true);
      setError(null);
      try {
        const [zoneRows, boxTypeRows] = await Promise.all([getZones(authToken), getBoxTypes(authToken)]);
        if (!active) return;
        setZones(zoneRows);
        setBoxTypes(boxTypeRows);
        setItems((prev) =>
          prev.map((item) => (item.boxTypeId === "" && boxTypeRows[0] ? { ...item, boxTypeId: boxTypeRows[0].boxTypeId } : item))
        );

        if (zoneRows.length > 0) {
          const firstArea = zoneRows[0].areaId;
          setSelectedAreaId(firstArea);

          const roomRows = await getRooms(authToken, firstArea);
          if (!active) return;
          setRooms(roomRows);
          if (roomRows.length > 0) setSelectedRoomId(roomRows[0].roomId);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Không thể tải dữ liệu ban đầu");
      } finally {
        if (active) setLoadingInit(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const areaId = selectedAreaId === "" ? undefined : selectedAreaId;
    if (!token || areaId == null) {
      setRooms([]);
      setSelectedRoomId("");
      return;
    }

    const authToken = token;
    let active = true;
    async function loadRooms() {
      try {
        const roomRows = await getRooms(authToken, areaId);
        if (!active) return;
        setRooms(roomRows);
        setSelectedRoomId((prev) => {
          const hasPrev = roomRows.some((room) => room.roomId === prev);
          return hasPrev ? prev : (roomRows[0]?.roomId ?? "");
        });
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Không thể tải danh sách phòng");
      }
    }

    loadRooms();
    return () => {
      active = false;
    };
  }, [token, selectedAreaId]);

  useEffect(() => {
    if (!token) return;
    const authToken = token;
    let active = true;

    async function loadTableAndSummary() {
      setLoadingTable(true);
      try {
        const [txRows, sumRow] = await Promise.all([
          getInventoryTransactions(authToken, {
            type: activeTab,
            areaId: tableAreaFilter === "ALL" ? undefined : tableAreaFilter,
            query: search.trim() || undefined,
          }),
          getInventorySummary(authToken, tableAreaFilter === "ALL" ? undefined : tableAreaFilter),
        ]);

        if (!active) return;
        setTransactions(txRows);
        setSummary(sumRow);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Không thể tải dữ liệu giao dịch");
      } finally {
        if (active) setLoadingTable(false);
      }
    }

    loadTableAndSummary();
    return () => {
      active = false;
    };
  }, [token, activeTab, tableAreaFilter, search]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId]
  );

  const roomMaxVolume = numberValue(selectedRoom?.maxVolume);
  const roomUsedVolume = numberValue(selectedRoom?.currentVolume);
  const roomRemainingVolume = Math.max(0, roomMaxVolume - roomUsedVolume);
  const roomUsedPercent = roomMaxVolume > 0 ? Math.min(100, (roomUsedVolume / roomMaxVolume) * 100) : 0;

  const totalDraftBoxes = useMemo(
    () => items.reduce((sum, item) => sum + numberValue(item.boxCount), 0),
    [items]
  );

  const totalDraftVolume = useMemo(
    () =>
      items.reduce((sum, item) => {
        const boxType = boxTypes.find((type) => type.boxTypeId === item.boxTypeId);
        return sum + numberValue(item.boxCount) * numberValue(boxType?.volumeM3);
      }, 0),
    [boxTypes, items]
  );

  async function reloadBoxTypes(nextSelectedId?: number) {
    if (!token) return;
    const authToken = token;
    const rows = await getBoxTypes(authToken);
    setBoxTypes(rows);
    setItems((prev) =>
      prev.map((item) => {
        if (nextSelectedId != null) return { ...item, boxTypeId: item.boxTypeId === "" ? nextSelectedId : item.boxTypeId };
        if (item.boxTypeId !== "" && rows.some((row) => row.boxTypeId === item.boxTypeId)) return item;
        return { ...item, boxTypeId: rows[0]?.boxTypeId ?? "" };
      })
    );
  }

  async function submitTransaction(type: "IN" | "OUT") {
    if (!token) return;
    const authToken = token;
    if (selectedAreaId === "" || selectedRoomId === "") {
      setError("Vui lòng chọn khu vực và phòng bảo quản.");
      return;
    }
    if (boxTypes.length === 0) {
      setError("Vui lòng tạo ít nhất một loại thùng trước khi nhập/xuất hàng.");
      return;
    }

    const mappedItems = items.map((item) => ({
      foodName: item.foodName.trim(),
      foodType: item.foodType.trim(),
      boxCount: numberValue(item.boxCount),
      boxTypeId: typeof item.boxTypeId === "number" ? item.boxTypeId : null,
    }));

    const hasIncompleteRow = mappedItems.some(
      (item) => item.foodName && (!item.boxTypeId || item.boxCount <= 0)
    );
    if (hasIncompleteRow) {
      setError("Mỗi dòng sản phẩm cần có số thùng > 0 và loại thùng hợp lệ.");
      return;
    }

    const validItems = mappedItems
      .filter((item): item is { foodName: string; foodType: string; boxCount: number; boxTypeId: number } =>
        Boolean(item.foodName && item.boxTypeId && item.boxCount > 0)
      );

    if (validItems.length === 0) {
      setError("Vui lòng nhập ít nhất một sản phẩm hợp lệ.");
      return;
    }
    if (type === "IN" && roomMaxVolume > 0 && totalDraftVolume > roomRemainingVolume) {
      setError("Thể tích nhập vượt sức chứa còn lại của phòng.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createInventoryTransaction(authToken, {
        transactionType: type,
        areaId: selectedAreaId,
        roomId: selectedRoomId,
        note,
        items: validItems,
      });

      setNote("");
      setItems([newDraftItem(defaultBoxTypeId)]);

      const [txRows, sumRow, roomRows] = await Promise.all([
        getInventoryTransactions(authToken, {
          type: activeTab,
          areaId: tableAreaFilter === "ALL" ? undefined : tableAreaFilter,
          query: search.trim() || undefined,
        }),
        getInventorySummary(authToken, tableAreaFilter === "ALL" ? undefined : tableAreaFilter),
        getRooms(authToken, selectedAreaId),
      ]);
      setTransactions(txRows);
      setSummary(sumRow);
      setRooms(roomRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu giao dịch");
    } finally {
      setSubmitting(false);
    }
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, newDraftItem(defaultBoxTypeId)]);
  }

  function removeItem(index: number) {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function editBoxType(boxType: BoxType) {
    setEditingBoxTypeId(boxType.boxTypeId);
    setBoxTypeForm({
      name: boxType.name,
      lengthM: String(boxType.lengthM),
      widthM: String(boxType.widthM),
      heightM: String(boxType.heightM),
    });
  }

  function resetBoxTypeForm() {
    setEditingBoxTypeId(null);
    setBoxTypeForm(EMPTY_BOX_TYPE_FORM);
  }

  async function saveBoxType() {
    if (!token) return;
    const authToken = token;
    const name = boxTypeForm.name.trim();
    const lengthM = positiveNumber(boxTypeForm.lengthM);
    const widthM = positiveNumber(boxTypeForm.widthM);
    const heightM = positiveNumber(boxTypeForm.heightM);

    if (!name || lengthM == null || widthM == null || heightM == null) {
      setError("Loại thùng cần có tên, chiều dài, chiều rộng và chiều cao > 0.");
      return;
    }

    setSavingBoxType(true);
    setError(null);
    try {
      const payload = { name, lengthM, widthM, heightM };
      const saved = editingBoxTypeId == null
        ? await createBoxType(authToken, payload)
        : await updateBoxType(authToken, editingBoxTypeId, payload);
      await reloadBoxTypes(saved.boxTypeId);
      resetBoxTypeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu loại thùng");
    } finally {
      setSavingBoxType(false);
    }
  }

  async function removeBoxType(boxType: BoxType) {
    if (!token) return;
    const authToken = token;
    const ok = window.confirm(`Xóa loại thùng "${boxType.name}"? Giao dịch cũ vẫn giữ thể tích đã ghi nhận.`);
    if (!ok) return;

    setSavingBoxType(true);
    setError(null);
    try {
      await deleteBoxType(authToken, boxType.boxTypeId);
      await reloadBoxTypes();
      if (editingBoxTypeId === boxType.boxTypeId) resetBoxTypeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xóa loại thùng");
    } finally {
      setSavingBoxType(false);
    }
  }

  if (user?.role === "MAINTENANCE") {
    return <div className="p-6 text-muted-foreground">Bạn không có quyền thao tác nhập/xuất hàng.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Boxes className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Nhập / Xuất hàng</h1>
          <p className="text-xs text-muted-foreground">
            Quản lý tồn kho theo số thùng và loại thùng để tính sức chứa phòng đông lạnh.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="glass-card border-border/30 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tạo giao dịch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Khu vực</span>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={selectedAreaId}
                  onChange={(e) => setSelectedAreaId(e.target.value ? Number(e.target.value) : "")}
                  disabled={loadingInit || submitting}
                >
                  <option value="">Chọn khu vực</option>
                  {zones.map((zone) => (
                    <option key={zone.areaId} value={zone.areaId}>{zone.areaName}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Phòng bảo quản</span>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : "")}
                  disabled={loadingInit || submitting || rooms.length === 0}
                >
                  <option value="">Chọn phòng</option>
                  {rooms.map((room) => (
                    <option key={room.roomId} value={room.roomId}>{room.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-md border border-border/60 bg-secondary/20 p-3">
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Sức chứa tối đa</p>
                  <p className="font-semibold">{formatVolume(roomMaxVolume)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Đã sử dụng</p>
                  <p className="font-semibold text-primary">{formatVolume(roomUsedVolume)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Còn lại</p>
                  <p className="font-semibold text-emerald-500">{formatVolume(roomRemainingVolume)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${roomUsedPercent}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Danh sách sản phẩm</p>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Thêm dòng
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => {
                  const selectedBoxType = boxTypes.find((type) => type.boxTypeId === item.boxTypeId);
                  const itemVolume = numberValue(item.boxCount) * numberValue(selectedBoxType?.volumeM3);

                  return (
                    <div key={`item-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-3 md:grid-cols-12">
                      <label className="space-y-1 md:col-span-3">
                        <span className="text-xs text-muted-foreground">Tên sản phẩm</span>
                        <input
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          placeholder="VD: Cá hồi Na Uy"
                          value={item.foodName}
                          onChange={(e) => updateItem(index, { foodName: e.target.value })}
                          disabled={submitting}
                        />
                      </label>

                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs text-muted-foreground">Nhóm hàng</span>
                        <select
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          value={item.foodType}
                          onChange={(e) => updateItem(index, { foodType: e.target.value })}
                          disabled={submitting}
                        >
                          {FOOD_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs text-muted-foreground">Số thùng</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          value={item.boxCount}
                          onChange={(e) => updateItem(index, { boxCount: Number(e.target.value) })}
                          disabled={submitting}
                        />
                      </label>

                      <label className="space-y-1 md:col-span-3">
                        <span className="text-xs text-muted-foreground">Loại thùng</span>
                        <select
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          value={item.boxTypeId}
                          onChange={(e) => updateItem(index, { boxTypeId: e.target.value ? Number(e.target.value) : "" })}
                          disabled={submitting || boxTypes.length === 0}
                        >
                          <option value="">Chọn loại thùng</option>
                          {boxTypes.map((type) => (
                            <option key={type.boxTypeId} value={type.boxTypeId}>{boxTypeLabel(type)}</option>
                          ))}
                        </select>
                      </label>

                      <div className="space-y-1 md:col-span-1">
                        <span className="block text-xs text-muted-foreground">Tổng m3</span>
                        <div className="rounded-md border border-border/60 bg-secondary/20 px-2 py-1.5 text-sm">
                          {itemVolume.toFixed(3)}
                        </div>
                      </div>

                      <div className="flex items-end justify-end md:col-span-1">
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(index)} disabled={submitting || items.length === 1}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Ghi chú</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: giao từ nhà cung cấp ABC"
                disabled={submitting}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary/30 px-3 py-2 text-sm">
              <span>
                Tổng dự kiến: {totalDraftBoxes} thùng • {totalDraftVolume.toFixed(3)} m3
              </span>
              <div className="flex gap-2">
                <Button onClick={() => submitTransaction("IN")} disabled={submitting || loadingInit} className="gap-1.5">
                  <ArrowDownToLine className="h-4 w-4" /> Nhập hàng
                </Button>
                <Button variant="destructive" onClick={() => submitTransaction("OUT")} disabled={submitting || loadingInit} className="gap-1.5">
                  <ArrowUpFromLine className="h-4 w-4" /> Xuất hàng
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tổng nhập</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-500">{numberValue(summary.totalInBoxes)}</p>
              <p className="text-xs text-muted-foreground">{formatVolume(summary.totalInVolume)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tổng xuất</p>
              <p className="mt-1 text-2xl font-semibold text-amber-500">{numberValue(summary.totalOutBoxes)}</p>
              <p className="text-xs text-muted-foreground">{formatVolume(summary.totalOutVolume)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tồn ước tính</p>
              <p className="mt-1 text-2xl font-semibold text-primary">{numberValue(summary.estimatedStockBoxes)}</p>
              <p className="text-xs text-muted-foreground">{formatVolume(summary.estimatedStockVolume)}</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/30">
            <CardHeader>
              <CardTitle className="text-base">Loại thùng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">Tên loại thùng</span>
                  <input
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                    value={boxTypeForm.name}
                    onChange={(e) => setBoxTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="VD: Thùng hải sản 30L"
                    disabled={savingBoxType}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">Dài (m)</span>
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                    value={boxTypeForm.lengthM}
                    onChange={(e) => setBoxTypeForm((prev) => ({ ...prev, lengthM: e.target.value }))}
                    disabled={savingBoxType}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">Rộng (m)</span>
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                    value={boxTypeForm.widthM}
                    onChange={(e) => setBoxTypeForm((prev) => ({ ...prev, widthM: e.target.value }))}
                    disabled={savingBoxType}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">Cao (m)</span>
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                    value={boxTypeForm.heightM}
                    onChange={(e) => setBoxTypeForm((prev) => ({ ...prev, heightM: e.target.value }))}
                    disabled={savingBoxType}
                  />
                </label>
                <div className="space-y-1 text-sm">
                  <span className="block text-xs text-muted-foreground">Thể tích</span>
                  <div className="rounded-md border border-border/60 bg-secondary/20 px-2 py-1.5">
                    {formatVolume(
                      numberValue(boxTypeForm.lengthM) *
                        numberValue(boxTypeForm.widthM) *
                        numberValue(boxTypeForm.heightM)
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveBoxType} disabled={savingBoxType} className="gap-1.5">
                  <Save className="h-3.5 w-3.5" />
                  {editingBoxTypeId == null ? "Thêm loại" : "Lưu"}
                </Button>
                {editingBoxTypeId != null && (
                  <Button type="button" size="sm" variant="outline" onClick={resetBoxTypeForm} disabled={savingBoxType} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Hủy
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {boxTypes.length === 0 ? (
                  <p className="rounded-md border border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa có loại thùng.
                  </p>
                ) : (
                  boxTypes.map((type) => (
                    <div key={type.boxTypeId} className="rounded-md border border-border/60 p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{type.name}</p>
                          <p className="text-xs text-muted-foreground">{boxDimensions(type)}</p>
                          <p className="text-xs text-primary">{formatVolume(type.volumeM3)} / thùng</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => editBoxType(type)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeBoxType(type)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="glass-card border-border/30">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Bảng giao dịch</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "IN", "OUT"] as TransactionType[]).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={activeTab === tab ? "default" : "outline"}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "ALL" ? "Tất cả" : tab === "IN" ? "Nhập" : "Xuất"}
              </Button>
            ))}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  className="bg-transparent outline-none"
                  value={tableAreaFilter}
                  onChange={(e) => setTableAreaFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                >
                  <option value="ALL">Tất cả khu vực</option>
                  {zones.map((zone) => (
                    <option key={zone.areaId} value={zone.areaId}>{zone.areaName}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  className="bg-transparent outline-none"
                  placeholder="Tìm sản phẩm / loại thùng / ghi chú"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTable ? (
            <p className="text-sm text-muted-foreground">Đang tải giao dịch...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có giao dịch nào.</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.transactionId} className="rounded-md border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.transactionType === "IN" ? "default" : "destructive"}>
                        {tx.transactionType === "IN" ? "Nhập" : "Xuất"}
                      </Badge>
                      <span className="text-sm font-medium">{tx.areaName} • {tx.roomName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</span>
                  </div>

                  {tx.note && <p className="mt-1 text-sm text-muted-foreground">{tx.note}</p>}

                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1 pr-3">Sản phẩm</th>
                          <th className="py-1 pr-3">Nhóm</th>
                          <th className="py-1 pr-3">Loại thùng</th>
                          <th className="py-1 pr-3">Kích thước</th>
                          <th className="py-1 pr-3">Số thùng</th>
                          <th className="py-1 pr-3">m3/thùng</th>
                          <th className="py-1">Tổng m3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tx.items.map((item, idx) => (
                          <tr key={`tx-${tx.transactionId}-item-${idx}`} className="border-t border-border/40">
                            <td className="py-1.5 pr-3">{item.foodName}</td>
                            <td className="py-1.5 pr-3">{item.foodType ?? "-"}</td>
                            <td className="py-1.5 pr-3">{item.boxTypeName ?? "-"}</td>
                            <td className="py-1.5 pr-3">
                              {item.boxTypeId
                                ? boxDimensions({
                                    lengthM: numberValue(item.boxLengthM),
                                    widthM: numberValue(item.boxWidthM),
                                    heightM: numberValue(item.boxHeightM),
                                  })
                                : "-"}
                            </td>
                            <td className="py-1.5 pr-3">{numberValue(item.boxCount)}</td>
                            <td className="py-1.5 pr-3">{numberValue(item.unitVolume).toFixed(3)}</td>
                            <td className="py-1.5">{numberValue(item.totalVolume).toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
