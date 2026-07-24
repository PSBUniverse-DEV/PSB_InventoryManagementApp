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
  Plus, Search,
  ArrowRightLeft, AlertTriangle, MapPin, User,
  PackageCheck, Warehouse,
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
} from "../data/inventory.actions";
import { useRouter } from "next/navigation";

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

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryView({ initialData }) {
  const router = useRouter();
  const data = initialData;
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterWh, setFilterWh] = useState("all");
  const [modal, setModal] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => { setLoaded(true); }, []);

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

  const categoryLookup = useMemo(() => {
    const map = {};
    (data?.config?.categories || []).forEach((c) => { map[String(c.id)] = c.name; });
    return map;
  }, [data]);

  const itemCategoryName = useCallback(
    (item) => categoryLookup[String(item?.category_id)] || "Unknown",
    [categoryLookup],
  );

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

  // ─── Mutation helpers ────────────────────────────────────
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

  // ─── Filtered items ──────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!data) return [];
    return (data.items || []).filter((it) => {
      if (filterWh !== "all" && String(it.warehouse_id) !== filterWh) return false;
      if (search && !(`${it.name} ${it.sku}`.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [data, filterWh, search]);

  const resolveCategory = useCallback(
    (item) => categoryLookup[String(item?.category_id)] || item?.category || "",
    [categoryLookup],
  );

  const materials = useMemo(() => filteredItems.filter((i) => resolveCategory(i) === "Material"), [filteredItems, resolveCategory]);
  const equipmentList = useMemo(() => filteredItems.filter((i) => resolveCategory(i) === "Equipment"), [filteredItems, resolveCategory]);
  const lowStock = useMemo(
    () => (data?.items || []).filter((i) => resolveCategory(i) === "Material" && (i.quantity || 0) <= (i.min_threshold || 0)),
    [data, resolveCategory],
  );
  const checkedOut = useMemo(
    () => (data?.items || []).filter((i) => resolveCategory(i) === "Equipment" && statusLookup[String(i.status_id)] === "In Use").length,
    [data, resolveCategory, statusLookup],
  );

  const openModal = useCallback((type, item) => {
    setForm(item ? { ...item } : {});
    setModal(type);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setForm({});
  }, []);

  // ─── Handlers ────────────────────────────────────────────
  const handleAddWarehouse = useCallback(() => {
    if (!form.name || !form.address) {
      showToast("Name and address required.", "error");
      return;
    }
    runMutation(
      () => createWarehouseAction(form),
      { type: "Warehouse added", itemName: form.name, detail: "New location registered", warehouseName: form.name },
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
      { type: `${category} added`, itemName: form.name, detail: `SKU ${form.sku}`, warehouseName: wh?.name || "Unknown" },
    );
    closeModal();
  }, [form, data, runMutation, showToast, closeModal]);

  const handleRestock = useCallback(() => {
    const qty = Number(form.qty);
    if (!qty || qty <= 0) {
      showToast("Enter a valid quantity.", "error");
      return;
    }
    const unitAbbrev = unitLookup[String(form.unit_id)] || "pcs";
    runMutation(
      () => updateItemAction(form.id, { quantity: (form.quantity || 0) + qty }),
      { type: "Restock", itemName: form.name, detail: `+${qty} ${unitAbbrev}`, warehouseName: whName(form.warehouse_id) },
    );
    closeModal();
  }, [form, runMutation, showToast, whName, unitLookup, closeModal]);

  const handleTransfer = useCallback(() => {
    const formCatName = categoryLookup[String(form.category_id)] || form.category || "";
    const isEquipment = formCatName === "Equipment";
    const qty = isEquipment ? 0 : Number(form.qty);
    const toWh = form.toWarehouseId;
    if (!toWh || String(toWh) === String(form.warehouse_id)) {
      showToast("Choose a different destination location.", "error");
      return;
    }
    if (!isEquipment && (!qty || qty <= 0 || qty > (form.quantity || 0))) {
      showToast("Enter a valid transfer quantity.", "error");
      return;
    }
    const toWhName = (data?.warehouses || []).find((w) => String(w.id) === String(toWh))?.name || "Unknown";
    runMutation(
      () => transferItemAction({ ...form, warehouseId: form.warehouse_id }, toWh, qty),
      { type: "Transfer", itemName: form.name, detail: `${whName(form.warehouse_id)} -> ${toWhName}`, warehouseName: toWhName },
    );
    closeModal();
  }, [form, data, runMutation, showToast, whName, closeModal]);

  const handleCheckout = useCallback(() => {
    if (!form.assignedTo) {
      showToast("Enter who is taking this equipment.", "error");
      return;
    }
    runMutation(
      () => updateItemAction(form.id, { statusId: statusIdByName("In Use"), assignedTo: form.assignedTo }),
      { type: "Check out", itemName: form.name, detail: `To ${form.assignedTo}`, warehouseName: whName(form.warehouse_id) },
    );
    closeModal();
  }, [form, runMutation, showToast, whName, statusIdByName, closeModal]);

  const handleCheckin = useCallback((item) => {
    runMutation(
      () => updateItemAction(item.id, { statusId: statusIdByName("Available"), assignedTo: null }),
      { type: "Check in", itemName: item.name, detail: `Returned by ${item.assigned_to || "field crew"}`, warehouseName: whName(item.warehouse_id) },
    );
  }, [runMutation, whName, statusIdByName]);

  if (!loaded) {
    return <div className="inventory-loading">Loading inventory...</div>;
  }

  return (
    <div className="inventory-module-layout">
      {/* Sidebar — hidden on small screens */}
      <aside className="inventory-sidebar">
        <div className="inventory-sidebar-brand">
          <div className="inventory-sidebar-title">PSB IMS</div>
          <div className="inventory-sidebar-subtitle">Materials Tracker</div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`inventory-sidebar-nav-item${view === n.id ? " is-active" : ""}`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="inventory-sidebar-footer">
          Data sourced from Supabase. Changes sync immediately.
        </div>
      </aside>

      {/* Main content */}
      <main className="inventory-main">
        {/* Mobile nav */}
        <div className="inventory-mobile-nav">
          <select
            className="form-select"
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="Switch view"
          >
            {INVENTORY_VIEWS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </div>

        {view === "dashboard" && (
          <div>
            <div className="inventory-view-header">
              <div>
                <h1 className="inventory-page-title">Dashboard</h1>
                <p className="inventory-page-desc">Live overview across all warehouse locations.</p>
              </div>
            </div>
            <div className="inventory-stat-row">
              <StatCard label="Total SKUs" value={(data?.items || []).length} />
              <StatCard label="Low stock alerts" value={lowStock.length} accent={lowStock.length ? "var(--psb-status-suspended)" : "var(--psb-gold)"} />
              <StatCard label="Equipment checked out" value={checkedOut} />
              <StatCard label="Active locations" value={(data?.warehouses || []).length} />
            </div>
            <div className="inventory-dashboard-panels">
              <Card className="inventory-panel" title={<><AlertTriangle size={15} /> Low stock alerts</>}>
                {lowStock.length === 0 && <p className="inventory-panel-empty">All materials are above their reorder threshold.</p>}
                {lowStock.map((item) => (
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
                {(data?.transactions || []).slice(0, 6).map((tx) => (
                  <div key={tx.id} className="inventory-panel-row">
                    <div>
                      <div className="d-flex justify-content-between gap-2">
                        <span className="fw-semibold">{tx.type}</span>
                        <span className="inventory-panel-row-date">{formatDateTime(tx.created_at)}</span>
                      </div>
                      <div className="inventory-panel-row-meta">{tx.item_name} — {tx.detail}</div>
                    </div>
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
              <Button
                variant="success"
                size="sm"
                onClick={() => openModal(view === "materials" ? "addMaterial" : "addEquipment")}
                disabled={isBusy}
              >
                <Plus size={14} /> Add {view === "materials" ? "material" : "equipment"}
              </Button>
            </div>
            <div className="inventory-filter-row">
              <div className="inventory-search-wrap">
                <Search size={15} className="inventory-search-icon" />
                <Input
                  placeholder="Search by name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="inventory-search-input"
                />
              </div>
              <select
                value={filterWh}
                onChange={(e) => setFilterWh(e.target.value)}
                className="form-select inventory-filter-select"
              >
                <option value="all">All locations</option>
                {(data?.warehouses || []).map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
              </select>
            </div>

            {view === "materials" && (
              <MaterialsTable
                materials={materials}
                warehouseName={whName}
                config={data?.config}
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
                  />
                ))}
                {equipmentList.length === 0 && <p className="text-muted">No equipment matches this view.</p>}
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
        <Field label="SKU"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MAT-LUM-206" /></Field>
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
        {modal === "addMaterial" && (
          <>
            <Field label="Unit">
              <select className="form-select" value={form.unitId || ""} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">Select unit</option>
                {(data?.config?.units || []).map((u) => <option key={u.id} value={String(u.id)}>{u.name} ({u.abbreviation})</option>)}
              </select>
            </Field>
            <Field label="Starting quantity"><Input type="number" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Reorder threshold"><Input type="number" value={form.minThreshold || ""} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field>
            <Field label="Unit cost ($)"><Input type="number" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Wholesale price ($)"><Input type="number" value={form.wholesalePrice || ""} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></Field>
            <Field label="Retail price ($)"><Input type="number" value={form.retailPrice || ""} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} /></Field>
          </>
        )}
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
        {categoryLookup[String(form.category_id)] !== "Equipment" && (
          <Field label={`Quantity to transfer (max ${form.quantity} ${unitLookup[String(form.unit_id)] || "pcs"})`}>
            <Input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </Field>
        )}
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
    </div>
  );
}

//#region ─── SUB-COMPONENTS ─────────────────────────────────────────

function MaterialsTable({ materials, warehouseName, config, onRestock, onTransfer }) {
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

  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row) => <span className="fw-semibold">{row.name}</span> },
    { key: "sku", label: "SKU", sortable: true, render: (row) => <span className="inventory-mono text-muted">{row.sku}</span> },
    { key: "category", label: "Category", sortable: true, render: (row) => <span>{catLookup[String(row.category_id)] || "—"}</span> },
    { key: "unit", label: "Unit", sortable: true, align: "center", render: (row) => {
      const u = uLookup[String(row.unit_id)];
      const text = u ? u.abbreviation : (row.unit || "—");
      return <span className="inventory-mono">{text}</span>;
    }},
    { key: "location", label: "Location", sortable: true, render: (row) => warehouseName(row.warehouse_id) },
    { key: "quantity", label: "Qty", sortable: true, align: "center", render: (row) => <span className="inventory-mono">{row.quantity}</span> },
    { key: "minThreshold", label: "Reorder At", sortable: true, align: "center", render: (row) => <span className="inventory-mono text-muted">{row.min_threshold}</span> },
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
    { key: "restock", label: "Restock", type: "secondary", icon: "plus", onClick: (r) => onRestock(r) },
    { key: "transfer", label: "Transfer", type: "secondary", icon: "right-to-bracket", onClick: (r) => onTransfer(r) },
  ];

  return (
    <TableZ
      data={materials}
      columns={columns}
      actions={actions}
      rowIdKey="id"
      hideSearch
      hideFooter
      emptyMessage="No materials match this view."
    />
  );
}

function EquipmentCard({ item, warehouseName, config, onCheckout, onCheckin, onTransfer }) {
  const statusName = useMemo(() => {
    const found = (config?.statuses || []).find((s) => String(s.id) === String(item?.status_id));
    return found?.name || item?.status || "Unknown";
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
        {item.assigned_to && (
          <span className="inventory-tag-card-assignee">
            <User size={12} /> {item.assigned_to}
          </span>
        )}
      </div>
      <div className="inventory-tag-card-actions">
        {statusName === "Available" && (
          <Button variant="primary" size="sm" onClick={() => onCheckout(item)}>Check out</Button>
        )}
        {statusName === "In Use" && (
          <Button variant="success" size="sm" onClick={() => onCheckin(item)}>Check in</Button>
        )}
        <Button variant="outline-secondary" size="sm" onClick={() => onTransfer(item)}>
          <ArrowRightLeft size={13} />
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

function WarehouseTable({ warehouses, items, config }) {
  const categoryMap = useMemo(() => {
    const map = {};
    (config?.categories || []).forEach((c) => { map[String(c.id)] = c.name; });
    return map;
  }, [config]);

  const resolveCat = useCallback(
    (item) => categoryMap[String(item?.category_id)] || item?.category || "",
    [categoryMap],
  );

  const warehouseRows = useMemo(() => {
    return (warehouses || []).map((w) => {
      const itemsAtWh = (items || []).filter((i) => String(i.warehouse_id) === String(w.id));
      const matCount = itemsAtWh.filter((i) => resolveCat(i) === "Material").length;
      const eqCount = itemsAtWh.filter((i) => resolveCat(i) === "Equipment").length;
      const low = itemsAtWh.filter((i) => resolveCat(i) === "Material" && (i.quantity || 0) <= (i.min_threshold || 0)).length;
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

//#endregion
