"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  toastSuccess,
  toastError,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import { actOnPurchaseRequestApprovalAction } from "../data/inventory.actions";
import { formatDateTime } from "../data/inventory.data";

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

function formatCurrency(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function PurchaseRequestApprovalsView({ initialData }) {
  const router = useRouter();
  const data = initialData || {};
  const approvals = data.approvals || [];

  const [selectedRow, setSelectedRow] = useState(null);
  const [decision, setDecision] = useState(null); // "approve" | "reject" | null
  const [comments, setComments] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 400);
  }, [router]);

  const handleAct = useCallback(async () => {
    if (!selectedRow || !decision) return;
    setIsBusy(true);
    try {
      await actOnPurchaseRequestApprovalAction({
        stageinstanceId: selectedRow.stageinstanceId,
        decision,
        comments,
        actorUserId: null, // Replace with current user id from session if available
        statusName: decision === "approve" ? "Approved" : "Rejected",
      });
      toastSuccess(`Purchase Request ${decision === "approve" ? "approved" : "rejected"}.`);
      setSelectedRow(null);
      setDecision(null);
      setComments("");
      router.refresh();
    } catch (err) {
      toastError(err?.message || "Failed to record decision.");
    } finally {
      setIsBusy(false);
    }
  }, [selectedRow, decision, comments, router]);

  const openDecision = useCallback((row, decisionType) => {
    setSelectedRow(row);
    setDecision(decisionType);
    setComments("");
  }, []);

  const closeDecision = useCallback(() => {
    setSelectedRow(null);
    setDecision(null);
    setComments("");
  }, []);

  const columns = useMemo(
    () => [
      {
        key: "prNo",
        label: "PR Number",
        sortable: true,
        render: (row) => <span className="fw-semibold">{row.prNo || row.prId}</span>,
      },
      { key: "requesterName", label: "Requester", sortable: true },
      { key: "departmentName", label: "Department", sortable: true },
      {
        key: "prDate",
        label: "Date",
        sortable: true,
        render: (row) => displayValue(row.prDate),
      },
      {
        key: "priority",
        label: "Priority",
        sortable: true,
        align: "center",
        render: (row) => <PriorityBadge priority={row.priority} />,
      },
      {
        key: "totalAmount",
        label: "Amount",
        sortable: true,
        align: "right",
        render: (row) => (
          <span className="inventory-mono fw-semibold">{formatCurrency(row.totalAmount)}</span>
        ),
      },
      {
        key: "stageCreatedAt",
        label: "Pending Since",
        sortable: true,
        render: (row) => (
          <span className="text-muted small">{formatDateTime(row.stageCreatedAt)}</span>
        ),
      },
      {
        key: "remarks",
        label: "Remarks",
        sortable: true,
        render: (row) => (
          <span className="text-muted small pr-remarks-cell" title={row.remarks || ""}>
            {row.remarks || "—"}
          </span>
        ),
      },
    ],
    []
  );

  const detailColumns = useMemo(
    () => [
      {
        key: "itemName",
        label: "Item",
        sortable: true,
        render: (item) => <span className="fw-semibold">{item.itemName}</span>,
      },
      {
        key: "itemSku",
        label: "SKU",
        sortable: true,
        render: (item) => <span className="text-muted small">{displayValue(item.itemSku)}</span>,
      },
      {
        key: "quantity",
        label: "Qty",
        sortable: true,
        align: "center",
        render: (item) => <span className="inventory-mono">{item.quantity}</span>,
      },
      {
        key: "uom_id",
        label: "Unit",
        sortable: true,
        align: "center",
        render: (item) => displayValue(item.uom_id),
      },
      {
        key: "est_unit_cost",
        label: "Est. Unit Cost",
        sortable: true,
        align: "right",
        render: (item) => <span className="inventory-mono">{formatCurrency(item.est_unit_cost)}</span>,
      },
      {
        key: "est_total_cost",
        label: "Est. Total Cost",
        sortable: true,
        align: "right",
        render: (item) => <span className="inventory-mono fw-semibold">{formatCurrency(item.est_total_cost)}</span>,
      },
    ],
    []
  );

  const renderDetail = useCallback(
    (row) => {
      const lineItems = row.lineItems || [];
      return (
        <div className="pr-detail-panel">
          <h4 className="pr-detail-title">Requested Items</h4>
          <TableZ
            data={lineItems}
            columns={detailColumns}
            rowIdKey="pritem_id"
            hideSearch
            hideFooter
            showActionColumn={false}
            emptyMessage="No items for this request."
          />
        </div>
      );
    },
    [detailColumns]
  );

  const actions = useMemo(
    () => [
      {
        key: "view",
        label: "View",
        type: "secondary",
        icon: "eye",
        onClick: (row) => setSelectedRow(row),
      },
      {
        key: "approve",
        label: "Approve",
        type: "success",
        icon: "check",
        onClick: (row) => openDecision(row, "approve"),
      },
      {
        key: "reject",
        label: "Reject",
        type: "danger",
        icon: "x",
        onClick: (row) => openDecision(row, "reject"),
      },
    ],
    [openDecision]
  );

  return (
    <div className="pr-approvals-page">
      <header className="pr-approvals-header">
        <div className="pr-approvals-header__main">
          <h1 className="pr-approvals-title">
            <ClipboardCheck size={22} className="pr-approvals-icon" />
            PR Approvals
          </h1>
          <p className="pr-approvals-subtitle">
            Purchase requests pending your approval via workflow stage instances.
          </p>
        </div>
        <div className="pr-approvals-header__actions">
          <Button variant="ghost" size="sm" onClick={() => router.push("/inventory")}>
            <ArrowLeft size={16} /> Back
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh
          </Button>
        </div>
      </header>

      <section className="pr-approvals-summary">
        <Card className="pr-summary-card">
          <div className="pr-summary-label">Pending PRs</div>
          <div className="pr-summary-value">{approvals.length}</div>
        </Card>
        <Card className="pr-summary-card">
          <div className="pr-summary-label">Total Pending Value</div>
          <div className="pr-summary-value">
            {formatCurrency(approvals.reduce((sum, a) => sum + (a.totalAmount || 0), 0))}
          </div>
        </Card>
      </section>

      <Card className="pr-approvals-card">
        <TableZ
          data={approvals}
          columns={columns}
          actions={actions}
          rowIdKey="stageinstanceId"
          searchPlaceholder="Search pending approvals..."
          emptyMessage="No pending purchase request approvals found."
          renderDetail={renderDetail}
        />
      </Card>

      <Modal
        show={Boolean(selectedRow && decision)}
        onHide={closeDecision}
        title={decision === "approve" ? "Approve Purchase Request" : "Reject Purchase Request"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeDecision} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              variant={decision === "approve" ? "success" : "danger"}
              size="sm"
              onClick={handleAct}
              loading={isBusy}
              disabled={isBusy}
            >
              {decision === "approve" ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {decision === "approve" ? "Approve" : "Reject"}
            </Button>
          </>
        }
      >
        {selectedRow && (
          <>
            <p className="text-muted small">
              PR <b>{selectedRow.prNo || selectedRow.prId}</b> from <b>{selectedRow.requesterName}</b>
              {selectedRow.departmentName ? ` (${selectedRow.departmentName})` : ""} — {" "}
              {formatCurrency(selectedRow.totalAmount)}
            </p>
            <label className="form-label inventory-form-label">Comments</label>
            <Input
              as="textarea"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Optional comments about your decision..."
              rows={3}
            />
          </>
        )}
      </Modal>

      <style jsx>{`
        .pr-approvals-page {
          width: 100%;
          min-width: 0;
          padding: 16px;
        }

        .pr-approvals-header {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .pr-approvals-header__main {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pr-approvals-header__actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pr-approvals-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }
        .pr-approvals-icon {
          color: #1877b9;
        }
        .pr-approvals-subtitle {
          margin: 0;
          color: #66737c;
          font-size: 13px;
        }

        .pr-approvals-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .pr-summary-card {
          padding: 14px 16px;
        }
        .pr-summary-label {
          color: #66737c;
          font-size: 12px;
          font-weight: 600;
        }
        .pr-summary-value {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }

        .pr-approvals-card {
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
          color: #66737c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pr-detail-panel .psb-ui-table-shell {
          padding: 0;
        }
        .pr-detail-panel .psb-ui-table-shell .card {
          border: none;
          box-shadow: none;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (min-width: 480px) {
          .pr-approvals-page { padding: 20px; }
          .pr-approvals-summary { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 768px) {
          .pr-approvals-title { font-size: 26px; }
        }

        @media (min-width: 1024px) {
          .pr-approvals-page { padding: 24px 32px; }
        }
      `}</style>
    </div>
  );
}
