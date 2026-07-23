/**
 * Server Actions — inventoryConfig.actions.js
 *
 * Runs on the server. CRUD operations for inventory master data tables.
 * Follows the same pattern as admin/application-setup/data/applicationSetup.actions.js.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { getCurrentSession } from "@/core/auth/session.service";

// ─── HELPERS ─────────────────────────────────────────────────

function getTableName(entityKey) {
  const tableMap = {
    categories: "inv_s_category",
    units: "inv_s_unit",
    statuses: "inv_s_equipmentstatus",
    warehouseTypes: "inv_s_warehousetype",
  };
  return tableMap[entityKey];
}

function mapPayload(entityKey, payload) {
  const base = {
    name: payload?.name || "",
    description: payload?.description || null,
    display_order: payload?.display_order || 0,
    is_active: payload?.is_active !== false,
  };
  // units use "abbreviation" column, all others use "key"
  if (entityKey === "units") {
    base.abbreviation = payload?.key || null;
  } else {
    base.key = payload?.key || null;
  }
  return base;
}

// ─── AUTH CHECK ─────────────────────────────────────────────

// async function verifyAccess() {
//   const session = await getCurrentSession();
//   if (!session) throw new Error("Unauthorized");
//   if (!session.modules?.includes("INVENTORY") && !session.modules?.includes("ADMIN")) {
//     throw new Error("Forbidden");
//   }
//   return session;
// }

// ─── LOAD ───────────────────────────────────────────────────

export async function loadInventoryConfigData() {
  await verifyAccess();
  const supabase = getSupabaseAdmin();
  const entityKeys = ["categories", "units", "statuses", "warehouseTypes"];
  const results = {};

  for (const key of entityKeys) {
    const tableName = getTableName(key);
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw new Error(`Failed to load ${key}: ${error.message}`);
    results[key] = data ?? [];
  }

  return results;
}

// ─── CREATE ─────────────────────────────────────────────────

export async function createEntityAction(entityKey, payload) {
  // await verifyAccess();
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(tableName)
    .insert([mapPayload(entityKey, payload)])
    .select()
    .single();

  if (error) throw new Error(`Failed to create ${entityKey}: ${error.message}`);
  return data;
}

// ─── UPDATE ─────────────────────────────────────────────────

export async function updateEntityAction(entityKey, id, updates) {
  await verifyAccess();
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);
  const supabase = getSupabaseAdmin();

  const columnMap = {
    categories: "category_id",
    units: "unit_id",
    statuses: "status_id",
    warehouseTypes: "type_id",
  };
  const pkColumn = columnMap[entityKey] || "id";

  const { data, error } = await supabase
    .from(tableName)
    .update(mapPayload(entityKey, updates))
    .eq(pkColumn, id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update ${entityKey}: ${error.message}`);
  return data;
}

// ─── DEACTIVATE ─────────────────────────────────────────────

export async function deactivateEntityAction(entityKey, id) {
  await verifyAccess();
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);
  const supabase = getSupabaseAdmin();

  const columnMap = {
    categories: "category_id",
    units: "unit_id",
    statuses: "status_id",
    warehouseTypes: "type_id",
  };
  const pkColumn = columnMap[entityKey] || "id";

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq(pkColumn, id);

  if (error) throw new Error(`Failed to deactivate ${entityKey}: ${error.message}`);
}

// ─── HARD DELETE ────────────────────────────────────────────

export async function hardDeleteEntityAction(entityKey, id) {
  await verifyAccess();
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);
  const supabase = getSupabaseAdmin();

  const columnMap = {
    categories: "category_id",
    units: "unit_id",
    statuses: "status_id",
    warehouseTypes: "type_id",
  };
  const pkColumn = columnMap[entityKey] || "id";

  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq(pkColumn, id);

  if (error) throw new Error(`Failed to delete ${entityKey}: ${error.message}`);
}

// ─── SAVE ORDER ─────────────────────────────────────────────

export async function saveEntityOrderAction(entityKey, orderedIds) {
  await verifyAccess();
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);
  const supabase = getSupabaseAdmin();

  const columnMap = {
    categories: "category_id",
    units: "unit_id",
    statuses: "status_id",
    warehouseTypes: "type_id",
  };
  const pkColumn = columnMap[entityKey] || "id";

  const updates = orderedIds.map((id, index) => ({
    [pkColumn]: id,
    display_order: index + 1,
    updated_at: new Date().toISOString(),
  }));

  // Use a batch upsert approach
  for (const update of updates) {
    const { error } = await supabase
      .from(tableName)
      .update({ display_order: update.display_order, updated_at: update.updated_at })
      .eq(pkColumn, update[pkColumn]);

    if (error) throw new Error(`Failed to save order for ${entityKey}: ${error.message}`);
  }
}