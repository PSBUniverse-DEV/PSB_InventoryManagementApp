/**
 * Client Component — ProjectBomView.jsx
 *
 * Displays all saved/approved BOMs from inv_t_bom in a table format.
 * Uses the shared TableZ component and the inventory sidebar layout.
 */
"use client";

import "./BomView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Warehouse, Truck, ClipboardList, Columns, Settings,
  ArrowLeftRight, Layers, FileText,
} from "lucide-react";
import {
  Button, Card, Badge, toastSuccess, toastError,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import { useRouter } from "next/navigation";
import { INVENTORY_VIEWS } from "../data/inventory.data";
import { loadProjectBomDataAction } from "../data/inventory.actions";

// ─── Status badge helper ────────────────────────────────────

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

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function ProjectBomView({ hideSidebar = false, onNavigate }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState("projectBom");
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState(false);

  // ─── Load data ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setBusy(true);
    try {
      const result = await loadProjectBomDataAction();
      setData(result);
    } catch (err) {
      toastError("Failed to load project BOM data.");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    setLoaded(true);
  }, [loadData]);

  // Auto-open drawer on desktop; close on mobile; respond to resize
  useEffect(() => {
    const checkWidth = () => {
      setDrawerOpen(window.innerWidth >= 992);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

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
      router.push("/inventory");
      return;
    }
    if (viewId === "projectBom") {
      return; // Already here
    }
    if (viewId === "procurement") {
      router.push("/inventory/transaction");
      return;
    }
    router.push("/inventory");
  }, [router]);

  // ─── TableZ actions ────────────────────────────────────────

  const actions = useMemo(
    () => [
      {
        key: "view",
        label: "View",
        type: "primary",
        icon: "eye",
        onClick: (row) => {
          if (onNavigate) {
            onNavigate("projectBomDetail", { bomId: row.id, mode: "view" });
          }
        },
      },
      {
        key: "edit",
        label: "Edit",
        type: "secondary",
        icon: "pen",
        onClick: (row) => {
          if (onNavigate) {
            onNavigate("projectBomDetail", { bomId: row.id, mode: "edit" });
          }
        },
      },
    ],
    [onNavigate],
  );

  // ─── TableZ columns ────────────────────────────────────────

  const columns = useMemo(
    () => [
      {
        key: "bomNo",
        label: "BOM No",
        sortable: true,
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontWeight: 600 }}>
            {row.bomNo || "—"}
          </span>
        ),
      },
      {
        key: "bomtSpec",
        label: "Project Specs",
        sortable: true,
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
            {row.bomtSpec || "—"}
          </span>
        ),
      },
      {
        key: "projectName",
        label: "Customer",
        sortable: true,
        render: (row) => (
          <span style={{ fontWeight: 500 }}>{row.projectName || "—"}</span>
        ),
      },
      {
        key: "spec",
        label: "Address",
        sortable: true,
        render: (row) => (
          <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
            {row.spec || "—"}
          </span>
        ),
      },
      
      // {
      //   key: "bomTempId",
      //   label: "Template ID",
      //   sortable: true,
      //   align: "center",
      //   render: (row) => (
      //     <span style={{ fontFamily: "var(--psb-mono, monospace)", fontSize: "0.82rem" }}>
      //       {row.bomTempId != null ? row.bomTempId : "—"}
      //     </span>
      //   ),
      // },
      {
        key: "status",
        label: "Status",
        sortable: true,
        align: "center",
        render: (row) => <BomStatusBadge statusName={row.statusName} />,
      },
      {
        key: "remarks",
        label: "Remarks",
        sortable: true,
        render: (row) => (
          <span style={{ color: "var(--psb-muted)", fontSize: "0.82rem" }}>
            {row.remarks || "—"}
          </span>
        ),
      },
      {
        key: "createdAt",
        label: "Date Created",
        sortable: true,
        align: "center",
        render: (row) => (
          <span style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            {formatDate(row.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (!loaded) {
    return <div className="inventory-loading">Loading Project BOM...</div>;
  }

  //#endregion

  // --- Content ---
  const content = (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="bom-page-header">
        <div className="bom-header-left">
          <h2 style={{ margin: 0, fontFamily: "var(--psb-serif)", fontSize: "1.35rem", fontWeight: 700 }}>
            Project BOM
          </h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--psb-muted)", fontSize: "0.85rem" }}>
            All saved and approved Bills of Materials
          </p>
        </div>
        <div className="bom-header-actions">
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={loadData}
            disabled={busy}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <Card className="bom-table-card">
        <div className="bom-table-toolbar">
          <span className="bom-table-title">BOM Records</span>
         
        </div>
         <br />   

        <TableZ
          data={data}
          columns={columns}
          actions={actions}
          rowIdKey="id"
          
          searchPlaceholder="Search BOM records..."
          emptyMessage="No BOM records found. Save a BOM from the Bill of Materials page to see it here."
        />
      </Card>
    </div>
  );

  // --- Embedded mode: no sidebar, no layout wrapper ---
  if (hideSidebar) {
    return content;
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
              Layers, FileText,
            };
            const isActive = n.id === "projectBom" || view === n.id;
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
        {content}
      </main>
    </div>
  );
}

//#endregion