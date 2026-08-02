/**
 * Client Component — InventoryView.jsx
 *
 * Displays inventory data bound from Supabase via server actions.
 * All mutations go through server actions and trigger a full page refresh.
 */
"use client";

import "./InventoryView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, RefreshCw,
  ArrowRightLeft, ArrowLeftRight, AlertTriangle, MapPin, User,
  PackageCheck, Warehouse, Pencil, Trash2, Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Truck, ClipboardList, Columns, Settings,
  Layers,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  INVENTORY_VIEWS,
  formatDateTime,
  getUnitName,
  getEquipmentStatusColor,
} from "../data/inventory.data";
import {
  createWarehouseAction,
  createItemAction,
  updateItemAction,
  transferItemAction,
  logTransactionAction,
  deleteItemAction,
  createStockLevelAction,
  updateStockLevelAction,
  deleteStockLevelAction,
  createSupplierAction,
  updateSupplierAction,
  deleteSupplierAction,
} from "../data/inventory.actions";
import { useRouter } from "next/navigation";
import MaterialFormModal from "./MaterialFormModal";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <Card className="inventory-stat-card">
      <div className="inventory-stat-label">{label}</div>
      <div className="inventory-stat-value" style={{ color: accent || "var(--psb-gold)" }}>{value}</div>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label inventory-form-label">{label}</label>
      {children}
    </div>
  );
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryView({ initialData }) {
  const router = useRouter();
  const data = initialData;
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterWh, setFilterWh] = useState("all");
  const [modal, setModal] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [form, setForm] = useState({});

  // MaterialFormModal state
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialModalMode, setMaterialModalMode] = useState("create");
  const [materialModalItem, setMaterialModalItem] = useState(null);

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

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const showToast = useCallback((msg, kind = "success") => {
    if (kind === "error") toastError(msg);
    else toastSuccess(msg);
  }, []);

  const whName = useCallback(
    (id) => (data?.warehouses || []).find((w) => String(w.id) === String(id))?.name || "Unknown",
    [data],
  );

  const classificationLookup = useMemo(() => {
    const map = {};
    (data?.config?.categories || []).forEach((c) => { map[String(c.id)] = c.name; });
    return map;
  }, [data]);

  const unitLookup = useMemo(() => {
    const map = {};
    (data?.config?.units || []).forEach((u) => { map[String(u.id)] = u.abbreviation; });
    return map;
  }, [data]);

  const itemUnitAbbrev = useCallback(
    (item) => unitLookup[String(item?.unit_id)] || "pcs",
    [unitLookup],
  );

  const statusLookup = useMemo(() => {
    const map = {};
    (data?.config?.statuses || []).forEach((s) => { map[String(s.id)] = s.name; });
    return map;
  }, [data]);

  const statusIdByName = useCallback(
    (name) => {
      const statuses = data?.config?.statuses || [];
      const found = statuses.find((s) => s.name === name);
      return found?.id || null;
    },
    [data],
  );
  //#endregion

//#region ─── Mutation helpers ────────────────────────────────────
  const runMutation = useCallback(async (fn, txEntry) => {
    if (isBusy) return;
        setIsBusy(true);

    try {
      await fn();
      if (txEntry) await logTransactionAction(txEntry).catch(() => {});
      refresh();
      showToast(txEntry?.detail || "Saved.");
    } catch (err) {
      showToast(err?.message || "Operation failed.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, refresh, showToast]);

  const items = data?.items || [];

  const materials = useMemo(
    () => items.filter((i) => String(i.classification || "").toLowerCase() === "material"),
    [items],
  );

  const equipmentList = useMemo(
    () => items.filter((i) => String(i.classification || "").toLowerCase() === "equipment"),
    [items],
  );

  const lowStock = useMemo(
    () => items.filter((i) => (i.quantity || 0) <= (i.min_threshold || 0)),
    [items],
  );

  const checkedOut = useMemo(
    () => items.filter((i) => statusLookup[String(i.status_id)] === "In Use").length,
    [items, statusLookup],
  );

  const filteredItems = useMemo(
    () => filterWh === "all" ? items : items.filter((i) => String(i.warehouse_id) === filterWh),
    [items, filterWh],
  );

  const filteredLowStock = useMemo(
    () => filteredItems.filter((i) => (i.quantity || 0) <= (i.min_threshold || 0)),
    [filteredItems],
  );

  const filteredCheckedOut = useMemo(
    () => filteredItems.filter((i) => statusLookup[String(i.status_id)] === "In Use").length,
    [filteredItems, statusLookup],
  );

  const filteredTransactions = useMemo(
    () => filterWh === "all"
      ? (data?.transactions || [])
      : (data?.transactions || []).filter((tx) => {
          // filter by warehouse_id on the txn row, or by linked item's warehouse_id
          if (tx.warehouse_id && String(tx.warehouse_id) === filterWh) return true;
          if (tx.to_warehouse_id && String(tx.to_warehouse_id) === filterWh) return true;
          const txItem = items.find((it) => String(it.id) === String(tx.item_id));
          return txItem && String(txItem.warehouse_id) === filterWh;
        }),
    [data?.transactions, items, filterWh],
  );

  const openModal = useCallback((type, item) => {
    if (item) {
      // Normalize snake_case DB fields to camelCase so form inputs pre-populate correctly.
      setForm({
        ...item,
        categoryId: item.categoryId ?? item.category_id,
        unitId: item.unitId ?? item.unit_id,
        warehouseId: item.warehouseId ?? item.warehouse_id,
        minThreshold: item.minThreshold ?? item.min_threshold,
        maxThreshold: item.maxThreshold ?? item.max_threshold ?? 0,
        reorderPoint: item.reorderPoint ?? item.reorder_point ?? 0,
        defaultReorderQty: item.defaultReorderQty ?? item.default_reorder_quantity ?? 0,
        wholesalePrice: item.wholesalePrice ?? item.wholesale_price,
        retailPrice: item.retailPrice ?? item.retail_price,
        statusId: item.statusId ?? item.status_id,
        supplierId: item.supplierId ?? item.supplier_id,
        trackingTypeId: item.trackingTypeId ?? item.tracking_type_id,
        itemId: item.itemId ?? item.item_id,
        binLocation: item.binLocation ?? item.bin_location,
        barcode: item.barcode ?? item.barcode ?? null,
        description: item.description ?? item.description ?? "",
        weight: item.weight ?? item.weight ?? null,
        length: item.length ?? item.length ?? null,
        width: item.width ?? item.width ?? null,
        height: item.height ?? item.height ?? null,
        color: item.color ?? item.color ?? null,
        gauge: item.gauge ?? item.gauge ?? null,
        specification: item.specification != null
          ? (typeof item.specification === "object" ? (item.specification.value || JSON.stringify(item.specification)) : String(item.specification))
          : "",
      });
    } else {
      setForm({});
    }
    setModal(type);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setForm({});
  }, []);

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
      router.push("/inventory/bom");
      return;
    }
    setView(viewId);
  }, [router]);

  //#endregion

//#region ─── Handlers ────────────────────────────────────────────
  const handleAddWarehouse = useCallback(() => {
    if (!form.name || !form.address) {
      showToast("Name and address required.", "error");
      return;
    }
    runMutation(
      () => createWarehouseAction(form),
      { type: "Warehouse added", itemName: form.name, detail: "New location registered", warehouseName: form.name, warehouseId: null },
    );
    closeModal();
  }, [form, runMutation, showToast, closeModal]);

  const handleAddItem = useCallback((category) => {
    if (!form.name || !form.sku || !form.warehouseId || !form.categoryId) {
      showToast("Name, SKU, category, and location required.", "error");
      return;
    }
    const wh = (data?.warehouses || []).find((w) => String(w.id) === String(form.warehouseId));
    runMutation(
      () => createItemAction({ ...form, categoryId: form.categoryId }),
      { type: `${category} added`, itemId: null, itemName: form.name, sku: form.sku, warehouseId: form.warehouseId, warehouseName: wh?.name || "Unknown" },
    );
    closeModal();
  }, [form, data, runMutation, showToast, closeModal]);

  // ─── MaterialFormModal save handler ─────────────────────────

  const handleMaterialFormSave = useCallback(
    async (savedMaterial) => {
      try {
        setIsBusy(true);

        // Map category name → categoryId
        const categories = data?.config?.categories || [];
        const categoryObj = categories.find(
          (c) => c.name === savedMaterial.category
        );
        const categoryId = categoryObj?.id || null;

        // Map status name → statusId
        const statuses = data?.config?.statuses || [];
        const statusObj = statuses.find(
          (s) => s.name === (savedMaterial.status || "Active")
        );
        const statusId = statusObj?.id || null;

        // Use first warehouse row's warehouse as primary, or null
        const primaryWhId =
          savedMaterial.warehouseRows?.length > 0
            ? Number(savedMaterial.warehouseRows[0].warehouseId)
            : null;

        const itemPayload = {
          name: savedMaterial.name,
          sku: savedMaterial.sku,
          barcode: savedMaterial.barcode || null,
          categoryId,
          unitId: savedMaterial.unitId,
          minThreshold: 0,
          maxThreshold: 0,
          reorderPoint: 0,
          defaultReorderQty: 0,
          cost: savedMaterial.lastPurchaseCost || 0,
          warehouseId: primaryWhId,
          statusId,
          wholesalePrice: savedMaterial.sellingPrice || null,
          retailPrice: null,
          supplierId: savedMaterial.supplierId || null,
          trackingTypeId: savedMaterial.trackingTypeId || null,
          classification: "Material",
        };

        // Create the item
        const createdItem = await createItemAction(itemPayload);

        // Create stock levels for each warehouse row
        if (savedMaterial.warehouseRows?.length > 0) {
          for (const row of savedMaterial.warehouseRows) {
            await createStockLevelAction({
              itemId: createdItem.item_id || createdItem.id,
              warehouseId: Number(row.warehouseId),
              quantity: 0,
              unitId: savedMaterial.unitId || null,
            }).catch(() => {});
          }
        }

        // Log transaction
        const wh = (data?.warehouses || []).find(
          (w) => String(w.id) === String(primaryWhId)
        );
        await logTransactionAction({
          type: "Material added",
          itemId: createdItem.item_id || createdItem.id,
          itemName: savedMaterial.name,
          sku: savedMaterial.sku,
          warehouseId: primaryWhId,
          warehouseName: wh?.name || "Unknown",
          detail: "New material created via form",
        }).catch(() => {});

        refresh();
        showToast(`"${savedMaterial.name}" added.`);
        setShowMaterialModal(false);
      } catch (err) {
        showToast(err?.message || "Failed to create material.", "error");
      } finally {
        setIsBusy(false);
      }
    },
    [data, refresh, showToast],
  );

  // ─── MaterialFormModal open/close helpers ───────────────────

  const openMaterialModal = useCallback(() => {
    setMaterialModalMode("create");
    setMaterialModalItem(null);
    setShowMaterialModal(true);
  }, []);

  const closeMaterialModal = useCallback(() => {
    setShowMaterialModal(false);
    setMaterialModalItem(null);
  }, []);

  const handleRestock = useCallback(() => {
    const qty = Number(form.qty);
    if (!qty || qty <= 0) {
      showToast("Enter a valid quantity.", "error");
      return;
    }
    // Restock now creates a stock level record instead of updating item quantity directly
    runMutation(
      () => createStockLevelAction({
        itemId: form.id,
        warehouseId: form.warehouse_id || form.warehouseId,
        quantity: qty,
        unitId: form.unit_id || form.unitId,
        binLocation: form.binLocation || null,
      }),
      { type: "Restock", itemId: form.id, itemName: form.name, sku: form.sku, warehouseId: form.warehouse_id, warehouseName: whName(form.warehouse_id), detail: `+${qty}`, qtyChange: qty },
    );
    closeModal();
  }, [form, runMutation, showToast, whName, closeModal]);


  const handleTransfer = useCallback(() => {
    const formCatName = form?.classification || form.category || "";
    const isEquipment = formCatName === "Equipment";
    const qty = isEquipment ? 0 : Number(form.qty);
    const toWh = form.toWarehouseId;
    if (!toWh || String(toWh) === String(form.warehouse_id)) {
      showToast("Choose a different destination location.", "error");
      return;
    }
    if (!isEquipment && (!qty || qty <= 0)) {
      showToast("Enter a valid transfer quantity.", "error");
      return;
    }
    const toWhName = (data?.warehouses || []).find((w) => String(w.id) === String(toWh))?.name || "Unknown";
    runMutation(
      () => transferItemAction({ ...form, warehouseId: form.warehouse_id }, toWh, qty),
      { type: "Transfer", itemId: form.id, itemName: form.name, sku: form.sku, warehouseId: form.warehouse_id, warehouseName: whName(form.warehouse_id), toWarehouseId: Number(toWh), detail: `${whName(form.warehouse_id)} -> ${toWhName}`, qtyChange: -(qty || 0) },
    );
    closeModal();
  }, [form, data, runMutation, showToast, whName, closeModal]);

  const handleCheckout = useCallback(() => {
    if (!form.assignedTo) {
      showToast("Enter who is taking this equipment.", "error");
      return;
    }
    // assigned_to column is removed; assignment is logged in transaction detail only
    runMutation(
      () => updateItemAction(form.id, { statusId: statusIdByName("In Use") }),
      { type: "Check out", itemId: form.id, itemName: form.name, sku: form.sku, warehouseId: form.warehouse_id, warehouseName: whName(form.warehouse_id), assignedTo: form.assignedTo },
    );
    closeModal();
  }, [form, runMutation, showToast, whName, statusIdByName, closeModal]);

  const handleEditItem = useCallback(() => {
    if (!form.name || !form.sku || !form.warehouseId || !form.categoryId) {
      showToast("Name, SKU, category, and location required.", "error");
      return;
    }
    runMutation(
      () => updateItemAction(form.id, {
        name: form.name,
        description: form.description,
        sku: form.sku,
        barcode: form.barcode,
        classification: form.classification,
        categoryId: form.categoryId,
        warehouseId: form.warehouseId,
        unitId: form.unitId,
        minThreshold: Number(form.minThreshold) || 0,
        maxThreshold: Number(form.maxThreshold) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
        defaultReorderQty: Number(form.defaultReorderQty) || 0,
        cost: Number(form.cost) || 0,
        wholesalePrice: form.wholesalePrice || null,
        retailPrice: form.retailPrice || null,
        supplierId: form.supplierId || null,
        trackingTypeId: form.trackingTypeId || null,
        weight: form.weight || null,
        length: form.length || null,
        width: form.width || null,
        height: form.height || null,
        color: form.color || null,
        gauge: form.gauge || null,
        specification: form.specification || null,
      }),
      { type: "Edit", itemId: form.id, itemName: form.name, sku: form.sku, warehouseId: form.warehouse_id, warehouseName: whName(form.warehouse_id) },
    );
    closeModal();
  }, [form, runMutation, showToast, whName, closeModal]);

  const handleDeleteItem = useCallback((item) => {
    runMutation(
      () => deleteItemAction(item.id),
      { type: "Delete", itemId: item.id, itemName: item.name, sku: item.sku, warehouseId: item.warehouse_id, warehouseName: whName(item.warehouse_id) },
    );
  }, [runMutation, whName]);

  const handleCheckin = useCallback((item) => {
    runMutation(
      () => updateItemAction(item.id, { statusId: statusIdByName("Available") }),
      { type: "Check in", itemName: item.name, detail: "Returned to available", warehouseName: whName(item.warehouse_id) },
    );
  }, [runMutation, whName, statusIdByName]);

  const handleSaveStockLevel = useCallback(() => {
    if (!form.itemId || !form.warehouseId) {
      showToast("Item and warehouse are required.", "error");
      return;
    }
    const payload = {
      itemId: form.itemId,
      warehouseId: form.warehouseId,
      quantity: Number(form.quantity) || 0,
      binLocation: form.binLocation || null,
      unitId: form.unitId || null,
    };
    if (form.id) {
      runMutation(
        () => updateStockLevelAction(form.id, payload),
        { type: "Stock level updated", itemId: form.itemId, warehouseId: form.warehouseId, detail: `Qty set to ${payload.quantity}` },
      );
    } else {
      runMutation(
        () => createStockLevelAction(payload),
        { type: "Stock level added", itemId: form.itemId, warehouseId: form.warehouseId, qtyChange: payload.quantity },
      );
    }
    closeModal();
  }, [form, runMutation, showToast, closeModal]);

  const handleDeleteStockLevel = useCallback((item) => {
    runMutation(
      () => deleteStockLevelAction(item.id),
      { type: "Stock level deleted", itemId: item.item_id, warehouseId: item.warehouse_id },
    );
  }, [runMutation]);

  const handleSaveSupplier = useCallback(() => {
    if (!form.name) {
      showToast("Supplier name is required.", "error");
      return;
    }
    const payload = {
      name: form.name,
      description: form.description || null,
      contactPerson: form.contactPerson || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      address: form.address || null,
    };
    if (form.id) {
      runMutation(
        () => updateSupplierAction(form.id, { ...payload, isActive: form.isActive }),
        { type: "Supplier updated", detail: `Updated "${payload.name}"` },
      );
    } else {
      runMutation(
        () => createSupplierAction(payload),
        { type: "Supplier added", detail: `Added "${payload.name}"` },
      );
    }
    closeModal();
  }, [form, runMutation, showToast, closeModal]);

  const handleDeleteSupplier = useCallback((supplier) => {
    runMutation(
      () => deleteSupplierAction(supplier.id),
      { type: "Supplier deleted", detail: `Deleted "${supplier.name}"` },
    );
  }, [runMutation]);

  if (!loaded) {
    return <div className="inventory-loading">Loading inventory...</div>;
  }

 //#endregion

  return (
    <div className="inventory-module-layout">
      {/* Drawer overlay (mobile only) */}
      <div
        className={`inventory-drawer-overlay${drawerOpen ? " is-open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer sidebar */}
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
            {/* <div className="inventory-sidebar-subtitle">Materials Tracker</div> */}
          </div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => {
            const iconMap = {
              LayoutDashboard, BarChart3, Package, Wrench,
              Warehouse, Truck, ArrowLeftRight, ClipboardList, Columns, Settings,
              Layers,
            };
            const IconComponent = iconMap[n.icon];
            return (
              <button
                key={n.id}
                onClick={() => handleNavClick(n.id)}
                className={`inventory-sidebar-nav-item${view === n.id ? " is-active" : ""}`}
                title={n.label}
              >
                {IconComponent && <IconComponent size={18} className="inventory-sidebar-nav-icon" />}
                <span className="inventory-sidebar-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
        {/* <div className="inventory-sidebar-footer">
          Data sourced from Supabase. Changes sync immediately.
        </div> */}
      </aside>

      {/* Main content */}
      <main className="inventory-main">
        <button
          className="inventory-drawer-toggle-mobile"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        {view === "dashboard" && (
          <div>
            <div className="inventory-view-header">
              <div>
                <h1 className="inventory-page-title">Dashboard</h1>
                <p className="inventory-page-desc">Live overview across all warehouse locations.</p>
              </div>
              <div>
                <select
                  className="form-select"
                  value={filterWh}
                  onChange={(e) => setFilterWh(e.target.value)}
                  style={{ minWidth: "200px" }}
                >
                  <option value="all">All locations</option>
                  {(data?.warehouses || []).map((w) => (
                    <option key={w.id} value={String(w.id)}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="inventory-stat-row">
              <StatCard label="Total SKUs" value={filteredItems.length} />
              <StatCard label="Low stock alerts" value={filteredLowStock.length} accent={filteredLowStock.length ? "var(--psb-status-suspended)" : "var(--psb-gold)"} />
              <StatCard label="Equipment checked out" value={filteredCheckedOut} />
              <StatCard label="Active locations" value={(data?.warehouses || []).length} />
            </div>
            <div className="inventory-dashboard-panels">
              <Card className="inventory-panel" title={<><AlertTriangle size={15} /> Low stock alerts</>}>
                {filteredLowStock.length === 0 && <p className="inventory-panel-empty">All materials are above their reorder threshold.</p>}
                {filteredLowStock.map((item) => (
                  <div key={item.id} className="inventory-panel-row">
                    <div>
                      <div className="fw-semibold">{item.name}</div>
                      <div className="inventory-panel-row-meta">{whName(item.warehouse_id)}</div>
                    </div>
                    <div className="inventory-panel-row-value">{item.quantity}/{item.min_threshold} {getUnitName(data?.config, item.unit)}</div>
                  </div>
                ))}
              </Card>
              <Card className="inventory-panel" title="Recent activity">
                {(filteredTransactions || []).slice(0, 6).map((tx) => (
                  <div key={tx.id} className="inventory-activity-row">
                    <div className="inventory-activity-main">
                      <div className="inventory-activity-type">{tx.type || "System"}</div>
                      <div className="inventory-activity-date">{formatDateTime(tx.created_at)}</div>
                    </div>
                    <div className="inventory-activity-detail">
                      <span className="inventory-activity-item">{tx.item_name || "—"}</span>
                      {tx.detail && <span className="inventory-activity-separator">—</span>}
                      {tx.detail && <span className="inventory-activity-action">{tx.detail}</span>}
                    </div>
                    {tx.warehouse_name && (
                      <div className="inventory-activity-location">{tx.warehouse_name}</div>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {(view === "materials" || view === "equipment") && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>
                {view === "materials" ? "Materials" : "Equipment"}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  disabled={isBusy}
                >
                  Refresh
                </Button>
                {view === "materials" ? (
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={openMaterialModal}
                    disabled={isBusy}
                  >
                    <Plus size={14} /> Add material
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={() => openModal("addEquipment")}
                    disabled={isBusy}
                  >
                    <Plus size={14} /> Add equipment
                  </Button>
                )}
              </div>
            </div>

            {view === "materials" && (
              <MaterialsTable
                materials={materials}
                warehouseName={whName}
                config={data?.config}
                onEdit={(item) => openModal("editItem", item)}
                onRestock={(item) => openModal("restock", item)}
                onTransfer={(item) => openModal("transfer", item)}
              />
            )}

            {view === "equipment" && (
              <div className="inventory-card-grid">
                {equipmentList.map((item) => (
                  <EquipmentCard
                    key={item.id}
                    item={item}
                    config={data?.config}
                    warehouseName={whName(item.warehouse_id)}
                    onCheckout={(it) => openModal("checkout", it)}
                    onCheckin={handleCheckin}
                    onTransfer={(it) => openModal("transfer", it)}
                    onEdit={(it) => openModal("editItem", it)}
                    onDelete={(it) => handleDeleteItem(it)}
                  />
                ))}
                {equipmentList.length === 0 && <p className="text-muted">No equipment found.</p>}
              </div>
            )}
          </div>
        )}

        {view === "warehouses" && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>Locations</h1>
              <Button variant="success" size="sm" onClick={() => openModal("addWarehouse")} disabled={isBusy}>
                <Plus size={14} /> Add location
              </Button>
            </div>
            <WarehouseTable
              warehouses={data?.warehouses || []}
              items={data?.items || []}
              config={data?.config}
            />
          </div>
        )}

        {view === "stocklevels" && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>Stock levels</h1>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  disabled={isBusy}
                >
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={() => openModal("addStockLevel")}
                  disabled={isBusy}
                >
                  <Plus size={14} /> Add stock
                </Button>
              </div>
            </div>
            <StockLevelsTable
              stockLevels={data?.stockLevels || []}
              items={data?.items || []}
              warehouses={data?.warehouses || []}
              config={data?.config}
              onEdit={(item) => openModal("editStockLevel", item)}
              onDelete={(item) => handleDeleteStockLevel(item)}
            />
          </div>
        )}

        {view === "suppliers" && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>Suppliers</h1>
              <Button variant="success" size="sm" onClick={() => openModal("addSupplier")} disabled={isBusy}>
                <Plus size={14} /> Add supplier
              </Button>
            </div>
            <SuppliersTable
              suppliers={data?.suppliers || []}
              onEdit={(s) => openModal("editSupplier", s)}
              onDelete={(s) => handleDeleteSupplier(s)}
            />
          </div>
        )}

        {view === "log" && (
          <div>
            <h1 className="inventory-page-title">Activity log</h1>
            <LogTable transactions={data?.transactions || []} />
          </div>
        )}
      </main>

      {/* Modals */}


      <Modal show={modal === "addWarehouse"} onHide={closeModal} title="Add location" footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
          <Button variant="success" size="sm" onClick={handleAddWarehouse} loading={isBusy}>Add location</Button>
        </>
      }>
        <Field label="Location name">
          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plano Equipment Yard" />
        </Field>
        <Field label="Address">
          <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
        </Field>
        <Field label="City">
          <Input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Plano, TX" />
        </Field>
        <Field label="Manager">
          <Input value={form.manager || ""} onChange={(e) => setForm({ ...form, manager: e.target.value })} placeholder="Name" />
        </Field>
      </Modal>


      <Modal show={modal === "addMaterial" || modal === "addEquipment"} onHide={closeModal}
        bodyClassName="inventory-modal-scrollable"
        title={modal === "addMaterial" ? "Add material" : "Add equipment"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" onClick={() => handleAddItem(modal === "addMaterial" ? "Material" : "Equipment")} loading={isBusy}>
              Add {modal === "addMaterial" ? "material" : "equipment"}
            </Button>
          </>
        }
      >
        <Field label="Name"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description">
          <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the item" />
        </Field>
        <Field label="SKU"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MAT-LUM-206" /></Field>
        <Field label="Barcode / Serial">
          <Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode" />
        </Field>
        <Field label="Classification">
          <Input value={form.classification || ""} onChange={(e) => setForm({ ...form, classification: e.target.value })} placeholder="e.g. Material, Equipment, Office Supply" />
        </Field>
        <Field label="Category">
          <select className="form-select" value={form.categoryId || ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Select category</option>
            {(data?.config?.categories || []).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select className="form-select" value={form.warehouseId || ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select location</option>
            {(data?.warehouses || []).map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </Field>
        <>
          <Field label="Unit">
            <select className="form-select" value={form.unitId || ""} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">Select unit</option>
              {(data?.config?.units || []).map((u) => <option key={u.id} value={String(u.id)}>{u.name} ({u.abbreviation})</option>)}
            </select>
          </Field>
          <Field label="Tracking type">
            <select className="form-select" value={form.trackingTypeId || ""} onChange={(e) => setForm({ ...form, trackingTypeId: e.target.value })}>
              <option value="">Select tracking type</option>
              {(data?.config?.trackingTypes || []).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
          </Field>
          {/* <Field label="Reorder threshold"><Input type="number" value={form.minThreshold || ""} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field> */}
          <Field label="Max threshold"><Input type="number" value={form.maxThreshold || ""} onChange={(e) => setForm({ ...form, maxThreshold: e.target.value })} /></Field>
          <Field label="Reorder point"><Input type="number" value={form.reorderPoint || ""} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} /></Field>
          <Field label="Default reorder qty"><Input type="number" value={form.defaultReorderQty || ""} onChange={(e) => setForm({ ...form, defaultReorderQty: e.target.value })} /></Field>
          <Field label="Unit cost ($)"><Input type="number" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label="Wholesale price ($)"><Input type="number" value={form.wholesalePrice || ""} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></Field>
          <Field label="Retail price ($)"><Input type="number" value={form.retailPrice || ""} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} /></Field>
          <Field label="Weight">
            <Input value={form.weight || ""} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="e.g. 25 kg" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Length">
              <Input value={form.length || ""} onChange={(e) => setForm({ ...form, length: e.target.value })} placeholder='e.g. 10"' />
            </Field>
            <Field label="Width">
              <Input value={form.width || ""} onChange={(e) => setForm({ ...form, width: e.target.value })} placeholder='e.g. 4"' />
            </Field>
            <Field label="Height">
              <Input value={form.height || ""} onChange={(e) => setForm({ ...form, height: e.target.value })} placeholder='e.g. 2"' />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Color">
              <Input value={form.color || ""} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. Black" />
            </Field>
            <Field label="Gauge">
              <Input value={form.gauge || ""} onChange={(e) => setForm({ ...form, gauge: e.target.value })} placeholder="e.g. 12 AWG" />
            </Field>
          </div>
          <Field label="Specification">
            <textarea className="form-control" rows="3" value={form.specification || ""} onChange={(e) => setForm({ ...form, specification: e.target.value })} placeholder="e.g. Material grade, certifications, technical notes" />
          </Field>
        </>
      </Modal>

      <Modal show={modal === "restock"} onHide={closeModal} title={`Restock: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleRestock} loading={isBusy}>Confirm restock</Button>
        </>
      }>
        <p className="text-muted small">Current quantity: <b>{form.quantity} {unitLookup[String(form.unit_id)] || "pcs"}</b> at {whName(form.warehouse_id)}</p>
        <Field label={`Quantity to add (${unitLookup[String(form.unit_id)] || "pcs"})`}>
          <Input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </Field>
      </Modal>

      <Modal show={modal === "transfer"} onHide={closeModal} title={`Transfer: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleTransfer} loading={isBusy}>Confirm transfer</Button>
        </>
      }>
        <p className="text-muted small">From <b>{whName(form.warehouse_id)}</b></p>
        <Field label="Destination location">
          <select className="form-select" value={form.toWarehouseId || ""} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}>
            <option value="">Select destination</option>
            {(data?.warehouses || []).filter((w) => String(w.id) !== String(form.warehouse_id)).map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </Field>
        {(form.classification || form.category || "") !== "Equipment" && (
          <Field label={`Quantity to transfer (current: ${form.quantity} ${unitLookup[String(form.unit_id)] || "pcs"})`}>
            <Input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </Field>
        )}
      </Modal>

      <Modal show={modal === "editItem"} onHide={closeModal} bodyClassName="inventory-modal-scrollable" title={`Edit: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
          <Button variant="success" size="sm" onClick={handleEditItem} loading={isBusy}>Save changes</Button>
        </>
      }>
        <Field label="Name"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description">
          <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the item" />
        </Field>
        <Field label="SKU"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MAT-LUM-206" /></Field>
        <Field label="Barcode / Serial">
          <Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode" />
        </Field>
        <Field label="Classification">
          <Input value={form.classification || ""} onChange={(e) => setForm({ ...form, classification: e.target.value })} placeholder="e.g. Material, Equipment, Office Supply" />
        </Field>
        <Field label="Category">
          <select className="form-select" value={form.categoryId || ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Select category</option>
            {(data?.config?.categories || []).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select className="form-select" value={form.warehouseId || ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select location</option>
            {(data?.warehouses || []).map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select className="form-select" value={form.unitId || ""} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">Select unit</option>
            {(data?.config?.units || []).map((u) => <option key={u.id} value={String(u.id)}>{u.name} ({u.abbreviation})</option>)}
          </select>
        </Field>
        <Field label="Tracking type">
          <select className="form-select" value={form.trackingTypeId || ""} onChange={(e) => setForm({ ...form, trackingTypeId: e.target.value })}>
            <option value="">None</option>
            {(data?.config?.trackingTypes || []).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Current Qty"><Input type="number" value={form.quantity || 0} disabled /></Field>
        <Field label="Reorder threshold"><Input type="number" value={form.minThreshold || ""} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field>
        <Field label="Max threshold"><Input type="number" value={form.maxThreshold || ""} onChange={(e) => setForm({ ...form, maxThreshold: e.target.value })} /></Field>
        <Field label="Reorder point"><Input type="number" value={form.reorderPoint || ""} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} /></Field>
        <Field label="Default reorder qty"><Input type="number" value={form.defaultReorderQty || ""} onChange={(e) => setForm({ ...form, defaultReorderQty: e.target.value })} /></Field>
        <Field label="Unit cost ($)"><Input type="number" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
        <Field label="Wholesale price ($)"><Input type="number" value={form.wholesalePrice || ""} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></Field>
        <Field label="Retail price ($)"><Input type="number" value={form.retailPrice || ""} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} /></Field>
        <Field label="Weight">
          <Input value={form.weight || ""} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="e.g. 25 kg" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <Field label="Length">
            <Input value={form.length || ""} onChange={(e) => setForm({ ...form, length: e.target.value })} placeholder='e.g. 10"' />
          </Field>
          <Field label="Width">
            <Input value={form.width || ""} onChange={(e) => setForm({ ...form, width: e.target.value })} placeholder='e.g. 4"' />
          </Field>
          <Field label="Height">
            <Input value={form.height || ""} onChange={(e) => setForm({ ...form, height: e.target.value })} placeholder='e.g. 2"' />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <Field label="Color">
            <Input value={form.color || ""} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. Black" />
          </Field>
          <Field label="Gauge">
            <Input value={form.gauge || ""} onChange={(e) => setForm({ ...form, gauge: e.target.value })} placeholder="e.g. 12 AWG" />
          </Field>
        </div>
        <Field label="Specification">
          <textarea className="form-control" rows="3" value={form.specification || ""} onChange={(e) => setForm({ ...form, specification: e.target.value })} placeholder="e.g. Material grade, certifications, technical notes" />
        </Field>
      </Modal>

      <Modal show={modal === "checkout"} onHide={closeModal} title={`Check out: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleCheckout} loading={isBusy}>Confirm check-out</Button>
        </>
      }>
        <p className="text-muted small">At {whName(form.warehouse_id)}</p>
        <Field label="Assigned to">
          <Input value={form.assignedTo || ""} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Crew member or supervisor name" />
        </Field>
      </Modal>

      <Modal show={modal === "addStockLevel" || modal === "editStockLevel"} onHide={closeModal}
        title={modal === "editStockLevel" ? "Edit stock level" : "Add stock level"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" onClick={handleSaveStockLevel} loading={isBusy}>
              {modal === "editStockLevel" ? "Save changes" : "Add stock"}
            </Button>
          </>
        }
      >
        <Field label="Item">
          <select className="form-select" value={form.itemId || ""} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
            <option value="">Select item</option>
            {(data?.items || []).map((i) => (
              <option key={i.id} value={String(i.id)}>{i.name} ({i.sku})</option>
            ))}
          </select>
        </Field>
        <Field label="Warehouse">
          <select className="form-select" value={form.warehouseId || ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select warehouse</option>
            {(data?.warehouses || []).map((w) => (
              <option key={w.id} value={String(w.id)}>{w.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Bin location">
          <Input value={form.binLocation || ""} onChange={(e) => setForm({ ...form, binLocation: e.target.value })} placeholder="e.g. A-12-3" />
        </Field>
        <Field label="Quantity">
          <Input type="number" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
        <Field label="UoM">
          <select className="form-select" value={form.unitId || ""} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">Select unit</option>
            {(data?.config?.units || []).map((u) => (
              <option key={u.id} value={String(u.id)}>{u.name} ({u.abbreviation})</option>
            ))}
          </select>
        </Field>
        <Field label="Supplier/Vendor">
          <select className="form-select" value={form.supplierId || ""} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Select supplier</option>
            {(data?.suppliers || []).map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
        </Field>
      </Modal>

      <Modal show={modal === "addSupplier" || modal === "editSupplier"} onHide={closeModal}
        title={modal === "editSupplier" ? "Edit supplier" : "Add supplier"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" onClick={handleSaveSupplier} loading={isBusy}>
              {modal === "editSupplier" ? "Save changes" : "Add supplier"}
            </Button>
          </>
        }
      >
        <Field label="Supplier name">
          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Building Supply" />
        </Field>
        <Field label="Contact person">
          <Input value={form.contactPerson || ""} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Name" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.contactEmail || ""} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="supplier@example.com" />
        </Field>
        <Field label="Phone">
          <Input value={form.contactPhone || ""} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="(555) 123-4567" />
        </Field>
        <Field label="Address">
          <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
        </Field>
        <Field label="Description">
          <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Notes about this supplier" />
        </Field>
        {modal === "editSupplier" && (
          <Field label="Active">
            <select className="form-select" value={String(form.isActive !== false)} onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
        )}
      </Modal>

      {/* ─── Material Form Modal ──────────────────────────── */}
      <MaterialFormModal
        show={showMaterialModal}
        onHide={closeMaterialModal}
        mode={materialModalMode}
        initialItem={materialModalItem}
        config={data?.config}
        warehouses={data?.warehouses || []}
        suppliers={data?.suppliers || []}
        allItems={data?.items || []}
        stockLevels={data?.stockLevels || []}
        onSave={handleMaterialFormSave}
      />
    </div>
  );
}

//#endregion

//#region ─── SUB-COMPONENTS ─────────────────────────────────────────

function MaterialsTable({ materials, warehouseName, config, onRestock, onTransfer, onEdit }) {
  const catLookup = useMemo(() => {
    const map = {};
    (config?.categories || []).forEach((c) => { map[String(c.id)] = c.name; });
    return map;
  }, [config]);

  const uLookup = useMemo(() => {
    const map = {};
    (config?.units || []).forEach((u) => { map[String(u.id)] = u; });
    return map;
  }, [config]);

  const trackingLookup = useMemo(() => {
    const map = {};
    (config?.trackingTypes || []).forEach((t) => { map[String(t.id)] = t.name; });
    return map;
  }, [config]);

  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row) => <span className="fw-semibold">{row.name}</span> },
    { key: "sku", label: "SKU", sortable: true, render: (row) => <span className="inventory-mono text-muted">{row.sku}</span> },
    { key: "barcode", label: "Barcode", sortable: true, render: (row) => <span className="inventory-mono small">{row.barcode || "—"}</span> },
    { key: "description", label: "Description", sortable: true, render: (row) => <span className="text-muted small">{row.description || "—"}</span> },
    { key: "classification", label: "Classification", sortable: true, render: (row) => <span>{row.classification || "—"}</span> },
    { key: "tracking", label: "Tracking", sortable: true, align: "center", render: (row) => <span className="text-muted small">{trackingLookup[String(row.tracking_type_id)] || "—"}</span> },
    { key: "unit", label: "UoM", sortable: true, align: "center", render: (row) => {
      const u = uLookup[String(row.unit_id)];
      const text = u ? u.abbreviation : (row.unit || "—");
      return <span className="inventory-mono">{text}</span>;
    }},
    { key: "quantity", label: "Qty", sortable: true, align: "center", render: (row) => <span className="inventory-mono">{row.quantity}</span> },
    { key: "minThreshold", label: "Min Stock", sortable: true, align: "center", render: (row) => <span className="inventory-mono text-muted">{row.min_threshold}</span> },
    { key: "maxThreshold", label: "Max Stock", sortable: true, align: "center", render: (row) => <span className="inventory-mono text-muted">{row.max_threshold || 0}</span> },
    { key: "reorderPoint", label: "Reorder Pt", sortable: true, align: "center", render: (row) => <span className="inventory-mono text-muted">{row.reorder_point || 0}</span> },
    { key: "defaultReorderQty", label: "Reorder Qty", sortable: true, align: "center", render: (row) => <span className="inventory-mono text-muted">{row.default_reorder_quantity || 0}</span> },
    { key: "dimensions", label: "Dimensions", sortable: false, align: "center", render: (row) => {
      const dims = [row.length, row.width, row.height].filter(Boolean);
      return <span className="text-muted small">{dims.length ? dims.join(" × ") : "—"}</span>;
    }},
    { key: "weight", label: "Weight", sortable: true, align: "center", render: (row) => <span className="text-muted small">{row.weight || "—"}</span> },
    { key: "color", label: "Color", sortable: true, align: "center", render: (row) => <span className="text-muted small">{row.color || "—"}</span> },
    { key: "gauge", label: "Gauge", sortable: true, align: "center", render: (row) => <span className="text-muted small">{row.gauge || "—"}</span> },
    { key: "specification", label: "Spec", sortable: true, render: (row) => {
      const spec = row.specification;
      if (!spec) return <span className="text-muted small">—</span>;
      if (typeof spec === "object") return <span className="text-muted small">{spec.value || JSON.stringify(spec)}</span>;
      return <span className="text-muted small">{spec}</span>;
    }},
    { key: "cost", label: "Cost ($)", sortable: true, align: "right", render: (row) => row.cost ? <span className="inventory-mono">${Number(row.cost).toFixed(2)}</span> : <span className="text-muted">—</span> },
    { key: "wholesale", label: "Wholesale ($)", sortable: true, align: "right", render: (row) => row.wholesale_price ? <span className="inventory-mono">${Number(row.wholesale_price).toFixed(2)}</span> : <span className="text-muted">—</span> },
    { key: "retail", label: "Retail ($)", sortable: true, align: "right", render: (row) => row.retail_price ? <span className="inventory-mono">${Number(row.retail_price).toFixed(2)}</span> : <span className="text-muted">—</span> },
    {
      key: "isActive", label: "Active", sortable: true, align: "center",
      render: (row) => row.is_active !== false
        ? <Badge bg="success" text="white">Active</Badge>
        : <Badge bg="secondary" text="dark">Inactive</Badge>,
    },
  ];

  const actions = [
    { key: "edit", label: "Edit", type: "secondary", icon: "edit", onClick: (r) => onEdit(r) },
    { key: "restock", label: "Restock", type: "secondary", icon: "plus", onClick: (r) => onRestock(r) },
    { key: "transfer", label: "Transfer", type: "secondary", icon: "right-to-bracket", onClick: (r) => onTransfer(r) },
  ];

  return (
    <TableZ
      data={materials}
      columns={columns}
      actions={actions}
      rowIdKey="id"
      searchPlaceholder="Search materials..."
      emptyMessage="No materials match this view."
    />
  );
}

function EquipmentCard({ item, warehouseName, config, onCheckout, onCheckin, onTransfer, onEdit, onDelete }) {
  const statusName = useMemo(() => {
    const found = (config?.statuses || []).find((s) => String(s.id) === String(item?.status_id));
    return found?.name || item?.status || "Available";
  }, [config, item]);
  const statusColor = getEquipmentStatusColor(statusName);
  return (
    <Card className="inventory-tag-card">
      <div className="inventory-tag-card-category">EQP</div>
      <div className="inventory-tag-card-title">{item.name}</div>
      <div className="inventory-tag-card-sku">{item.sku}</div>
      <div className="inventory-tag-card-meta">
        <MapPin size={13} /> {warehouseName}
      </div>
      <div className="inventory-tag-card-status-row">
        <Badge bg={statusColor === "active" ? "success" : statusColor === "pending" ? "warning" : "secondary"} text={statusColor === "active" ? "white" : "dark"}>
          {statusName}
        </Badge>
      </div>
      <div className="inventory-tag-card-actions">
        {statusName === "Available" && (
          <Button variant="primary" size="sm" onClick={() => onCheckout(item)}>Check out</Button>
        )}
        {statusName === "In Use" && (
          <Button variant="success" size="sm" onClick={() => onCheckin(item)}>Check in</Button>
        )}
        <Button variant="outline-secondary" size="sm" onClick={() => onTransfer(item)} title="Transfer">
          <ArrowRightLeft size={13} />
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={() => onEdit(item)} title="Edit">
          <Pencil size={13} />
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={() => onDelete(item)} title="Delete">
          <Trash2 size={13} />
        </Button>
      </div>
    </Card>
  );
}

function LogTable({ transactions }) {
  const columns = [
    { key: "created_at", label: "Date", sortable: true, render: (row) => <span className="inventory-mono text-muted small">{formatDateTime(row.created_at)}</span> },
    { key: "type", label: "Type", sortable: true, render: (row) => <span className="fw-semibold">{row.type}</span> },
    { key: "item_name", label: "Item", sortable: true },
    { key: "detail", label: "Detail", sortable: true, render: (row) => <span className="text-muted">{row.detail}</span> },
    { key: "warehouse_name", label: "Location", sortable: true },
  ];

  return (
    <TableZ
      data={transactions}
      columns={columns}
      rowIdKey="id"
      hideSearch
      hideFooter
      emptyMessage="No activity recorded yet."
    />
  );
}

function StockLevelsTable({ stockLevels, items, warehouses, config, onEdit, onDelete }) {
  const itemLookup = useMemo(() => {
    const map = {};
    (items || []).forEach((i) => { map[String(i.id)] = i; });
    return map;
  }, [items]);

  const whLookup = useMemo(() => {
    const map = {};
    (warehouses || []).forEach((w) => { map[String(w.id)] = w; });
    return map;
  }, [warehouses]);

  const uLookup = useMemo(() => {
    const map = {};
    (config?.units || []).forEach((u) => { map[String(u.id)] = u; });
    return map;
  }, [config]);

  const columns = [
    {
      key: "item", label: "Item", sortable: true,
      render: (row) => {
        const item = itemLookup[String(row.item_id)];
        return (
          <div>
            <div className="fw-semibold">{item?.name || "Unknown"}</div>
            <div className="inventory-mono text-muted small">{item?.sku || "—"}</div>
          </div>
        );
      },
    },
    { key: "warehouse", label: "Warehouse", sortable: true, render: (row) => whLookup[String(row.warehouse_id)]?.name || "Unknown" },
    { key: "bin", label: "Bin", sortable: true, render: (row) => row.bin_location || "—" },
    { key: "quantity", label: "Qty", sortable: true, align: "center", render: (row) => <span className="inventory-mono">{row.quantity}</span> },
    { key: "unit", label: "Unit", sortable: true, align: "center", render: (row) => {
      const u = uLookup[String(row.unit_id)];
      return <span className="inventory-mono">{u ? u.abbreviation : "pcs"}</span>;
    }},
  ];

  const actions = [
    { key: "edit", label: "Edit", type: "secondary", icon: "edit", onClick: (r) => onEdit(r) },
    {
      key: "delete",
      label: "Delete",
      type: "danger",
      icon: "trash",
      confirm: true,
      confirmMessage: (row) => `Delete stock for "${itemLookup[String(row.item_id)]?.name || "this item"}" at ${whLookup[String(row.warehouse_id)]?.name || "this warehouse"}?`,
      onClick: (r) => onDelete(r),
    },
  ];

  return (
    <TableZ
      data={stockLevels}
      columns={columns}
      actions={actions}
      rowIdKey="id"
      searchPlaceholder="Search stock levels..."
      emptyMessage="No stock levels found."
    />
  );
}

function WarehouseTable({ warehouses, items, config }) {
  const categoryMap = useMemo(() => {
    const map = {};
    (config?.categories || []).forEach((c) => { map[String(c.id)] = c.name; });
    return map;
  }, [config]);

  const resolveCat = useCallback(
    (item) => String(item?.classification || categoryMap[String(item?.category_id)] || "").toLowerCase(),
    [categoryMap],
  );

  const warehouseRows = useMemo(() => {
    return (warehouses || []).map((w) => {
      const itemsAtWh = (items || []).filter((i) => String(i.warehouse_id) === String(w.id));
      const matCount = itemsAtWh.filter((i) => resolveCat(i) === "material").length;
      const eqCount = itemsAtWh.filter((i) => resolveCat(i) === "equipment").length;
      const low = itemsAtWh.filter((i) => resolveCat(i) === "material" && (i.quantity || 0) <= (i.min_threshold || 0)).length;
      return { ...w, matCount, eqCount, low };
    });
  }, [warehouses, items, resolveCat]);

  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row) => <span className="fw-semibold">{row.name}</span> },
    { key: "address", label: "Address", sortable: true, render: (row) => <span className="text-muted">{row.address || "—"}{row.city ? `, ${row.city}` : ""}</span> },
    { key: "manager", label: "Manager", sortable: true, render: (row) => <span>{row.manager || "Unassigned"}</span> },
    { key: "matCount", label: "Materials", align: "center", render: (row) => <span className="inventory-mono">{row.matCount}</span> },
    { key: "eqCount", label: "Equipment", align: "center", render: (row) => <span className="inventory-mono">{row.eqCount}</span> },
    {
      key: "low", label: "Low Stock", sortable: true, align: "center",
      render: (row) => row.low > 0 ? <Badge bg="warning" text="dark">{row.low}</Badge> : <span className="text-muted">0</span>,
    },
  ];

  return (
    <TableZ
      data={warehouseRows}
      columns={columns}
      rowIdKey="id"
      hideFooter
      emptyMessage="No warehouses found."
    />
  );
}

function SuppliersTable({ suppliers, onEdit, onDelete }) {
  const columns = [
    { key: "name", label: "Supplier", sortable: true, render: (row) => <span className="fw-semibold">{row.name}</span> },
    { key: "contactPerson", label: "Contact", sortable: true, render: (row) => <span>{row.contact_person || "—"}</span> },
    { key: "contactEmail", label: "Email", sortable: true, render: (row) => row.contact_email ? <span className="inventory-mono small">{row.contact_email}</span> : <span className="text-muted">—</span> },
    { key: "contactPhone", label: "Phone", sortable: true, render: (row) => row.contact_phone ? <span className="inventory-mono small">{row.contact_phone}</span> : <span className="text-muted">—</span> },
    { key: "address", label: "Address", sortable: true, render: (row) => <span className="text-muted">{row.address || "—"}</span> },
    {
      key: "isActive", label: "Active", sortable: true, align: "center",
      render: (row) => row.is_active !== false
        ? <Badge bg="success" text="white">Active</Badge>
        : <Badge bg="secondary" text="dark">Inactive</Badge>,
    },
  ];

  const actions = [
    { key: "edit", label: "Edit", type: "secondary", icon: "edit", onClick: (r) => onEdit(r) },
    {
      key: "delete",
      label: "Delete",
      type: "danger",
      icon: "trash",
      confirm: true,
      confirmMessage: (row) => `Delete supplier "${row.name}"?`,
      onClick: (r) => onDelete(r),
    },
  ];

  return (
    <TableZ
      data={suppliers}
      columns={columns}
      actions={actions}
      rowIdKey="id"
      searchPlaceholder="Search suppliers..."
      emptyMessage="No suppliers found."
    />
  );
}

//#endregion