/**
 * Server Component — InventoryPage.js
 *
 * Runs on the server. Loads data, then passes it to the View.
 *
 * WHAT TO DO:
 *   1. Import your load function from "../data/inventory.actions"
 *   2. Call it with `await`
 *   3. Pass the result as props to InventoryView
 *
 * RULES:
 *   - No useState, useEffect, or onClick here — those go in the View.
 *   - Do NOT wrap JSX in try/catch (causes a React lint error).
 *
 * SSO NOTE:
 *   This page is a server component. Session validation happens
 *   on the client side in the View via useAuth() or in API routes
 *   via withModuleAuth(). If you need server-side session data,
 *   use getCurrentSession() from "@/core/auth/session.service".
 */
import InventoryView from "./InventoryView";
// import { loadInventoryData } from "../data/inventory.actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  // TODO: Load your data here
  // const { items } = await loadInventoryData();

  return <InventoryView />;
}
