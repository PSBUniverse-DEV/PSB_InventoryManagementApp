/**
 * Server Actions — inventoryConfig.actions.js
 *
 * CRUD operations for inventory master data tables.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── HELPERS ─────────────────────────────────────────────────

const TABLE_MAP = {
  categories: "inv_s_category",
  units: "inv_s_unit",
  statuses: "inv_s_equipmentstatus",
  warehouseTypes: "inv_s_warehousetype",
};

const PK_MAP = {
  categories: "category_id",
  units: "unit_id",
  statuses: "status_id",
  warehouseTypes: "type_id",
};

function getTableName(entityKey) {
  return TABLE_MAP[entityKey];
}

function getPkColumn(entityKey) {
  return PK_MAP[entityKey] || "id";
}

function mapPayload(entityKey, payload) {
  const base = {
    name: payload?.name || "",
    description: payload?.description || null,
    display_order: payload?.display_order || 0,
    is_active: payload?.is_active !== false,
  };
  if (entityKey === "units") {
    base.abbreviation = payload?.key || null;
  } else {
    base.key = payload?.key || null;
  }
  return base;
}

// ─── LOAD ───────────────────────────────────────────────────

export async function loadUnitOfMeasures(entityKey) {
const supabase = getSupabaseAdmin();
  const{data, error} = await supabase
    .from("inv_s_unit") 
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load ${entityKey}: ${error.message}`);
  return data ?? [];  

}




// export async function loadInventoryConfigData() {
//   const supabase = getSupabaseAdmin();
//   const results = {};

//   for (const key of Object.keys(TABLE_MAP)) {
//     const { data, error } = await supabase
//       .from(TABLE_MAP[key])
//       .select("*")
//       .order("display_order", { ascending: true })
//       .order("name", { ascending: true });

//     if (error) throw new Error(`Failed to load ${key}: ${error.message}`);
//     results[key] = data ?? [];
//   }

//   return results;
// }

// ─── CREATE ─────────────────────────────────────────────────

export async function createEntityAction(entityKey, payload) {
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);

  const { data, error } = await getSupabaseAdmin()
    .from(tableName)
    .insert([mapPayload(entityKey, payload)])
    .select()
    .single();

  if (error) throw new Error(`Failed to create ${entityKey}: ${error.message}`);
  return data;
}

// ─── UPDATE ─────────────────────────────────────────────────

export async function updateEntityAction(entityKey, id, updates) {
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);

  const { data, error } = await getSupabaseAdmin()
    .from(tableName)
    .update(mapPayload(entityKey, updates))
    .eq(getPkColumn(entityKey), id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update ${entityKey}: ${error.message}`);
  return data;
}

// ─── DEACTIVATE ─────────────────────────────────────────────

export async function deactivateEntityAction(entityKey, id) {
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);

  const { error } = await getSupabaseAdmin()
    .from(tableName)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq(getPkColumn(entityKey), id);

  if (error) throw new Error(`Failed to deactivate ${entityKey}: ${error.message}`);
}

// ─── HARD DELETE ────────────────────────────────────────────

export async function hardDeleteEntityAction(entityKey, id) {
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);

  const { error } = await getSupabaseAdmin()
    .from(tableName)
    .delete()
    .eq(getPkColumn(entityKey), id);

  if (error) throw new Error(`Failed to delete ${entityKey}: ${error.message}`);
}

// ─── SAVE ORDER ─────────────────────────────────────────────

export async function saveEntityOrderAction(entityKey, orderedIds) {
  const tableName = getTableName(entityKey);
  if (!tableName) throw new Error(`Unknown entity: ${entityKey}`);

  const pkColumn = getPkColumn(entityKey);

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await getSupabaseAdmin()
      .from(tableName)
      .update({ display_order: i + 1, updated_at: new Date().toISOString() })
      .eq(pkColumn, orderedIds[i]);

    if (error) throw new Error(`Failed to save order for ${entityKey}: ${error.message}`);
  }
}