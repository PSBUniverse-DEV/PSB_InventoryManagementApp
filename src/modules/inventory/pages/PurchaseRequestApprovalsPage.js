/**
 * Server Component — PurchaseRequestApprovalsPage.js
 *
 * Loads pending PR approvals from the workflow engine and renders the
 * approvals view.  This page is registered at
 * /inventory/purchase-requests/approvals.
 */
import PurchaseRequestApprovalsView from "./PurchaseRequestApprovalsView";
import { loadPendingPrApprovalsAction } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function PurchaseRequestApprovalsPage() {
  const { approvals } = await loadPendingPrApprovalsAction();

  return <PurchaseRequestApprovalsView initialData={{ approvals }} />;
}
