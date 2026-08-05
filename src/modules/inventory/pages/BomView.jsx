/**
 * Client Component — BomView.jsx
 *
 * BOM (Bill of Materials) page. Ties a project to the materials it needs,
 * with template loading, manual line-item editing, and stock status per SKU.
 */
"use client";

import "./BomView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, X, Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Warehouse, Truck, ClipboardList, Columns, Settings,
  ArrowLeftRight, FileText, Download, Save, AlertTriangle,
  PackageCheck, Layers,
} from "lucide-react";
import {
  Button, Card, Input, Badge, toastSuccess, toastError,
} from "@/shared/components/ui";
import { useRouter } from "next/navigation";
import { INVENTORY_VIEWS } from "../data/inventory.data";
import { loadBomTemplateDetailsAction } from "../data/inventory.actions";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label inventory-form-label">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent, danger }) {
  return (
    <Card className={`bom-stat-card${danger ? " bom-stat-card--danger" : ""}`}>
      <div className="bom-stat-label">{label}</div>
      <div className="bom-stat-value" style={{ color: danger ? "var(--psb-status-suspended)" : (accent || "var(--psb-gold)") }}>{value}</div>
    </Card>
  );
}

// ─── MOCK PROJECTS ──────────────────────────────────────────

const MOCK_PROJECT = {
  id: 4821,
  title: "AFV 24' × 50' 14G — Miller job site",
};

// ─── Status badge helper ────────────────────────────────────

function LineStatusBadge({ required, available }) {
  const inStock = available >= required;
  return (
    <Badge
      variant={inStock ? "active" : "pending"}
      className="bom-status-badge"
    >
      {inStock ? "In stock" : "Short"}
    </Badge>
  );
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function BomView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState("bom");

  // Destructure server-loaded data
  const items = data?.items || [];
  const allWarehouses = data?.warehouses || [];
  const stockLevels = data?.stockLevels || [];
  const bomTemplates = data?.bomTemplates || [];

  // ─── BOM state ──────────────────────────────────────────────

  const [projectId, setProjectId] = useState(MOCK_PROJECT.id);
  const [projectTitle, setProjectTitle] = useState(MOCK_PROJECT.title);
  const [assignedWarehouse, setAssignedWarehouse] = useState("");
  const [lineItems, setLineItems] = useState([]);

  // Template search state
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Create-new-BOM state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    buildingSpec: "",
    size: "",
    gauge: "",
  });

  // Manual add-item state
  const [showAddItemRow, setShowAddItemRow] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    sku: "",
    name: "",
    requiredQty: 1,
    warehouseId: "",
  });

  // Loaded flag
  useEffect(() => { setLoaded(true); }, []);

  // Auto-open drawer on desktop; close on mobile; respond to resize
  useEffect(() => {
    const checkWidth = () => {
      setDrawerOpen(window.innerWidth >= 992);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Auto-select first warehouse
  useEffect(() => {
    if (!assignedWarehouse && allWarehouses.length > 0) {
      setAssignedWarehouse(String(allWarehouses[0].id));
    }
  }, [allWarehouses, assignedWarehouse]);

  // ─── Navigation ─────────────────────────────────────────────

  const handleNavClick = useCallback((viewId) => {
    if (viewId === "boards") {
      router.push("/inventory/board");
      return;
    }
    if (viewId === "boardSetup") {
      router.push("/inventory/board/manage");
      return;
    }
    if (viewId === "transaction") {
      router.push("/inventory/transaction");
      return;
    }
    if (viewId === "bom") {
      return; // Already here
    }
    router.push("/inventory");
  }, [router]);

  // ─── Warehouse helpers ──────────────────────────────────────

  const warehouseName = useCallback(
    (id) => (allWarehouses || []).find((w) => String(w.id) === String(id))?.name || "Unknown",
    [allWarehouses],
  );

  // Get available quantity for an item at a warehouse
  const getAvailableQty = useCallback(
    (itemId, whId) => {
      const stock = stockLevels.find(
        (sl) =>
          String(sl.item_id) === String(itemId) &&
          String(sl.warehouse_id) === String(whId),
      );
      return stock?.quantity || 0;
    },
    [stockLevels],
  );

  // ─── Normalize DB templates into shape expected by dropdown ──

  const templates = useMemo(
    () =>
      (bomTemplates || []).map((t) => ({
        id: t.id,
        name: t.project_name || t.name || "",
        spec: t.spec || "",
      })),
    [bomTemplates],
  );

  // ─── Template search filtering ──────────────────────────────

  const filteredTemplates = useMemo(() => {
    const q = (templateSearch || "").trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.spec.toLowerCase().includes(q),
    );
  }, [templateSearch, templates]);

  const handleLoadTemplate = useCallback(async () => {
    if (!selectedTemplate) {
      toastError("Please select a template first.");
      return;
    }
    try {
      const details = await loadBomTemplateDetailsAction(selectedTemplate);
      if (!details || details.length === 0) {
        toastError("No line items found for the selected template.");
        return;
      }
      const lines = details.map((d, idx) => ({
        id: Date.now() + idx,
        sku: d.inv_s_inventoryitem?.sku || "",
        name: d.inv_s_inventoryitem?.name || "",
        requiredQty: Number(d.required_qty) || 1,
        warehouseId: assignedWarehouse,
      }));
      setLineItems(lines);
      setTemplateSearch("");
      setTemplateDropdownOpen(false);
      setSelectedTemplate(null);
      toastSuccess(`Template "${templates.find((t) => t.id === selectedTemplate)?.name}" loaded.`);
    } catch (err) {
      toastError("Failed to load template details.");
      console.error(err);
    }
  }, [selectedTemplate, assignedWarehouse, templates]);

  // ─── Line item helpers ──────────────────────────────────────

  const addLineItem = useCallback(() => {
    const newItem = {
      id: Date.now(),
      sku: newItemForm.sku || "",
      name: newItemForm.name || "",
      requiredQty: Number(newItemForm.requiredQty) || 1,
      warehouseId: newItemForm.warehouseId || assignedWarehouse,
    };
    setLineItems((prev) => [...prev, newItem]);
    setNewItemForm({ sku: "", name: "", requiredQty: 1, warehouseId: "" });
    setShowAddItemRow(false);
  }, [newItemForm, assignedWarehouse]);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // ─── Computed metrics ───────────────────────────────────────

  const metrics = useMemo(() => {
    const lineCount = lineItems.length;
    const estMaterialCost = lineItems.reduce((sum, item) => {
      const dbItem = items.find((i) => String(i.sku) === String(item.sku));
      const cost = dbItem?.cost || 0;
      return sum + (Number(item.requiredQty) || 0) * cost;
    }, 0);
    const itemsShort = lineItems.filter((item) => {
      const available = getAvailableQty(item.sku
        ? (items.find((i) => String(i.sku) === String(item.sku))?.id)
        : null, item.warehouseId);
      return Number(item.requiredQty) > available;
    }).length;
    return { lineCount, estMaterialCost, itemsShort };
  }, [lineItems, items, getAvailableQty]);

  // ─── Handlers ───────────────────────────────────────────────

  const handleExport = useCallback(() => {
    toastSuccess("Export triggered (PDF/CSV — placeholder).");
  }, []);

  const handleSaveAsTemplate = useCallback(() => {
    toastSuccess("BOM saved as new template (placeholder).");
  }, []);

  const handleAllocateStock = useCallback(() => {
    if (lineItems.length === 0) {
      toastError("No line items to allocate.");
      return;
    }
    if (metrics.itemsShort > 0) {
      toastError(`${metrics.itemsShort} item(s) are short — resolve before allocating.`);
      return;
    }
    toastSuccess("Stock allocated — handing off to pick/dispatch (placeholder).");
  }, [lineItems, metrics.itemsShort]);

  const handleCreateNewBom = useCallback(() => {
    if (!createForm.buildingSpec || !createForm.size || !createForm.gauge) {
      toastError("Please fill in building spec, size, and gauge.");
      return;
    }
    const title = `${createForm.buildingSpec} ${createForm.size} ${createForm.gauge}`;
    setProjectTitle(title);
    const structuralLines = [
      { id: Date.now() + 1, sku: "PNL-RF-1426", name: "Roof Panel 14G 26\"", requiredQty: 24, warehouseId: assignedWarehouse },
      { id: Date.now() + 2, sku: "PNL-WL-1410", name: "Wall Panel 14G 10'", requiredQty: 32, warehouseId: assignedWarehouse },
      { id: Date.now() + 3, sku: "LEG-ADJ-14G", name: "Adjustable Leg 14G", requiredQty: 12, warehouseId: assignedWarehouse },
      { id: Date.now() + 4, sku: "TRS-24-14G", name: "Truss 24' 14G", requiredQty: 8, warehouseId: assignedWarehouse },
    ];
    setLineItems(structuralLines);
    setShowCreateForm(false);
    setCreateForm({ buildingSpec: "", size: "", gauge: "" });
    toastSuccess("New BOM created with pre-filled structural items.");
  }, [createForm, assignedWarehouse]);

  if (!loaded) {
    return <div className="inventory-loading">Loading BOM screen...</div>;
  }

  //#endregion

  // --- BOM content (shared between standalone and embedded) ---
  const bomContent = (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="bom-page-header">
        <div className="bom-header-left">
          <div className="bom-header-meta">
            <span className="bom-header-meta-label">Assigned warehouse:</span>
            <select
              className="form-select bom-warehouse-select"
              value={assignedWarehouse}
              onChange={(e) => setAssignedWarehouse(e.target.value)}
            >
              <option value="">Select warehouse</option>
              {allWarehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bom-header-actions">
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={handleExport}
            disabled={lineItems.length === 0}
          >
            <Download size={14} /> Export
          </Button>
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={handleSaveAsTemplate}
            disabled={lineItems.length === 0}
          >
            <Save size={14} /> Save as template
          </Button>
        </div>
      </div>

      {/* ═══ TWO PATHS — Load template OR Create new BOM ═══ */}
      <div className="bom-entry-section">
        {/* Path A — Load template */}
        <div className="bom-entry-card">
          <div className="bom-entry-card-header">
            <FileText size={18} />
            <span>Load a predefined template</span>
          </div>
          <div className="bom-entry-card-body">
            <div className="bom-template-search-wrap">
              <Search size={16} className="bom-template-search-icon" />
              <input
                type="text"
                className="form-control bom-template-search-input"
                placeholder='Search templates, e.g. "AFV 24×50 14G"'
                value={templateSearch}
                onChange={(e) => {
                  setTemplateSearch(e.target.value);
                  setTemplateDropdownOpen(e.target.value.trim().length > 0);
                  setSelectedTemplate(null);
                }}
                onFocus={() => {
                  if (templateSearch.trim().length > 0) setTemplateDropdownOpen(true);
                }}
              />
              {templateDropdownOpen && filteredTemplates.length > 0 && (
                <ul className="bom-template-dropdown">
                  {filteredTemplates.map((t) => (
                    <li
                      key={t.id}
                      className={`bom-template-dropdown-item${selectedTemplate === t.id ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedTemplate(t.id);
                        setTemplateSearch(t.name);
                        setTemplateDropdownOpen(false);
                      }}
                    >
                      <span className="bom-template-dd-name">{t.name}</span>
                      <span className="bom-template-dd-spec">{t.spec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              type="button"
              variant="success"
              size="sm"
              className="bom-entry-btn"
              onClick={handleLoadTemplate}
            >
              <Layers size={14} /> Load template
            </Button>
          </div>
        </div>

        {/* "Or" divider */}
        <div className="bom-or-divider">
          <span className="bom-or-divider-text">or</span>
        </div>

        {/* Path B — Create new BOM */}
        <div className="bom-entry-card">
          <div className="bom-entry-card-header">
            <Plus size={18} />
            <span>Create new BOM</span>
          </div>
          <div className="bom-entry-card-body">
            {!showCreateForm ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="bom-entry-btn"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus size={14} /> Create new BOM
              </Button>
            ) : (
              <div className="bom-create-form">
                <Field label="Building spec">
                  <Input
                    value={createForm.buildingSpec}
                    onChange={(e) => setCreateForm({ ...createForm, buildingSpec: e.target.value })}
                    placeholder='e.g. AFV, RV Carport, Utility'
                  />
                </Field>
                <Field label="Size">
                  <Input
                    value={createForm.size}
                    onChange={(e) => setCreateForm({ ...createForm, size: e.target.value })}
                    placeholder="e.g. 24' × 50'"
                  />
                </Field>
                <Field label="Gauge">
                  <select
                    className="form-select"
                    value={createForm.gauge}
                    onChange={(e) => setCreateForm({ ...createForm, gauge: e.target.value })}
                  >
                    <option value="">Select gauge</option>
                    <option value="14G">14 Gauge</option>
                    <option value="12G">12 Gauge</option>
                    <option value="16G">16 Gauge</option>
                  </select>
                </Field>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={handleCreateNewBom}
                  >
                    Create BOM
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SUMMARY METRICS ═══ */}
      <div className="bom-stat-row">
        <StatCard label="Line items" value={metrics.lineCount} />
        <StatCard label="Est. material cost" value={`$${metrics.estMaterialCost.toFixed(2)}`} />
        <StatCard label="Items short" value={metrics.itemsShort} danger={metrics.itemsShort > 0} />
      </div>

      {/* ═══ LINE-ITEM TABLE ═══ */}
      <Card className="bom-table-card">
        <div className="bom-table-toolbar">
          <span className="bom-table-title">Line items</span>
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={() => setShowAddItemRow((prev) => !prev)}
          >
            <Plus size={14} /> Add item
          </Button>
        </div>

        {showAddItemRow && (
          <div className="bom-add-item-row">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="SKU"
              value={newItemForm.sku}
              onChange={(e) => setNewItemForm({ ...newItemForm, sku: e.target.value })}
            />
            <input
              type="text"
              className="form-control form-control-sm bom-add-item-name"
              placeholder="Item name"
              value={newItemForm.name}
              onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
            />
            <input
              type="number"
              className="form-control form-control-sm bom-add-item-qty"
              placeholder="Qty"
              min={1}
              value={newItemForm.requiredQty}
              onChange={(e) => setNewItemForm({ ...newItemForm, requiredQty: e.target.value })}
            />
            <select
              className="form-select form-select-sm bom-add-item-wh"
              value={newItemForm.warehouseId}
              onChange={(e) => setNewItemForm({ ...newItemForm, warehouseId: e.target.value })}
            >
              <option value="">Warehouse</option>
              {allWarehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
            <Button type="button" variant="success" size="sm" onClick={addLineItem}>Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddItemRow(false)}>
              <X size={14} />
            </Button>
          </div>
        )}

        <div className="bom-table-wrap">
          <table className="bom-table">
            <thead>
              <tr>
                <th>Item / SKU</th>
                <th className="bom-col-num">Required</th>
                <th className="bom-col-num">Available</th>
                <th>Warehouse</th>
                <th className="bom-col-status">Status</th>
                <th className="bom-col-action"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="bom-table-empty">
                    No line items yet. Load a template, create a new BOM, or add items manually.
                  </td>
                </tr>
              )}
              {lineItems.map((item) => {
                const dbItem = items.find((i) => String(i.sku) === String(item.sku));
                const available = dbItem ? getAvailableQty(dbItem.id, item.warehouseId) : 0;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="bom-item-name">{item.name || "—"}</div>
                      <div className="bom-item-sku">{item.sku || "—"}</div>
                    </td>
                    <td className="bom-col-num">
                      <input
                        type="number"
                        className="form-control form-control-sm bom-input-num"
                        value={item.requiredQty}
                        onChange={(e) => updateLineItem(item.id, "requiredQty", e.target.value)}
                        min={0}
                      />
                    </td>
                    <td className="bom-col-num bom-available-cell">
                      <span className={available < (Number(item.requiredQty) || 0) ? "bom-short" : ""}>
                        {available}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select form-select-sm bom-wh-select"
                        value={item.warehouseId || ""}
                        onChange={(e) => updateLineItem(item.id, "warehouseId", e.target.value)}
                      >
                        <option value="">—</option>
                        {allWarehouses.map((w) => (
                          <option key={w.id} value={String(w.id)}>{w.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="bom-col-status">
                      <LineStatusBadge required={Number(item.requiredQty) || 0} available={available} />
                    </td>
                    <td className="bom-col-action">
                      <button
                        type="button"
                        className="bom-remove-btn"
                        onClick={() => removeLineItem(item.id)}
                        title="Remove line"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ ALLOCATE STOCK ═══ */}
      <div className="bom-allocate-section">
        <Button
          type="button"
          variant="success"
          className="bom-allocate-btn"
          onClick={handleAllocateStock}
          disabled={lineItems.length === 0}
        >
          <PackageCheck size={18} /> Allocate stock
        </Button>
        {metrics.itemsShort > 0 && lineItems.length > 0 && (
          <div className="bom-short-warning">
            <AlertTriangle size={14} />
            <span>{metrics.itemsShort} item(s) are short — review before allocating.</span>
          </div>
        )}
      </div>
    </div>
  );

  // --- Embedded mode: no sidebar, no layout wrapper ---
  if (hideSidebar) {
    return bomContent;
  }

  // --- Standalone: full layout with sidebar ---
  return (
    <div className="inventory-module-layout">
      <div
        className={`inventory-drawer-overlay${drawerOpen ? " is-open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside className={`inventory-sidebar${drawerOpen ? " is-open" : ""}`}>
        <div className="inventory-sidebar-brand">
          <button
            className="inventory-drawer-toggle"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          >
            <Menu size={18} />
          </button>
          <div className="inventory-sidebar-brand-text">
            <div className="inventory-sidebar-title">PSB IMS</div>
          </div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => {
            const iconMap = {
              LayoutDashboard, BarChart3, Package, Wrench,
              Warehouse, Truck, ArrowLeftRight, ClipboardList, Columns, Settings,
              Layers,
            };
            const isActive = n.id === "bom" || view === n.id;
            const IconComponent = iconMap[n.icon];
            return (
              <button
                key={n.id}
                onClick={() => handleNavClick(n.id)}
                className={`inventory-sidebar-nav-item${isActive ? " is-active" : ""}`}
                title={n.label}
              >
                {IconComponent && <IconComponent size={18} className="inventory-sidebar-nav-icon" />}
                <span className="inventory-sidebar-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="inventory-main">
        <button
          className="inventory-drawer-toggle-mobile"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        {bomContent}
      </main>
    </div>
  );
}

//#endregion