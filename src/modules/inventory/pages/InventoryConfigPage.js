/**
 * Server Component — InventoryConfigPage.js
 *
 * Loads inventory master data, then passes it to the configuration View.
 */
import InventoryConfigView from "./InventoryConfigView";
// import { loadInventoryConfigData } from "../data/inventoryConfig.actions";

export const dynamic = "force-dynamic";

export default async function InventoryConfigPage() {
  // TODO: Uncomment when database tables exist
  // const configData = await loadInventoryConfigData();

  // Pass empty arrays as seed data until DB is ready
  const configData = {
    categories: [],
    units: [],
    statuses: [],
    warehouseTypes: [],
  };

  return <InventoryConfigView configData={configData} />;
}