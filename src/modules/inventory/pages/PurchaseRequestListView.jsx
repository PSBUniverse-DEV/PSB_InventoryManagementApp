"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, ArrowLeft, RefreshCw } from "lucide-react";
import { Button, Card, Badge, toastSuccess } from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";

function PriorityBadge({ priority }) {
  const level = String(priority || "").toLowerCase();
  const variants = {
    low: { bg: "info", text: "dark" },
    medium: { bg: "warning", text: "dark" },
    high: { bg: "danger", text: "white" },
    urgent: { bg: "dark", text: "white" },
  };
  const variant = variants[level] || { bg: "secondary", text: "dark" };
  return <Badge bg={variant.bg} text={variant.text}>{priority || "—"}</Badge>;
}

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
  return <Badge bg={variant.bg} text={variant.text}>{name || "Pending Approval"}</Badge>;
}

function formatCurrency(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

const RECALLABLE_STATUSES = new Set(["pending approval", "pending for approval"]);
const EDITABLE_STATUSES = new Set(["saved", "recalled", "returned"]);

export default function PurchaseRequestListView({ initialData, onNavigate, onCreateRequest, onEditPurchaseRequest, onCreatePo, onRecallPurchaseRequest, onOpenPurchaseRequest }) {
  const router = useRouter();
  const data = initialData || {};
  const [selectedRowId, setSelectedRowId] = useState(null);

  const purchaseRequests = data?.purchaseRequests || [];
  const purchaseRequestItems = data?.purchaseRequestItems || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const users = data?.users || [];
  const departments = data?.departments || [];
  const units = data?.config?.units || [];
  const statuses = data?.purchaseRequestStatuses || [];

  const userById = useMemo(() => {
    const map = {};
    users.forEach((u) => { map[String(u.id)] = u; });
    return map;
  }, [users]);

  const deptById = useMemo(() => {
    const map = {};
    departments.forEach((d) => { map[String(d.id)] = d; });
    return map;
  }, [departments]);

  const unitById = useMemo(() => {
    const map = {};
    units.forEach((u) => { map[String(u.id)] = u.abbreviation || u.name; });
    return map;
  }, [units]);

  const itemsByPrId = useMemo(() => {
    const map = {};
    purchaseRequestItems.forEach((item) => {
      const prId = String(item.pr_id);
      if (!map[prId]) map[prId] = [];
      map[prId].push(item);
    });
    return map;
  }, [purchaseRequestItems]);

  const statusById = useMemo(() => {
    const map = {};
    statuses.forEach((s) => { map[String(s.id)] = s; });
    return map;
  }, [statuses]);

  const statusNameForPr = useCallback((pr) => {
    if (pr.status_id == null) return null;
    const status = statusById[String(pr.status_id)];
    return status?.name || null;
  }, [statusById]);

  const poPrIds = useMemo(
    () => new Set((purchaseOrders || []).map((po) => String(po.pr_id))),
    [purchaseOrders]
  );

  const canCreatePo = useCallback((pr) => {
    const name = String(statusNameForPr(pr) || "").toLowerCase();
    const isApproved = name === "approved" || name.includes("approved");
    return isApproved && !poPrIds.has(String(pr.id ?? pr.pr_id));
  }, [statusNameForPr, poPrIds]);

  const toggleExpand = useCallback((id) => {
    setSelectedRowId((prev) => (String(prev) === String(id) ? null : id));
  }, []);

  const handleRefresh = useCallback(() => router.refresh(), [router]);

  const handleRowClick = useCallback((row) => {
    toggleExpand(row.id);
  }, [toggleExpand]);

  const totalSpend = useMemo(
    () => purchaseRequestItems.reduce((sum, item) => sum + (Number(item.est_total_cost) || 0), 0),
    [purchaseRequestItems]
  );

  const prRows = useMemo(
    () => purchaseRequests.map((pr) => {
      const prId = String(pr.id ?? pr.pr_id);
      const lineItems = itemsByPrId[prId] || [];
      const prTotal = lineItems.reduce((sum, item) => sum + (Number(item.est_total_cost) || 0), 0);
      const requester = userById[String(pr.requestor_id)];
      const department = deptById[String(pr.dept_id)];
      return {
        ...pr,
        id: prId,
        prTotal,
        statusName: statusNameForPr(pr),
        requesterName: requester ? `${requester.first_name} ${requester.last_name}` : displayValue(pr.requestor_id),
        departmentName: department ? department.dept_name : displayValue(pr.dept_id),
      };
    }),
    [purchaseRequests, itemsByPrId, userById, deptById, statusNameForPr]
  );


  const handleEdit = useCallback((row) => {
    if (onEditPurchaseRequest) {
      const lineItems = itemsByPrId[row.id] || [];
      onEditPurchaseRequest(row, lineItems);
      return;
    }
    toastSuccess(`Edit PR ${row.pr_no || row.id} (editor coming soon).`);
  }, [onEditPurchaseRequest, itemsByPrId]);

  const columns = useMemo(
    () => [
      { key: "pr_no", label: "PR Number", sortable: true, render: (row) => <span className="fw-semibold">{row.pr_no || row.id}</span> },
      { key: "requesterName", label: "Requester", sortable: true },
      { key: "departmentName", label: "Department", sortable: true },
      { key: "pr_date", label: "Date", sortable: true, render: (row) => displayValue(row.pr_date) },
      { key: "priority", label: "Priority", sortable: true, align: "center", render: (row) => <PriorityBadge priority={row.priority} /> },
      { key: "prTotal", label: "Amount", sortable: true, align: "right", render: (row) => <span className="inventory-mono fw-semibold">{formatCurrency(row.prTotal)}</span> },
      { key: "statusName", label: "Status", sortable: true, align: "center", render: (row) => <StatusBadge name={row.statusName} /> },
      { key: "remarks", label: "Remarks", sortable: true, render: (row) => (
        <span className="text-muted small pr-remarks-cell" title={row.remarks || ""}>{row.remarks || "—"}</span>
      ) },
    ],
    []
  );

  const canRecallPr = useCallback((row) => {
    const name = String(row.statusName || "").toLowerCase();
    return RECALLABLE_STATUSES.has(name);
  }, []);

  const canEditPr = useCallback((row) => {
    const name = String(row.statusName || "").toLowerCase();
    return EDITABLE_STATUSES.has(name);
  }, []);

  const actions = useMemo(
    () => [
      { key: "view", label: "View", type: "secondary", icon: "eye", onClick: (row) => toggleExpand(row.id) },
      { key: "open", label: "Open", type: "secondary", icon: "file-lines", onClick: (row) => onOpenPurchaseRequest ? onOpenPurchaseRequest(row) : undefined },
      { key: "edit", label: "Edit", type: "secondary", icon: "edit", visible: (row) => canEditPr(row), onClick: (row) => handleEdit(row) },
      {
        key: "createPo",
        label: "Create New Purchase Order",
        type: "success",
        icon: "file-invoice",
        visible: (row) => canCreatePo(row),
        onClick: (row) => onCreatePo ? onCreatePo(row) : undefined,
      },
      {
        key: "recall",
        label: "Recall",
        type: "danger",
        icon: "rotate-left",
        visible: (row) => canRecallPr(row),
        confirm: true,
        confirmMessage: (row) => `Recall "${row.pr_no || row.id}"? This will set its status to Recalled.`,
        onClick: (row) => onRecallPurchaseRequest ? onRecallPurchaseRequest(row) : undefined,
      },
    ],
    [toggleExpand, handleEdit, canCreatePo, onCreatePo, canRecallPr, onRecallPurchaseRequest, canEditPr, onOpenPurchaseRequest]
  );

  const detailColumns = useMemo(
    () => [
      { key: "itemName", label: "Item", sortable: true, render: (item) => <span className="fw-semibold">{item.itemName}</span> },
      { key: "itemSku", label: "SKU", sortable: true, render: (item) => <span className="text-muted small">{displayValue(item.itemSku)}</span> },
      { key: "quantity", label: "Qty", sortable: true, align: "center", render: (item) => <span className="inventory-mono">{item.quantity}</span> },
      { key: "uom_id", label: "Unit", sortable: true, align: "center", render: (item) => unitById[String(item.uom_id)] || displayValue(item.uom_id) },
      { key: "est_unit_cost", label: "Est. Unit Cost", sortable: true, align: "right", render: (item) => <span className="inventory-mono">{formatCurrency(item.est_unit_cost)}</span> },
      { key: "est_total_cost", label: "Est. Total Cost", sortable: true, align: "right", render: (item) => <span className="inventory-mono fw-semibold">{formatCurrency(item.est_total_cost)}</span> },
    ],
    [unitById]
  );

  const renderDetail = useCallback(
    (row) => {
      const lineItems = itemsByPrId[row.id] || [];
      return (
        <div className="pr-detail-panel">
          <h4 className="pr-detail-title">Requested Items</h4>
          <TableZ
            data={lineItems}
            columns={detailColumns}
            rowIdKey="id"
            hideSearch
            hideFooter
            showActionColumn={false}
            emptyMessage="No items for this request."
          />
        </div>
      );
    },
    [itemsByPrId, detailColumns]
  );

  return (
    <div className="pr-list-page">
      {/* Header */}
      <header className="pr-list-header">
        <div className="pr-list-header__main">
          <h1 className="pr-list-title">
            <ClipboardList size={22} className="pr-list-icon" />
            Purchase Requests
          </h1>
          <p className="pr-list-subtitle">All purchase requests with item details.</p>
        </div>
        <div className="pr-list-header__actions">
          <Button variant="ghost" size="sm" onClick={() => onNavigate ? onNavigate("procurement") : router.push("/inventory")} className="pr-list-back">
            <ArrowLeft size={16} /> Back
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => onCreateRequest ? onCreateRequest() : router.push("/inventory?tab=procurement")}>
            <Plus size={14} /> New Request
          </Button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="pr-list-summary">
        <Card className="pr-summary-card">
          <div className="pr-summary-label">Total PRs</div>
          <div className="pr-summary-value">{purchaseRequests.length}</div>
        </Card>
        <Card className="pr-summary-card">
          <div className="pr-summary-label">Total Items</div>
          <div className="pr-summary-value">{purchaseRequestItems.length}</div>
        </Card>
        <Card className="pr-summary-card">
          <div className="pr-summary-label">Estimated Spend</div>
          <div className="pr-summary-value">{formatCurrency(totalSpend)}</div>
        </Card>
      </section>

      {/* Table */}
      <Card className="pr-list-card">
        <TableZ
          data={prRows}
          columns={columns}
          actions={actions}
          rowIdKey="id"
          selectedRowId={selectedRowId}
          onRowClick={handleRowClick}
          searchPlaceholder="Search purchase requests..."
          emptyMessage="No purchase requests found."
          renderDetail={renderDetail}
        />
      </Card>

      <style jsx>{`
        .pr-list-page {
          width: 100%;
          min-width: 0;
          padding: 16px;
        }

        .pr-list-header {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .pr-list-header__main {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pr-list-header__actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pr-list-back {
          padding-left: 0;
        }
        .pr-list-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }
        .pr-list-icon {
          color: #1877B9;
        }
        .pr-list-subtitle {
          margin: 0;
          color: #66737C;
          font-size: 13px;
        }

        .pr-list-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .pr-summary-card {
          padding: 14px 16px;
        }
        .pr-summary-label {
          color: #66737C;
          font-size: 12px;
          font-weight: 600;
        }
        .pr-summary-value {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }

        .pr-list-card {
          overflow: hidden;
        }
        .pr-remarks-cell {
          display: inline-block;
          max-width: 240px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
        }
        .pr-detail-panel {
          padding: 12px 14px 16px;
        }
        .pr-detail-title {
          margin: 0 0 12px;
          font-size: 12px;
          font-weight: 800;
          color: #66737C;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pr-detail-empty {
          margin: 0;
          color: #8A969E;
          font-size: 12px;
        }
        .pr-detail-panel .psb-ui-table-shell {
          padding: 0;
        }
        .pr-detail-panel .psb-ui-table-shell .card {
          border: none;
          box-shadow: none;
        }

        /* Mobile-first responsive enhancements */
        @media (min-width: 480px) {
          .pr-list-page { padding: 20px; }
          .pr-list-summary { grid-template-columns: repeat(3, 1fr); }
        }

        @media (min-width: 768px) {
          .pr-list-title { font-size: 26px; }
        }

        @media (min-width: 1024px) {
          .pr-list-page { padding: 24px 32px; }
        }
      `}</style>
    </div>
  );
}
