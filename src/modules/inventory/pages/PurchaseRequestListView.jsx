"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, ArrowLeft } from "lucide-react";
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

function StatusBadge({ statusId }) {
  if (statusId == null) return <Badge bg="warning" text="dark">Pending Approval</Badge>;
  return <Badge bg="success" text="white">Approved</Badge>;
}

function formatCurrency(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function PurchaseRequestListView({ initialData, onNavigate, onCreateRequest }) {
  const router = useRouter();
  const data = initialData || {};
  const [selectedRowId, setSelectedRowId] = useState(null);

  const purchaseRequests = data?.purchaseRequests || [];
  const purchaseRequestItems = data?.purchaseRequestItems || [];
  const users = data?.users || [];
  const departments = data?.departments || [];
  const units = data?.config?.units || [];

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

  const toggleExpand = useCallback((id) => {
    setSelectedRowId((prev) => (String(prev) === String(id) ? null : id));
  }, []);

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
        requesterName: requester ? `${requester.first_name} ${requester.last_name}` : displayValue(pr.requestor_id),
        departmentName: department ? department.dept_name : displayValue(pr.dept_id),
      };
    }),
    [purchaseRequests, itemsByPrId, userById, deptById]
  );


  const handleEdit = useCallback((row) => {
    toastSuccess(`Edit PR ${row.pr_no || row.id} (editor coming soon).`);
  }, []);

  const columns = useMemo(
    () => [
      { key: "pr_no", label: "PR Number", sortable: true, render: (row) => <span className="fw-semibold">{row.pr_no || row.id}</span> },
      { key: "requesterName", label: "Requester", sortable: true },
      { key: "departmentName", label: "Department", sortable: true },
      { key: "pr_date", label: "Date", sortable: true, render: (row) => displayValue(row.pr_date) },
      { key: "priority", label: "Priority", sortable: true, align: "center", render: (row) => <PriorityBadge priority={row.priority} /> },
      { key: "prTotal", label: "Amount", sortable: true, align: "right", render: (row) => <span className="inventory-mono fw-semibold">{formatCurrency(row.prTotal)}</span> },
      { key: "status_id", label: "Status", sortable: true, align: "center", render: (row) => <StatusBadge statusId={row.status_id} /> },
    ],
    []
  );

  const actions = useMemo(
    () => [
      { key: "view", label: "View", type: "secondary", icon: "eye", onClick: (row) => toggleExpand(row.id) },
      { key: "edit", label: "Edit", type: "secondary", icon: "edit", onClick: (row) => handleEdit(row) },
    ],
    [toggleExpand, handleEdit]
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
          <Button variant="ghost" size="sm" onClick={() => onNavigate ? onNavigate("procurement") : router.push("/inventory")} className="pr-list-back">
            <ArrowLeft size={16} /> Back
          </Button>
          <h1 className="pr-list-title">
            <ClipboardList size={22} className="pr-list-icon" />
            Purchase Requests
          </h1>
          <p className="pr-list-subtitle">All purchase requests with item details.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => onCreateRequest ? onCreateRequest() : router.push("/inventory?tab=procurement")}>
          <Plus size={14} /> New Request
        </Button>
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
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .pr-list-header__main {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pr-list-back {
          align-self: flex-start;
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
          .pr-list-header {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
          }
          .pr-list-title { font-size: 26px; }
        }

        @media (min-width: 1024px) {
          .pr-list-page { padding: 24px 32px; }
        }
      `}</style>
    </div>
  );
}
