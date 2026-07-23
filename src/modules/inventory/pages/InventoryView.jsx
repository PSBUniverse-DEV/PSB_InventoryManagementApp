/**
 * Client Component — InventoryView.jsx
 *
 * Displays inventory data bound from the server, with local client state
 * for mutations. Falls back to seeded demo data when operational tables are
 * empty. Uses shared UI components and a mobile-first responsive layout.
 */
"use client";

import "./InventoryView.css";
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search,
  ArrowRightLeft, AlertTriangle, MapPin, User, RotateCcw,
  PackageCheck, Warehouse,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  INVENTORY_VIEWS,
  createEmptyInventoryData,
  mergeInventoryData,
  formatDateTime,
  getUnitName,
  getEquipmentStatusColor,
} from "../data/inventory.data";

const STORAGE_KEY = "psb-inventory-data-v1";

const genId = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();

function seedData() {
  const w1 = genId(), w2 = genId(), w3 = genId();
  const warehouses = [
    { id: w1, name: "Dallas Central Yard", address: "4200 Irving Blvd", city: "Dallas, TX", manager: "R. Alvarez" },
    { id: w2, name: "Fort Worth Distribution Center", address: "1120 Mercantile Row", city: "Fort Worth, TX", manager: "T. Nguyen" },
    { id: w3, name: "Arlington Storage Facility", address: "890 Commerce Loop", city: "Arlington, TX", manager: "K. Douglas" },
  ];

  const materials = [
    { name: "Lumber - 2x4x8 Stud", sku: "MAT-LUM-204", unit: "pcs", qty: 1400, min: 500, wh: w1, cost: 4.25 },
    { name: "Rebar - #4 Grade 60", sku: "MAT-REB-004", unit: "ft", qty: 3200, min: 1000, wh: w1, cost: 0.85 },
    { name: "Ready-Mix Concrete Bags", sku: "MAT-CON-080", unit: "bags", qty: 180, min: 200, wh: w2, cost: 6.5 },
    { name: "PVC Pipe - 4in Schedule 40", sku: "MAT-PVC-400", unit: "ft", qty: 640, min: 300, wh: w2, cost: 2.1 },
    { name: "Romex Wire 12/2", sku: "MAT-WIR-122", unit: "ft", qty: 90, min: 250, wh: w3, cost: 0.95 },
    { name: "Hard Hats (ANSI Type I)", sku: "MAT-PPE-HH1", unit: "pcs", qty: 42, min: 25, wh: w3, cost: 14 },
    { name: "Safety Vests - Hi-Vis", sku: "MAT-PPE-VST", unit: "pcs", qty: 15, min: 20, wh: w1, cost: 9.5 },
    { name: "Drywall Sheets 4x8", sku: "MAT-DRY-408", unit: "sheets", qty: 260, min: 100, wh: w2, cost: 13.75 },
  ];
  const equipment = [
    { name: "Cat 320 Excavator", sku: "EQP-EXC-320", wh: w1, status: "Available" },
    { name: "Bobcat Skid Steer S650", sku: "EQP-SKD-650", wh: w1, status: "In Use", assignedTo: "J. Whitfield" },
    { name: "Portable Generator 20kW", sku: "EQP-GEN-020", wh: w2, status: "Available" },
    { name: "Concrete Mixer - Towable", sku: "EQP-MIX-TOW", wh: w2, status: "Maintenance" },
    { name: "Scissor Lift 26ft", sku: "EQP-LFT-026", wh: w3, status: "Available" },
    { name: "Forklift - 5000lb", sku: "EQP-FRK-500", wh: w3, status: "In Use", assignedTo: "M. Castillo" },
    { name: "Air Compressor 185CFM", sku: "EQP-CMP-185", wh: w1, status: "Available" },
    { name: "Scaffolding Set - 40ft run", sku: "EQP-SCF-040", wh: w2, status: "Available" },
  ];
  const items = [
    ...materials.map(m => ({
      id: genId(), category: "Material", name: m.name, sku: m.sku, unit: m.unit,
      quantity: m.qty, minThreshold: m.min, warehouseId: m.wh, cost: m.cost,
    })),
    ...equipment.map(e => ({
      id: genId(), category: "Equipment", name: e.name, sku: e.sku, unit: "unit",
      quantity: 1, minThreshold: 0, warehouseId: e.wh, status: e.status,
      assignedTo: e.assignedTo || null,
    })),
  ];
  const transactions = [
    { id: genId(), date: nowISO(), type: "System", itemName: "Initial inventory load", detail: "Seed data initialized", warehouseName: "All locations" },
  ];
  return { warehouses, items, transactions };
}

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

export default function InventoryView({ initialData = createEmptyInventoryData() }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterWh, setFilterWh] = useState("all");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const localData = raw ? JSON.parse(raw) : seedData();
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
      }
      setData(mergeInventoryData(initialData, { ...localData, config: initialData?.config }));
    } catch (e) {
      setData(mergeInventoryData(initialData, seedData()));
    } finally {
      setLoaded(true);
    }
  }, [initialData]);

  const persist = (next) => {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const whName = (id) => data?.warehouses.find(w => w.id === id)?.name || "Unknown";

  const logTx = (base, entry) => {
    const tx = { id: genId(), date: nowISO(), ...entry };
    return { ...base, transactions: [tx, ...base.transactions].slice(0, 200) };
  };

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter(it => {
      if (filterWh !== "all" && it.warehouseId !== filterWh) return false;
      if (search && !(`${it.name} ${it.sku}`.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [data, filterWh, search]);

  const materials = filteredItems.filter(i => i.category === "Material");
  const equipmentList = filteredItems.filter(i => i.category === "Equipment");
  const lowStock = data ? data.items.filter(i => i.category === "Material" && i.quantity <= i.minThreshold) : [];
  const checkedOut = data ? data.items.filter(i => i.category === "Equipment" && i.status === "In Use").length : 0;

  const openModal = (type, item) => { setForm(item ? { ...item } : {}); setModal(type); };
  const closeModal = () => { setModal(null); setForm({}); };

  const handleAddWarehouse = () => {
    if (!form.name || !form.address) return showToast("Name and address required.");
    const wh = { id: genId(), name: form.name, address: form.address, city: form.city || "", manager: form.manager || "" };
    let next = { ...data, warehouses: [...data.warehouses, wh] };
    next = logTx(next, { type: "Warehouse added", itemName: wh.name, detail: "New location registered", warehouseName: wh.name });
    persist(next);
    showToast(`${wh.name} added.`);
    closeModal();
  };

  const handleAddItem = (category) => {
    if (!form.name || !form.sku || !form.warehouseId) return showToast("Name, SKU, and location required.");
    const base = {
      id: genId(), category, name: form.name, sku: form.sku, warehouseId: form.warehouseId,
    };
    let item;
    if (category === "Material") {
      item = { ...base, unit: form.unit || "pcs", quantity: Number(form.quantity) || 0, minThreshold: Number(form.minThreshold) || 0, cost: Number(form.cost) || 0 };
    } else {
      item = { ...base, unit: "unit", quantity: 1, minThreshold: 0, status: "Available", assignedTo: null };
    }
    let next = { ...data, items: [...data.items, item] };
    next = logTx(next, { type: `${category} added`, itemName: item.name, detail: `SKU ${item.sku}`, warehouseName: whName(item.warehouseId) });
    persist(next);
    showToast(`${item.name} added to inventory.`);
    closeModal();
  };

  const handleRestock = () => {
    const qty = Number(form.qty);
    if (!qty || qty <= 0) return showToast("Enter a valid quantity.");
    const items = data.items.map(i => i.id === form.id ? { ...i, quantity: i.quantity + qty } : i);
    let next = { ...data, items };
    next = logTx(next, { type: "Restock", itemName: form.name, detail: `+${qty} ${form.unit}`, warehouseName: whName(form.warehouseId) });
    persist(next);
    showToast(`Restocked ${form.name}.`);
    closeModal();
  };

  const handleTransfer = () => {
    const qty = form.category === "Equipment" ? 1 : Number(form.qty);
    const toWh = form.toWarehouseId;
    if (!toWh || toWh === form.warehouseId) return showToast("Choose a different destination location.");
    if (form.category === "Material" && (!qty || qty <= 0 || qty > form.quantity)) return showToast("Enter a valid transfer quantity.");

    let items = [...data.items];
    if (form.category === "Equipment") {
      items = items.map(i => i.id === form.id ? { ...i, warehouseId: toWh } : i);
    } else {
      items = items.map(i => i.id === form.id ? { ...i, quantity: i.quantity - qty } : i);
      const existing = items.find(i => i.category === "Material" && i.sku === form.sku && i.warehouseId === toWh);
      if (existing) {
        items = items.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + qty } : i);
      } else {
        items.push({ ...form, id: genId(), quantity: qty, warehouseId: toWh });
      }
    }
    let next = { ...data, items };
    next = logTx(next, { type: "Transfer", itemName: form.name, detail: `${whName(form.warehouseId)} -> ${whName(toWh)}`, warehouseName: whName(toWh) });
    persist(next);
    showToast(`${form.name} transferred.`);
    closeModal();
  };

  const handleCheckout = () => {
    if (!form.assignedTo) return showToast("Enter who is taking this equipment.");
    const items = data.items.map(i => i.id === form.id ? { ...i, status: "In Use", assignedTo: form.assignedTo } : i);
    let next = { ...data, items };
    next = logTx(next, { type: "Check out", itemName: form.name, detail: `To ${form.assignedTo}`, warehouseName: whName(form.warehouseId) });
    persist(next);
    showToast(`${form.name} checked out to ${form.assignedTo}.`);
    closeModal();
  };

  const handleCheckin = (item) => {
    const items = data.items.map(i => i.id === item.id ? { ...i, status: "Available", assignedTo: null } : i);
    let next = { ...data, items };
    next = logTx(next, { type: "Check in", itemName: item.name, detail: `Returned by ${item.assignedTo || "field crew"}`, warehouseName: whName(item.warehouseId) });
    persist(next);
    showToast(`${item.name} checked in.`);
  };

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
          {/* <div className="inventory-sidebar-region">Dallas–Fort Worth, TX</div> */}
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map(n => (
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
          Data shared across all Strata team members using this app.
        </div>
      </aside>

      {/* Main content */}
      <main className="inventory-main">
        {toast && (
          <div className="inventory-toast">
            <PackageCheck size={15} color="var(--psb-gold)" /> {toast}
          </div>
        )}

        {/* Mobile nav */}
        <div className="inventory-mobile-nav">
          <select
            className="form-select"
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="Switch view"
          >
            {INVENTORY_VIEWS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </div>

        {view === "dashboard" && (
          <div>
            <div className="inventory-view-header">
              <div>
                <h1 className="inventory-page-title">Dashboard</h1>
                <p className="inventory-page-desc">Live overview across all warehouse locations.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload(); }}>
                <RotateCcw size={14} /> Reset demo data
              </Button>
            </div>
            <div className="inventory-stat-row">
              <StatCard label="Total SKUs" value={data.items.length} />
              <StatCard label="Low stock alerts" value={lowStock.length} accent={lowStock.length ? "var(--psb-status-suspended)" : "var(--psb-gold)"} />
              <StatCard label="Equipment checked out" value={checkedOut} />
              <StatCard label="Active locations" value={data.warehouses.length} />
            </div>
            <div className="inventory-dashboard-panels">
              <Card className="inventory-panel" title={<><AlertTriangle size={15} /> Low stock alerts</>}>
                {lowStock.length === 0 && <p className="inventory-panel-empty">All materials are above their reorder threshold.</p>}
                {lowStock.map(item => (
                  <div key={item.id} className="inventory-panel-row">
                    <div>
                      <div className="fw-semibold">{item.name}</div>
                      <div className="inventory-panel-row-meta">{whName(item.warehouseId)}</div>
                    </div>
                    <div className="inventory-panel-row-value">{item.quantity}/{item.minThreshold} {item.unit}</div>
                  </div>
                ))}
              </Card>
              <Card className="inventory-panel" title="Recent activity">
                {data.transactions.slice(0, 6).map(tx => (
                  <div key={tx.id} className="inventory-panel-row">
                    <div>
                      <div className="d-flex justify-content-between gap-2">
                        <span className="fw-semibold">{tx.type}</span>
                        <span className="inventory-panel-row-date">{formatDateTime(tx.date)}</span>
                      </div>
                      <div className="inventory-panel-row-meta">{tx.itemName} — {tx.detail}</div>
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
                {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {view === "materials" && (
              <MaterialsTable
                materials={materials}
                warehouseName={whName}
                config={data.config}
                onRestock={(item) => openModal("restock", item)}
                onTransfer={(item) => openModal("transfer", item)}
              />
            )}

            {view === "equipment" && (
              <div className="inventory-card-grid">
                {equipmentList.map(item => (
                  <EquipmentCard
                    key={item.id}
                    item={item}
                    warehouseName={whName(item.warehouseId)}
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
              <Button variant="success" size="sm" onClick={() => openModal("addWarehouse")}>
                <Plus size={14} /> Add location
              </Button>
            </div>
            <div className="inventory-card-grid">
              {data.warehouses.map(w => {
                const itemsAtWh = data.items.filter(i => i.warehouseId === w.id);
                const matCount = itemsAtWh.filter(i => i.category === "Material").length;
                const eqCount = itemsAtWh.filter(i => i.category === "Equipment").length;
                const low = itemsAtWh.filter(i => i.category === "Material" && i.quantity <= i.minThreshold).length;
                return (
                  <Card key={w.id} className="inventory-wh-card">
                    <div className="inventory-wh-card-header">
                      <Warehouse size={16} color="var(--psb-gold)" />
                      <span className="inventory-wh-card-name">{w.name}</span>
                    </div>
                    <div className="inventory-wh-card-address">{w.address}, {w.city}</div>
                    <div className="inventory-wh-card-manager">Manager: {w.manager || "Unassigned"}</div>
                    <div className="inventory-wh-card-stats">
                      <span><b className="inventory-mono">{matCount}</b> materials</span>
                      <span><b className="inventory-mono">{eqCount}</b> equipment</span>
                      {low > 0 && <span className="inventory-wh-card-low"><b className="inventory-mono">{low}</b> low stock</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {view === "log" && (
          <div>
            <h1 className="inventory-page-title">Activity log</h1>
            <LogTable transactions={data.transactions} />
          </div>
        )}
      </main>


      {/* Modals */}
      
      <Modal show={modal === "addWarehouse"} onHide={closeModal} title="Add location" footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
          <Button variant="success" size="sm" onClick={handleAddWarehouse}>Add location</Button>
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
            <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
            <Button variant="success" size="sm" onClick={() => handleAddItem(modal === "addMaterial" ? "Material" : "Equipment")}>
              Add {modal === "addMaterial" ? "material" : "equipment"}
            </Button>
          </>
        }
      >
        <Field label="Name"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="SKU"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MAT-LUM-206" /></Field>
        <Field label="Location">
          <select className="form-select" value={form.warehouseId || ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select location</option>
            {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        {modal === "addMaterial" && (
          <>
            <Field label="Unit"><Input value={form.unit || ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ft, bags..." /></Field>
            <Field label="Starting quantity"><Input type="number" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Reorder threshold"><Input type="number" value={form.minThreshold || ""} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field>
            <Field label="Unit cost ($)"><Input type="number" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          </>
        )}
      </Modal>

      <Modal show={modal === "restock"} onHide={closeModal} title={`Restock: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleRestock}>Confirm restock</Button>
        </>
      }>
        <p className="text-muted small">Current quantity: <b>{form.quantity} {form.unit}</b> at {whName(form.warehouseId)}</p>
        <Field label={`Quantity to add (${form.unit})`}>
          <Input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </Field>
      </Modal>

      <Modal show={modal === "transfer"} onHide={closeModal} title={`Transfer: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleTransfer}>Confirm transfer</Button>
        </>
      }>
        <p className="text-muted small">From <b>{whName(form.warehouseId)}</b></p>
        <Field label="Destination location">
          <select className="form-select" value={form.toWarehouseId || ""} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}>
            <option value="">Select destination</option>
            {data.warehouses.filter(w => w.id !== form.warehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        {form.category === "Material" && (
          <Field label={`Quantity to transfer (max ${form.quantity} ${form.unit})`}>
            <Input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </Field>
        )}
      </Modal>

      <Modal show={modal === "checkout"} onHide={closeModal} title={`Check out: ${form.name}`} footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleCheckout}>Confirm check-out</Button>
        </>
      }>
        <p className="text-muted small">At {whName(form.warehouseId)}</p>
        <Field label="Assigned to">
          <Input value={form.assignedTo || ""} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Crew member or supervisor name" />
        </Field>
      </Modal>
    </div>
  );
  
}



//#region ─── SUB-COMPONENTS ─────────────────────────────────────────


function MaterialsTable({ materials, warehouseName, config, onRestock, onTransfer }) {
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row) => <span className="fw-semibold">{row.name}</span> },
    { key: "sku", label: "SKU", sortable: true, render: (row) => <span className="inventory-mono text-muted">{row.sku}</span> },
    { key: "location", label: "Location", sortable: true, render: (row) => warehouseName(row.warehouseId) },
    { key: "quantity", label: "Quantity", sortable: true, render: (row) => <span className="inventory-mono">{row.quantity} {getUnitName(config, row.unit)}</span> },
    {
      key: "status", label: "Status", sortable: true, align: "center",
      render: (row) => {
        const low = row.quantity <= row.minThreshold;
        return <Badge bg={low ? "warning" : "success"} text={low ? "dark" : "white"}>{low ? "Low stock" : "OK"}</Badge>;
      },
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

function EquipmentCard({ item, warehouseName, onCheckout, onCheckin, onTransfer }) {
  const statusColor = getEquipmentStatusColor(item.status);
  const categoryName = item.category === "Equipment" ? "EQP" : "MAT";

  return (
    <Card className="inventory-tag-card">
      <div className="inventory-tag-card-category">{categoryName}</div>
      <div className="inventory-tag-card-title">{item.name}</div>
      <div className="inventory-tag-card-sku">{item.sku}</div>
      <div className="inventory-tag-card-meta">
        <MapPin size={13} /> {warehouseName}
      </div>
      <div className="inventory-tag-card-status-row">
        <Badge bg={statusColor === "active" ? "success" : statusColor === "pending" ? "warning" : "secondary"} text={statusColor === "active" ? "white" : "dark"}>
          {item.status}
        </Badge>
        {item.assignedTo && (
          <span className="inventory-tag-card-assignee">
            <User size={12} /> {item.assignedTo}
          </span>
        )}
      </div>
      <div className="inventory-tag-card-actions">
        {item.status === "Available" && (
          <Button variant="primary" size="sm" onClick={() => onCheckout(item)}>Check out</Button>
        )}
        {item.status === "In Use" && (
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
    { key: "date", label: "Date", sortable: true, render: (row) => <span className="inventory-mono text-muted small">{formatDateTime(row.date)}</span> },
    { key: "type", label: "Type", sortable: true, render: (row) => <span className="fw-semibold">{row.type}</span> },
    { key: "itemName", label: "Item", sortable: true },
    { key: "detail", label: "Detail", sortable: true, render: (row) => <span className="text-muted">{row.detail}</span> },
    { key: "warehouseName", label: "Location", sortable: true },
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

//#endregion
