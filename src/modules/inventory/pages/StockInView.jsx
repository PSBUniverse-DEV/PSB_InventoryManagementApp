"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle, Plus, RefreshCw, X, Save, Trash2,
} from "lucide-react";
import {
  Button, Card, Input, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  logTransactionAction,
  createStockLevelAction,
} from "../data/inventory.actions";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateRefNo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `PO-${num}`;
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function StockInView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);

  const items = data?.items || [];
  const warehouses = data?.warehouses || [];
  const suppliers = data?.suppliers || [];
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

  // Form state — warehouse is at form level, not per line item
  const [form, setForm] = useState({
    refNo: generateRefNo(),
    date: new Date().toISOString().slice(0, 10),
    warehouseId: "",
    deliveryNo: "",
    supplierId: "",
    remarks: "",
  });

  // Line items state (no warehouse per item)
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
      { id: Date.now(), itemId: "", quantity: "" },
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

  // --- Submit ---

  const handleSubmit = useCallback(async () => {
    if (lineItems.length === 0) {
      showToast("Add at least one line item.", "error");
      return;
    }
    if (!form.warehouseId) {
      showToast("Please select a warehouse.", "error");
      return;
    }

    const invalid = lineItems.some(
      (li) => !li.itemId || !li.quantity || Number(li.quantity) <= 0
    );
    if (invalid) {
      showToast("Please fill all fields for each line item.", "error");
      return;
    }

    setIsBusy(true);
    try {
      const whName = warehouses.find((w) => String(w.id) === String(form.warehouseId))?.name || "Unknown";
      for (const li of lineItems) {
        const qty = Number(li.quantity);
        const item = itemMap[String(li.itemId)];

        await createStockLevelAction({
          itemId: li.itemId,
          warehouseId: form.warehouseId,
          quantity: qty,
          unitId: item?.unit_id || null,
          supplierId: form.supplierId || null,
          poNo: form.refNo,
          deliveryNo: form.deliveryNo || null,
          remarks: form.remarks || null,
        });

        await logTransactionAction({
          type: "Stock In",
          itemId: li.itemId,
          itemName: item?.name || "Unknown",
          sku: item?.sku || "",
          warehouseId: form.warehouseId,
          warehouseName: whName,
          detail: `Received +${qty} ${unitForItem(li.itemId)}`,
          qtyChange: qty,
          supplierId: form.supplierId || null,
          referenceNo: form.refNo,
        }).catch(() => {});
      }

      showToast(`${lineItems.length} item(s) received successfully.`);
      setLineItems([]);
      setForm((prev) => ({ ...prev, refNo: generateRefNo(), remarks: "" }));
      refresh();
    } catch (err) {
      showToast(err?.message || "Failed to record stock in.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [lineItems, form, itemMap, warehouses, unitForItem, showToast, refresh]);

  // Line items columns for TableZ — no warehouse column
  const lineItemColumns = useMemo(
    () => [
      {
        key: "itemId",
        label: "Item",
        sortable: false,
        render: (row) => {
          return (
            <select
              className="form-select form-select-sm"
              value={row.itemId}
              onChange={(e) => updateLineItem(row.id, "itemId", e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select item</option>
              {materialItems.map((i) => (
                <option key={i.id} value={String(i.id)}>
                  {i.name} ({i.sku})
                </option>
              ))}
            </select>
          );
        },
      },
      {
        key: "quantity",
        label: "Qty",
        sortable: false,
        align: "center",
        render: (row) => (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
            <input
              type="number"
              className="form-control form-control-sm"
              value={row.quantity}
              onChange={(e) => updateLineItem(row.id, "quantity", e.target.value)}
              placeholder="0"
              min="1"
              style={{ width: "60px", textAlign: "center" }}
            />
            <span className="text-muted small">{unitForItem(row.itemId)}</span>
          </div>
        ),
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
    [materialItems, updateLineItem, removeLineItem, unitForItem]
  );

  // --- Embedded vs standalone rendering ---
  if (hideSidebar) {
    return (
      <div className="tx-form-page">
        {/* Header */}
        <div className="tx-form-header">
          <div>
            <h1 className="tx-form-title">
              <ArrowDownCircle size={22} className="tx-form-icon-in" />
              Stock In
            </h1>
            <p className="tx-form-subtitle">Receive inventory into the warehouse.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isBusy}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        <div className="tx-form-layout tx-form-layout--full">
          <div className="tx-form-main">
            <Card className="tx-form-card">
              {/* Form header info */}
              <div className="tx-form-card-header">
                <div className="tx-form-field-row">
                  <div className="tx-form-field">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label className="tx-form-label">Reference #</label>
                        <Input
                          value={form.refNo}
                          onChange={(e) => updateForm("refNo", e.target.value)}
                          placeholder="Auto-generated"
                        />
                      </div>
                      <div>
                        <label className="tx-form-label">Delivery No.</label>
                        <Input
                          value={form.deliveryNo}
                          onChange={(e) => updateForm("deliveryNo", e.target.value)}
                          placeholder="e.g. DL-001"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="tx-form-field">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label className="tx-form-label">Warehouse</label>
                        <select
                          className="form-select"
                          value={form.warehouseId}
                          onChange={(e) => updateForm("warehouseId", e.target.value)}
                        >
                          <option value="">Select warehouse</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={String(w.id)}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="tx-form-label">Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={form.date}
                          onChange={(e) => updateForm("date", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supplier & Remarks */}
              <div className="tx-form-section">
                <div className="tx-form-field-row">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Supplier</label>
                    <select
                      className="form-select"
                      value={form.supplierId}
                      onChange={(e) => updateForm("supplierId", e.target.value)}
                    >
                      <option value="">Select supplier (optional)</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="tx-form-field">
                    <label className="tx-form-label">Remarks</label>
                    <Input
                      value={form.remarks}
                      onChange={(e) => updateForm("remarks", e.target.value)}
                      placeholder="Delivery notes, PO reference, etc."
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
                  variant="success"
                  size="md"
                  onClick={handleSubmit}
                  loading={isBusy}
                >
                  <Save size={14} /> Confirm Stock In
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Standalone: render with full sidebar navigation (legacy separate page)
  return null;
}