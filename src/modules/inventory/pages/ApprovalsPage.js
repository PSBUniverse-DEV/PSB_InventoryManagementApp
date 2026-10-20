/**
 * Server Component — ApprovalsPage.js
 *
 * Renders the consolidated approver queue — a table of all documents
 * (purchase requests, purchase orders, BOM releases, etc.) that are
 * currently pending the signed-in user's approval.  Registered at
 * /inventory/approvals.
 *
 * Data is loaded server-side via `loadMyPendingApprovalsAction`, which scopes
 * the queue to the workflow stages assigned to the current user's org roles.
 * The `documents` row shape expected by the view is:
 *   { documentType, documentNo, description, requestedBy, department,
 *     dateSubmitted, amount, priority, currentStage }
 *
 * NOTE: Approval actions (view / approve / reject) are intentionally NOT
 * wired yet — only the data lookup is live.  They will be added in a
 * follow-up once the workflow-engine integration is ready.
 */
import ApprovalsView from "./ApprovalsView";
import { loadMyPendingApprovalsAction } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { documents } = await loadMyPendingApprovalsAction();

  return <ApprovalsView initialData={{ documents }} />;
}