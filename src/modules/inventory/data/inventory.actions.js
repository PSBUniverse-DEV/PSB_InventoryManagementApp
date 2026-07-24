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
    safeQuery(() => supabase.from("inv_s_inventoryitem").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_warehouse").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_transaction").select("*").order("created_at", { ascending: false }).limit(200)),
  ]);

  return {
    config,
    items: (itemsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.item_id })),
    warehouses: (warehousesRes ?? []).map((r) => ({ ...r, id: r.id ?? r.warehouse_id })),
    transactions: (transactionsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.transaction_id })),
  };
}

// ─── CREATE ──────────────────────────────────────────────────

export async function createWarehouseAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_warehouse")
    .insert([{
      name: payload?.name || "",
      address: payload?.address || null,
      city: payload?.city || null,
      manager: payload?.manager || null,
      is_active: true,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create warehouse: ${error.message}`);
  return data;
}

export async function createItemAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_inventoryitem")
    .insert([{
      name: payload?.name || "",
      sku: payload?.sku || "",
      category_id: payload?.categoryId || null,
      unit_id: payload?.unitId || null,
      quantity: payload?.quantity || 0,
      min_threshold: payload?.minThreshold || 0,
      cost: payload?.cost || 0,
      warehouse_id: payload?.warehouseId || null,
      status_id: payload?.statusId || null,
      assigned_to: payload?.assignedTo || null,
      wholesale_price: payload?.wholesalePrice || null,
      retail_price: payload?.retailPrice || null,
      supplier_id: payload?.supplierId || null,
      is_active: true,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create item: ${error.message}`);
  return data;
}

// ─── UPDATE ──────────────────────────────────────────────────

export async function updateItemAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.name !== undefined) patch.name = updates.name;
  if (updates?.sku !== undefined) patch.sku = updates.sku;
  if (updates?.quantity !== undefined) patch.quantity = updates.quantity;
  if (updates?.minThreshold !== undefined) patch.min_threshold = updates.minThreshold;
  if (updates?.cost !== undefined) patch.cost = updates.cost;
  if (updates?.warehouseId !== undefined) patch.warehouse_id = updates.warehouseId;
  if (updates?.statusId !== undefined) patch.status_id = updates.statusId;
  if (updates?.assignedTo !== undefined) patch.assigned_to = updates.assignedTo;
  if (updates?.wholesalePrice !== undefined) patch.wholesale_price = updates.wholesalePrice;
  if (updates?.retailPrice !== undefined) patch.retail_price = updates.retailPrice;
  if (updates?.supplierId !== undefined) patch.supplier_id = updates.supplierId;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("inv_s_inventoryitem")
    .update(patch)
    .eq("item_id", id);

  if (error) throw new Error(`Failed to update item: ${error.message}`);
}

// ─── TRANSFER ────────────────────────────────────────────────

export async function transferItemAction(item, toWarehouseId, qty) {
  const supabase = getSupabaseAdmin();

  if (!qty) {
    // Equipment: just reassign warehouse
    await updateItemAction(item.id, { warehouseId: toWarehouseId });
  } else {
    // Material: decrement source, upsert destination
    await updateItemAction(item.id, { quantity: Math.max(0, (item.quantity || 0) - qty) });

    // Check if same SKU already exists at destination
    const { data: existing } = await supabase
      .from("inv_s_inventoryitem")
      .select("id, quantity")
      .eq("sku", item.sku)
      .eq("warehouse_id", toWarehouseId)
      .maybeSingle();

    if (existing) {
      await updateItemAction(existing.id, { quantity: (existing.quantity || 0) + qty });
    } else {
      await createItemAction({
        name: item.name, sku: item.sku, categoryId: item.category_id,
        unitId: item.unit_id, quantity: qty, minThreshold: item.minThreshold || 0,
        cost: item.cost || 0, warehouseId: toWarehouseId,
      });
    }
  }
}

// ─── TRANSACTION LOG ─────────────────────────────────────────

export async function logTransactionAction(entry) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inv_transaction")
    .insert([{
      type: entry?.type || "System",
      item_name: entry?.itemName || "",
      detail: entry?.detail || null,
      warehouse_name: entry?.warehouseName || null,
    }]);

  if (error) throw new Error(`Failed to log transaction: ${error.message}`);
}

// ─── DELETE ──────────────────────────────────────────────────

export async function deleteItemAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inv_s_inventoryitem").delete().eq("item_id", id);
  if (error) throw new Error(`Failed to delete item: ${error.message}`);
}

export async function deleteWarehouseAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inv_s_warehouse").delete().eq("warehouse_id", id);
  if (error) throw new Error(`Failed to delete warehouse: ${error.message}`);
}

// ─── HELPERS ────────────────────────────────────────────────

async function safeQuery(queryFn) {
  try {
    const { data, error } = await queryFn();
    if (error) {
      return [];
    }
    return data ?? [];
  } catch (err) {
    return [];
  }
}
