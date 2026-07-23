/**
 * Server Actions — inventory.actions.js
 *
 * Runs on the server. This is the ONLY place you talk to the database.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { loadInventoryConfigData } from "./inventoryConfig.actions";

// ─── LOAD CONFIG + OPERATIONAL DATA ─────────────────────────

export async function loadInventoryData() {
  const supabase = getSupabaseAdmin();

  // Reference/config data is already managed by inventoryConfig.actions.
  const config = await loadInventoryConfigData();

  // Operational tables may not exist yet; wrap each call so the page still
  // renders if a table is missing. Returns empty arrays as safe fallbacks.
  const [itemsRes, warehousesRes, transactionsRes] = await Promise.all([
    safeQuery(() => supabase.from("inv_item").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_warehouse").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_transaction").select("*").order("created_at", { ascending: false }).limit(200)),
  ]);

  return {
    config,
    items: itemsRes ?? [],
    warehouses: warehousesRes ?? [],
    transactions: transactionsRes ?? [],
  };
}

// ─── HELPERS ────────────────────────────────────────────────

async function safeQuery(queryFn) {
  try {
    const { data, error } = await queryFn();
    if (error) {
      // Swallow so the UI can fall back to seed data.
      return [];
    }
    return data ?? [];
  } catch (err) {
    // Swallow so the UI can fall back to seed data.
    return [];
  }
}
