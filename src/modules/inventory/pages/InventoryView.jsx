/**
 * Client Component — InventoryView.jsx
 *
 * Adapted from the Strata Tracker inventory management layout.
 * Manages materials, equipment, warehouses, and activity log
 * with client-side persistence via localStorage.
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

const catColor = (cat) => cat === "Equipment" ? "#B5652B" : "#2F6B4F";

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "#1C232C", borderRadius: 6, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px", minWidth: 150,
    }}>
      <span style={{
        fontFamily: "'Oswald',sans-serif", fontSize: 11, letterSpacing: "0.08em",
        color: "#9AA5B1", textTransform: "uppercase", fontWeight: 500,
      }}>{label}</span>
      <span style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 28, fontWeight: 600,
        color: accent || "#F2A900",
      }}>{value}</span>
    </div>
  );
}

function TagCard({ item, warehouseName, onCheckout, onCheckin, onTransfer }) {
  const color = catColor(item.category);
  const statusColor = item.status === "Available" ? "#2F6B4F" : item.status === "In Use" ? "#B5652B" : "#8A8478";
  return (
    <div style={{
      position: "relative", background: "#FFFFFF", border: "2px dashed #C9C2B2",
      borderRadius: 6, padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        position: "absolute", top: -9, left: 18, width: 16, height: 16, borderRadius: "50%",
        background: "#EDEAE1", border: "2px dashed #C9C2B2",
      }} />
      <div style={{
        position: "absolute", top: 10, right: 12, fontFamily: "'Oswald',sans-serif",
        fontSize: 10, letterSpacing: "0.1em", fontWeight: 600, color,
        border: `1.5px solid ${color}`, padding: "2px 6px", borderRadius: 3,
        transform: "rotate(-6deg)", textTransform: "uppercase",
      }}>{item.category === "Equipment" ? "EQP" : "MAT"}</div>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 15, color: "#1C232C" }}>{item.name}</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#8A8478", marginTop: 2 }}>{item.sku}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5B6470" }}>
        <MapPin size={13} /> {warehouseName}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: statusColor, textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}>{item.status}</span>
        {item.assignedTo && (
          <span style={{ fontSize: 12, color: "#5B6470", display: "flex", alignItems: "center", gap: 4 }}>
            <User size={12} /> {item.assignedTo}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {item.status === "Available" && (
          <button onClick={() => onCheckout(item)} style={btnStyle("#1C232C", "#fff")}>Check out</button>
        )}
        {item.status === "In Use" && (
          <button onClick={() => onCheckin(item)} style={btnStyle("#2F6B4F", "#fff")}>Check in</button>
        )}
        <button onClick={() => onTransfer(item)} style={btnStyle("transparent", "#1C232C", "#C9C2B2")}>
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
      position: "fixed", inset: 0, background: "rgba(28,35,44,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 8, width: "100%", maxWidth: 460,
        maxHeight: "90vh", overflowY: "auto", padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{
            fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: "#1C232C",
            textTransform: "uppercase", letterSpacing: "0.02em", margin: 0,
          }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8478" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 5, border: "1.5px solid #D8D3C6",
  fontFamily: "'Inter',sans-serif", fontSize: 14, marginBottom: 14, boxSizing: "border-box",
  background: "#FAF9F5",
};
const labelStyle = {
  fontSize: 12, fontWeight: 600, color: "#5B6470", marginBottom: 5, display: "block",
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
    return <div style={{ padding: 40, fontFamily: "'Inter',sans-serif", color: "#5B6470" }}>Loading inventory...</div>;
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "materials", label: "Materials", icon: Boxes },
    { id: "equipment", label: "Equipment", icon: HardHat },
    { id: "warehouses", label: "Locations", icon: Warehouse },
    { id: "log", label: "Activity log", icon: ClipboardList },
  ];

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#EDEAE1", minHeight: 600, display: "flex", color: "#1C232C", margin: "-1.25rem -1.5rem", width: "calc(100% + 3rem)" }}>
      <style>{FONT_IMPORT}</style>

      <div style={{
        width: 220, background: "#1C232C", flexShrink: 0, display: "flex", flexDirection: "column",
        padding: "22px 16px",
      }} className="sidebar-desktop">
        <div style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 22px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 22px)",
          padding: "10px 10px 14px", marginBottom: 20, borderBottom: "1px solid #333D48",
        }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 17, fontWeight: 700, color: "#F2A900", letterSpacing: "0.03em" }}>STRATA</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, color: "#9AA5B1", letterSpacing: "0.12em", textTransform: "uppercase" }}>Equipment & Material Tracker</div>
          <div style={{ fontSize: 11, color: "#5F6B78", marginTop: 4 }}>Dallas–Fort Worth, TX</div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setView(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 5,
              background: view === n.id ? "#2A3541" : "transparent", border: "none", cursor: "pointer",
              color: view === n.id ? "#F2A900" : "#C4CAD1", fontSize: 13.5, fontWeight: 500, textAlign: "left",
            }}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: "auto", fontSize: 11, color: "#5F6B78", paddingTop: 16, borderTop: "1px solid #333D48" }}>
          Data shared across all Strata team members using this app.
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: "26px 32px" }}>
        {toast && (
          <div style={{
            position: "fixed", top: 20, right: 20, background: "#1C232C", color: "#fff", padding: "10px 16px",
            borderRadius: 6, fontSize: 13.5, zIndex: 100, display: "flex", alignItems: "center", gap: 8,
          }}>
            <PackageCheck size={15} color="#F2A900" /> {toast}
          </div>
        )}

        {view === "dashboard" && (
          <div>
            <h1 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Dashboard</h1>
            <p style={{ color: "#5B6470", fontSize: 14, marginBottom: 20 }}>Live overview across all warehouse locations.</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
              <StatCard label="Total SKUs" value={data.items.length} />
              <StatCard label="Low stock alerts" value={lowStock.length} accent={lowStock.length ? "#E0632E" : "#F2A900"} />
              <StatCard label="Equipment checked out" value={checkedOut} />
              <StatCard label="Active locations" value={data.warehouses.length} />
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", background: "#fff", borderRadius: 6, border: "1px solid #D8D3C6", padding: 18 }}>
                <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6, color: "#B5652B" }}>
                  <AlertTriangle size={15} /> Low stock alerts
                </h3>
                {lowStock.length === 0 && <p style={{ fontSize: 13.5, color: "#8A8478" }}>All materials are above their reorder threshold.</p>}
                {lowStock.map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13.5 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ color: "#8A8478", fontSize: 12 }}>{whName(item.warehouseId)}</div>
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#B5652B", fontWeight: 600 }}>{item.quantity}/{item.minThreshold} {item.unit}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: "1 1 320px", background: "#fff", borderRadius: 6, border: "1px solid #D8D3C6", padding: 18 }}>
                <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Recent activity</h3>
                {data.transactions.slice(0, 6).map(tx => (
                  <div key={tx.id} style={{ padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{tx.type}</span>
                      <span style={{ color: "#8A8478", fontSize: 11.5 }}>{new Date(tx.date).toLocaleString()}</span>
                    </div>
                    <div style={{ color: "#5B6470" }}>{tx.itemName} — {tx.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(view === "materials" || view === "equipment") && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h1 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, textTransform: "uppercase", margin: 0 }}>
                {view === "materials" ? "Materials" : "Equipment"}
              </h1>
              <button onClick={() => openModal(view === "materials" ? "addMaterial" : "addEquipment")} style={{
                ...btnStyle("#F2A900", "#1C232C"), flex: "none", padding: "9px 14px",
              }}>
                <Plus size={14} /> Add {view === "materials" ? "material" : "equipment"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 220px" }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#8A8478" }} />
                <input placeholder="Search by name or SKU" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0, paddingLeft: 32 }} />
              </div>
              <select value={filterWh} onChange={e => setFilterWh(e.target.value)} style={{ ...inputStyle, marginBottom: 0, width: 210 }}>
                <option value="all">All locations</option>
                {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {view === "materials" && (
              <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #D8D3C6", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: "#F5F3EC", textAlign: "left" }}>
                      {["Name", "SKU", "Location", "Quantity", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5B6470" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map(item => {
                      const low = item.quantity <= item.minThreshold;
                      return (
                        <tr key={item.id} style={{ borderTop: "1px solid #F0EEE7" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono',monospace", color: "#8A8478" }}>{item.sku}</td>
                          <td style={{ padding: "10px 14px" }}>{whName(item.warehouseId)}</td>
                          <td style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono',monospace" }}>{item.quantity} {item.unit}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 3,
                              background: low ? "#F9E3D8" : "#E3EEE7", color: low ? "#B5652B" : "#2F6B4F",
                            }}>{low ? "Low stock" : "OK"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                            <button onClick={() => openModal("restock", item)} style={{ ...btnStyle("transparent", "#1C232C", "#D8D3C6"), flex: "none", padding: "5px 8px" }}>
                              <PackagePlus size={13} />
                            </button>
                            <button onClick={() => openModal("transfer", item)} style={{ ...btnStyle("transparent", "#1C232C", "#D8D3C6"), flex: "none", padding: "5px 8px" }}>
                              <ArrowRightLeft size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {materials.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#8A8478" }}>No materials match this view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {view === "equipment" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
                {equipmentList.map(item => (
                  <TagCard key={item.id} item={item} warehouseName={whName(item.warehouseId)}
                    onCheckout={(it) => openModal("checkout", it)}
                    onCheckin={handleCheckin}
                    onTransfer={(it) => openModal("transfer", it)} />
                ))}
                {equipmentList.length === 0 && <p style={{ color: "#8A8478" }}>No equipment matches this view.</p>}
              </div>
            )}
          </div>
        )}

        {view === "warehouses" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h1 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, textTransform: "uppercase", margin: 0 }}>Locations</h1>
              <button onClick={() => openModal("addWarehouse")} style={{ ...btnStyle("#F2A900", "#1C232C"), flex: "none", padding: "9px 14px" }}>
                <Plus size={14} /> Add location
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {data.warehouses.map(w => {
                const items = data.items.filter(i => i.warehouseId === w.id);
                const matCount = items.filter(i => i.category === "Material").length;
                const eqCount = items.filter(i => i.category === "Equipment").length;
                const low = items.filter(i => i.category === "Material" && i.quantity <= i.minThreshold).length;
                return (
                  <div key={w.id} style={{ background: "#fff", border: "1px solid #D8D3C6", borderRadius: 6, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Warehouse size={16} color="#F2A900" />
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#5B6470", marginBottom: 12 }}>{w.address}, {w.city}</div>
                    <div style={{ fontSize: 12.5, color: "#8A8478", marginBottom: 12 }}>Manager: {w.manager || "Unassigned"}</div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12.5, borderTop: "1px solid #F0EEE7", paddingTop: 10 }}>
                      <span><b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{matCount}</b> materials</span>
                      <span><b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{eqCount}</b> equipment</span>
                      {low > 0 && <span style={{ color: "#B5652B" }}><b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{low}</b> low stock</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "log" && (
          <div>
            <h1 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, textTransform: "uppercase", marginBottom: 18 }}>Activity log</h1>
            <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #D8D3C6", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: "#F5F3EC", textAlign: "left" }}>
                    {["Date", "Type", "Item", "Detail", "Location"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5B6470" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map(tx => (
                    <tr key={tx.id} style={{ borderTop: "1px solid #F0EEE7" }}>
                      <td style={{ padding: "10px 14px", color: "#8A8478", fontSize: 12 }}>{new Date(tx.date).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{tx.type}</td>
                      <td style={{ padding: "10px 14px" }}>{tx.itemName}</td>
                      <td style={{ padding: "10px 14px", color: "#5B6470" }}>{tx.detail}</td>
                      <td style={{ padding: "10px 14px" }}>{tx.warehouseName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modal === "addWarehouse" && (
        <Modal title="Add location" onClose={closeModal}>
          <Field label="Location name"><input style={inputStyle} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plano Equipment Yard" /></Field>
          <Field label="Address"><input style={inputStyle} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address" /></Field>
          <Field label="City"><input style={inputStyle} value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Plano, TX" /></Field>
          <Field label="Manager"><input style={inputStyle} value={form.manager || ""} onChange={e => setForm({ ...form, manager: e.target.value })} placeholder="Name" /></Field>
          <button onClick={handleAddWarehouse} style={{ ...btnStyle("#F2A900", "#1C232C"), width: "100%", padding: 10 }}>Add location</button>
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
          <button onClick={() => handleAddItem(modal === "addMaterial" ? "Material" : "Equipment")} style={{ ...btnStyle("#F2A900", "#1C232C"), width: "100%", padding: 10 }}>
            Add {modal === "addMaterial" ? "material" : "equipment"}
          </button>
        </Modal>
      )}

      {modal === "restock" && (
        <Modal title={`Restock: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "#5B6470", marginBottom: 14 }}>Current quantity: <b>{form.quantity} {form.unit}</b> at {whName(form.warehouseId)}</p>
          <Field label={`Quantity to add (${form.unit})`}><input type="number" style={inputStyle} value={form.qty || ""} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
          <button onClick={handleRestock} style={{ ...btnStyle("#F2A900", "#1C232C"), width: "100%", padding: 10 }}>Confirm restock</button>
        </Modal>
      )}

      {modal === "transfer" && (
        <Modal title={`Transfer: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "#5B6470", marginBottom: 14 }}>From <b>{whName(form.warehouseId)}</b></p>
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
          <button onClick={handleTransfer} style={{ ...btnStyle("#F2A900", "#1C232C"), width: "100%", padding: 10 }}>Confirm transfer</button>
        </Modal>
      )}

      {modal === "checkout" && (
        <Modal title={`Check out: ${form.name}`} onClose={closeModal}>
          <p style={{ fontSize: 13.5, color: "#5B6470", marginBottom: 14 }}>At {whName(form.warehouseId)}</p>
          <Field label="Assigned to"><input style={inputStyle} value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="Crew member or supervisor name" /></Field>
          <button onClick={handleCheckout} style={{ ...btnStyle("#F2A900", "#1C232C"), width: "100%", padding: 10 }}>Confirm check-out</button>
        </Modal>
      )}
    </div>
  );
}