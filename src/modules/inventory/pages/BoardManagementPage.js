/**
 * Server Component — BoardManagementPage.js
 *
 * Loads all boards and passes them to the BoardManagementView.
 */
import BoardManagementView from "./BoardManagementView";

export const dynamic = "force-dynamic";

export default async function BoardManagementPage() {
  return <BoardManagementView />;
}