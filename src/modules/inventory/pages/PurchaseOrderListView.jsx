"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, ArrowLeft, RefreshCw } from "lucide-react";
import { Button, Card, Badge } from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";

const PENDING_STATUS_NAMES = new Set([
  "pending",
  "pending approval",
  "for approval",
  "submitted",
  "pending review",
  "for review",
]);

function statusBadgeVariant(name) {
  const level = String(name || "").toLowerCase();
  if (PENDING_STATUS_NAMES.has(level) || level === "draft") return { bg: "warning", text: "dark" };
  if (level === "approved" || level === "completed" || level === "fulfilled" || level === "received") return { bg: "success", text: "white" };
  if (level === "rejected" || level === "cancelled" || level === "canceled" || level === "denied") return { bg: "danger", text: "white" };
  if (level === "saved") return { bg: "info", text: "dark" };
  return { bg: "secondary", text: "light" };
}

function StatusBadge({ name }) {
  const variant = statusBadgeVariant(name);
  return <Badge bg={variant.bg} text={variant.text}>{name || "Pending"}</Badge>;
}

function formatCurrency(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function PurchaseOrderListView({ initialData, onNavigate, onCreateOrder }) {
  const router = useRouter();
  const data = initialData || {};
  const [selectedRowId, setSelectedRowId] = useState(null);

  const purchaseOrders = data?.purchaseOrders || [];
  const statuses = data?.purchaseRequestStatuses || [];

  const statusById = useMemo(() => {
    const map = {};
    statuses.forEach((s) => { map[String(s.id)] = s; });
    return map;
  }, [statuses]);

  const statusNameForPo = useCallback((po) => {
    if (po.status_id == null) return null;
    const status = statusById[String(po.status_id)];
    return status?.name || null;
  }, [statusById]);

  const toggleExpand = useCallback((id) => {
    setSelectedRowId((prev) => (String(prev) === String(id) ? null : id));
  }, []);

  const handleRefresh = useCallback(() => router.refresh(), [router]);

  const handleRowClick = useCallback((row) => {
    toggleExpand(row.id);
  }, [toggleExpand]);

  const totalSpend = useMemo(
    () => purchaseOrders.reduce((sum, po) => sum + (Number(po.est_total_cost) || 0), 0),
    [purchaseOrders]
  );

  const activeCount = useMemo(
    () => purchaseOrders.filter((po) => {
      const name = String(statusNameForPo(po) || "").toLowerCase();
      return name && !["rejected", "cancelled", "canceled", "denied", "completed", "received"].includes(name);
    }).length,
    [purchaseOrders, statusNameForPo]
  );

  const poRows = useMemo(
    () => purchaseOrders.map((po) => {
      const poId = String(po.id ?? po.po_id);
      return {
        ...po,
        id: poId,
        statusName: statusNameForPo(po),
        supplierName: po.supplierName || displayValue(po.supplier_id),
      };
    }),
    [purchaseOrders, statusNameForPo]
  );

  const columns = useMemo(
    () => [
      { key: "po_no", label: "PO Number", sortable: true, render: (row) => <span className="fw-semibold">{row.po_no || row.id}</span> },
      { key: "supplierName", label: "Supplier", sortable: true },
      { key: "po_date", label: "Date", sortable: true, render: (row) => displayValue(row.po_date || row.created_at) },
      { key: "delivery_date", label: "Delivery Date", sortable: true, render: (row) => displayValue(row.delivery_date) },
      { key: "payment_terms", label: "Payment Terms", sortable: true, render: (row) => displayValue(row.payment_terms) },
      { key: "est_total_cost", label: "Amount", sortable: true, align: "right", render: (row) => <span className="inventory-mono fw-semibold">{formatCurrency(row.est_total_cost)}</span> },
      { key: "statusName", label: "Status", sortable: true, align: "center", render: (row) => <StatusBadge name={row.statusName} /> },
      { key: "remarks", label: "Remarks", sortable: true, render: (row) => (
        <span className="text-muted small po-remarks-cell" title={row.remarks || ""}>{row.remarks || "—"}</span>
      ) },
    ],
    []
  );

  const actions = useMemo(
    () => [
      { key: "view", label: "View", type: "secondary", icon: "eye", onClick: (row) => toggleExpand(row.id) },
    ],
    [toggleExpand]
  );

  return (
    <div className="po-list-page">
      {/* Header */}
      <header className="po-list-header">
        <div className="po-list-header__main">
          <h1 className="po-list-title">
            <FileText size={22} className="po-list-icon" />
            Purchase Orders
          </h1>
          <p className="po-list-subtitle">All purchase orders with supplier details.</p>
        </div>
        <div className="po-list-header__actions">
          <Button variant="ghost" size="sm" onClick={() => onNavigate ? onNavigate("procurement") : router.push("/inventory")} className="po-list-back">
            <ArrowLeft size={16} /> Back
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => onCreateOrder ? onCreateOrder() : router.push("/inventory?tab=procurement")}>
            <Plus size={14} /> New Order
          </Button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="po-list-summary">
        <Card className="po-summary-card">
          <div className="po-summary-label">Total POs</div>
          <div className="po-summary-value">{purchaseOrders.length}</div>
        </Card>
        <Card className="po-summary-card">
          <div className="po-summary-label">Active POs</div>
          <div className="po-summary-value">{activeCount}</div>
        </Card>
        <Card className="po-summary-card">
          <div className="po-summary-label">Total Spend</div>
          <div className="po-summary-value">{formatCurrency(totalSpend)}</div>
        </Card>
      </section>

      {/* Table */}
      <Card className="po-list-card">
        <TableZ
          data={poRows}
          columns={columns}
          actions={actions}
          rowIdKey="id"
          selectedRowId={selectedRowId}
          onRowClick={handleRowClick}
          searchPlaceholder="Search purchase orders..."
          emptyMessage="No purchase orders found."
        />
      </Card>

      <style jsx>{`
        .po-list-page {
          width: 100%;
          min-width: 0;
          padding: 16px;
        }

        .po-list-header {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .po-list-header__main {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .po-list-header__actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .po-list-back {
          padding-left: 0;
        }
        .po-list-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }
        .po-list-icon {
          color: #1877B9;
        }
        .po-list-subtitle {
          margin: 0;
          color: #66737C;
          font-size: 13px;
        }

        .po-list-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .po-summary-card {
          padding: 14px 16px;
        }
        .po-summary-label {
          color: #66737C;
          font-size: 12px;
          font-weight: 600;
        }
        .po-summary-value {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }

        .po-list-card {
          overflow: hidden;
        }
        .po-remarks-cell {
          display: inline-block;
          max-width: 240px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
        }

        /* Mobile-first responsive enhancements */
        @media (min-width: 480px) {
          .po-list-page { padding: 20px; }
          .po-list-summary { grid-template-columns: repeat(3, 1fr); }
        }

        @media (min-width: 768px) {
          .po-list-title { font-size: 26px; }
        }

        @media (min-width: 1024px) {
          .po-list-page { padding: 24px 32px; }
        }
      `}</style>
    </div>
  );
}