"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpCircle, RefreshCw, X,
} from "lucide-react";
import {
  Button, Card, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  loadBOMsForReleaseAction,
  releaseBOMItemsAction,
} from "../data/inventory.actions";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
export default function BOMReleaseView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);
  const [boms, setBoms] = useState([]);
  const [selectedBOM, setSelectedBOM] = useState(null);
  const [loading, setLoading] = useState(true);

  const warehouses = data?.warehouses || [];

  // Form state
  const [form, setForm] = useState({
    warehouseId: "",
    remarks: "",
  });

  // Release quantities per line item
  const [releaseQtys, setReleaseQtys] = useState({});

  // ─── Load BOMs ─────────────────────────────────────────────

  const loadBOMs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadBOMsForReleaseAction();
      setBoms(result);
    } catch (err) {
      toastError("Failed to load BOMs.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBOMs();
  }, [loadBOMs]);

  const refresh = useCallback(() => router.refresh(), [router]);

  // ─── BOM selection ─────────────────────────────────────────

  const handleSelectBOM = useCallback((bomId) => {
    const bom = boms.find((b) => String(b.id) === String(bomId));
    setSelectedBOM(bom || null);
    // Reset release quantities to 0
    const qtys = {};
    if (bom?.lineItems) {
      bom.lineItems.forEach((li) => {
        qtys[li.id] = 0;
      });
    }
    setReleaseQtys(qtys);
  }, [boms]);

  const updateForm = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateReleaseQty = (lineItemId, value) => {
    setReleaseQtys((prev) => ({ ...prev, [lineItemId]: value }));
  };

  // ─── Clear ─────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setSelectedBOM(null);
    setReleaseQtys({});
    setForm({ warehouseId: "", remarks: "" });
  }, []);

  // ─── Submit ────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedBOM) {
      toastError("Please select a BOM.", "error");
      return;
    }
    if (!form.warehouseId) {
      toastError("Please select a warehouse.", "error");
      return;
    }

    const items = (selectedBOM.lineItems || [])
      .filter((li) => {
        const qty = Number(releaseQtys[li.id]) || 0;
        return qty > 0;
      })
      .map((li) => ({
        bomDetailsId: li.id || null,
        itemId: li.itemId,
        name: li.name,
        sku: li.sku,
        uomId: li.uomId,
        releaseQty: Number(releaseQtys[li.id]) || 0,
      }));

    if (items.length === 0) {
      toastError("Enter at least one quantity to release.", "error");
      return;
    }

    setIsBusy(true);
    try {
      await releaseBOMItemsAction(selectedBOM.id, {
        items,
        warehouseId: form.warehouseId,
        remarks: form.remarks || null,
      });

      toastSuccess(`${items.length} item(s) released for ${selectedBOM.bomNo}.`);
      // Reset release qty inputs to 0 for all line items
      const resetQtys = {};
      (selectedBOM.lineItems || []).forEach((li) => {
        resetQtys[li.id] = 0;
      });
      setReleaseQtys(resetQtys);
      setForm((prev) => ({ ...prev, remarks: "" }));
      refresh();
      loadBOMs();
    } catch (err) {
      toastError(err?.message || "Failed to record release.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [selectedBOM, releaseQtys, form, refresh, loadBOMs]);

  // ─── BOM list columns ──────────────────────────────────────

  const bomListColumns = useMemo(
    () => [
      {
        key: "bomNo",
        label: "BOM No.",
        sortable: true,
        render: (row) => (
          <span style={{ fontWeight: 600, fontFamily: "var(--psb-mono, monospace)" }}>
            {row.bomNo || "—"}
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
        key: "requiredQty",
        label: "Required",
        sortable: true,
        align: "center",
        render: (row) => <span>{row.requiredQty}</span>,
      },
      {
        key: "availableQty",
        label: "Available",
        sortable: true,
        align: "center",
        render: (row) => (
          <span className={row.availableQty < row.requiredQty ? "bom-short" : ""}>
            {row.availableQty}
          </span>
        ),
      },
      {
        key: "releasedQty",
        label: "Released",
        sortable: true,
        align: "center",
        render: (row) => (
          <span style={{ color: row.releasedQty > 0 ? "var(--psb-status-active)" : "var(--psb-muted)" }}>
            {row.releasedQty || 0}
          </span>
        ),
      },
      {
        key: "releaseQty",
        label: "Qty to Release",
        sortable: false,
        align: "center",
        render: (row) => {
          const maxQty = Math.min(row.requiredQty, row.availableQty);
          return (
            <input
              type="number"
              className="form-control form-control-sm"
              value={releaseQtys[row.id] ?? 0}
              onChange={(e) => updateReleaseQty(row.id, e.target.value)}
              min={0}
              max={maxQty}
              style={{ width: "90px", display: "inline-block" }}
            />
          );
        },
      },
    ],
    [releaseQtys],
  );

  // ─── Computed metrics ──────────────────────────────────────

  const metrics = useMemo(() => {
    if (!selectedBOM) return { totalItems: 0, totalToRelease: 0 };
    const items = selectedBOM.lineItems || [];
    const totalToRelease = items.reduce((sum, li) => {
      return sum + (Number(releaseQtys[li.id]) || 0);
    }, 0);
    return { totalItems: items.length, totalToRelease };
  }, [selectedBOM, releaseQtys]);

  // ─── Content ───────────────────────────────────────────────

  const content = (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="inventory-view-header">
        <div>
          <h1 className="inventory-page-title" style={{ margin: 0 }}>
            Material Releasing
          </h1>
          <p className="inventory-page-desc">
            Release materials against a saved Bill of Materials.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadBOMs}
            disabled={isBusy}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* ═══ TWO-PANEL LAYOUT ═══ */}
      <div className="receiving-split-layout">
        {/* ─── LEFT PANEL: BOM List Table ────────────────────── */}
        <div className="receiving-left-panel">
          <Card className="bom-table-card" style={{ height: "100%" }}>
            <div className="bom-table-toolbar">
              <span className="bom-table-title">Bill of Materials</span>
            </div>
            <TableZ
              data={boms}
              columns={bomListColumns}
              rowIdKey="id"
              selectedRowId={selectedBOM?.id || null}
              onRowClick={(row) => handleSelectBOM(row.id)}
              searchPlaceholder="Search BOMs..."
              emptyMessage={loading ? "Loading..." : "No BOMs available for release."}
              loading={loading}
            />
          </Card>
        </div>

        {/* ─── RIGHT PANEL: Details / Form ───────────────────── */}
        <div className="receiving-right-panel">
          {selectedBOM ? (
            <>
              {/* BOM Info Card */}
              <Card style={{ marginBottom: "1rem" }}>
                <div style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                      {selectedBOM.bomNo}
                    </h3>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Customer: </span>
                      <b>{selectedBOM.projectName}</b>
                    </div>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Date: </span>
                      <b>{formatDate(selectedBOM.createdAt)}</b>
                    </div>
                    <div>
                      <span style={{ color: "var(--psb-muted)" }}>Spec: </span>
                      <b>{selectedBOM.spec || "—"}</b>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Release Form */}
              <Card style={{ marginBottom: "1rem" }}>
                <div style={{ padding: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>Release Details</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label className="form-label" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                        Warehouse
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
                  <div className="inventory-stat-label">Qty to Release</div>
                  <div className="inventory-stat-value" style={{ color: "var(--psb-gold)" }}>
                    {metrics.totalToRelease}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <Card className="bom-table-card" style={{ marginBottom: "1rem" }}>
                <div className="bom-table-toolbar">
                  <span className="bom-table-title">Line Items</span>
                </div>
                <TableZ
                  data={selectedBOM.lineItems || []}
                  columns={lineItemColumns}
                  rowIdKey="id"
                  searchPlaceholder="Search line items..."
                  emptyMessage="No line items for this BOM."
                />
              </Card>

              {/* Submit + Clear Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "2rem" }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={handleClear}
                  disabled={isBusy}
                >
                  <X size={16} /> Clear
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  onClick={handleSubmit}
                  disabled={isBusy || metrics.totalToRelease === 0}
                >
                  <ArrowUpCircle size={16} /> {isBusy ? "Processing..." : "Release Items"}
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--psb-muted)" }}>
                Select a Bill of Materials from the table to begin releasing items.
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