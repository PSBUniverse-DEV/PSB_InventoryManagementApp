/**
 * Client Component — ProjectBomDetailView.jsx
 *
 * View/Edit a single Project BOM record. Loads BOM header + line items
 * from inv_t_bom / inv_t_bom_details. Supports read-only view and edit modes.
 */
"use client";

import "./BomView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Save, Pencil, X, Plus, FileText, PackageCheck,
} from "lucide-react";
import {
  Button, Card, Badge, toastSuccess, toastError,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  loadProjectBomByIdAction,
  updateProjectBomAction,
  allocateBomStockAction,
  loadAllocatedQuantitiesAction,
} from "../data/inventory.actions";

// ─── Status badge helpers ────────────────────────────────────

function BomStatusBadge({ statusName }) {
  const name = (statusName || "").toLowerCase();
  let variant = "pending";
  if (name === "approved" || name === "completed") variant = "active";
  else if (name === "draft" || name === "saved") variant = "inactive";
  else if (name === "pending approval") variant = "warning";
  else if (name === "cancelled" || name === "recalled") variant = "failed";

  return (
    <Badge variant={variant} className="bom-status-badge">
      {statusName || "Draft"}
    </Badge>
  );
}

function LineStatusBadge({ required, available, hasActivePO, hasActivePR, poNumbers, prNumbers }) {
  const inStock = available >= required;
  if (inStock) {
    return (
      <Badge variant="active" className="bom-status-badge">
        In stock
      </Badge>
    );
  }
  if (hasActivePO) {
    const poList = (poNumbers || []).join(", ");
    return (
      <Badge variant="info" className="bom-status-badge">
        On Order{poList ? ` (${poList})` : " (PO)"}
      </Badge>
    );
  }
  if (hasActivePR) {
    const prList = (prNumbers || []).join(", ");
    return (
      <Badge variant="warning" className="bom-status-badge">
        Requested{prList ? ` (${prList})` : " (PR)"}
      </Badge>
    );
  }
  return (
    <Badge variant="pending" className="bom-status-badge">
      Short
    </Badge>
  );
}

// ─── Formatting helpers ─────────────────────────────────────

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

function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

// ─── Temp ID helpers ────────────────────────────────────────

const TEMP_ID_PREFIX = "tmp-";

function createTempId() {
  return `${TEMP_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function ProjectBomDetailView({
  bomId,
  mode = "view",
  onBack,
  onNavigate,
  items = [],
  stockLevels = [],
  purchaseRequests = [],
  purchaseRequestItems = [],
  purchaseOrders = [],
  purchaseOrderItems = [],
}) {
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(mode === "edit");
  const [allocateBusy, setAllocateBusy] = useState(false);
  const [allocatedByItem, setAllocatedByItem] = useState({});

  // Editable fields
  const [editRemarks, setEditRemarks] = useState("");
  const [editLineItems, setEditLineItems] = useState([]);

  // ─── Load BOM data ─────────────────────────────────────────

  const loadBom = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadProjectBomByIdAction(bomId);
      setBom(data);
      setEditRemarks(data.remarks || "");
      setEditLineItems((data.lineItems || []).map((li) => ({ ...li })));
    } catch (err) {
      toastError("Failed to load BOM details.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => {
    loadBom();
  }, [loadBom]);

  // Load allocated quantities
  useEffect(() => {
    const loadAllocated = async () => {
      try {
        const result = await loadAllocatedQuantitiesAction();
        setAllocatedByItem(result || {});
      } catch (err) {
        console.error("Failed to load allocated quantities:", err);
      }
    };
    loadAllocated();
  }, []);

  // ─── Active PR/PO lookup per item SKU ──────────────────────

  const itemProcurementStatus = useMemo(() => {
    const map = new Map();

    const activePRMap = new Map();
    for (const pr of purchaseRequests) {
      const status = (pr.status || pr.pr_status || "").toLowerCase();
      if (status !== "completed" && status !== "cancelled") {
        activePRMap.set(pr.id, pr.pr_no || "");
      }
    }

    for (const pri of purchaseRequestItems) {
      const prId = pri.pr_id ?? pri.purchaseRequestId;
      const prNo = activePRMap.get(prId);
      if (prId != null && prNo != null) {
        const sku = pri.itemSku || pri.item_sku || "";
        if (sku) {
          const entry = map.get(sku) || { hasActivePR: false, hasActivePO: false, prNumbers: [], poNumbers: [] };
          entry.hasActivePR = true;
          if (!entry.prNumbers.includes(prNo)) entry.prNumbers.push(prNo);
          map.set(sku, entry);
        }
      }
    }

    const activePOMap = new Map();
    for (const po of purchaseOrders) {
      const status = (po.status || po.po_status || "").toLowerCase();
      if (status !== "completed" && status !== "cancelled") {
        activePOMap.set(po.id, po.po_no || "");
      }
    }

    for (const poi of purchaseOrderItems) {
      const poId = poi.po_id ?? poi.purchaseOrderId;
      const poNo = activePOMap.get(poId);
      if (poId != null && poNo != null) {
        const sku = poi.itemSku || poi.item_sku || "";
        if (sku) {
          const entry = map.get(sku) || { hasActivePR: false, hasActivePO: false, prNumbers: [], poNumbers: [] };
          entry.hasActivePO = true;
          if (!entry.poNumbers.includes(poNo)) entry.poNumbers.push(poNo);
          map.set(sku, entry);
        }
      }
    }

    return map;
  }, [purchaseRequests, purchaseRequestItems, purchaseOrders, purchaseOrderItems]);

  // ─── Get available qty for an item ─────────────────────────

  const getAvailableQty = useCallback(
    (itemId) => {
      const totalStock = stockLevels
        .filter((sl) => String(sl.item_id) === String(itemId))
        .reduce((sum, sl) => sum + (Number(sl.quantity) || 0), 0);
      const allocated = allocatedByItem[itemId] || 0;
      return totalStock - allocated;
    },
    [stockLevels, allocatedByItem],
  );

  // ─── Line item helpers ─────────────────────────────────────

  const addLineItem = useCallback(() => {
    setEditLineItems((prev) => [...prev, {
      id: createTempId(),
      itemId: null,
      sku: "",
      name: "",
      cost: 0,
      quantity: 1,
      uomId: null,
      uomName: "",
      uomAbbreviation: "",
      remarks: "",
    }]);
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setEditLineItems((prev) =>
      prev.map((item) =>
        String(item.id) === String(id) ? { ...item, [field]: value } : item,
      ),
    );
  }, []);

  const removeLineItem = useCallback((id) => {
    setEditLineItems((prev) => prev.filter((item) => String(item.id) !== String(id)));
  }, []);

  // ─── Save handler ──────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const lineItems = editLineItems
        .filter((li) => li.itemId)
        .map((li) => ({
          itemId: li.itemId,
          quantity: Number(li.quantity) || 0,
          uomId: li.uomId || null,
          remarks: li.remarks || null,
        }));

      const updated = await updateProjectBomAction(bomId, {
        remarks: editRemarks,
        lineItems,
      });

      setBom(updated);
      setEditRemarks(updated.remarks || "");
      setEditLineItems((updated.lineItems || []).map((li) => ({ ...li })));
      setEditMode(false);
      toastSuccess("BOM updated successfully.");
    } catch (err) {
      toastError("Failed to update BOM.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [bomId, editRemarks, editLineItems]);

  const handleCancelEdit = useCallback(() => {
    if (bom) {
      setEditRemarks(bom.remarks || "");
      setEditLineItems((bom.lineItems || []).map((li) => ({ ...li })));
    }
    setEditMode(false);
  }, [bom]);

  // ─── Computed metrics ──────────────────────────────────────

  const metrics = useMemo(() => {
    const lineItems = editMode ? editLineItems : (bom?.lineItems || []);
    const lineCount = lineItems.length;
    const estMaterialCost = lineItems.reduce((sum, li) => {
      return sum + (Number(li.quantity) || 0) * (Number(li.cost) || 0);
    }, 0);
    const itemsShort = lineItems.filter((li) => {
      const available = getAvailableQty(li.itemId);
      return available < (Number(li.quantity) || 0);
    }).length;
    return { lineCount, estMaterialCost, itemsShort };
  }, [bom, editLineItems, editMode, getAvailableQty]);

  // ─── Allocate Stock handler ────────────────────────────────

  const handleAllocateStock = useCallback(async () => {
    const sourceItems = editMode ? editLineItems : (bom?.lineItems || []);
    if (sourceItems.length === 0) {
      toastError("No line items to allocate.");
      return;
    }
    setAllocateBusy(true);
    try {
      const lineItems = sourceItems
        .filter((li) => {
          if (!li.itemId) return false;
          const available = getAvailableQty(li.itemId);
          return available >= (Number(li.quantity) || 0);
        })
        .map((li) => ({
          bomDetailsId: li.id || null,
          itemId: li.itemId,
          itemName: li.name || li.sku || "",
          sku: li.sku || "",
          quantity: Number(li.quantity) || 0,
        }));

      if (lineItems.length === 0) {
        toastError("No in-stock items to allocate.");
        setAllocateBusy(false);
        return;
      }

      const skippedCount = sourceItems.filter((li) => li.itemId).length - lineItems.length;

      await allocateBomStockAction(bomId, {
        warehouseId: null,
        lineItems,
      });

      toastSuccess(`${lineItems.length} item(s) allocated successfully.${skippedCount > 0 ? ` ${skippedCount} short item(s) skipped.` : ""}`);
    } catch (err) {
      toastError("Failed to allocate stock.");
      console.error(err);
    } finally {
      setAllocateBusy(false);
    }
  }, [bomId, editMode, editLineItems, bom, getAvailableQty]);

  // ─── Create PR handler ─────────────────────────────────────

  const handleCreatePR = useCallback(() => {
    const sourceItems = editMode ? editLineItems : (bom?.lineItems || []);
    const shortItems = sourceItems.filter((li) => {
      const available = getAvailableQty(li.itemId);
      return li.itemId && available < (Number(li.quantity) || 0);
    });

    if (shortItems.length === 0) {
      toastError("No short items to create a purchase request for.");
      return;
    }

    const prLineItems = shortItems.map((li) => ({
      item_id: li.itemId,
      itemName: li.name || li.sku || "",
      itemSku: li.sku || "",
      quantity: Math.max(0, (Number(li.quantity) || 0) - getAvailableQty(li.itemId)),
      uom_id: li.uomId || null,
      est_unit_cost: li.cost || 0,
    }));

    if (onNavigate) {
      onNavigate("procurement", { lineItems: prLineItems, remarks: `BOM: ${bom?.bomNo || "—"}` });
    }
  }, [editMode, editLineItems, bom, getAvailableQty, onNavigate]);

  // ─── TableZ columns ────────────────────────────────────────

  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Item",
        sortable: true,
        render: (row) => {
          if (editMode) {
            return (
              <select
                className="form-select form-select-sm"
                value={row.sku || ""}
                onChange={(e) => {
                  const selectedItem = items.find((i) => String(i.sku) === e.target.value);
                  updateLineItem(row.id, "sku", e.target.value);
                  updateLineItem(row.id, "name", selectedItem?.name || "");
                  updateLineItem(row.id, "itemId", selectedItem?.id || selectedItem?.item_id || null);
                  updateLineItem(row.id, "cost", selectedItem?.cost || 0);
                  updateLineItem(row.id, "uomId", selectedItem?.unit_id || null);
                  updateLineItem(row.id, "uomName", "");
                  updateLineItem(row.id, "uomAbbreviation", "");
                }}
              >
                <option value="">— Select item —</option>
                {items.map((item) => (
                  <option key={item.id} value={item.sku}>
                    {item.name} ({item.sku})
                  </option>
                ))}
              </select>
            );
          }
          return (
            <span style={{ fontWeight: 500 }}>
              {row.name || row.sku || "—"}
            </span>
          );
        },
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
        key: "quantity",
        label: "Qty",
        sortable: true,
        align: "center",
        render: (row) => {
          if (editMode) {
            return (
              <input
                type="number"
                className="form-control form-control-sm bom-input-num"
                value={row.quantity}
                onChange={(e) => updateLineItem(row.id, "quantity", e.target.value)}
                min={0}
                style={{ width: "80px", display: "inline-block" }}
              />
            );
          }
          return <span>{row.quantity}</span>;
        },
      },
      {
        key: "available",
        label: "Available",
        sortable: true,
        align: "center",
        render: (row) => {
          const available = getAvailableQty(row.itemId);
          const required = Number(row.quantity) || 0;
          return (
            <span className={available < required ? "bom-short" : ""}>
              {available}
            </span>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        align: "center",
        render: (row) => {
          const available = getAvailableQty(row.itemId);
          const required = Number(row.quantity) || 0;
          const procurement = itemProcurementStatus.get(row.sku) || {
            hasActivePR: false,
            hasActivePO: false,
            prNumbers: [],
            poNumbers: [],
          };
          return (
            <LineStatusBadge
              required={required}
              available={available}
              hasActivePO={procurement.hasActivePO}
              hasActivePR={procurement.hasActivePR}
              poNumbers={procurement.poNumbers}
              prNumbers={procurement.prNumbers}
            />
          );
        },
      },
      {
        key: "cost",
        label: "Unit Cost",
        sortable: true,
        align: "right",
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
            {formatCurrency(row.cost)}
          </span>
        ),
      },
      {
        key: "total",
        label: "Total",
        sortable: true,
        align: "right",
        render: (row) => {
          const total = (Number(row.quantity) || 0) * (Number(row.cost) || 0);
          return (
            <span style={{ fontFamily: "var(--psb-mono, monospace)", fontWeight: 600 }}>
              {formatCurrency(total)}
            </span>
          );
        },
      },
      {
        key: "remarks",
        label: "Remarks",
        sortable: true,
        render: (row) => {
          if (editMode) {
            return (
              <input
                type="text"
                className="form-control form-control-sm"
                value={row.remarks || ""}
                onChange={(e) => updateLineItem(row.id, "remarks", e.target.value)}
                placeholder="—"
                style={{ width: "120px" }}
              />
            );
          }
          return (
            <span style={{ color: "var(--psb-muted)", fontSize: "0.82rem" }}>
              {row.remarks || "—"}
            </span>
          );
        },
      },
    ],
    [editMode, updateLineItem, items, getAvailableQty, itemProcurementStatus],
  );

  const actions = useMemo(
    () => editMode
      ? [
          {
            key: "remove",
            label: "Remove",
            type: "danger",
            icon: "xmark",
            onClick: (row) => removeLineItem(row.id),
          },
        ]
      : [],
    [editMode, removeLineItem],
  );

  // ─── Loading state ─────────────────────────────────────────

  if (loading) {
    return <div className="inventory-loading">Loading BOM details...</div>;
  }

  if (!bom) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p>BOM not found.</p>
        {onBack && (
          <Button variant="outline-primary" size="sm" onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </Button>
        )}
      </div>
    );
  }

  //#endregion

  return (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="bom-page-header">
        <div className="bom-header-left">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                style={{ padding: "0.25rem" }}
              >
                <ArrowLeft size={18} />
              </Button>
            )}
            <div>
              <h2 style={{ margin: 0, fontFamily: "var(--psb-serif)", fontSize: "1.35rem", fontWeight: 700 }}>
                {bom.bomNo}
              </h2>
              <p style={{ margin: "0.25rem 0 0", color: "var(--psb-muted)", fontSize: "0.85rem" }}>
                {bom.projectName || "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="bom-header-actions">
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={handleAllocateStock}
            disabled={allocateBusy}
            title={metrics.itemsShort > 0 ? `${metrics.itemsShort} item(s) are short` : "Allocate stock for all line items"}
          >
            <PackageCheck size={14} /> {allocateBusy ? "Allocating..." : "Allocate Stock"}
          </Button>
          {!editMode ? (
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              onClick={() => setEditMode(true)}
            >
              <Pencil size={14} /> Edit
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X size={14} /> Cancel
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={14} /> {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ═══ DETAIL PANELS ═══ */}
      <div className="bom-detail-panels">
        {/* Left — BOM Info */}
        <Card className="bom-project-detail-card">
          <div className="bom-project-detail-header">
            <span><strong>Bill of Materials Header Detail</strong></span>
           
          </div>
           <br/>
          <div className="bom-project-detail-body">
            <div className="bom-project-detail-row">
              <span className="bom-project-detail-label">BOM No: </span>
              <span className="bom-project-detail-value bom-project-detail-mono">
                <b>{bom.bomNo}</b>
              </span>
            </div>
            
            <div className="bom-project-detail-row">
              <span className="bom-project-detail-label">Project Spec: </span>
              <span className="bom-project-detail-value">
                <b>{bom.bomtSpec || "—"}</b>
              </span>
            </div>
            {/* <div className="bom-project-detail-row">
              <span className="bom-project-detail-label">Template ID</span>
              <span className="bom-project-detail-value bom-project-detail-mono">
                {bom.bomTempId != null ? bom.bomTempId : "—"}
              </span>
            </div> */}
            <div className="bom-project-detail-row">
              <span className="bom-project-detail-label">Date Created: </span>
              <span className="bom-project-detail-value">
                <b>{formatDate(bom.createdAt)}</b>
              </span>
            </div>
            <div className="bom-project-detail-row">
              <span className="bom-project-detail-label">Status: </span>
              <span className="bom-project-detail-value">
                <BomStatusBadge statusName={bom.statusName} />
              </span>
            </div>
            <div className="bom-project-detail-row" style={{ alignItems: "flex-start" }}>
              <span className="bom-project-detail-label">Remarks:  </span>
              {editMode ? (
                <textarea
                  className="form-control"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={3}
                  style={{ flex: 1, fontSize: "0.85rem" }}
                  placeholder="Add remarks..."
                />
              ) : (
                <span className="bom-project-detail-value" style={{ color: "var(--psb-muted)" }}>
                 <b>   {bom.remarks || "—"} </b>
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Right — Customer Info */}
        <Card className="bom-project-info-card">
          <div className="bom-project-detail-header">
            <span><strong>Customer Information</strong></span>
          </div>
          <br/>
          <div className="bom-project-detail-body">
            {bom.customer ? (
              <>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Client Name: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.clientName || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Address: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.formattedAddress || bom.customer.addressLine1 || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">City: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.city || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">State: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.state || "—"}{bom.customer.stateCode ? ` (${bom.customer.stateCode})` : ""}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Postal Code: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.postalCode || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Country: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.country || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Dealer</span>
                  <span className="bom-project-detail-value"><b>{bom.customer.dealer || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Invoice #: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.invoiceNumber || "—"}</b></span>
                </div>
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Order Received: </span>
                  <span className="bom-project-detail-value"><b>{bom.customer.orderReceivedAt ? new Date(bom.customer.orderReceivedAt).toLocaleDateString() : "—"}</b></span>
                </div>
              </>
            ) : (
              <div className="bom-customer-empty">No customer information available.</div>
            )}
          </div>
        </Card>
      </div>

      {/* ═══ SUMMARY METRICS ═══ */}
      <div className="bom-stat-row">
        <div className="bom-stat-card">
          <div className="bom-stat-label">Line items</div>
          <div className="bom-stat-value" style={{ color: "var(--psb-gold)" }}>{metrics.lineCount}</div>
        </div>
        <div className="bom-stat-card">
          <div className="bom-stat-label">Est. material cost</div>
          <div className="bom-stat-value" style={{ color: "var(--psb-gold)" }}>{formatCurrency(metrics.estMaterialCost)}</div>
        </div>
      </div>

      {/* ═══ LINE-ITEM TABLE ═══ */}
      <Card className="bom-table-card">
        <div className="bom-table-toolbar">
          <span className="bom-table-title">Line items</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleCreatePR}
              disabled={metrics.itemsShort === 0}
              title={metrics.itemsShort === 0 ? "No short items" : `Create PR for ${metrics.itemsShort} short item(s)`}
            >
              <FileText size={14} /> Create PR
            </Button>
            {editMode && (
              <Button
                type="button"
                variant="outline-primary"
                size="sm"
                onClick={addLineItem}
              >
                <Plus size={14} /> Add item
              </Button>
            )}
          </div>
        </div>

        <TableZ
          data={editMode ? editLineItems : (bom.lineItems || [])}
          columns={columns}
          actions={actions}
          rowIdKey="id"
          searchPlaceholder="Search line items..."
          emptyMessage="No line items found for this BOM."
        />
      </Card>
    </div>
  );
}

//#endregion