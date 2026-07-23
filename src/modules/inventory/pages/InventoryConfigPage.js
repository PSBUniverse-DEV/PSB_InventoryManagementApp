/**
 * Server Component — InventoryConfigPage.js
 *
 * Loads inventory master data, then passes it to the configuration View.
 */
import InventoryConfigView from "./InventoryConfigView";
import { loadInventoryConfigData } from "../data/inventoryConfig.actions";

export const dynamic = "force-dynamic";

export default async function InventoryConfigPage() {
  const configData = await loadInventoryConfigData();

  return <InventoryConfigView configData={configData} />;
}
