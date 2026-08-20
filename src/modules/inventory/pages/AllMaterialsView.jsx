"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight } from "lucide-react";
import { Button, Card, toastError } from "@/shared/components/ui";
import { loadAllMaterialsAction } from "../data/inventory.actions";
import "./InventoryView.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

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

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function AllMaterialsView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState("");

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadAllMaterialsAction();
      setMaterials(result);
    } catch (err) {
      toastError("Failed to load materials.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Filtered materials ────────────────────────────────────

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q)
    );
  }, [materials, search]);

  // ─── KPI Metrics ───────────────────────────────────────────

  const kpi = useMemo(() => {
    const totalMaterials = materials.length;
    const totalStock = materials.reduce((sum, m) => sum + (m.totalStock || 0), 0);
    const totalAllocated = materials.reduce((sum, m) => sum + (m.allocated || 0), 0);
    const totalReleased = materials.reduce((sum, m) => sum + (m.released || 0), 0);
    const totalAvailable = materials.reduce((sum, m) => sum + (m.available || 0), 0);
    const lowStockCount = materials.filter((m) => m.available <= (m.minThreshold || 0)).length;
    return { totalMaterials, totalStock, totalAllocated, totalReleased, totalAvailable, lowStockCount };
  }, [materials]);

  // ─── Content ───────────────────────────────────────────────

  const content = (
    <div className="procurement-page">
      {/* ── Page Header ─────────────────────────────────── */}
      <header className="proc-page-header">
        <div className="proc-page-header__copy">
          <h1 className="proc-page-header__title">All Materials</h1>
          <p className="proc-page-header__desc">
            Current stock levels across all materials (Total Stock − Allocated − Released = Available).
          </p>
        </div>
        <div className="proc-header-actions">
          <Button variant="ghost" size="sm" onClick={loadMaterials} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </header>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <section className="proc-section">
        <div className="proc-kpi-grid">
          <article className="proc-kpi-card">
            <div className="proc-kpi-label">Total Materials</div>
            <div className="proc-kpi-value">{kpi.totalMaterials}</div>
            <div className="proc-kpi-meta">Active SKUs</div>
          </article>
          <article className="proc-kpi-card">
            <div className="proc-kpi-label">Total Stock</div>
            <div className="proc-kpi-value">{kpi.totalStock}</div>
            <div className="proc-kpi-meta">All warehouses</div>
          </article>
          <article className="proc-kpi-card proc-kpi-card--warning">
            <div className="proc-kpi-label">Allocated</div>
            <div className="proc-kpi-value">{kpi.totalAllocated}</div>
            <div className="proc-kpi-meta">Reserved for BOMs</div>
          </article>
          <article className="proc-kpi-card proc-kpi-card--success">
            <div className="proc-kpi-label">Available</div>
            <div className="proc-kpi-value">{kpi.totalAvailable}</div>
            <div className="proc-kpi-meta">Ready to use</div>
          </article>
          <article className={`proc-kpi-card${kpi.lowStockCount > 0 ? " proc-kpi-card--danger" : ""}`}>
            <div className="proc-kpi-label">Low Stock</div>
            <div className="proc-kpi-value">{kpi.lowStockCount}</div>
            <div className="proc-kpi-meta">Below min threshold</div>
          </article>
        </div>
      </section>

      {/* ── Materials Table ──────────────────────────────── */}
      <section className="proc-section">
        <div className="proc-section-header">
          <div>
            <h2 className="proc-section-title">Materials Inventory</h2>
            <p className="proc-section-desc">All materials with current stock, allocation, and release status.</p>
          </div>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "220px", fontSize: "12px" }}
            />
          </div>
        </div>
        <div className="proc-card">
          <div className="proc-table-container">
            <table className="proc-table proc-table--expandable">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}></th>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Total Stock</th>
                  <th>Allocated</th>
                  <th>Released</th>
                  <th>Available</th>
                  <th>Min Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.length === 0 && (
                  <tr className="proc-table-empty">
                    <td colSpan={8}>
                      <div className="proc-empty-state">
                        <div className="proc-empty-state__icon">—</div>
                        <strong>{loading ? "Loading..." : "No materials found."}</strong>
                        <span>Material data will appear here when available.</span>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredMaterials.map((mat) => {
                  const matId = String(mat.id);
                  const isExpanded = expandedIds.has(matId);
                  const isLow = mat.available <= (mat.minThreshold || 0);
                  return (
                    <React.Fragment key={matId}>
                      <tr onClick={() => toggleExpand(matId)} className="proc-table-row--clickable">
                        <td>
                          <span className="proc-expand-icon">{isExpanded ? "▼" : "▶"}</span>
                        </td>
                        <td className="fw-semibold">{mat.name}</td>
                        <td className="inventory-mono text-muted small">{mat.sku || "—"}</td>
                        <td className="inventory-mono fw-semibold">{mat.totalStock}</td>
                        <td className="inventory-mono" style={{ color: mat.allocated > 0 ? "var(--psb-status-warning)" : "var(--psb-muted)" }}>{mat.allocated}</td>
                        <td className="inventory-mono" style={{ color: mat.released > 0 ? "var(--psb-status-active)" : "var(--psb-muted)" }}>{mat.released}</td>
                        <td className="inventory-mono fw-semibold" style={{ color: isLow ? "var(--psb-status-suspended)" : "var(--psb-status-active)" }}>{mat.available}</td>
                        <td className="inventory-mono text-muted">{mat.minThreshold || 0}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="proc-detail-row">
                          <td colSpan={8}>
                            <div className="proc-detail-panel">
                              <h4 className="proc-detail-title">Stock Details — {mat.name}</h4>
                              <table className="proc-detail-table">
                                <thead>
                                  <tr>
                                    <th>Warehouse</th>
                                    <th>Bin</th>
                                    <th>Qty</th>
                                    <th>UOM</th>
                                    <th>PO No.</th>
                                    <th>Delivery No.</th>
                                    <th>Supplier</th>
                                    <th>Remarks</th>
                                    <th>Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(mat.stockDetails || []).map((sd, idx) => (
                                    <tr key={idx}>
                                      <td>{sd.warehouseName}</td>
                                      <td>{displayValue(sd.binLocation)}</td>
                                      <td className="inventory-mono">{sd.quantity}</td>
                                      <td>{sd.uomAbbreviation || sd.uomName || "—"}</td>
                                      <td className="inventory-mono small">{displayValue(sd.poNo)}</td>
                                      <td className="inventory-mono small">{displayValue(sd.deliveryNo)}</td>
                                      <td>{displayValue(sd.supplierName)}</td>
                                      <td className="text-muted small">{displayValue(sd.remarks)}</td>
                                      <td className="text-muted small" style={{ whiteSpace: "nowrap" }}>{formatDate(sd.createdAt)}</td>
                                    </tr>
                                  ))}
                                  {(!mat.stockDetails || mat.stockDetails.length === 0) && (
                                    <tr><td colSpan={9} className="text-muted text-center py-2">No stock records for this material.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        .proc-kpi-card--danger::before { background: var(--proc-danger); }
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
           CARD
        ========================================================= */
        .proc-card {
          min-width: 0;
          background: var(--proc-surface);
          border: 1px solid var(--proc-border);
          border-radius: var(--proc-radius-md);
          box-shadow: var(--proc-shadow-sm);
        }

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

        /* Expandable rows */
        .proc-table-row--clickable { cursor: pointer; }
        .proc-table-row--clickable:hover { background: #F0F6FA; }
        .proc-expand-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          color: var(--proc-text-muted);
          font-size: 11px;
        }
        .proc-detail-row { background: var(--proc-surface-soft) !important; cursor: default !important; }
        .proc-detail-row:hover { background: var(--proc-surface-soft) !important; }
        .proc-detail-panel { padding: 12px 16px 16px; }
        .proc-detail-title {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 800;
          color: var(--proc-text-secondary);
        }
        .proc-detail-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--proc-surface);
          border: 1px solid var(--proc-border);
          border-radius: var(--proc-radius-sm);
        }
        .proc-detail-table th,
        .proc-detail-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--proc-border);
          font-size: 11px;
        }
        .proc-detail-table th {
          background: var(--proc-surface-soft);
          color: var(--proc-text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .proc-detail-table tbody tr:last-child td { border-bottom: none; }

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
        }

        @media (min-width: 1024px) {
          .procurement-page { padding: 28px 32px; }
          .proc-kpi-grid { grid-template-columns: repeat(5, 1fr); }
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

  if (hideSidebar) return content;

  return (
    <div className="inventory-module-layout">
      <main className="inventory-main" style={{ padding: "1.5rem" }}>
        {content}
      </main>
    </div>
  );
}