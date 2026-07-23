/**
 * Server Component — InventoryPage.js
 *
 * Runs on the server. Loads inventory data, then passes it to the View.
 */
import InventoryView from "./InventoryView";
import { loadInventoryData } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const initialData = await loadInventoryData();

  return <InventoryView initialData={initialData} />;
}
