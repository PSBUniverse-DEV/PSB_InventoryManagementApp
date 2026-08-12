  "use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, FileText, Plus, RefreshCw, X, Save, Trash2,
  ArrowLeft, TrendingUp, TrendingDown, Clock, CheckCircle,
  AlertTriangle, DollarSign, Package, Truck, BarChart3,
  Download,
} from "lucide-react";
import {
  Button, Card, Input, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PR_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const PO_PAYMENT_TERMS = ["Net 15", "Net 30", "Net 60", "COD", "50% Advance"];

function generatePRNo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `PR-${num}`;
}

function generatePONo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `PO-${num}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function ProcurementView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);
  const [view, setView] = useState("dashboard"); // "dashboard" | "pr" | "po"

  const items = data?.items || [];
  const warehouses = data?.warehouses || [];
  const suppliers = data?.suppliers || [];
  const config = data?.config || {};

  // Filter to materials only
  const materialItems = useMemo(
    () => items.filter((i) => (i.classification || "").toLowerCase() === "material"),
    [items]
  );

  // Lookups
  const itemMap = useMemo(() => {
    const map = {};
    items.forEach((i) => { map[String(i.id)] = i; });
    return map;
  }, [items]);

  const unitLookup = useMemo(() => {
    const map = {};
    (config?.units || []).forEach((u) => { map[String(u.id)] = u.abbreviation || u.name; });
    return map;
  }, [config]);

  const unitForItem = useCallback(
    (itemId) => {
      const item = itemMap[String(itemId)];
      return item ? unitLookup[String(item.unit_id)] || "pcs" : "pcs";
    },
    [itemMap, unitLookup]
  );

  // ─── PR Form State ─────────────────────────────────────────
  const [prForm, setPrForm] = useState({
    refNo: generatePRNo(),
    date: new Date().toISOString().slice(0, 10),
    requestedBy: "",
    department: "",
    requiredDate: "",
    priority: PR_PRIORITIES[1],
    remarks: "",
  });
  const [prLineItems, setPrLineItems] = useState([]);
  const updatePrForm = (field, value) => setPrForm((prev) => ({ ...prev, [field]: value }));

  // ─── PO Form State ─────────────────────────────────────────
  const [poForm, setPoForm] = useState({
    refNo: generatePONo(),
    date: new Date().toISOString().slice(0, 10),
    supplierId: "",
    prRef: "",
    deliveryDate: "",
    paymentTerms: PO_PAYMENT_TERMS[1],
    remarks: "",
  });
  const [poLineItems, setPoLineItems] = useState([]);
  const updatePoForm = (field, value) => setPoForm((prev) => ({ ...prev, [field]: value }));

  // ─── Common ────────────────────────────────────────────────
  const refresh = useCallback(() => router.refresh(), [router]);
  const showToast = useCallback((msg, kind = "success") => {
    if (kind === "error") toastError(msg);
    else toastSuccess(msg);
  }, []);

  // ─── PR Line Item Helpers ──────────────────────────────────
  const addPrLineItem = useCallback(() => {
    setPrLineItems((prev) => [...prev, { id: Date.now(), itemId: "", quantity: "", purpose: "" }]);
  }, []);
  const updatePrLineItem = useCallback((id, field, value) => {
    setPrLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  }, []);
  const removePrLineItem = useCallback((id) => {
    setPrLineItems((prev) => prev.filter((li) => li.id !== id));
  }, []);

  // ─── PO Line Item Helpers ──────────────────────────────────
  const addPoLineItem = useCallback(() => {
    setPoLineItems((prev) => [...prev, { id: Date.now(), itemId: "", quantity: "", unitPrice: "" }]);
  }, []);
  const updatePoLineItem = useCallback((id, field, value) => {
    setPoLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  }, []);
  const removePoLineItem = useCallback((id) => {
    setPoLineItems((prev) => prev.filter((li) => li.id !== id));
  }, []);

  // ─── Submit Handlers ───────────────────────────────────────
  const handlePrSubmit = useCallback(() => {
    showToast("Purchase Request saved (UI only — data binding coming soon).");
  }, [showToast]);
  const handlePoSubmit = useCallback(() => {
    showToast("Purchase Order saved (UI only — data binding coming soon).");
  }, [showToast]);

  // ─── PR Line Item Columns ──────────────────────────────────
  const prLineItemColumns = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, render: (row) => (
      <select className="form-select form-select-sm" value={row.itemId} onChange={(e) => updatePrLineItem(row.id, "itemId", e.target.value)} style={{ width: "100%", minWidth: "180px" }}>
        <option value="">Select item</option>
        {materialItems.map((i) => (<option key={i.id} value={String(i.id)}>{i.name} ({i.sku})</option>))}
      </select>
    )},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
        <input type="number" className="form-control form-control-sm" value={row.quantity} onChange={(e) => updatePrLineItem(row.id, "quantity", e.target.value)} placeholder="0" min="1" style={{ width: "80px", textAlign: "center" }} />
        <span className="text-muted small">{unitForItem(row.itemId)}</span>
      </div>
    )},
    { key: "purpose", label: "Purpose / Notes", sortable: false, render: (row) => (
      <input type="text" className="form-control form-control-sm" value={row.purpose} onChange={(e) => updatePrLineItem(row.id, "purpose", e.target.value)} placeholder="e.g. Project Alpha restock" style={{ width: "100%", minWidth: "160px" }} />
    )},
    { key: "actions", label: "", sortable: false, align: "center", render: (row) => (
      <Button variant="ghost" size="sm" onClick={() => removePrLineItem(row.id)} title="Remove item"><Trash2 size={14} /></Button>
    )},
  ], [materialItems, updatePrLineItem, removePrLineItem, unitForItem]);

  // ─── PO Line Item Columns ──────────────────────────────────
  const poLineItemColumns = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, render: (row) => (
      <select className="form-select form-select-sm" value={row.itemId} onChange={(e) => updatePoLineItem(row.id, "itemId", e.target.value)} style={{ width: "100%", minWidth: "180px" }}>
        <option value="">Select item</option>
        {materialItems.map((i) => (<option key={i.id} value={String(i.id)}>{i.name} ({i.sku})</option>))}
      </select>
    )},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
        <input type="number" className="form-control form-control-sm" value={row.quantity} onChange={(e) => updatePoLineItem(row.id, "quantity", e.target.value)} placeholder="0" min="1" style={{ width: "80px", textAlign: "center" }} />
        <span className="text-muted small">{unitForItem(row.itemId)}</span>
      </div>
    )},
    { key: "unitPrice", label: "Unit Price", sortable: false, align: "right", render: (row) => (
      <input type="number" className="form-control form-control-sm" value={row.unitPrice} onChange={(e) => updatePoLineItem(row.id, "unitPrice", e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ width: "100px", textAlign: "right" }} />
    )},
    { key: "total", label: "Total", sortable: false, align: "right", render: (row) => {
      const qty = Number(row.quantity) || 0;
      const price = Number(row.unitPrice) || 0;
      return <span className="inventory-mono fw-semibold">${(qty * price).toFixed(2)}</span>;
    }},
    { key: "actions", label: "", sortable: false, align: "center", render: (row) => (
      <Button variant="ghost" size="sm" onClick={() => removePoLineItem(row.id)} title="Remove item"><Trash2 size={14} /></Button>
    )},
  ], [materialItems, updatePoLineItem, removePoLineItem, unitForItem]);

  // ─── Render ────────────────────────────────────────────────
  if (hideSidebar) {
    // ─── PR FORM VIEW ────────────────────────────────────────
    if (view === "pr") {
      return (
        <div className="tx-form-page">
          <div className="tx-form-header">
            <div>
              <h1 className="tx-form-title">
                <ClipboardList size={22} style={{ color: "var(--psb-blue, #3b82f6)" }} />
                New Purchase Request
              </h1>
              <p className="tx-form-subtitle">Create a purchase request for materials and supplies.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
              <ArrowLeft size={14} /> Back to Dashboard
            </Button>
          </div>
          <div className="tx-form-layout tx-form-layout--full">
            <div className="tx-form-main">
              <Card className="tx-form-card">
                <div className="tx-form-card-header">
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">PR Reference #</label>
                      <Input value={prForm.refNo} onChange={(e) => updatePrForm("refNo", e.target.value)} placeholder="Auto-generated" />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Date</label>
                      <input type="date" className="form-control" value={prForm.date} onChange={(e) => updatePrForm("date", e.target.value)} />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Requested By *</label>
                      <Input value={prForm.requestedBy} onChange={(e) => updatePrForm("requestedBy", e.target.value)} placeholder="Employee name" />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Department</label>
                      <Input value={prForm.department} onChange={(e) => updatePrForm("department", e.target.value)} placeholder="e.g. Operations, Maintenance" />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Required Date</label>
                      <input type="date" className="form-control" value={prForm.requiredDate} onChange={(e) => updatePrForm("requiredDate", e.target.value)} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Priority</label>
                      <select className="form-select" value={prForm.priority} onChange={(e) => updatePrForm("priority", e.target.value)}>
                        {PR_PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-section-header">
                    <h3>Requested Items</h3>
                    <Button variant="success" size="sm" onClick={addPrLineItem} disabled={isBusy}><Plus size={14} /> Add Item</Button>
                  </div>
                  {prLineItems.length > 0 && <TableZ data={prLineItems} columns={prLineItemColumns} rowIdKey="id" hideSearch hideFooter emptyMessage="" />}
                  {prLineItems.length === 0 && <p className="tx-form-empty">No items added yet. Click "Add Item" to start.</p>}
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Remarks</label>
                    <Input value={prForm.remarks} onChange={(e) => updatePrForm("remarks", e.target.value)} placeholder="Justification, special instructions, etc." />
                  </div>
                </div>
                <div className="tx-form-actions">
                  <Button variant="ghost" size="sm" onClick={() => { setPrLineItems([]); updatePrForm("remarks", ""); }} disabled={isBusy}><X size={14} /> Clear Form</Button>
                  <Button variant="danger" size="md" onClick={handlePrSubmit} loading={isBusy}><Save size={14} /> Submit Purchase Request</Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      );
    }

    // ─── PO FORM VIEW ────────────────────────────────────────
    if (view === "po") {
      return (
        <div className="tx-form-page">
          <div className="tx-form-header">
            <div>
              <h1 className="tx-form-title">
                <FileText size={22} style={{ color: "var(--psb-blue, #3b82f6)" }} />
                New Purchase Order
              </h1>
              <p className="tx-form-subtitle">Create a purchase order from an approved request.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
              <ArrowLeft size={14} /> Back to Dashboard
            </Button>
          </div>
          <div className="tx-form-layout tx-form-layout--full">
            <div className="tx-form-main">
              <Card className="tx-form-card">
                <div className="tx-form-card-header">
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">PO Reference #</label>
                      <Input value={poForm.refNo} onChange={(e) => updatePoForm("refNo", e.target.value)} placeholder="Auto-generated" />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Date</label>
                      <input type="date" className="form-control" value={poForm.date} onChange={(e) => updatePoForm("date", e.target.value)} />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Supplier *</label>
                      <select className="form-select" value={poForm.supplierId} onChange={(e) => updatePoForm("supplierId", e.target.value)}>
                        <option value="">Select supplier</option>
                        {suppliers.map((s) => (<option key={s.id} value={String(s.id)}>{s.name}</option>))}
                      </select>
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">PR Reference</label>
                      <Input value={poForm.prRef} onChange={(e) => updatePoForm("prRef", e.target.value)} placeholder="e.g. PR-12345" />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Delivery Date</label>
                      <input type="date" className="form-control" value={poForm.deliveryDate} onChange={(e) => updatePoForm("deliveryDate", e.target.value)} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Payment Terms</label>
                      <select className="form-select" value={poForm.paymentTerms} onChange={(e) => updatePoForm("paymentTerms", e.target.value)}>
                        {PO_PAYMENT_TERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-section-header">
                    <h3>Order Items</h3>
                    <Button variant="success" size="sm" onClick={addPoLineItem} disabled={isBusy}><Plus size={14} /> Add Item</Button>
                  </div>
                  {poLineItems.length > 0 && <TableZ data={poLineItems} columns={poLineItemColumns} rowIdKey="id" hideSearch hideFooter emptyMessage="" />}
                  {poLineItems.length === 0 && <p className="tx-form-empty">No items added yet. Click "Add Item" to start.</p>}
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Remarks</label>
                    <Input value={poForm.remarks} onChange={(e) => updatePoForm("remarks", e.target.value)} placeholder="Delivery instructions, special terms, etc." />
                  </div>
                </div>
                <div className="tx-form-actions">
                  <Button variant="ghost" size="sm" onClick={() => { setPoLineItems([]); updatePoForm("remarks", ""); }} disabled={isBusy}><X size={14} /> Clear Form</Button>
                  <Button variant="danger" size="md" onClick={handlePoSubmit} loading={isBusy}><Save size={14} /> Submit Purchase Order</Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      );
    }

    // ─── DASHBOARD VIEW (default) ────────────────────────────
    return (
      <div className="procurement-page">
        {/* ── Page Header ─────────────────────────────────── */}
        <header className="proc-page-header">
          <div className="proc-page-header__copy">
            <h1 className="proc-page-header__title">Procurement Dashboard</h1>
            <p className="proc-page-header__desc">
              Monitor purchasing activities, approvals, suppliers, and material acquisition across inventory operations.
            </p>
          </div>
          <div className="proc-header-actions">
            <Button variant="outline-secondary" size="sm" onClick={() => showToast("Export report (coming soon).")}>
              <Download size={14} /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setView("pr")}>
              <Plus size={14} /> New Purchase Request
            </Button>
          </div>
        </header>

        {/* ── KPI Cards ───────────────────────────────────── */}
        <section className="proc-section">
          <div className="proc-kpi-grid">
            <article className="proc-kpi-card">
              <div className="proc-kpi-label">Purchase Requests</div>
              <div className="proc-kpi-value">—</div>
              <div className="proc-kpi-meta">Current period</div>
            </article>
            <article className="proc-kpi-card proc-kpi-card--warning">
              <div className="proc-kpi-label">Pending Approval</div>
              <div className="proc-kpi-value">—</div>
              <div className="proc-kpi-meta">Requires attention</div>
            </article>
            <article className="proc-kpi-card proc-kpi-card--success">
              <div className="proc-kpi-label">Active Purchase Orders</div>
              <div className="proc-kpi-value">—</div>
              <div className="proc-kpi-meta">Current active orders</div>
            </article>
            <article className="proc-kpi-card">
              <div className="proc-kpi-label">Procurement Spend</div>
              <div className="proc-kpi-value">—</div>
              <div className="proc-kpi-meta">Current period</div>
            </article>
          </div>
        </section>

        {/* ── Procurement Workflow ────────────────────────── */}
        <section className="proc-section">
          <div className="proc-section-header">
            <div>
              <h2 className="proc-section-title">Procurement Workflow</h2>
              <p className="proc-section-desc">Current transaction flow across procurement and inventory.</p>
            </div>
          </div>
          <div className="proc-workflow-card">
            <div className="proc-workflow-scroll">
              <div className="proc-workflow">
                {[
                  { icon: "PR", label: "Purchase Request", count: "—" },
                  { icon: "A", label: "Approval", count: "—", active: true },
                  { icon: "PO", label: "Purchase Order", count: "—", complete: true },
                  { icon: "R", label: "Receiving", count: "—" },
                  { icon: "V", label: "Verification", count: "—" },
                  { icon: "SI", label: "Stock-In", count: "—" },
                ].map((step, i) => (
                  <React.Fragment key={step.label}>
                    {i > 0 && <div className="proc-workflow-connector" />}
                    <div className={`proc-workflow-step${step.active ? " proc-workflow-step--active" : ""}${step.complete ? " proc-workflow-step--complete" : ""}`}>
                      <div className="proc-workflow-node">
                        <div className="proc-workflow-icon">{step.icon}</div>
                        <div className="proc-workflow-name">{step.label}</div>
                        <div className="proc-workflow-count">{step.count}</div>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Analytics Grid ──────────────────────────────── */}
        <section className="proc-section">
          <div className="proc-analytics-grid">
            {/* Procurement Spend */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Procurement Spend</h2>
                  <p className="proc-card-subtitle">Spending trend based on actual procurement data.</p>
                </div>
              </div>
              <div className="proc-card-body">
                <div className="proc-spend-summary">
                  <div>
                    <div className="proc-spend-value">—</div>
                    <div className="proc-spend-label">Current period</div>
                  </div>
                </div>
                <div className="proc-chart-placeholder">No procurement spend data available.</div>
              </div>
            </article>

            {/* Procurement Health */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Procurement Health</h2>
                  <p className="proc-card-subtitle">Performance indicators calculated from actual data.</p>
                </div>
              </div>
              <div className="proc-card-body">
                <div className="proc-health-grid">
                  {[
                    { label: "Supplier On-Time Delivery", value: "—", status: "Not available" },
                    { label: "Cost Savings", value: "—", status: "Not available" },
                    { label: "Average Lead Time", value: "—", status: "Not available" },
                    { label: "Delayed Orders", value: "—", status: "Not available" },
                  ].map((item, i) => (
                    <div key={i} className="proc-health-item">
                      <div className="proc-health-label">{item.label}</div>
                      <div className="proc-health-value">{item.value}</div>
                      <div className="proc-health-status">{item.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* ── Recent Purchase Requests ────────────────────── */}
        <section className="proc-section">
          <div className="proc-section-header">
            <div>
              <h2 className="proc-section-title">Recent Purchase Requests</h2>
              <p className="proc-section-desc">Latest purchase requests from the inventory procurement process.</p>
            </div>
          </div>
          <div className="proc-card">
            <div className="proc-table-container">
              <table className="proc-table">
                <thead>
                  <tr>
                    <th>PR Number</th>
                    <th>Project</th>
                    <th>Material</th>
                    <th>Requester</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="proc-table-empty">
                    <td colSpan={7}>
                      <div className="proc-empty-state">
                        <div className="proc-empty-state__icon">—</div>
                        <strong>No purchase requests found.</strong>
                        <span>Purchase request data will appear here when available.</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Bottom Operations ───────────────────────────── */}
        <section className="proc-section">
          <div className="proc-ops-grid">
            {/* Approval Queue */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Approval Queue</h2>
                  <p className="proc-card-subtitle">Purchase requests requiring your attention.</p>
                </div>
                <span className="proc-status proc-status--pending">—</span>
              </div>
              <div className="proc-queue">
                <div className="proc-empty-state">
                  <div className="proc-empty-state__icon">—</div>
                  <strong>No pending approvals.</strong>
                  <span>Assigned approval tasks will appear here.</span>
                </div>
              </div>
            </article>

            {/* Supplier Performance */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Supplier Performance</h2>
                  <p className="proc-card-subtitle">Supplier performance based on actual procurement activity.</p>
                </div>
              </div>
              <div className="proc-supplier-list">
                <div className="proc-supplier-empty">No supplier performance data available.</div>
              </div>
            </article>
          </div>
        </section>

        {/* ── Dashboard-specific CSS ──────────────────────── */}
        <style jsx>{`
          /* =========================================================
             DESIGN TOKENS
          ========================================================= */
          .procurement-page {
            --proc-primary: #1877B9;
            --proc-primary-dark: #0F5D91;
            --proc-black: #111518;
            --proc-charcoal: #1C2227;
            --proc-steel: #39434B;
            --proc-bg: #F3F5F6;
            --proc-surface: #FFFFFF;
            --proc-surface-soft: #F8FAFB;
            --proc-border: #E1E6E9;
            --proc-border-dark: #CBD3D8;
            --proc-text: #172027;
            --proc-text-secondary: #66737C;
            --proc-text-muted: #8A969E;
            --proc-success: #248661;
            --proc-success-bg: #EAF6F1;
            --proc-warning: #C98228;
            --proc-warning-bg: #FFF5E8;
            --proc-danger: #C94E4E;
            --proc-danger-bg: #FDEEEE;
            --proc-radius-sm: 6px;
            --proc-radius-md: 10px;
            --proc-radius-lg: 14px;
            --proc-shadow-sm: 0 2px 8px rgba(17, 21, 24, 0.05);
            --proc-shadow-md: 0 8px 24px rgba(17, 21, 24, 0.07);
            --proc-content-max: 1600px;

            width: 100%;
            min-width: 0;
            max-width: var(--proc-content-max);
            margin: 0 auto;
            padding: 16px;
          }

          /* =========================================================
             PAGE HEADER
          ========================================================= */
          .proc-page-header {
            display: flex;
            flex-direction: column;
            gap: 18px;
            margin-bottom: 20px;
          }
          .proc-page-header__title {
            margin: 0;
            font-size: 26px;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: var(--proc-black);
          }
          .proc-page-header__desc {
            max-width: 650px;
            margin: 8px 0 0;
            color: var(--proc-text-secondary);
            font-size: 14px;
          }
          .proc-header-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          /* =========================================================
             SECTION
          ========================================================= */
          .proc-section { margin-bottom: 18px; }
          .proc-section-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
          }
          .proc-section-title {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: -0.01em;
            color: var(--proc-black);
          }
          .proc-section-desc {
            margin: 3px 0 0;
            color: var(--proc-text-muted);
            font-size: 12px;
          }

          /* =========================================================
             KPI
          ========================================================= */
          .proc-kpi-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .proc-kpi-card {
            position: relative;
            min-width: 0;
            padding: 16px;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-kpi-card::before {
            content: "";
            position: absolute;
            left: 0; top: 12px; bottom: 12px;
            width: 3px;
            background: var(--proc-primary);
            border-radius: 0 3px 3px 0;
          }
          .proc-kpi-card--warning::before { background: var(--proc-warning); }
          .proc-kpi-card--success::before { background: var(--proc-success); }
          .proc-kpi-label {
            margin-left: 7px;
            color: var(--proc-text-secondary);
            font-size: 12px;
            font-weight: 600;
          }
          .proc-kpi-value {
            margin: 8px 0 0 7px;
            font-size: 28px;
            line-height: 1;
            font-weight: 800;
            letter-spacing: -0.04em;
            color: var(--proc-black);
          }
          .proc-kpi-meta {
            margin: 8px 0 0 7px;
            color: var(--proc-text-muted);
            font-size: 11px;
          }

          /* =========================================================
             WORKFLOW
          ========================================================= */
          .proc-workflow-card {
            overflow: hidden;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-workflow-scroll {
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
          }
          .proc-workflow {
            display: flex;
            align-items: stretch;
            min-width: max-content;
            padding: 16px;
          }
          .proc-workflow-step { min-width: 135px; display: flex; align-items: center; }
          .proc-workflow-node { width: 100%; text-align: center; }
          .proc-workflow-icon {
            width: 38px; height: 38px;
            margin: 0 auto 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #EAF3F9;
            color: var(--proc-primary);
            font-size: 13px;
            font-weight: 800;
          }
          .proc-workflow-step--active .proc-workflow-icon {
            background: var(--proc-warning-bg);
            color: var(--proc-warning);
          }
          .proc-workflow-step--complete .proc-workflow-icon {
            background: var(--proc-success-bg);
            color: var(--proc-success);
          }
          .proc-workflow-name {
            color: var(--proc-text);
            font-size: 11px;
            font-weight: 700;
          }
          .proc-workflow-count {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 11px;
          }
          .proc-workflow-connector {
            flex: 0 0 38px;
            height: 1px;
            margin: 19px 8px 0;
            background: var(--proc-border-dark);
          }

          /* =========================================================
             ANALYTICS
          ========================================================= */
          .proc-analytics-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .proc-card {
            min-width: 0;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 16px 0;
          }
          .proc-card-title {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
            color: var(--proc-black);
          }
          .proc-card-subtitle {
            margin: 3px 0 0;
            color: var(--proc-text-muted);
            font-size: 11px;
          }
          .proc-card-body { padding: 16px; }

          /* =========================================================
             EMPTY STATE
          ========================================================= */
          .proc-empty-state {
            min-height: 150px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            text-align: center;
            color: var(--proc-text-muted);
          }
          .proc-empty-state__icon {
            width: 42px; height: 42px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: var(--proc-surface-soft);
            border: 1px solid var(--proc-border);
            color: var(--proc-text-muted);
            font-size: 16px;
          }
          .proc-empty-state strong {
            color: var(--proc-text-secondary);
            font-size: 13px;
          }
          .proc-empty-state span {
            margin-top: 3px;
            font-size: 11px;
          }

          /* =========================================================
             SPEND SUMMARY
          ========================================================= */
          .proc-spend-summary {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            margin-bottom: 18px;
          }
          .proc-spend-value {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.04em;
            color: var(--proc-black);
          }
          .proc-spend-label {
            color: var(--proc-text-muted);
            font-size: 11px;
          }

          /* =========================================================
             CHART PLACEHOLDER
          ========================================================= */
          .proc-chart-placeholder {
            width: 100%;
            min-height: 190px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed var(--proc-border-dark);
            border-radius: var(--proc-radius-sm);
            background:
              linear-gradient(to bottom,
                transparent 24%, rgba(225,230,233,0.55) 25%, transparent 26%,
                transparent 49%, rgba(225,230,233,0.55) 50%, transparent 51%,
                transparent 74%, rgba(225,230,233,0.55) 75%, transparent 76%);
            color: var(--proc-text-muted);
            font-size: 12px;
          }

          /* =========================================================
             HEALTH METRICS
          ========================================================= */
          .proc-health-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .proc-health-item {
            padding: 13px;
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-sm);
            background: var(--proc-surface-soft);
          }
          .proc-health-label {
            color: var(--proc-text-secondary);
            font-size: 11px;
            font-weight: 600;
          }
          .proc-health-value {
            margin-top: 5px;
            font-size: 20px;
            font-weight: 800;
            color: var(--proc-black);
          }
          .proc-health-status {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 10px;
          }

          /* =========================================================
             TABLE
          ========================================================= */
          .proc-table-container {
            width: 100%;
            overflow-x: auto;
            border-top: 1px solid var(--proc-border);
          }
          .proc-table {
            width: 100%;
            min-width: 760px;
            border-collapse: collapse;
          }
          .proc-table th,
          .proc-table td {
            padding: 13px 16px;
            text-align: left;
            white-space: nowrap;
            border-bottom: 1px solid var(--proc-border);
          }
          .proc-table th {
            background: var(--proc-surface-soft);
            color: var(--proc-text-muted);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .proc-table td {
            color: var(--proc-text-secondary);
            font-size: 12px;
          }
          .proc-table tbody tr {
            transition: background 0.15s ease;
            cursor: pointer;
          }
          .proc-table tbody tr:hover { background: #F8FBFD; }
          .proc-table-empty { cursor: default !important; }
          .proc-table-empty:hover { background: transparent !important; }
          .proc-table-empty td { height: 150px; text-align: center; }

          /* =========================================================
             STATUS
          ========================================================= */
          .proc-status {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 700;
          }
          .proc-status::before {
            content: "";
            width: 5px; height: 5px;
            border-radius: 50%;
            background: currentColor;
          }
          .proc-status--pending { background: var(--proc-warning-bg); color: var(--proc-warning); }
          .proc-status--approved { background: var(--proc-success-bg); color: var(--proc-success); }
          .proc-status--processing { background: #EAF3F9; color: var(--proc-primary); }

          /* =========================================================
             OPERATIONS GRID
          ========================================================= */
          .proc-ops-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
          }

          /* =========================================================
             APPROVAL QUEUE
          ========================================================= */
          .proc-queue {
            display: flex;
            flex-direction: column;
          }
          .proc-queue-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 64px;
            padding: 11px 16px;
            border-top: 1px solid var(--proc-border);
            cursor: pointer;
            transition: background 0.15s ease;
          }
          .proc-queue-item:hover { background: var(--proc-surface-soft); }
          .proc-queue-info { min-width: 0; }
          .proc-queue-title {
            color: var(--proc-text);
            font-size: 12px;
            font-weight: 750;
          }
          .proc-queue-meta {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .proc-queue-value {
            flex: 0 0 auto;
            color: var(--proc-text);
            font-size: 12px;
            font-weight: 800;
          }

          /* =========================================================
             SUPPLIER
          ========================================================= */
          .proc-supplier-list { display: flex; flex-direction: column; }
          .proc-supplier-empty {
            min-height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--proc-text-muted);
            font-size: 12px;
            text-align: center;
          }

          /* =========================================================
             RESPONSIVE
          ========================================================= */
          @media (min-width: 480px) {
            .procurement-page { padding: 20px; }
            .proc-header-actions {
              grid-template-columns: auto auto;
              justify-content: flex-end;
            }
          }

          @media (min-width: 768px) {
            .procurement-page { padding: 24px; }
            .proc-page-header {
              flex-direction: row;
              align-items: flex-end;
              justify-content: space-between;
            }
            .proc-page-header__copy { min-width: 0; }
            .proc-header-actions { flex: 0 0 auto; }
            .proc-kpi-grid { grid-template-columns: repeat(2, 1fr); }
            .proc-analytics-grid { grid-template-columns: 1.5fr 1fr; }
            .proc-ops-grid { grid-template-columns: 1fr 1fr; }
          }

          @media (min-width: 1024px) {
            .procurement-page { padding: 28px 32px; }
            .proc-kpi-grid { grid-template-columns: repeat(4, 1fr); }
            .proc-page-header__title { font-size: 30px; }
          }

          @media (min-width: 1280px) {
            .procurement-page { padding: 32px 40px; }
            .proc-kpi-card { padding: 18px; }
          }

          /* =========================================================
             REDUCED MOTION
          ========================================================= */
          @media (prefers-reduced-motion: reduce) {
            .procurement-page *,
            .procurement-page *::before,
            .procurement-page *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // Standalone: render with full sidebar navigation (legacy separate page)
  return null;
}