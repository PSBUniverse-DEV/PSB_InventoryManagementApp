/**
 * Server Component — InventoryTransactionPage.js
 *
 * Runs on the server. Passes initial data to the Transaction View.
 * Loads items, warehouses, and stock levels for search binding.
 */
import InventoryTransactionView from "./InventoryTransactionView";
import { loadInventoryData } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function InventoryTransactionPage() {
  const { items, warehouses, stockLevels, config } = await loadInventoryData();

  const initialData = { items, warehouses, stockLevels, config };

  return <InventoryTransactionView initialData={initialData} />;
}
