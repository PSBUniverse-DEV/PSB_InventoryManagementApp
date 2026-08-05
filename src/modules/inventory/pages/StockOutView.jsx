"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpCircle, Plus, RefreshCw, X, Save, Trash2,
} from "lucide-react";
import {
  Button, Card, Input, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  logTransactionAction,
  updateStockLevelAction,
  createStockLevelAction,
} from "../data/inventory.actions";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OUT_TYPES = ["Project Delivery", "Internal Usage", "Sales Order", "Other"];

function generateRefNo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `SO-${num}`;
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function StockOutView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);

  const items = data?.items || [];
  const warehouses = data?.warehouses || [];
  const stockLevels = data?.stockLevels || [];
  const config = data?.config || {};

  // Filter to materials only
  const materialItems = useMemo(
    () =>
      items.filter(
        (i) => (i.classification || "").toLowerCase() === "material"
      ),
    [items]
  );

  // Lookups
  const itemMap = useMemo(() => {
    const map = {};
    items.forEach((i) => {
      map[String(i.id)] = i;
    });
    return map;
  }, [items]);

  const unitLookup = useMemo(() => {
    const map = {};
    (config?.units || []).forEach((u) => {
      map[String(u.id)] = u.abbreviation || u.name;
    });
    return map;
  }, [config]);

  const unitForItem = useCallback(
    (itemId) => {
      const item = itemMap[String(itemId)];
      return item ? unitLookup[String(item.unit_id)] || "pcs" : "pcs";
    },
    [itemMap, unitLookup]
  );

  // Available stock per item → warehouse
  const availableStock = useMemo(() => {
    const map = {};
    stockLevels.forEach((sl) => {
      const key = `${sl.item_id}::${sl.warehouse_id}`;
      map[key] = (map[key] || 0) + (Number(sl.quantity) || 0);
    });
    return map;
  }, [stockLevels]);

  const getAvailable = useCallback(
    (itemId, warehouseId) =>
      availableStock[`${itemId}::${warehouseId}`] || 0,
    [availableStock]
  );

  // Form state
  const [form, setForm] = useState({
    refNo: generateRefNo(),
    date: new Date().toISOString().slice(0, 10),
    type: OUT_TYPES[0],
    project: "",
    deliverySite: "",
    handledBy: "",
    remarks: "",
  });

  // Line items state
  const [lineItems, setLineItems] = useState([]);

  const updateForm = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const refresh = useCallback(() => router.refresh(), [router]);

  const showToast = useCallback((msg, kind = "success") => {
    if (kind === "error") toastError(msg);
    else toastSuccess(msg);
  }, []);

  // --- Line item helpers ---

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { id: Date.now(), itemId: "", warehouseId: "", quantity: "" },
    ]);
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, [field]: value } : li))
    );
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }, []);

  // --- Submit with stock validation ---

  const handleSubmit = useCallback(async () => {
    if (lineItems.length === 0) {
      showToast("Add at least one line item.", "error");
      return;
    }

    const invalid = lineItems.some(
      (li) => !li.itemId || !li.warehouseId || !li.quantity || Number(li.quantity) <= 0
    );
    if (invalid) {
      showToast("Please fill all fields for each line item.", "error");
      return;
    }

    // Validate stock availability
    for (const li of lineItems) {
      const avail = getAvailable(li.itemId, li.warehouseId);
      const qty = Number(li.quantity);
      if (qty > avail) {
        const item = itemMap[String(li.itemId)];
        showToast(
          `"${item?.name || "Item"}" has only ${avail} ${unitForItem(li.itemId)} available.`,
          "error"
        );
        return;
      }
    }

    setIsBusy(true);
    try {
      for (const li of lineItems) {
        const qty = Number(li.quantity);
        const item = itemMap[String(li.itemId)];
        const whName = warehouses.find((w) => String(w.id) === String(li.warehouseId))?.name || "Unknown";

        // Deduct from existing stock level if found; otherwise create negative stock
        const existing = stockLevels.find(
          (sl) => String(sl.item_id) === String(li.itemId) && String(sl.warehouse_id) === String(li.warehouseId)
        );

        if (existing) {
          await updateStockLevelAction(existing.id, {
            itemId: li.itemId,
            warehouseId: li.warehouseId,
            quantity: Math.max(0, (Number(existing.quantity) || 0) - qty),
            unitId: item?.unit_id || null,
          });
        } else {
          await createStockLevelAction({
            itemId: li.itemId,
            warehouseId: li.warehouseId,
            quantity: -qty,
            unitId: item?.unit_id || null,
          });
        }

        await logTransactionAction({
          type: "Stock Out",
          itemId: li.itemId,
          itemName: item?.name || "Unknown",
          sku: item?.sku || "",
          warehouseId: li.warehouseId,
          warehouseName: whName,
          detail: `${form.type} — Issued -${qty} ${unitForItem(li.itemId)}`,
          qtyChange: -qty,
          project: form.project || null,
          referenceNo: form.refNo,
        }).catch(() => {});
      }

      showToast(`${lineItems.length} item(s) issued successfully.`);
      setLineItems([]);
      setForm((prev) => ({ ...prev, refNo: generateRefNo(), remarks: "" }));
      refresh();
    } catch (err) {
      showToast(err?.message || "Failed to record stock out.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [lineItems, form, itemMap, warehouses, stockLevels, unitForItem, getAvailable, showToast, refresh]);

  // Line items columns
  const lineItemColumns = useMemo(
    () => [
      {
        key: "itemId",
        label: "Item",
        sortable: false,
        render: (row) => (
          <select
            className="form-select form-select-sm"
            value={row.itemId}
            onChange={(e) => updateLineItem(row.id, "itemId", e.target.value)}
            style={{ width: "100%", minWidth: "180px" }}
          >
            <option value="">Select item</option>
            {materialItems.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.name} ({i.sku})
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "warehouseId",
        label: "Warehouse",
        sortable: false,
        render: (row) => (
          <select
            className="form-select form-select-sm"
            value={row.warehouseId}
            onChange={(e) => updateLineItem(row.id, "warehouseId", e.target.value)}
            style={{ width: "100%", minWidth: "150px" }}
          >
            <option value="">Select warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "available",
        label: "Available",
        sortable: false,
        align: "center",
        render: (row) => {
          const avail = row.itemId && row.warehouseId
            ? getAvailable(row.itemId, row.warehouseId)
            : 0;
          return (
            <span className={`inventory-mono small ${avail === 0 ? "text-danger" : "text-muted"}`}>
              {avail}
            </span>
          );
        },
      },
      {
        key: "quantity",
        label: "Qty to Issue",
        sortable: false,
        align: "center",
        render: (row) => {
          const avail = row.itemId && row.warehouseId
            ? getAvailable(row.itemId, row.warehouseId)
            : 0;
          const qty = Number(row.quantity) || 0;
          const overLimit = qty > avail;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
              <input
                type="number"
                className={`form-control form-control-sm ${overLimit ? "is-invalid" : ""}`}
                value={row.quantity}
                onChange={(e) => updateLineItem(row.id, "quantity", e.target.value)}
                placeholder="0"
                min="1"
                max={avail || 0}
                style={{ width: "80px", textAlign: "center" }}
              />
              <span className="text-muted small">{unitForItem(row.itemId)}</span>
            </div>
          );
        },
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        align: "center",
        render: (row) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeLineItem(row.id)}
            title="Remove item"
          >
            <Trash2 size={14} />
          </Button>
        ),
      },
    ],
    [materialItems, warehouses, updateLineItem, removeLineItem, getAvailable, unitForItem]
  );

  // --- Embedded vs standalone rendering ---
  if (hideSidebar) {
    // Embedded: just render the form content (no sidebar, no layout wrapper)
    return (
      <div className="tx-form-page">
        {/* Header */}
        <div className="tx-form-header">
          <div>
            <h1 className="tx-form-title">
              <ArrowUpCircle size={22} className="tx-form-icon-out" />
              Stock Out
            </h1>
            <p className="tx-form-subtitle">Issue inventory for projects, usage, or sales.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isBusy}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        <div className="tx-form-layout tx-form-layout--full">
          {/* Stock Out Form */}
          <div className="tx-form-main">
            <Card className="tx-form-card">
              {/* Form header info */}
              <div className="tx-form-card-header">
                <div className="tx-form-field-row">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Reference #</label>
                    <Input
                      value={form.refNo}
                      onChange={(e) => updateForm("refNo", e.target.value)}
                      placeholder="Auto-generated"
                    />
                  </div>
                  <div className="tx-form-field">
                    <label className="tx-form-label">Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.date}
                      onChange={(e) => updateForm("date", e.target.value)}
                    />
                  </div>
                </div>
                <div className="tx-form-field-row">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Type *</label>
                    <select
                      className="form-select"
                      value={form.type}
                      onChange={(e) => updateForm("type", e.target.value)}
                    >
                      {OUT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tx-form-field">
                    <label className="tx-form-label">Project</label>
                    <Input
                      value={form.project}
                      onChange={(e) => updateForm("project", e.target.value)}
                      placeholder="e.g. Project Alpha"
                    />
                  </div>
                </div>
                <div className="tx-form-field-row">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Delivery Site</label>
                    <Input
                      value={form.deliverySite}
                      onChange={(e) => updateForm("deliverySite", e.target.value)}
                      placeholder="e.g. Job Site B"
                    />
                  </div>
                  <div className="tx-form-field">
                    <label className="tx-form-label">Handled By</label>
                    <Input
                      value={form.handledBy}
                      onChange={(e) => updateForm("handledBy", e.target.value)}
                      placeholder="Crew member or supervisor name"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="tx-form-section">
                <div className="tx-form-section-header">
                  <h3>Line Items</h3>
                  <Button variant="success" size="sm" onClick={addLineItem} disabled={isBusy}>
                    <Plus size={14} /> Add Item
                  </Button>
                </div>
                {lineItems.length > 0 && (
                  <TableZ
                    data={lineItems}
                    columns={lineItemColumns}
                    rowIdKey="id"
                    hideSearch
                    hideFooter
                    emptyMessage=""
                  />
                )}
                {lineItems.length === 0 && (
                  <p className="tx-form-empty">No items added yet. Click "Add Item" to start.</p>
                )}
              </div>

              {/* Remarks */}
              <div className="tx-form-section">
                <div className="tx-form-field">
                  <label className="tx-form-label">Remarks</label>
                  <Input
                    value={form.remarks}
                    onChange={(e) => updateForm("remarks", e.target.value)}
                    placeholder="Reason, work order reference, etc."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="tx-form-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLineItems([]);
                    updateForm("remarks", "");
                  }}
                  disabled={isBusy}
                >
                  <X size={14} /> Clear Form
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleSubmit}
                  loading={isBusy}
                >
                  <Save size={14} /> Confirm Stock Out
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Standalone: render with full sidebar navigation (legacy separate page)
  return null; // This path is no longer used — kept for backward compatibility
}