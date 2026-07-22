/**
 * Client Component — InventoryView.jsx
 *
 * Adapted from the Strata Tracker inventory management layout.
 * Uses PSBUniverse design tokens from src/styles/variables.css.
 *
 * SSO AUTHENTICATION:
 *   - Use useAuth() from "@/core/auth/useAuth" to get current user session
 *   - Session is automatically validated via the psb_session cookie
 *   - If not authenticated, the AuthProvider handles redirect to login
 *   - For API calls, the cookie is sent automatically with credentials: "include"
 *
 * TODO (future): Migrate data operations to Server Actions in
 *   src/modules/inventory/data/inventory.actions.js using Supabase.
 */
"use client";

import "./InventoryView.css";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Boxes, HardHat, Warehouse, ClipboardList, Plus, Search,
  ArrowRightLeft, AlertTriangle, X, MapPin, User, Menu, RotateCcw,
  PackageCheck, PackagePlus, Wrench, ChevronRight
} from "lucide-react";

// import { useAuth } from "@/core/auth/useAuth";

const STORAGE_KEY = "psb-inventory-data-v1";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
`;

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

const catColor = (cat) => cat === "Equipment" ? "var(--psb-status-pending)" : "var(--psb-status-active)";

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "var(--psb-ink)", borderRadius: 6, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px", minWidth: 150,
    }}>
      <span style={{
        fontFamily: "'Oswald',sans-serif", fontSize: 11, letterSpacing: "0.08em",
        color: "#9AA5B1", textTransform: "uppercase", fontWeight: 500,
      }}>{label}</span>
      <span style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 28, fontWeight: 600,
        color: accent || "var(--psb-gold)",
      }}>{value}</span>
    </div>
  );
}

function TagCard({ item, warehouseName, onCheckout, onCheckin, onTransfer }) {
  const color = catColor(item.category);
  const statusColor = item.status === "Available"
    ? "var(--psb-status-active)"
    : item.status === "In Use"
      ? "var(--psb-status-pending)"
      : "var(--psb-muted)";
  return (
    <div style={{
      position: "relative", background: "var(--psb-surface)", border: "2px dashed var(--psb-border)",
      borderRadius: 6, padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        position: "absolute", top: -9, left: 18, width: 16, height: 16, borderRadius: "50%",
        background: "var(--psb-bg)", border: "2px dashed var(--psb-border)",
      }} />
      <div style={{
        position: "absolute", top: 10, right: 12, fontFamily: "'Oswald',sans-serif",
        fontSize: 10, letterSpacing: "0.1em", fontWeight: 600, color,
        border: `1.5px solid ${color}`, padding: "2px 6px", borderRadius: 3,
        transform: "rotate(-6deg)", textTransform: "uppercase",
      }}>{item.category === "Equipment" ? "EQP" : "MAT"}</div>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 15, color: "var(--psb-text)" }}>{item.name}</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--psb-muted)", marginTop: 2 }}>{item.sku}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--psb-muted)" }}>
        <MapPin size={13} /> {warehouseName}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: statusColor, textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}>{item.status}</span>
        {item.assignedTo && (
          <span style={{ fontSize: 12, color: "var(--psb-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <User size={12} /> {item.assignedTo}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {item.status === "Available" && (
          <button onClick={() => onCheckout(item)} style={btnStyle("var(--psb-ink)", "#fff")}>Check out</button>
        )}
        {item.status === "In Use" && (
          <button onClick={() => onCheckin(item)} style={btnStyle("var(--psb-status-active)", "#fff")}>Check in</button>
        )}
        <button onClick={() => onTransfer(item)} style={btnStyle("transparent", "var(--psb-text)", "var(--psb-border)")}>
          <ArrowRightLeft size={13} />
        </button>
      </div>
    </div>
  );
}

const btnStyle = (bg, color, border) => ({
  background: bg, color, border: border ? `1.5px solid ${border}` : "none",
  borderRadius: 4, padding: "6px 10px", fontSize: 12.5, fontWeight: 600,
  fontFamily: "'Inter',sans-serif", cursor: "pointer", flex: 1,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
});

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(16,39,54,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "var(--psb-surface)", borderRadius: 8, width: "100%", maxWidth: 460,
        maxHeight: "90vh", overflowY: "auto", padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{
            fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: "var(--psb-text)",
            textTransform: "uppercase", letterSpacing: "0.02em", margin: 0,
          }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--psb-muted)" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 5, border: "1.5px solid var(--psb-border)",
  fontFamily: "'Inter',sans-serif", fontSize: 14, marginBottom: 14, boxSizing: "border-box",
  background: "var(--psb-surface)",
};
const labelStyle = {
  fontSize: 12, fontWeight: 600, color: "var(--psb-muted)", marginBottom: 5, display: "block",
  textTransform: "uppercase", letterSpacing: "0.03em",
};

function Field({ label, children }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

export default function InventoryView() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterWh, setFilterWh] = useState("all");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setData(JSON.parse(raw));
      } else {
        const seeded = seedData();
        setData(seeded);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      }
    } catch (e) {
      const seeded = seedData();
      setData(seeded);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch (_) {}
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
  }, []);

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
    return <div style={{ padding: 40, fontFamily: "'Inter',sans-serif", color: "var(--psb-muted)" }}>Loading inventory...</div>;
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "materials", label: "Materials", icon: Boxes },
    { id: "equipment", label: "Equipment", icon: HardHat },
    { id: "warehouses", label: "Locations", icon: Warehouse },
    { id: "log", label: "Activity log", icon: ClipboardList },
  ];

  return (
    <div className="inventory-module-layout">
      <style>{FONT_IMPORT}</style>

      {/* Sidebar */}
      <div className="inventory-sidebar">
        <div className="inventory-sidebar-brand">
          <div className="inventory-sidebar-title">STRATA</div>
          <div className="inventory-sidebar-subtitle">Equipment & Material Tracker</div>
          <div className="inventory-sidebar-region">Dallas–Fort Worth, TX</div>
        </div>
        <nav className="inventory-sidebar-nav">
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`inventory-sidebar-nav-item${view === n.id ? " is-active" : ""}`}
            >
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="inventory-sidebar-footer">
          Data shared across all Strata team members using this app.
        </div>
      </div>

      {/* Main content */}
      <div className="inventory-main">
        {toast && (
          <div className="inventory-toast">
            <PackageCheck size={15} color="var(--psb-gold)" /> {toast}
          </div>
        )}

        {view === "dashboard" && (
          <div>
            <h1 className="inventory-page-title">Dashboard</h1>
            <p className="inventory-page-desc">Live overview across all warehouse locations.</p>
            <div className="inventory-stat-row">
              <StatCard label="Total SKUs" value={data.items.length} />
              <StatCard label="Low stock alerts" value={lowStock.length} accent={lowStock.length ? "var(--psb-status-suspended)" : "var(--psb-gold)"} />
              <StatCard label="Equipment checked out" value={checkedOut} />
              <StatCard label="Active locations" value={data.warehouses.length} />
            </div>
            <div className="inventory-dashboard-panels">
              <div className="inventory-panel">
                <h3 className="inventory-panel-heading inventory-panel-heading--alert">
                  <AlertTriangle size={15} /> Low stock alerts
                </h3>
                {lowStock.length === 0 && <p className="inventory-panel-empty">All materials are above their reorder threshold.</p>}
                {lowStock.map(item => (
                  <div key={item.id} className="inventory-panel-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div className="inventory-panel-row-meta">{whName(item.warehouseId)}</div>
                    </div>
                    <div className="inventory-panel-row-value">{item.quantity}/{item.minThreshold} {item.unit}</div>
                  </div>
                ))}
              </div>
              <div className="inventory-panel">
                <h3 className="inventory-panel-heading">Recent activity</h3>
                {data.transactions.slice(0, 6).map(tx => (
                  <div key={tx.id} className="inventory-panel-row">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{tx.type}</span>
                      <span className="inventory-panel-row-date">{new Date(tx.date).toLocaleString()}</span>
                    </div>
                    <div className="inventory-panel-row-meta">{tx.itemName} — {tx.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(view === "materials" || view === "equipment") && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>
                {view === "materials" ? "Materials" : "Equipment"}
              </h1>
              <button
                onClick={() => openModal(view === "materials" ? "addMaterial" : "addEquipment")}
                className="inventory-btn inventory-btn--primary"
              >
                <Plus size={14} /> Add {view === "materials" ? "material" : "equipment"}
              </button>
            </div>
            <div className="inventory-filter-row">
              <div className="inventory-search-wrap">
                <Search size={15} className="inventory-search-icon" />
                <input
                  placeholder="Search by name or SKU"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="inventory-search-input"
                />
              </div>
              <select
                value={filterWh}
                onChange={e => setFilterWh(e.target.value)}
                className="inventory-filter-select"
              >
                <option value="all">All locations</option>
                {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {view === "materials" && (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      {["Name", "SKU", "Location", "Quantity", "Status", ""].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map(item => {
                      const low = item.quantity <= item.minThreshold;
                      return (
                        <tr key={item.id}>
                          <td className="inventory-td-name">{item.name}</td>
                          <td className="inventory-td-sku">{item.sku}</td>
                          <td>{whName(item.warehouseId)}</td>
                          <td className="inventory-td-mono">{item.quantity} {item.unit}</td>
                          <td>
                            <span className={`inventory-stock-badge${low ? " is-low" : " is-ok"}`}>
                              {low ? "Low stock" : "OK"}
                            </span>
                          </td>
                          <td className="inventory-td-actions">
                            <button onClick={() => openModal("restock", item)} className="inventory-btn inventory-btn--ghost">
                              <PackagePlus size={13} />
                            </button>
                            <button onClick={() => openModal("transfer", item)} className="inventory-btn inventory-btn--ghost">
                              <ArrowRightLeft size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {materials.length === 0 && (
                      <tr><td colSpan={6} className="inventory-empty">No materials match this view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {view === "equipment" && (
              <div className="inventory-card-grid">
                {equipmentList.map(item => (
                  <TagCard key={item.id} item={item} warehouseName={whName(item.warehouseId)}
                    onCheckout={(it) => openModal("checkout", it)}
                    onCheckin={handleCheckin}
                    onTransfer={(it) => openModal("transfer", it)} />
                ))}
                {equipmentList.length === 0 && <p style={{ color: "var(--psb-muted)" }}>No equipment matches this view.</p>}
              </div>
            )}
          </div>
        )}

        {view === "warehouses" && (
          <div>
            <div className="inventory-view-header">
              <h1 className="inventory-page-title" style={{ margin: 0 }}>Locations</h1>
              <button onClick={() => openModal("addWarehouse")} className="inventory-btn inventory-btn--primary">
                <Plus size={14} /> Add location
              </button>
            </div>
            <div className="inventory-card-grid">
              {data.warehouses.map(w => {
                const items = data.items.filter(i => i.warehouseId === w.id);
                const matCount = items.filter(i => i.category === "Material").length;
                const eqCount = items.filter(i => i.category === "Equipment").length;
                const low = items.filter(i => i.category === "Material" && i.quantity <= i.minThreshold).length;
                return (
                  <div key={w.id} className="inventory-wh-card">
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "log" && (
          <div>
            <h1 className="inventory-page-title">Activity log</h1>
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    {["Date", "Type", "Item", "Detail", "Location"].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map(tx => (
                    <tr key={tx.id}>
                      <td className="inventory-td-date">{new Date(tx.date).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{tx.type}</td>
                      <td>{tx.itemName}</td>
                      <td className="inventory-td-muted">{tx.detail}</td>
                      <td>{tx.warehouseName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "addWarehouse" && (
        <Modal title="Add location" onClose={closeModal}>
          <Field label="Location name"><input style={inputStyle} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plano Equipment Yard" /></Field>
          <Field label="Address"><input style={inputStyle} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address" /></Field>
          <Field label="City"><input style={inputStyle} value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Plano, TX" /></Field>
          <Field label="Manager"><input style={inputStyle} value={form.manager || ""} onChange={e => setForm({ ...form, manager: e.target.value })} placeholder="Name" /></Field>
          <button onClick={handleAddWarehouse} className="inventory-btn inventory-btn--primary" style={{ width: "100%", padding: 10, justifyContent: "center" }}>Add location</button>
        </Modal>
      )}

      {(modal === "addMaterial" || modal === "addEquipment") && (
        <Modal title={modal === "addMaterial" ? "Add material" : "Add equipment"} onClose={closeModal}>
          <Field label="Name"><input style={inputStyle} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="SKU"><input style={inputStyle} value={form.sku || ""} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MAT-LUM-206" /></Field>
          <Field label="Location">
            <select style={inputStyle} value={form.warehouseId || ""} onChange={e => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">Select location</option>
              {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          {modal === "addMaterial" && (
            <>
              <Field label="Unit"><input style={inputStyle} value={form.unit || ""} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ft, bags..." /></Field>
              <Field label="Starting quantity"><input type="number" style={inputStyle} value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field>
              <Field label="Reorder threshold"><input type="number" style={inputStyle} value={form.minThreshold || ""} onChange={e => setForm({ ...form, minThreshold: e.target.value })} /></Field>
              <Field label="Unit cost ($)"><input type="number" style={inputStyle} value={form.cost || ""} onChange={e => setForm({ ...form, cost: e.target.value })} /></Field>
            </>
          )}
          <button onClick={() => handleAddItem(modal === "addMaterial" ? "Material" : "Equipment")} className="inventory-btn inventory-btn--primary" style={{ width: "100%", padding: 10, justifyContent: "center" }}>
            Add {modal === "addMaterial" ? "material" : "equipment"}
          </button>
        </Modal>
      )}

      {modal === "restock" && (
        <Modal title={`Restock: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "var(--psb-muted)", marginBottom: 14 }}>Current quantity: <b>{form.quantity} {form.unit}</b> at {whName(form.warehouseId)}</p>
          <Field label={`Quantity to add (${form.unit})`}><input type="number" style={inputStyle} value={form.qty || ""} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
          <button onClick={handleRestock} className="inventory-btn inventory-btn--primary" style={{ width: "100%", padding: 10, justifyContent: "center" }}>Confirm restock</button>
        </Modal>
      )}

      {modal === "transfer" && (
        <Modal title={`Transfer: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "var(--psb-muted)", marginBottom: 14 }}>From <b>{whName(form.warehouseId)}</b></p>
          <Field label="Destination location">
            <select style={inputStyle} value={form.toWarehouseId || ""} onChange={e => setForm({ ...form, toWarehouseId: e.target.value })}>
              <option value="">Select destination</option>
              {data.warehouses.filter(w => w.id !== form.warehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          {form.category === "Material" && (
            <Field label={`Quantity to transfer (max ${form.quantity} ${form.unit})`}>
              <input type="number" style={inputStyle} value={form.qty || ""} onChange={e => setForm({ ...form, qty: e.target.value })} />
            </Field>
          )}
          <button onClick={handleTransfer} className="inventory-btn inventory-btn--primary" style={{ width: "100%", padding: 10, justifyContent: "center" }}>Confirm transfer</button>
        </Modal>
      )}

      {modal === "checkout" && (
        <Modal title={`Check out: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "var(--psb-muted)", marginBottom: 14 }}>At {whName(form.warehouseId)}</p>
          <Field label="Assigned to"><input style={inputStyle} value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="Crew member or supervisor name" /></Field>
          <button onClick={handleCheckout} className="inventory-btn inventory-btn--primary" style={{ width: "100%", padding: 10, justifyContent: "center" }}>Confirm check-out</button>
        </Modal>
      )}
    </div>
  );
}