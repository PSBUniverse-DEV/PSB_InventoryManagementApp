import { loadInventoryData } from "../data/inventory.actions";
import StockOutView from "./StockOutView";

export default async function StockOutPage() {
  const initialData = await loadInventoryData();
  return <StockOutView initialData={initialData} />;
}
npm 