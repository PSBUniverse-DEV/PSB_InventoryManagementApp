/**
 * Client Component — InventoryTransactionView.jsx
 *
 * UI structure only — no data binding, no backend logic, no validation rules yet.
 * Records stock in, stock out, transfer, and adjustment transactions for materials.
 */
"use client";

import "./InventoryTransactionView.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Check, X, Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Warehouse, Truck, ClipboardList, Columns, Settings,
  ArrowLeftRight, Hash, Calculator, Layers,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge,
} from "@/shared/components/ui";
import { useRouter } from "next/navigation";
import { INVENTORY_VIEWS } from "../data/inventory.data";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label inventory-form-label">{label}</label>
      {children}
    </div>
  );
}

// ─── CONSTANTS ──────────────────────────────────────────────

const TRANSACTION_TYPES = ["Stock In", "Stock Out", "Transfer", "Adjustment"];

const REASON_OPTIONS = {
  "Stock In": ["Purchase receipt", "Return to stock", "Production output", "Other"],
  "Stock Out": ["Project delivery", "Internal usage", "Sales order", "Other"],
  Transfer: ["Replenishment", "Project allocation", "Relocation", "Other"],
  Adjustment: ["Damaged", "Miscount", "Expired", "Quality hold", "Other"],
};

function generateRefNo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `WH-${num}`;
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryTransactionView({ initialData }) {
  const router = useRouter();
  const data = initialData;
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState("transaction");

  // Destructure server-loaded data
  const items = data?.items || [];
  const stockLevels = data?.stockLevels || [];
  const allWarehouses = data?.warehouses || [];
  const config = data?.config || {};

  // Transaction state — uses transaction type ID from config
  const transactionTypes = config?.transactionTypes || [];
  const [txType, setTxType] = useState(transactionTypes.length > 0 ? transactionTypes[0].id : "");
  const [searchValue, setSearchValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const searchRef = useRef(null);
  const [form, setForm] = useState({
    refNo: generateRefNo(),
    date: new Date().toISOString().slice(0, 10),
    project: "",
    deliverySite: "",
    sourceWarehouse: "",
    destinationWarehouse: "",
    reason: "",
    handledBy: "",
  });

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
      // Already on transaction page — no-op
      return;
    }
    if (viewId === "bom") {
      router.push("/inventory/bom");
      return;
    }
    // Navigate back to main inventory for other views
    router.push("/inventory");
  }, [router]);

  // ─── Search filtering (debounced) ───────────────────────

  const filteredResults = useMemo(() => {
    const q = (searchValue || "").trim().toLowerCase();
    if (q.length < 2) return [];

    return items
      .filter((item) => {
        const sku = (item.sku || "").toLowerCase();
        const name = (item.name || "").toLowerCase();
        const barcode = (item.barcode || "").toLowerCase();
        return sku.includes(q) || name.includes(q) || barcode.includes(q);
      })
      .slice(0, 8)
      .map((item) => {
        const stockEntry = stockLevels.find((sl) => String(sl.item_id) === String(item.id || item.item_id));
        return {
          id: item.id || item.item_id,
          sku: item.sku || "",
          name: item.name || "",
          barcode: item.barcode || null,
          binLocation: stockEntry?.bin_location || "",
          cost: item.cost || 0,
        };
      });
  }, [searchValue, items, stockLevels]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchValue(val);
    setSearchOpen(val.trim().length >= 2);
  }, []);

  const selectSearchResult = useCallback((result) => {
    const newItem = {
      id: Date.now(),
      sku: result.sku,
      material: result.name,
      barcode: result.barcode || "",
      binRack: result.binLocation,
      qty: 1,
      unitCost: result.cost || 0,
    };
    setLineItems((prev) => [...prev, newItem]);
    setSearchValue("");
    setSearchOpen(false);
  }, []);

  // Click-away & Escape close
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // ─── Line item helpers ───────────────────────────────────

  const addLineItem = useCallback(() => {
    const newItem = {
      id: Date.now(),
      sku: "",
      material: "",
      binRack: "",
      qty: 1,
      unitCost: 0,
    };
    setLineItems((prev) => [...prev, newItem]);
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // ─── Computed totals ─────────────────────────────────────

  const totals = useMemo(() => {
    const totalQty = lineItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const grandTotal = lineItems.reduce(
      (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitCost) || 0),
      0
    );
    return { totalQty, grandTotal, lineCount: lineItems.length };
  }, [lineItems]);

  // ─── Handlers ────────────────────────────────────────────

  const handleTxTypeChange = useCallback((newTypeId) => {
    setTxType(newTypeId);
    const found = transactionTypes.find((t) => String(t.id) === String(newTypeId));
    const isTransfer = found?.name === "Transfer";
    setForm((prev) => ({
      ...prev,
      reason: "",
      destinationWarehouse: isTransfer ? prev.destinationWarehouse : "",
    }));
  }, [transactionTypes]);

  const handleConfirm = useCallback(() => {
    // No data binding yet — placeholder
  }, []);

  const handleCancel = useCallback(() => {
    router.push("/inventory");
  }, [router]);

  const currentTxTypeName = useMemo(() => {
    const found = transactionTypes.find((t) => String(t.id) === String(txType));
    return found?.name || "";
  }, [txType, transactionTypes]);

  const showDestination = currentTxTypeName === "Transfer";

  if (!loaded) {
    return <div className="inventory-loading">Loading transaction screen...</div>;
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
          </div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => {
            const iconMap = {
              LayoutDashboard, BarChart3, Package, Wrench,
              Warehouse, Truck, ArrowLeftRight, ClipboardList, Columns, Settings,
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

        <div className="invoice-tx-header">
          <h1 className="inventory-page-title" style={{ margin: 0 }}>
            <ArrowLeftRight size={22} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
            Inventory Transaction
          </h1>
        </div>

        <div className="invoice-tx-layout">
          {/* ─── LEFT COLUMN — Line items panel ─── */}
          <div className="invoice-tx-left">
            {/* Toolbar */}
            <div className="invoice-tx-toolbar">
              <div className="invoice-tx-toolbar-field">
                <label className="form-label invoice-tx-toolbar-label">Transaction type</label>
                <select
                  className="form-select"
                  value={txType}
                  onChange={(e) => handleTxTypeChange(e.target.value)}
                >
                   {transactionTypes.map((t, idx) => (
                     <option key={t.id ?? idx} value={t.id}>{t.name}</option>
                   ))}
                </select>
              </div>
              <div className="invoice-tx-toolbar-field invoice-tx-search-field">
                <label className="form-label invoice-tx-toolbar-label">Search</label>
                <div className="invoice-tx-search-wrap" ref={searchRef}>
                  <Search size={16} className="invoice-tx-search-icon" />
                  <input
                    type="text"
                    className="form-control invoice-tx-search-input"
                    placeholder="Scan SKU or search material"
                    value={searchValue}
                    onChange={handleSearchChange}
                    onFocus={() => { if (searchValue.trim().length >= 2) setSearchOpen(true); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredResults.length > 0) {
                        selectSearchResult(filteredResults[0]);
                      }
                    }}
                  />
                  {searchOpen && filteredResults.length > 0 && (
                    <ul className="invoice-tx-search-dropdown">
                      {filteredResults.map((r) => (
                        <li
                          key={r.id}
                          className="invoice-tx-search-dropdown-item"
                          onClick={() => selectSearchResult(r)}
                        >
                          <span className="invoice-tx-search-dd-sku">{r.sku}</span>
                          {r.barcode && (
                            <span className="invoice-tx-search-dd-barcode">{r.barcode}</span>
                          )}
                          <span className="invoice-tx-search-dd-name">{r.name}</span>
                          {r.binLocation && (
                            <span className="invoice-tx-search-dd-bin">{r.binLocation}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Line items table */}
            <Card className="invoice-tx-table-card">
              <table className="invoice-tx-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Barcode</th>
                    <th>Material</th>
                    <th>Bin / Rack</th>
                    <th className="invoice-tx-col-num">Qty</th>
                    <th className="invoice-tx-col-currency">Unit cost</th>
                    <th className="invoice-tx-col-currency">Total</th>
                    <th className="invoice-tx-col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 && (
                    <tr>
                    <td colSpan={8} className="invoice-tx-empty">
                        No line items yet. Click "Add line item" or scan a SKU.
                      </td>
                    </tr>
                  )}
                  {lineItems.map((item) => {
                    const lineTotal = (Number(item.qty) || 0) * (Number(item.unitCost) || 0);
                    return (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={item.sku}
                            onChange={(e) => updateLineItem(item.id, "sku", e.target.value)}
                            placeholder="SKU"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={item.barcode || ""}
                            onChange={(e) => updateLineItem(item.id, "barcode", e.target.value)}
                            placeholder="Barcode"
                            style={{ minWidth: "110px" }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={item.material}
                            onChange={(e) => updateLineItem(item.id, "material", e.target.value)}
                            placeholder="Description"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={item.binRack}
                            onChange={(e) => updateLineItem(item.id, "binRack", e.target.value)}
                            placeholder="Bin"
                          />
                        </td>
                        <td className="invoice-tx-col-num">
                          <input
                            type="number"
                            className="form-control form-control-sm invoice-tx-input-num"
                            value={item.qty}
                            onChange={(e) => updateLineItem(item.id, "qty", e.target.value)}
                            min={0}
                          />
                        </td>
                        <td className="invoice-tx-col-currency">
                          <input
                            type="number"
                            className="form-control form-control-sm invoice-tx-input-currency"
                            value={item.unitCost}
                            onChange={(e) => updateLineItem(item.id, "unitCost", e.target.value)}
                            min={0}
                            step="0.01"
                          />
                        </td>
                        <td className="invoice-tx-col-currency invoice-tx-line-total">
                          ${lineTotal.toFixed(2)}
                        </td>
                        <td className="invoice-tx-col-action">
                          <button
                            type="button"
                            className="invoice-tx-remove-btn"
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
            </Card>

            <Button
              type="button"
              variant="outline-primary"
              className="invoice-tx-add-line-btn"
              onClick={addLineItem}
            >
              <Plus size={16} /> Add line item
            </Button>
          </div>

          {/* ─── RIGHT COLUMN — Transaction details, summary, actions ─── */}
          <div className="invoice-tx-right">
            {/* Transaction details card */}
            <Card className="invoice-tx-card" title="Transaction details">
              <Field label="Reference no.">
                <Input
                  value={form.refNo}
                  onChange={(e) => setForm({ ...form, refNo: e.target.value })}
                  disabled
                  className="invoice-tx-mono"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Project">
                <Input
                  value={form.project}
                  onChange={(e) => setForm({ ...form, project: e.target.value })}
                  placeholder='e.g. AFV 24x50 - J. Thompson'
                  className="invoice-tx-project-input"
                />
              </Field>
              <Field label="Delivery site">
                <Input
                  value={form.deliverySite}
                  onChange={(e) => setForm({ ...form, deliverySite: e.target.value })}
                  placeholder="Customer install address"
                />
              </Field>
              <Field label="Source warehouse">
                <select
                  className="form-select"
                  value={form.sourceWarehouse}
                  onChange={(e) => setForm({ ...form, sourceWarehouse: e.target.value })}
                >
                  <option value="">Select warehouse</option>
                  {allWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </Field>
              {showDestination && (
                <Field label="Destination warehouse">
                  <select
                    className="form-select"
                    value={form.destinationWarehouse}
                    onChange={(e) => setForm({ ...form, destinationWarehouse: e.target.value })}
                  >
                  <option value="">Select destination</option>
                  {allWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  </select>
                </Field>
              )}
              <Field label="Reason">
                <select
                  className="form-select"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                >
                  <option value="">Select reason</option>
                  {(REASON_OPTIONS[currentTxTypeName] || REASON_OPTIONS["Stock In"]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Handled by">
                <Input
                  value={form.handledBy}
                  onChange={(e) => setForm({ ...form, handledBy: e.target.value })}
                  placeholder="Staff member name"
                />
              </Field>
            </Card>

            {/* Summary card */}
            <Card className="invoice-tx-card invoice-tx-summary-card">
              <div className="invoice-tx-summary-row">
                <span className="invoice-tx-summary-label">
                  <Hash size={14} /> Line items
                </span>
                <span className="invoice-tx-summary-value">{totals.lineCount}</span>
              </div>
              <div className="invoice-tx-summary-row">
                <span className="invoice-tx-summary-label">
                  <Calculator size={14} /> Total qty
                </span>
                <span className="invoice-tx-summary-value">{totals.totalQty}</span>
              </div>
              <div className="invoice-tx-summary-row invoice-tx-summary-grand">
                <span className="invoice-tx-summary-label">Grand total</span>
                <span className="invoice-tx-summary-grand-value">
                  ${totals.grandTotal.toFixed(2)}
                </span>
              </div>
            </Card>

            {/* Actions */}
            <Button
              type="button"
              variant="success"
              className="invoice-tx-action-btn"
              onClick={handleConfirm}
            >
              <Check size={18} /> Confirm transaction
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="invoice-tx-action-btn invoice-tx-cancel-btn"
              onClick={handleCancel}
            >
              <X size={18} /> Cancel
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

//#endregion