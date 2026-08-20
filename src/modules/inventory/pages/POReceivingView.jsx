"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle, RefreshCw, Save,
} from "lucide-react";
import {
  Button, Card, Input, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  loadOpenPOsAction,
  receivePOItemsAction,
} from "../data/inventory.actions";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function POReceivingView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);
  const [openPOs, setOpenPOs] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [loading, setLoading] = useState(true);

  const warehouses = data?.warehouses || [];

  // Form state
  const [form, setForm] = useState({
    warehouseId: "",
    deliveryNo: "",
    remarks: "",
  });

  // Receive quantities per line item
  const [receiveQtys, setReceiveQtys] = useState({});

  // ─── Load open POs ─────────────────────────────────────────

  const loadPOs = useCallback(async () => {
    setLoading(true);
    try {
      const pos = await loadOpenPOsAction();
      setOpenPOs(pos);
    } catch (err) {
      toastError("Failed to load purchase orders.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPOs();
  }, [loadPOs]);

  const refresh = useCallback(() => router.refresh(), [router]);

  // ─── PO selection ──────────────────────────────────────────

  const handleSelectPO = useCallback((poId) => {
    const po = openPOs.find((p) => String(p.id) === String(poId));
    setSelectedPO(po || null);
    // Reset receive quantities
    const qtys = {};
    if (po?.lineItems) {
      po.lineItems.forEach((li) => {
        const remaining = Math.max(0, (li.orderedQty || 0) - (li.receivedQty || 0));
        qtys[li.id] = remaining;
      });
    }
    setReceiveQtys(qtys);
  }, [openPOs]);

  const updateForm = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateReceiveQty = (lineItemId, value) => {
    setReceiveQtys((prev) => ({ ...prev, [lineItemId]: value }));
  };

  // ─── Submit ────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedPO) {
      toastError("Please select a purchase order.", "error");
      return;
    }
    if (!form.warehouseId) {
      toastError("Please select a receiving warehouse.", "error");
      return;
    }

    const items = (selectedPO.lineItems || [])
      .filter((li) => {
        const qty = Number(receiveQtys[li.id]) || 0;
        return qty > 0;
      })
      .map((li) => ({
        itemId: li.itemId,
        name: li.name,
        sku: li.sku,
        uomId: li.uomId,
        receiveQty: Number(receiveQtys[li.id]) || 0,
      }));

    if (items.length === 0) {
      toastError("Enter at least one quantity to receive.", "error");
      return;
    }

    setIsBusy(true);
    try {
      await receivePOItemsAction(selectedPO.id, {
        items,
        warehouseId: form.warehouseId,
        deliveryNo: form.deliveryNo || null,
        remarks: form.remarks || null,
      });

      toastSuccess(`${items.length} item(s) received for ${selectedPO.poNo}.`);
      // Reset receive qty inputs to remaining quantities
      const resetQtys = {};
      (selectedPO.lineItems || []).forEach((li) => {
        const remaining = Math.max(0, (li.orderedQty || 0) - (li.receivedQty || 0));
        resetQtys[li.id] = remaining;
      });
      setReceiveQtys(resetQtys);
      setForm((prev) => ({ ...prev, deliveryNo: "", remarks: "" }));
      refresh();
      loadPOs();
    } catch (err) {
      toastError(err?.message || "Failed to record receipt.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [selectedPO, receiveQtys, form, refresh, loadPOs]);

  // ─── PO list columns ───────────────────────────────────────

  const poListColumns = useMemo(
    () => [
      {
        key: "poNo",
        label: "PO No.",
        sortable: true,
        render: (row) => (
          <span style={{ fontWeight: 600, fontFamily: "var(--psb-mono, monospace)" }}>
            {row.poNo || "—"}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        align: "center",
        render: (row) => (
          <Badge variant={row.status === "Approved" ? "active" : "pending"}>
            {row.status || "—"}
          </Badge>
        ),
      },
    ],
    [],
  );

  // ─── Line items columns ────────────────────────────────────

  const lineItemColumns = useMemo(
    () => [
      {
        key: "name",
        label: "Item",
        sortable: true,
        render: (row) => (
          <span style={{ fontWeight: 500 }}>
            {row.name || row.sku || "—"}
          </span>
        ),
      },
      {
        key: "sku",
        label: "SKU",
        sortable: true,
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
            {row.sku || "—"}
          </span>
        ),
      },
      {
        key: "uom",
        label: "UOM",
        sortable: true,
        align: "center",
        render: (row) => (
          <span style={{ fontSize: "0.82rem", color: "var(--psb-muted)" }}>
            {row.uomAbbreviation || row.uomName || "—"}
          </span>
        ),
      },
      {
        key: "orderedQty",
        label: "Ordered",
        sortable: true,
        align: "center",
        render: (row) => <span>{row.orderedQty}</span>,
      },
      {
        key: "receivedQty",
        label: "Received",
        sortable: true,
        align: "center",
        render: (row) => (
          <span style={{ color: row.receivedQty > 0 ? "var(--psb-status-active)" : "var(--psb-muted)" }}>
            {row.receivedQty}
          </span>
        ),
      },
      {
        key: "receiveQty",
        label: "Qty to Receive",
        sortable: false,
        align: "center",
        render: (row) => {
          const remaining = Math.max(0, (row.orderedQty || 0) - (row.receivedQty || 0));
          return (
            <input
              type="number"
              className="form-control form-control-sm"
              value={receiveQtys[row.id] ?? remaining}
              onChange={(e) => updateReceiveQty(row.id, e.target.value)}
              min={0}
              max={remaining}
              style={{ width: "90px", display: "inline-block" }}
            />
          );
        },
      },
      {
        key: "unitPrice",
        label: "Unit Price",
        sortable: true,
        align: "right",
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
            {formatCurrency(row.unitPrice)}
          </span>
        ),
      },
      {
        key: "total",
        label: "Line Total",
        sortable: true,
        align: "right",
        render: (row) => {
          const qty = Number(receiveQtys[row.id]) || 0;
          const total = qty * (Number(row.unitPrice) || 0);
          return (
            <span style={{ fontFamily: "var(--psb-mono, monospace)", fontWeight: 600 }}>
              {formatCurrency(total)}
            </span>
          );
        },
      },
    ],
    [receiveQtys],
  );

  // ─── Computed metrics ──────────────────────────────────────

  const metrics = useMemo(() => {
    if (!selectedPO) return { totalItems: 0, totalToReceive: 0, totalCost: 0 };
    const items = selectedPO.lineItems || [];
    const totalToReceive = items.reduce((sum, li) => {
      return sum + (Number(receiveQtys[li.id]) || 0);
    }, 0);
    const totalCost = items.reduce((sum, li) => {
      const qty = Number(receiveQtys[li.id]) || 0;
      return sum + qty * (Number(li.unitPrice) || 0);
    }, 0);
    return { totalItems: items.length, totalToReceive, totalCost };
  }, [selectedPO, receiveQtys]);

  // ─── Content ───────────────────────────────────────────────

  const content = (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="inventory-view-header">
        <div>
          <h1 className="inventory-page-title" style={{ margin: 0 }}>
            Materials Receiving
          </h1>
          <p className="inventory-page-desc">
            Receive items against open purchase orders.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadPOs}
            disabled={isBusy}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* ═══ TWO-PANEL LAYOUT ═══ */}
      <div className="receiving-split-layout">
        {/* ─── LEFT PANEL: PO List Table ─────────────────────── */}
        <div className="receiving-left-panel">
          <Card className="bom-table-card" style={{ height: "100%" }}>
            <div className="bom-table-toolbar">
              <span className="bom-table-title">Purchase Orders</span>
            </div>
            <TableZ
              data={openPOs}
              columns={poListColumns}
              rowIdKey="id"
              selectedRowId={selectedPO?.id || null}
              onRowClick={(row) => handleSelectPO(row.id)}
              searchPlaceholder="Search POs..."
              emptyMessage={loading ? "Loading..." : "No open purchase orders."}
              loading={loading}
            />
          </Card>
        </div>

        {/* ─── RIGHT PANEL: Details / Form ───────────────────── */}
        <div className="receiving-right-panel">
          {selectedPO ? (
            <>
              {/* PO Info Card */}
              <Card style={{ marginBottom: "1rem" }}>
                <div style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                      {selectedPO.poNo}
                    </h3>
                    <Badge variant={selectedPO.status === "Approved" ? "active" : "pending"}>
                      {selectedPO.status}
                    </Badge>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Supplier: </span>
                      <b>{selectedPO.supplierName}</b>
                    </div>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Date: </span>
                      <b>{formatDate(selectedPO.createdAt)}</b>
                    </div>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Est. Total: </span>
                      <b>{formatCurrency(selectedPO.estTotalCost)}</b>
                    </div>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Delivery To: </span>
                      <b>{selectedPO.deliveryLocation || "—"}</b>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Receiving Form */}
              <Card style={{ marginBottom: "1rem" }}>
                <div style={{ padding: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>Receiving Details</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label className="form-label" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                        Receiving Warehouse
                      </label>
                      <select
                        className="form-select form-select-sm"
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
                      <label className="form-label" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                        Delivery No.
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={form.deliveryNo}
                        onChange={(e) => updateForm("deliveryNo", e.target.value)}
                        placeholder="e.g. DL-001"
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                        Remarks
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={form.remarks}
                        onChange={(e) => updateForm("remarks", e.target.value)}
                        placeholder="Notes"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Summary Metrics */}
              <div className="inventory-stat-row" style={{ marginBottom: "1rem" }}>
                <div className="inventory-stat-card">
                  <div className="inventory-stat-label">Items</div>
                  <div className="inventory-stat-value" style={{ color: "var(--psb-gold)" }}>
                    {metrics.totalItems}
                  </div>
                </div>
                <div className="inventory-stat-card">
                  <div className="inventory-stat-label">Qty to Receive</div>
                  <div className="inventory-stat-value" style={{ color: "var(--psb-gold)" }}>
                    {metrics.totalToReceive}
                  </div>
                </div>
                <div className="inventory-stat-card">
                  <div className="inventory-stat-label">Receiving Cost</div>
                  <div className="inventory-stat-value" style={{ color: "var(--psb-gold)" }}>
                    {formatCurrency(metrics.totalCost)}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <Card className="bom-table-card" style={{ marginBottom: "1rem" }}>
                <div className="bom-table-toolbar">
                  <span className="bom-table-title">Line Items</span>
                </div>
                <TableZ
                  data={selectedPO.lineItems || []}
                  columns={lineItemColumns}
                  rowIdKey="id"
                  searchPlaceholder="Search line items..."
                  emptyMessage="No line items for this PO."
                />
              </Card>

              {/* Submit Button */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2rem" }}>
                <Button
                  type="button"
                  variant="success"
                  size="md"
                  onClick={handleSubmit}
                  disabled={isBusy || metrics.totalToReceive === 0}
                >
                  <ArrowDownCircle size={16} /> {isBusy ? "Processing..." : "Receive Items"}
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--psb-muted)" }}>
                Select a purchase order from the table to begin receiving items.
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  if (hideSidebar) return content;

  return (
    <div className="inventory-module-layout">
      <main className="inventory-main" style={{ padding: "1.5rem" }}>
        {content}
      </main>
    </div>
  );
}