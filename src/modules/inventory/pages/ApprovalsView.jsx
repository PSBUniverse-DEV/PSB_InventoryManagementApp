"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Eye, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import {
  Card,
  Badge,
  StatusBadge,
  Modal,
  Button,
  Input,
  SearchBar,
  toastSuccess,
  toastError,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import { actOnPurchaseRequestApprovalAction } from "../data/inventory.actions";
import { formatDateTime } from "../data/inventory.data";

/**
 * ApprovalsView — consolidated approver queue.
 *
 * Renders the list of documents (purchase requests, purchase orders, BOM
 * releases, etc.) that are pending approval.  Rows are supplied by the
 * server component via `initialData.documents`.
 *
 * NOTE: Approval actions (view / approve / reject), navigation and data
 * lookups are intentionally NOT wired yet — they will be added in a
 * follow-up once the workflow-engine integration is ready.
 */

function DocumentTypeBadge({ documentType }) {
  const variants = {
    "purchase request": { bg: "info", text: "dark" },
    "purchase order": { bg: "primary", text: "white" },
    "bom release": { bg: "warning", text: "dark" },
  };
  const variant = variants[String(documentType || "").toLowerCase()] || { bg: "secondary", text: "dark" };
  return <Badge bg={variant.bg} text={variant.text}>{documentType || "—"}</Badge>;
}

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

function historyStatus(entry) {
  if (entry?.isPending) return "pending";
  const name = String(entry?.statusName || "").toLowerCase();
  if (name.includes("reject")) return "rejected";
  if (name.includes("approve") || name.includes("complete")) return "approved";
  return "processing";
}

export default function ApprovalsView({ initialData }) {
  const router = useRouter();
  const data = initialData || {};
  const documents = data.documents || [];

  // Search + client-side filtering for the table.
  const [search, setSearch] = useState("");
  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      [d.documentNo, d.documentType, d.description, d.requestedBy, d.department, d.currentStage]
        .some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [documents, search]);

  // View modal — read-only document detail.
  const [viewRow, setViewRow] = useState(null);

  // Approve / Reject decision modal.
  const [decisionRow, setDecisionRow] = useState(null);
  const [decision, setDecision] = useState(null); // "approve" | "reject" | null
  const [comments, setComments] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 400);
  }, [router]);

  const openView = useCallback((row) => setViewRow(row), []);
  const closeView = useCallback(() => setViewRow(null), []);

  const openDecision = useCallback((row, decisionType) => {
    setDecisionRow(row);
    setDecision(decisionType);
    setComments("");
  }, []);

  const closeDecision = useCallback(() => {
    setDecisionRow(null);
    setDecision(null);
    setComments("");
  }, []);

  // Approve straight from the details modal — close the detail view and open
  // the approve confirmation (reuses the shared decision flow).
  const approveFromView = useCallback(
    (row) => {
      setViewRow(null);
      openDecision(row, "approve");
    },
    [openDecision]
  );

  const handleAct = useCallback(async () => {
    if (!decisionRow || !decision) return;
    setIsBusy(true);
    try {
      const result = await actOnPurchaseRequestApprovalAction({
        stageinstanceId: decisionRow.stageinstanceId,
        decision,
        comments,
        statusName: decision === "approve" ? "Approved" : "Rejected",
      });
      if (decision === "approve") {
        toastSuccess(result?.completed ? "Document fully approved." : "Document approved — sent to the next approver.");
      } else {
        toastSuccess("Document rejected — returned to the first stage for rework.");
      }
      setDecisionRow(null);
      setDecision(null);
      setComments("");
      router.refresh();
    } catch (err) {
      toastError(err?.message || "Failed to record decision.");
    } finally {
      setIsBusy(false);
    }
  }, [decisionRow, decision, comments, router]);

  const actions = useMemo(
    () => [
      {
        key: "view",
        label: "View",
        type: "secondary",
        icon: "eye",
        onClick: (row) => openView(row),
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
    [openView, openDecision]
  );

  const columns = useMemo(
    () => [
      {
        key: "documentType",
        label: "Document Type",
        sortable: true,
        render: (row) => <DocumentTypeBadge documentType={row.documentType} />,
      },
      {
        key: "documentNo",
        label: "Document No.",
        sortable: true,
        render: (row) => <span className="fw-semibold">{displayValue(row.documentNo)}</span>,
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        render: (row) => (
          <span className="text-muted small approvals-remarks-cell" title={row.description || ""}>
            {displayValue(row.description)}
          </span>
        ),
      },
      {
        key: "requestedBy",
        label: "Requested By",
        sortable: true,
        render: (row) => displayValue(row.requestedBy),
      },
      {
        key: "dateSubmitted",
        label: "Date Submitted",
        sortable: true,
        render: (row) => (
          <span className="text-muted small">{formatDateTime(row.dateSubmitted)}</span>
        ),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        align: "right",
        render: (row) => (
          <span className="inventory-mono fw-semibold">{formatCurrency(row.amount)}</span>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        sortable: true,
        align: "center",
        render: (row) => <PriorityBadge priority={row.priority} />,
      },
      {
        key: "currentStage",
        label: "Current Stage",
        sortable: true,
        render: (row) => displayValue(row.currentStage),
      },
    ],
    []
  );

  const lineItemColumns = useMemo(
    () => [
      {
        key: "itemName",
        label: "Item",
        sortable: true,
        render: (item) => <span className="fw-semibold">{item.itemName || displayValue(item.item_name)}</span>,
      },
      {
        key: "itemSku",
        label: "SKU",
        sortable: true,
        render: (item) => <span className="text-muted small">{displayValue(item.itemSku || item.item_sku)}</span>,
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

  return (
    <div className="approvals-page">
      <header className="approvals-header">
        <div className="approvals-header__main">
          <h1 className="approvals-title">
            <ClipboardCheck size={22} className="approvals-icon" />
            Pending   Approvals
          </h1>
          <p className="approvals-subtitle">
            Documents pending your approval.
          </p>
        </div>
      </header>

      <section className="approvals-summary">
        <Card className="approvals-summary-card">
          <div className="approvals-summary-label">Pending Documents</div>
          <div className="approvals-summary-value">{documents.length}</div>
        </Card>
        <Card className="approvals-summary-card">
          <div className="approvals-summary-label">Total Pending Value</div>
          <div className="approvals-summary-value">
            {formatCurrency(documents.reduce((sum, doc) => sum + (Number(doc.amount) || 0), 0))}
          </div>
        </Card>
      </section>

      <Card className="approvals-card">
        <div className="approvals-table-toolbar">
          <SearchBar
            value={search}
            placeholder="Search pending documents..."
            onDebouncedChange={setSearch}
          />
          <Button variant="outline-secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh
          </Button>
        </div>
        <TableZ
          data={filteredDocuments}
          columns={columns}
          actions={actions}
          rowIdKey="stageinstanceId"
          hideSearch
          emptyMessage="No documents are pending approval."
        />
      </Card>

      {/* View — read-only document detail */}
      <Modal
        show={Boolean(viewRow)}
        onHide={closeView}
        title="Document Details"
        size="xl"
        scrollable
        dialogClassName="approvals-details-dialog"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeView}>
              Close
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={() => approveFromView(viewRow)}
              disabled={isBusy}
            >
              <CheckCircle size={14} /> Approve
            </Button>
          </>
        }
      >
        {viewRow && (
          <div className="approvals-detail-layout">
            <aside className="approvals-history-panel">
              <h4 className="approvals-detail-items-title">Approval History</h4>
              {Array.isArray(viewRow.history) && viewRow.history.length > 0 ? (
                <div className="approvals-history-list">
                  {viewRow.history.map((h, i) => (
                    <div key={h.stageinstanceId ?? i} className="approvals-history-card">
                      <div className="approvals-history-card__header">
                        <span className="approvals-history-card__stage">{h.stageName || "—"}</span>
                        <StatusBadge status={historyStatus(h)} label={h.statusName || "Pending"} />
                      </div>
                      <div className="approvals-history-card__body">
                        <div className="approvals-history-field">
                          <span className="approvals-history-field__label">Approver</span>
                          <span className="approvals-history-field__value">{h.approverName || "Awaiting action"}</span>
                        </div>
                        <div className="approvals-history-field">
                          <span className="approvals-history-field__label">Date Assigned</span>
                          <span className="approvals-history-field__value">{h.createdAt ? formatDateTime(h.createdAt) : "—"}</span>
                        </div>
                        <div className="approvals-history-field">
                          <span className="approvals-history-field__label">Date of Action</span>
                          <span className="approvals-history-field__value">{h.actedAt ? formatDateTime(h.actedAt) : "—"}</span>
                        </div>
                        <div className="approvals-history-field">
                          <span className="approvals-history-field__label">Remarks</span>
                          <span className="approvals-history-field__value">{h.comments || "—"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted small">No history available.</p>
              )}
            </aside>
            <div className="approvals-detail-main">
            <dl className="approvals-detail-grid">
              <div>
                <dt>Document Type</dt>
                <dd>{displayValue(viewRow.documentType)}</dd>
              </div>
              <div>
                <dt>Document No.</dt>
                <dd>{displayValue(viewRow.documentNo)}</dd>
              </div>
              <div>
                <dt>Requested By</dt>
                <dd>{displayValue(viewRow.requestedBy)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{displayValue(viewRow.department)}</dd>
              </div>
              <div>
                <dt>Date Submitted</dt>
                <dd>{formatDateTime(viewRow.dateSubmitted)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{displayValue(viewRow.priority)}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{formatCurrency(viewRow.amount)}</dd>
              </div>
              <div>
                <dt>Current Stage</dt>
                <dd>{displayValue(viewRow.currentStage)}</dd>
              </div>
            </dl>
            <p className="approvals-detail-desc">
              <span className="approvals-detail-label">Description:</span>{" "}
              {displayValue(viewRow.description)}
            </p>
            {Array.isArray(viewRow.lineItems) && viewRow.lineItems.length > 0 ? (
              <div className="approvals-detail-items">
                <h4 className="approvals-detail-items-title">Requested Items</h4>
                <TableZ
                  data={viewRow.lineItems}
                  columns={lineItemColumns}
                  rowIdKey="pritem_id"
                  hideSearch
                  hideFooter
                  showActionColumn={false}
                  emptyMessage="No items for this request."
                />
              </div>
            ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* Approve / Reject decision */}
      <Modal
        show={Boolean(decisionRow && decision)}
        onHide={closeDecision}
        title={decision === "approve" ? "Approve Document" : "Reject Document"}
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
        {decisionRow && (
          <>
            <p className="text-muted small">
              <b>{decisionRow.documentType}</b> <b>{displayValue(decisionRow.documentNo)}</b> from{" "}
              <b>{displayValue(decisionRow.requestedBy)}</b>
              {decisionRow.department ? ` (${decisionRow.department})` : ""} —{" "}
              {formatCurrency(decisionRow.amount)}
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
        .approvals-page {
          width: 100%;
          min-width: 0;
          padding: 16px;
        }

        .approvals-header {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .approvals-header__main {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .approvals-header__actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .approvals-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }
        .approvals-icon {
          color: #1877b9;
        }
        .approvals-subtitle {
          margin: 0;
          color: #66737c;
          font-size: 13px;
        }

        .approvals-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .approvals-summary-card {
          padding: 14px 16px;
        }
        .approvals-summary-label {
          color: #66737c;
          font-size: 12px;
          font-weight: 600;
        }
        .approvals-summary-value {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          color: #111518;
        }

        .approvals-card {
          overflow: hidden;
        }
        .approvals-table-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #e6ebee;
        }
        .approvals-table-toolbar :global(.psb-ui-searchbar) {
          flex: 1 1 auto;
          min-width: 0;
          width: 100%;
        }
        .approvals-remarks-cell {
          display: inline-block;
          max-width: 240px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
        }

        .approvals-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px 28px;
          margin: 0 0 18px;
          padding: 16px 18px;
          background: #f7f9fa;
          border: 1px solid #e6ebee;
          border-radius: 10px;
        }
        .approvals-detail-grid dt {
          margin: 0;
          color: #66737c;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .approvals-detail-grid dd {
          margin: 4px 0 0;
          font-size: 15px;
          font-weight: 600;
          color: #111518;
          line-height: 1.4;
        }
        .approvals-detail-desc {
          margin: 0 0 18px;
          padding: 14px 18px;
          background: #f7f9fa;
          border: 1px solid #e6ebee;
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.6;
          color: #445158;
        }
        .approvals-detail-label {
          display: block;
          margin-bottom: 4px;
          color: #66737c;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .approvals-detail-items {
          margin-top: 4px;
        }
        .approvals-detail-items-title {
          margin: 0 0 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e6ebee;
          font-size: 13px;
          font-weight: 800;
          color: #445158;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .approvals-detail-layout {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 20px;
        }
        .approvals-history-panel {
          flex: 0 0 340px;
          width: 340px;
          position: sticky;
          top: 0;
          align-self: flex-start;
          max-height: calc(100vh - 240px);
          overflow-y: auto;
          overflow-x: hidden;
          background: #f7f9fa;
          border: 1px solid #e6ebee;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .approvals-detail-main {
          flex: 1 1 auto;
          min-width: 0;
        }
        .approvals-history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .approvals-history-card {
          background: #ffffff;
          border: 1px solid #e6ebee;
          border-radius: 8px;
          overflow: hidden;
        }
        .approvals-history-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px;
          background: #f2f5f7;
          border-bottom: 1px solid #e6ebee;
        }
        .approvals-history-card__stage {
          font-weight: 700;
          font-size: 13px;
          color: #111518;
        }
        .approvals-history-card__body {
          padding: 10px 12px;
        }
        .approvals-history-field {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px 0;
        }
        .approvals-history-field + .approvals-history-field {
          border-top: 1px dashed #eef1f3;
        }
        .approvals-history-field__label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #66737c;
        }
        .approvals-history-field__value {
          font-size: 13px;
          color: #111518;
          line-height: 1.4;
          word-break: break-word;
        }

        @media (max-width: 767px) {
          .approvals-detail-layout {
            flex-direction: column;
          }
          .approvals-history-panel {
            flex: 1 1 auto;
            width: 100%;
          }
        }

        /* Widen the Document Details dialog beyond Bootstrap's built-in xl.
           The dialog renders via a portal outside this component's scope, so it
           is targeted globally through the dialogClassName hook. */
        :global(.approvals-details-dialog) {
          width: 92vw;
          max-width: 92vw;
        }

        @media (min-width: 480px) {
          .approvals-page { padding: 20px; }
          .approvals-summary { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 768px) {
          .approvals-title { font-size: 26px; }
        }

        @media (min-width: 1024px) {
          .approvals-page { padding: 24px 32px; }
        }
      `}</style>
    </div>
  );
}