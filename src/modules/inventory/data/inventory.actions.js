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
  const [itemsRes, warehousesRes, transactionsRes, stockLevelsRes, suppliersRes] = await Promise.all([
    safeQuery(() => supabase.from("inv_s_inventoryitem").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_warehouse").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_t_inventorytransaction").select("*").order("created_at", { ascending: false }).limit(200)),
    safeQuery(() => supabase.from("inv_t_stockslevels").select("*").order("created_at", { ascending: false })),
    safeQuery(() => supabase.from("inv_s_supplier").select("*").order("name", { ascending: true })),
  ]);

  return {
    config,
    items: (itemsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.item_id })),
    warehouses: (warehousesRes ?? []).map((r) => ({ ...r, id: r.id ?? r.warehouse_id })),
    transactions: (transactionsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.transaction_id, type: r.transaction_type ?? r.type })),
    stockLevels: (stockLevelsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.stocklevel_id })),
    suppliers: (suppliersRes ?? []).map((r) => ({ ...r, id: r.id ?? r.supplier_id })),
  };
}

//#region ─── WAREHOUSE ──────────────────────────────────────────────────

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
      classification: payload?.classification || "Material",
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
  if (updates?.categoryId !== undefined) patch.category_id = updates.categoryId;
  if (updates?.unitId !== undefined) patch.unit_id = updates.unitId;
  if (updates?.quantity !== undefined) patch.quantity = updates.quantity;
  if (updates?.minThreshold !== undefined) patch.min_threshold = updates.minThreshold;
  if (updates?.cost !== undefined) patch.cost = updates.cost;
  if (updates?.warehouseId !== undefined) patch.warehouse_id = updates.warehouseId;
  if (updates?.statusId !== undefined) patch.status_id = updates.statusId;
  if (updates?.assignedTo !== undefined) patch.assigned_to = updates.assignedTo;
  if (updates?.wholesalePrice !== undefined) patch.wholesale_price = updates.wholesalePrice;
  if (updates?.retailPrice !== undefined) patch.retail_price = updates.retailPrice;
  if (updates?.supplierId !== undefined) patch.supplier_id = updates.supplierId;
  if (updates?.classification !== undefined) patch.classification = updates.classification;
  patch.updated_at = new Date().toISOString();
     

  const { error } = await supabase
    .from("inv_s_inventoryitem")
    .update(patch)
    .eq("item_id", id);

  if (error) throw new Error(`Failed to update item: ${error.message}`);
}

//#endregion

//#region ─── TRANSFER ────────────────────────────────────────────────

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

//#endregion  

//#region ─── TRANSACTION LOG ─────────────────────────────────────────

export async function logTransactionAction(entry) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("insert_transaction", {
    p_transaction_type: entry?.type || "System",
    p_item_id:          entry?.itemId || null,
    p_item_name:        entry?.itemName || "",
    p_sku:              entry?.sku || null,
    p_warehouse_id:     entry?.warehouseId || null,
    p_warehouse_name:   entry?.warehouseName || null,
    p_to_warehouse_id:  entry?.toWarehouseId || null,
    p_detail:           entry?.detail || null,
    p_qty_change:       entry?.qtyChange || 0,
    p_user_id:          entry?.userId || null,
    p_assigned_to:      entry?.assignedTo || null,
  });

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
//#endregion

//#region ─── STOCK LEVELS ───────────────────────────────────────────

export async function createStockLevelAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_t_stockslevels")
    .insert([{
      item_id: payload?.itemId || null,
      warehouse_id: payload?.warehouseId || null,
      quantity: payload?.quantity || 0,
      bin_location: payload?.binLocation || null,
      unit_id: payload?.unitId || null,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create stock level: ${error.message}`);
  return data;
}

export async function updateStockLevelAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.itemId !== undefined) patch.item_id = updates.itemId;
  if (updates?.warehouseId !== undefined) patch.warehouse_id = updates.warehouseId;
  if (updates?.quantity !== undefined) patch.quantity = updates.quantity;
  if (updates?.binLocation !== undefined) patch.bin_location = updates.binLocation;
  if (updates?.unitId !== undefined) patch.unit_id = updates.unitId;

  const { error } = await supabase
    .from("inv_t_stockslevels")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(`Failed to update stock level: ${error.message}`);
}

export async function deleteStockLevelAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inv_t_stockslevels").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete stock level: ${error.message}`);
}
//#endregion

//#region ─── SUPPLIERS ───────────────────────────────────────────
function slugifyKey(name) {
  if (!name) return "";
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base}_${Date.now()}`;
}

export async function createSupplierAction(payload) { 
    const supabase = getSupabaseAdmin();
    const name = payload?.name || "";
    const { data, error } = await supabase  
     .from("inv_s_supplier" )
     .insert([{
      key: slugifyKey(name),
      name,
      description: payload?.description || null,
      contact_person: payload?.contactPerson || null,
      contact_email: payload?.contactEmail || null,
      contact_phone: payload?.contactPhone || null,
      address : payload?.address || null,
      is_active: true,
    }])
     .select()
     .single();

     if (error) throw new Error(`Failed to create supplier: ${error.message}`);
      return data;
    }

export async function updateSupplierAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.name !== undefined) patch.name = updates.name;
  if (updates?.description !== undefined) patch.description = updates.description;
  if (updates?.contactPerson !== undefined) patch.contact_person = updates.contactPerson;
  if (updates?.contactEmail !== undefined) patch.contact_email = updates.contactEmail;
  if (updates?.contactPhone !== undefined) patch.contact_phone = updates.contactPhone;
  if (updates?.address !== undefined) patch.address = updates.address;
  if (updates?.isActive !== undefined) patch.is_active = updates.isActive;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("inv_s_supplier")
    .update(patch)
    .eq("supplier_id", id);

  if (error) throw new Error(`Failed to update supplier: ${error.message}`);
}

export async function deleteSupplierAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inv_s_supplier").delete().eq("supplier_id", id);
  if (error) throw new Error(`Failed to delete supplier: ${error.message}`);
}

//#endregion

//#region ─── HELPERS ────────────────────────────────────────────────

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
//#endregion
