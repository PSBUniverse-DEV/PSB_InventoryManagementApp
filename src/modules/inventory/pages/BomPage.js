/**
 * Server Component — BomPage.js
 *
 * Runs on the server. Loads data needed for the BOM view (projects, warehouses,
 * templates, items) and passes it to the client component.
 */
import BomView from "./BomView";
import { loadInventoryData } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function BomPage() {
  const { items, warehouses, stockLevels, config } = await loadInventoryData();

  const initialData = { items, warehouses, stockLevels, config };

  return <BomView initialData={initialData} />;
}