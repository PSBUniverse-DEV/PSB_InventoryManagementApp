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
  const [itemsRes, warehousesRes, transactionsRes, stockLevelsRes, suppliersRes, bomTemplateRes, usersRes, departmentsRes, purchaseRequestsRes, purchaseRequestItemsRes, purchaseOrdersRes, purchaseOrderItemsRes, purchaseRequestStatusesRes] = await Promise.all([
    safeQuery(() => supabase.from("inv_s_inventoryitem").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_warehouse").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_t_activitylog").select("*").order("created_at", { ascending: false }).limit(200)),
    safeQuery(() => supabase.from("inv_t_stockslevels").select("*").order("created_at", { ascending: false })),
    safeQuery(() => supabase.from("inv_s_supplier").select("*").order("name", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_bom_template").select("*").order("project_name", { ascending: true })),
    safeQuery(() => supabase.from("psb_s_user").select("user_id, first_name, last_name, email").order("last_name", { ascending: true })),
    safeQuery(() => supabase.from("psb_s_department").select("dept_id, dept_name").order("dept_name", { ascending: true })),
    safeQuery(() => supabase.from("inv_t_purchaserequest").select("*").order("created_at", { ascending: false }).limit(200)),
    safeQuery(() => supabase.from("inv_t_purchaserequest_items").select("*, inv_s_inventoryitem(name, sku)").order("pritem_id", { ascending: true })),
    safeQuery(() => supabase.from("inv_t_purchaseorder").select("*, inv_s_supplier(name)").order("created_at", { ascending: false }).limit(200)),
    safeQuery(() => supabase.from("inv_t_purchasorder_items").select("*, inv_s_inventoryitem(name, sku)").order("poitem_id", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_status").select("id, name, description, color").order("name", { ascending: true })),
  ]);

  // Compute quantity per item by aggregating stock levels
  const stockLevels = stockLevelsRes ?? [];
  const quantityByItemId = {};
  for (const sl of stockLevels) {
    const itemId = sl.item_id;
    if (itemId != null) {
      quantityByItemId[itemId] = (quantityByItemId[itemId] || 0) + (Number(sl.quantity) || 0);
    }
  }

  const items = (itemsRes ?? []).map((r) => ({
    ...r,
    id: r.id ?? r.item_id,
    quantity: quantityByItemId[r.item_id ?? r.id] ?? 0, // computed from stock levels
  }));

  return {
    config,
    items,
    warehouses: (warehousesRes ?? []).map((r) => ({ ...r, id: r.id ?? r.warehouse_id })),
    transactions: (transactionsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.transaction_id, type: r.transaction_type ?? r.type })),
    stockLevels: (stockLevelsRes ?? []).map((r) => ({ ...r, id: r.id ?? r.stocklevel_id })),
    suppliers: (suppliersRes ?? []).map((r) => ({ ...r, id: r.id ?? r.supplier_id })),
    bomTemplates: (bomTemplateRes ?? []).map((r) => ({ ...r, id: r.id ?? r.bom_temp_id })),
    units: config.units || [],
    users: (usersRes ?? []).map((r) => ({ ...r, id: r.user_id })),
    departments: (departmentsRes ?? []).map((r) => ({ ...r, id: r.dept_id })),
    purchaseRequests: (purchaseRequestsRes ?? []).map((r) => ({ ...r, id: r.pr_id })),
    purchaseRequestItems: (purchaseRequestItemsRes ?? []).map((r) => ({
      ...r,
      id: r.pritem_id,
      itemName: r.inv_s_inventoryitem?.name || r.item_name || "Unknown",
      itemSku: r.inv_s_inventoryitem?.sku || r.item_sku || "",
    })),
    purchaseOrders: (purchaseOrdersRes ?? []).map((r) => ({
      ...r,
      id: r.po_id,
      supplierName: r.inv_s_supplier?.name || r.supplier_name || "Unknown",
    })),
    purchaseOrderItems: (purchaseOrderItemsRes ?? []).map((r) => ({
      ...r,
      id: r.poitem_id,
      itemName: r.inv_s_inventoryitem?.name || r.item_name || "Unknown",
      itemSku: r.inv_s_inventoryitem?.sku || r.item_sku || "",
    })),
    purchaseRequestStatuses: (purchaseRequestStatusesRes ?? []).map((r) => ({
      ...r,
      id: r.id,
    })),
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
      description: payload?.description || payload?.name || "",
      sku: payload?.sku || "",
      barcode: payload?.barcode || null,
      category_id: payload?.categoryId || null,
      unit_id: payload?.unitId || null,
      min_threshold: payload?.minThreshold || 0,
      max_threshold: payload?.maxThreshold || 0,
      reorder_point: payload?.reorderPoint || 0,
      default_reorder_quantity: payload?.defaultReorderQty || 0,
      cost: payload?.cost || 0,
      warehouse_id: payload?.warehouseId || null,
      status_id: payload?.statusId || null,
      wholesale_price: payload?.wholesalePrice || null,
      retail_price: payload?.retailPrice || null,
      supplier_id: payload?.supplierId || null,
      tracking_type_id: payload?.trackingTypeId || null,
      classification: payload?.classification || "Material",
      weight: payload?.weight || null,
      length: payload?.length || null,
      width: payload?.width || null,
      height: payload?.height || null,
      color: payload?.color || null,
      gauge: payload?.gauge || null,
      specification: payload?.specification ? (typeof payload.specification === "object" ? payload.specification : { value: payload.specification }) : null,
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
  if (updates?.description !== undefined) patch.description = updates.description;
  if (updates?.sku !== undefined) patch.sku = updates.sku;
  if (updates?.barcode !== undefined) patch.barcode = updates.barcode;
  if (updates?.categoryId !== undefined) patch.category_id = updates.categoryId;
  if (updates?.unitId !== undefined) patch.unit_id = updates.unitId;
  if (updates?.minThreshold !== undefined) patch.min_threshold = updates.minThreshold;
  if (updates?.maxThreshold !== undefined) patch.max_threshold = updates.maxThreshold;
  if (updates?.reorderPoint !== undefined) patch.reorder_point = updates.reorderPoint;
  if (updates?.defaultReorderQty !== undefined) patch.default_reorder_quantity = updates.defaultReorderQty;
  if (updates?.cost !== undefined) patch.cost = updates.cost;
  if (updates?.warehouseId !== undefined) patch.warehouse_id = updates.warehouseId;
  if (updates?.statusId !== undefined) patch.status_id = updates.statusId;
  if (updates?.wholesalePrice !== undefined) patch.wholesale_price = updates.wholesalePrice;
  if (updates?.retailPrice !== undefined) patch.retail_price = updates.retailPrice;
  if (updates?.supplierId !== undefined) patch.supplier_id = updates.supplierId;
  if (updates?.trackingTypeId !== undefined) patch.tracking_type_id = updates.trackingTypeId;
  if (updates?.classification !== undefined) patch.classification = updates.classification;
  if (updates?.weight !== undefined) patch.weight = updates.weight;
  if (updates?.length !== undefined) patch.length = updates.length;
  if (updates?.width !== undefined) patch.width = updates.width;
  if (updates?.height !== undefined) patch.height = updates.height;
  if (updates?.color !== undefined) patch.color = updates.color;
  if (updates?.gauge !== undefined) patch.gauge = updates.gauge;
  if (updates?.specification !== undefined) {
    patch.specification = updates.specification
      ? (typeof updates.specification === "object" ? updates.specification : { value: updates.specification })
      : null;
  }
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
    // Material: quantity is tracked in stock levels, not on the item row.
    // Transfer creates/updates stock level records at the destination.
    // Check if same SKU already exists at destination
    const { data: existing } = await supabase
      .from("inv_s_inventoryitem")
      .select("item_id")
      .eq("sku", item.sku)
      .eq("warehouse_id", toWarehouseId)
      .maybeSingle();

    if (existing) {
      // Add to existing stock level at destination
      const destItemId = existing.item_id;
      await createStockLevelAction({
        itemId: destItemId,
        warehouseId: toWarehouseId,
        quantity: qty,
        unitId: item.unit_id,
      });
    } else {
      // Create new item at destination with stock level
      const newItem = await createItemAction({
        name: item.name,
        description: item.description,
        sku: item.sku,
        categoryId: item.category_id,
        unitId: item.unit_id,
        minThreshold: item.min_threshold || 0,
        maxThreshold: item.max_threshold || 0,
        reorderPoint: item.reorder_point || 0,
        defaultReorderQty: item.default_reorder_quantity || 0,
        cost: item.cost || 0,
        warehouseId: toWarehouseId,
        classification: item.classification,
        weight: item.weight,
        length: item.length,
        width: item.width,
        height: item.height,
        color: item.color,
        gauge: item.gauge,
        specification: item.specification || null,
      });
      await createStockLevelAction({
        itemId: newItem.item_id,
        warehouseId: toWarehouseId,
        quantity: qty,
        unitId: item.unit_id,
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
      supplier_id: payload?.supplierId || null,
      po_no: payload?.poNo || null,
      delivery_no: payload?.deliveryNo || null,
      remarks: payload?.remarks || null,
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
  if (updates?.supplierId !== undefined) patch.supplier_id = updates.supplierId;
  if (updates?.poNo !== undefined) patch.po_no = updates.poNo;
  if (updates?.deliveryNo !== undefined) patch.delivery_no = updates.deliveryNo;
  if (updates?.remarks !== undefined) patch.remarks = updates.remarks;

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

//#region ─── BOM TEMPLATES ─────────────────────────────────────────

// ─── CREATE ──────────────────────────────────────────────────

export async function createBomTemplateAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_bom_template")
    .insert([{
      project_name: payload?.projectName || "",
      project_description: payload?.projectDescription || null,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create BOM template: ${error.message}`);
  return data;
}

// ─── SAVE LINE ITEMS ────────────────────────────────────────

export async function saveBomLineItemsAction(bomTempId, payload) {
  const supabase = getSupabaseAdmin();
  const { created = [], updated = [], deleted = [] } = payload || {};

  // PHASE 1: DELETE — rows marked for removal that exist in DB
  for (const row of deleted) {
    if (!row.id || String(row.id).startsWith("tmp-")) continue;
    const { error } = await supabase
      .from("inv_s_bom_details_template")
      .delete()
      .eq("bom_detial_id", row.id);
    if (error) throw new Error(`Failed to delete BOM detail ${row.id}: ${error.message}`);
  }

  // PHASE 2: CREATE — rows with temp IDs
  for (const row of created) {
    const itemId = await resolveItemIdBySku(supabase, row.sku);
    if (itemId == null) {
      console.warn(`[saveBomLineItemsAction] SKU "${row.sku}" not found — skipping.`);
      continue;
    }
    const { error } = await supabase
      .from("inv_s_bom_details_template")
      .insert([{
        bom_temp_id: bomTempId,
        item_id: itemId,
        required_qty: Number(row.requiredQty) || 1,
        uom_id: row.uomId || null,
      }]);
    if (error) throw new Error(`Failed to create BOM detail: ${error.message}`);
  }

  // PHASE 3: UPDATE — existing rows with changed fields
  for (const row of updated) {
    if (!row.id || String(row.id).startsWith("tmp-")) continue;
    const itemId = await resolveItemIdBySku(supabase, row.sku);
    const patch = {};
    if (itemId != null) patch.item_id = itemId;
    if (row.requiredQty !== undefined) patch.required_qty = Number(row.requiredQty) || 1;
    if (row.uomId !== undefined) patch.uom_id = row.uomId || null;

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("inv_s_bom_details_template")
      .update(patch)
      .eq("bom_detial_id", row.id);
    if (error) throw new Error(`Failed to update BOM detail ${row.id}: ${error.message}`);
  }

  // Return fresh data so the client can reset baseline
  const { data, error } = await supabase
    .from("inv_s_bom_details_template")
    .select("*, inv_s_inventoryitem(sku, name), inv_s_unit(unit_id, name, abbreviation)")
    .eq("bom_temp_id", bomTempId)
    .order("bom_detial_id", { ascending: true });

  if (error) throw new Error(`Failed to reload BOM details: ${error.message}`);
  return data ?? [];
}

async function resolveItemIdBySku(supabase, sku) {
  if (!sku) return null;
  const { data, error } = await supabase
    .from("inv_s_inventoryitem")
    .select("item_id")
    .eq("sku", sku)
    .maybeSingle();
  if (error || !data) return null;
  return data.item_id;
}

//#endregion

//#region ─── BOM TEMPLATE DETAILS ─────────────────────────────────

export async function loadBomTemplateDetailsAction(bomTempId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_bom_details_template")
    .select("*, inv_s_inventoryitem(sku, name), inv_s_unit(unit_id, name, abbreviation)")
    .eq("bom_temp_id", bomTempId)
    .order("bom_detial_id", { ascending: true });

  if (error) throw new Error(`Failed to load BOM template details: ${error.message}`);
  return (data ?? []).map((d) => ({
    ...d,
    uomId: d.uom_id || null,
    uomName: d.inv_s_unit?.name || "",
    uomAbbreviation: d.inv_s_unit?.abbreviation || "",
  }));
}

//#endregion

//#region ─── STATUS LOOKUP ─────────────────────────────────────────

/**
 * Global helper (server-only).
 * Returns the ID for a status in `inv_s_status` by name.
 * Name matching is case-insensitive.
 *
 * Table definition:
 *   create table public.inv_s_status (
 *     id bigint generated by default as identity not null,
 *     created_at timestamp with time zone not null default now(),
 *     name text null,
 *     description text null,
 *     color text null,
 *     constraint inv_s_status_pkey primary key (id)
 *   ) TABLESPACE pg_default;
 */
export async function resolveStatusIdByName(name) {
  const statusName = String(name || "").trim();
  if (!statusName) return null;

  const supabase = getSupabaseAdmin();

  // 1. Try exact case-insensitive match first.
  const { data: exact, error: exactError } = await supabase
    .from("inv_s_status")
    .select("id")
    .ilike("name", statusName)
    .maybeSingle();

  if (exactError) throw new Error(`Failed to resolve status: ${exactError.message}`);
  if (exact?.id != null) return exact.id;

  // 2. Fall back to a contains match (e.g. "Pending Approval" matches "Pending Approvaled").
  const { data: contains, error: containsError } = await supabase
    .from("inv_s_status")
    .select("id")
    .ilike("name", `%${statusName}%`)
    .limit(1)
    .maybeSingle();

  if (containsError) throw new Error(`Failed to resolve status: ${containsError.message}`);
  if (contains?.id != null) return contains.id;

  // 3. Log a warning so mismatches are easy to spot.
  console.warn(`[resolveStatusIdByName] No status found matching "${statusName}" in inv_s_status.`);
  return null;
}

//#endregion

//#region ─── PURCHASE REQUESTS ─────────────────────────────────────

/**
 * Resolve a default category id for new materials.
 * Prefers a "Material" category (by key or name); otherwise falls back to the first category.
 * Throws a clear error if no category exists in master data.
 */
async function resolveDefaultCategoryId(supabase) {
  const { data, error } = await supabase
    .from("inv_s_category")
    .select("category_id, key, name")
    .order("category_id", { ascending: true })
    .limit(50);

  if (error) throw new Error(`Failed to resolve default category: ${error.message}`);
  const categories = data ?? [];
  const material = categories.find(
    (c) => String(c.key || "").toLowerCase() === "material" || String(c.name || "").toLowerCase() === "material"
  );
  const chosen = material || categories[0];
  if (!chosen?.category_id) {
    throw new Error("No category found in master data. Please create a category before adding new materials.");
  }
  return chosen.category_id;
}

/**
 * Resolve a default warehouse id for new materials.
 * Returns the first warehouse in master data; throws a clear error if none exist.
 */
async function resolveDefaultWarehouseId(supabase) {
  const { data, error } = await supabase
    .from("inv_s_warehouse")
    .select("warehouse_id, name")
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve default warehouse: ${error.message}`);
  if (data?.warehouse_id == null) {
    throw new Error("No warehouse found in master data. Please create a warehouse before adding new materials.");
  }
  return data.warehouse_id;
}

/**
 * Resolve a PR line item to a real item_id.
 * If the line is a quick-added new material (isNewItem), it is first inserted
 * into the inventory master table (inv_s_inventoryitem) and the new item_id
 * is returned. Otherwise the existing itemId is returned as-is.
 */
async function resolvePrLineItemId(supabase, lineItem) {
  if (!lineItem?.isNewItem) {
    return lineItem?.itemId || null;
  }

  const name = (lineItem?.newItemName || "").trim();
  if (!name) return null;

  const sku = (lineItem?.newItemSku || "").trim() || `NEW-${Date.now()}`;
  const unitId = lineItem?.unitId ? Number(lineItem.unitId) : null;
  const categoryId = lineItem?.categoryId ? Number(lineItem.categoryId) : await resolveDefaultCategoryId(supabase);
  const warehouseId = lineItem?.warehouseId ? Number(lineItem.warehouseId) : await resolveDefaultWarehouseId(supabase);

  // Insert into master data
  const { data, error } = await supabase
    .from("inv_s_inventoryitem")
    .insert([{
      name,
      description: name,
      sku,
      unit_id: unitId,
      category_id: categoryId,
      warehouse_id: warehouseId,
      classification: "Material",
      is_active: true,
    }])
    .select("item_id")
    .single();

  if (error) {
    // Duplicate SKU is the most likely failure — surface a readable message.
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("sku")) {
      throw new Error(`New material "${name}" could not be added: SKU "${sku}" already exists in master data.`);
    }
    throw new Error(`Failed to create new material "${name}": ${error.message}`);
  }

  if (!data?.item_id) {
    throw new Error(`Failed to create new material "${name}": no item_id returned.`);
  }

  return data.item_id;
}

export async function createPurchaseRequestAction(payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID from inv_s_status.
  // - Saving as draft → "Saved" (falls back to "Pending Approval" if not found).
  // - Submitting → "Pending Approval".
  let statusId = payload?.statusId || null;
  if (payload?.isDraft && !statusId) {
    statusId = (await resolveStatusIdByName("Saved")) ?? (await resolveStatusIdByName("Pending Approval"));
  } else if (!payload?.isDraft && !statusId) {
    statusId = await resolveStatusIdByName("Pending Approval");
  }
  
  // 1. Insert header
  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaserequest")
    .insert([{
      pr_no: payload?.prNo || null,
      pr_date: payload?.prDate || null,
      requestor_id: payload?.requestorId || null,
      dept_id: payload?.deptId || null,
      date_required: payload?.dateRequired || null,
      priority: payload?.priority || null,
      remarks: payload?.remarks || null,
      status_id: statusId,
    }])
    .select("*")
    .single();

  if (headerError) throw new Error(`Failed to create purchase request: ${headerError.message}`);
  if (!header) throw new Error("Failed to create purchase request: no data returned.");

  const prId = header.pr_id;
  const items = (payload?.items || []).filter((i) => i.itemId || (i.isNewItem && i.newItemName));

  // 2. Insert line items (if any)
  if (items.length > 0) {
    const lineRows = [];
    for (const i of items) {
      const itemId = await resolvePrLineItemId(supabase, i);
      lineRows.push({
        pr_id: prId,
        item_id: itemId,
        quantity: Number(i.quantity) || 0,
        uom_id: i.unitId || null,
        est_unit_cost: i.estUnitCost ? Number(i.estUnitCost) : null,
        est_total_cost: (Number(i.quantity) || 0) * (i.estUnitCost ? Number(i.estUnitCost) : 0),
      });
    }

    const { error: itemsError } = await supabase
      .from("inv_t_purchaserequest_items")
      .insert(lineRows);

    if (itemsError) {
      // Rollback header on line item failure
      await supabase.from("inv_t_purchaserequest").delete().eq("pr_id", prId);
      throw new Error(`Failed to create purchase request items: ${itemsError.message}`);
    }
  }

  return header;
}

export async function updatePurchaseRequestAction(prId, payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID. Prefer an explicit statusId from the payload; otherwise
  // fall back to a status name lookup so a mismatch in inv_s_status never
  // leaves status_id as null.
  let statusId = payload?.statusId || null;

  if(payload?.isDraft) {    
   statusId = (await resolveStatusIdByName("Saved "))
  }else
  {
   statusId = (await resolveStatusIdByName("Pending Approval"))
  }
  
  // 1. Update header
  const patch = {};   
  if (payload?.prNo !== undefined) patch.pr_no = payload.prNo;
  if (payload?.prDate !== undefined) patch.pr_date = payload.prDate;
  if (payload?.requestorId !== undefined) patch.requestor_id = payload.requestorId;
  if (payload?.deptId !== undefined) patch.dept_id = payload.deptId;
  if (payload?.dateRequired !== undefined) patch.date_required = payload.dateRequired;
  if (payload?.priority !== undefined) patch.priority = payload.priority;
  if (payload?.remarks !== undefined) patch.remarks = payload.remarks;
  patch.status_id = 1;
  patch.updated_at = new Date().toISOString();

  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaserequest")
    .update(patch)
    .eq("pr_id", prId)
    .select("*")
    .single();

  if (headerError) throw new Error(`Failed to insert purchase request: ${headerError.message}`);
  if (!header) throw new Error("Failed to update purchase request: no data returned.");

  const items = (payload?.items || []).filter((i) => i.itemId || (i.isNewItem && i.newItemName));

  // 2. Replace line items: delete existing, then insert new set.
  const { error: deleteError } = await supabase
    .from("inv_t_purchaserequest_items")
    .delete()
    .eq("pr_id", prId);

  if (deleteError) throw new Error(`Failed to update purchase request items: ${deleteError.message}`);

  if (items.length > 0) {
    const lineRows = [];
    for (const i of items) {
      const itemId = await resolvePrLineItemId(supabase, i);
      lineRows.push({
        pr_id: prId,
        item_id: itemId,
        quantity: Number(i.quantity) || 0,
        uom_id: i.unitId || null,
        est_unit_cost: i.estUnitCost ? Number(i.estUnitCost) : null,
        est_total_cost: (Number(i.quantity) || 0) * (i.estUnitCost ? Number(i.estUnitCost) : 0),
      });
    }

    const { error: itemsError } = await supabase
      .from("inv_t_purchaserequest_items")
      .insert(lineRows);

    if (itemsError) throw new Error(`Failed to update purchase request items: ${itemsError.message}`);
  }

  return header;
}

export async function recallPurchaseRequestAction(prId) {
  const supabase = getSupabaseAdmin();
  const statusId = await resolveStatusIdByName("Recalled");

  const { error } = await supabase
    .from("inv_t_purchaserequest")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("pr_id", prId);

  if (error) throw new Error(`Failed to recall purchase request: ${error.message}`);
}

//#endregion

//#region ─── PURCHASE ORDERS ───────────────────────────────────────

export async function createPurchaseOrderAction(payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID from inv_s_status.
  // - Saving as draft → "Saved" (falls back to "Pending Approval" if not found).
  // - Submitting → "Pending Approval".
  let statusId = payload?.statusId || null;
  if (payload?.isDraft && !statusId) {
    statusId = (await resolveStatusIdByName("Saved")) ?? (await resolveStatusIdByName("Pending Approval"));
  } else if (!payload?.isDraft && !statusId) {
    statusId = await resolveStatusIdByName("Pending Approval");
  }

  // 1. Insert header
  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaseorder")
    .insert([{
      po_no: payload?.poNo || null,
      supplier_id: payload?.supplierId || null,
      status_id: statusId,
      est_total_cost: payload?.estTotalCost || 0,
      remarks: payload?.remarks || null,
      pr_id: payload?.prId || null,
      delivery_location: payload?.deliveryLocation || null,
      created_at: payload?.poDate || null,
    }])
    .select("*")
    .single();

  if (headerError) throw new Error(`Failed to create purchase order: ${headerError.message}`);
  if (!header) throw new Error("Failed to create purchase order: no data returned.");

  const poId = header.po_id;
  const items = (payload?.items || []).filter((i) => i.itemId);

  // 2. Insert line items (if any)
  if (items.length > 0) {
    const lineRows = items.map((i) => ({
      po_id: poId,
      item_id: i.itemId || null,
      uom_id: i.unitId || null,
      quantity: Number(i.quantity) || 0,
      est_unit_cost: i.unitPrice ? Number(i.unitPrice) : null,
      est_total_cost: (Number(i.quantity) || 0) * (i.unitPrice ? Number(i.unitPrice) : 0),
    }));

    const { error: itemsError } = await supabase
      .from("inv_t_purchasorder_items")
      .insert(lineRows);

    if (itemsError) {
      // Rollback header on line item failure
      await supabase.from("inv_t_purchaseorder").delete().eq("po_id", poId);
      throw new Error(`Failed to create purchase order items: ${itemsError.message}`);
    }
  }

  return header;
}

export async function updatePurchaseOrderAction(poId, payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID. Prefer an explicit statusId from the payload; otherwise
  // fall back to a status name lookup so a mismatch in inv_s_status never
  // leaves status_id as null.
  let statusId = payload?.statusId || null;

  if (payload?.isDraft) {
    statusId = (await resolveStatusIdByName("Saved")) ?? (await resolveStatusIdByName("Pending Approval"));
  } else {
    statusId = await resolveStatusIdByName("Pending Approval");
  }

  // 1. Update header
  const patch = {};
  if (payload?.poNo !== undefined) patch.po_no = payload.poNo;
  if (payload?.supplierId !== undefined) patch.supplier_id = payload.supplierId;
  if (payload?.estTotalCost !== undefined) patch.est_total_cost = payload.estTotalCost;
  if (payload?.remarks !== undefined) patch.remarks = payload.remarks;
  if (payload?.prId !== undefined) patch.pr_id = payload.prId;
  if (payload?.deliveryLocation !== undefined) patch.delivery_location = payload.deliveryLocation;
  patch.status_id = statusId;
  patch.updated_at = new Date().toISOString();

  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaseorder")
    .update(patch)
    .eq("po_id", poId)
    .select("*")
    .single();

  if (headerError) throw new Error(`Failed to update purchase order: ${headerError.message}`);
  if (!header) throw new Error("Failed to update purchase order: no data returned.");

  const items = (payload?.items || []).filter((i) => i.itemId);

  // 2. Replace line items: delete existing, then insert new set.
  const { error: deleteError } = await supabase
    .from("inv_t_purchasorder_items")
    .delete()
    .eq("po_id", poId);

  if (deleteError) throw new Error(`Failed to update purchase order items: ${deleteError.message}`);

  if (items.length > 0) {
    const lineRows = items.map((i) => ({
      po_id: poId,
      item_id: i.itemId || null,
      uom_id: i.unitId || null,
      quantity: Number(i.quantity) || 0,
      est_unit_cost: i.unitPrice ? Number(i.unitPrice) : null,
      est_total_cost: (Number(i.quantity) || 0) * (i.unitPrice ? Number(i.unitPrice) : 0),
    }));

    const { error: itemsError } = await supabase
      .from("inv_t_purchasorder_items")
      .insert(lineRows);

    if (itemsError) throw new Error(`Failed to update purchase order items: ${itemsError.message}`);
  }

  return header;
}

export async function recallPurchaseOrderAction(poId) {
  const supabase = getSupabaseAdmin();
  const statusId = await resolveStatusIdByName("Recalled");

  const { error } = await supabase
    .from("inv_t_purchaseorder")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("po_id", poId);

  if (error) throw new Error(`Failed to recall purchase order: ${error.message}`);
}

//#endregion

//#region ─── PENDING PR APPROVALS ─────────────────────────────────

/**
 * Load purchase requests that currently have a pending stage instance in the
 * workflow engine.  A stage is considered pending when its wfk_t_stageinstance
 * status_id matches the "Pending" / "Pending Approval" status (and acted_at
 * is null).
 *
 * Returns an array of approval rows enriched with PR header, requester and
 * department names, line items, current stage info, and estimated totals.
 */
export async function loadPendingPrApprovalsAction() {
  const supabase = getSupabaseAdmin();

  // 1. Resolve the pending status ID for a stage instance.
  const pendingStatusId = await resolveStatusIdByName("Pending Approval") ?? (await resolveStatusIdByName("Pending"));

  // 2. Fetch pending stage instances.  If the workflow tables are missing or
  //    the query fails for any reason, recover gracefully and return [].
  let stages = [];
  try {
    const { data, error } = await supabase
      .from("wfk_t_stageinstance")
      .select("stageinstance_id, instance_id, wfs_id, status_id, created_at, acted_at, acted_by, comments")
      .is("acted_at", null)
      .eq("status_id", pendingStatusId);

    if (error) {
      console.warn("[loadPendingPrApprovalsAction] Stage query failed:", error.message);
      return { approvals: [], error: null };
    }
    stages = data ?? [];
  } catch (err) {
    console.warn("[loadPendingPrApprovalsAction] Stage query threw:", err.message);
    return { approvals: [], error: null };
  }

  if (!stages.length) {
    return { approvals: [], error: null };
  }

  // 3. Fetch the workflow instances for those stages to get document_id (pr_id).
  const instanceIds = stages.map((s) => s.instance_id).filter(Boolean);
  let instances = [];
  try {
    const { data, error } = await supabase
      .from("wfk_t_workflowinstance")
      .select("instance_id, document_id, app_id, wf_id, status_id, started_at, created_by")
      .in("instance_id", instanceIds);

    if (error) {
      console.warn("[loadPendingPrApprovalsAction] Workflow instance query failed:", error.message);
      return { approvals: [], error: null };
    }
    instances = data ?? [];
  } catch (err) {
    console.warn("[loadPendingPrApprovalsAction] Workflow instance query threw:", err.message);
    return { approvals: [], error: null };
  }

  const instanceById = Object.fromEntries(instances.map((i) => [String(i.instance_id), i]));
  const prIds = instances
    .map((i) => i.document_id)
    .filter(Boolean)
    .map((id) => Number(id));

  if (!prIds.length) {
    return { approvals: [], error: null };
  }

  // 4. Fetch PR headers and line items for the linked documents.
  let prHeaders = [];
  let prItems = [];
  try {
    const [headersRes, itemsRes] = await Promise.all([
      supabase.from("inv_t_purchaserequest").select("*").in("pr_id", prIds),
      supabase.from("inv_t_purchaserequest_items").select("*").in("pr_id", prIds),
    ]);

    if (headersRes.error) console.warn("[loadPendingPrApprovalsAction] PR headers query failed:", headersRes.error.message);
    if (itemsRes.error) console.warn("[loadPendingPrApprovalsAction] PR items query failed:", itemsRes.error.message);

    prHeaders = headersRes.data ?? [];
    prItems = itemsRes.data ?? [];
  } catch (err) {
    console.warn("[loadPendingPrApprovalsAction] PR query threw:", err.message);
    return { approvals: [], error: null };
  }

  const prById = Object.fromEntries(prHeaders.map((pr) => [String(pr.pr_id), pr]));
  const itemsByPrId = {};
  for (const item of prItems) {
    const prId = String(item.pr_id);
    if (!itemsByPrId[prId]) itemsByPrId[prId] = [];
    itemsByPrId[prId].push(item);
  }

  // 5. Fetch supporting reference data for display enrichment.
  const [usersRes, deptsRes, itemsRes] = await Promise.all([
    safeQuery(() => supabase.from("psb_s_user").select("user_id, first_name, last_name, email")),
    safeQuery(() => supabase.from("psb_s_department").select("dept_id, dept_name")),
    safeQuery(() => supabase.from("inv_s_inventoryitem").select("item_id, name, sku")),
  ]);

  const users = (usersRes ?? []).map((r) => ({ ...r, id: r.user_id }));
  const depts = (deptsRes ?? []).map((r) => ({ ...r, id: r.dept_id }));
  const items = (itemsRes ?? []).map((r) => ({ ...r, id: r.item_id }));

  const userById = Object.fromEntries(users.map((u) => [String(u.id), u]));
  const deptById = Object.fromEntries(depts.map((d) => [String(d.id), d]));
  const itemById = Object.fromEntries(items.map((i) => [String(i.id), i]));

  // 6. Build enriched approval rows.
  const approvals = [];
  for (const stage of stages) {
    const instance = instanceById[String(stage.instance_id)];
    if (!instance) continue;

    const pr = prById[String(instance.document_id)];
    if (!pr) continue;

    const requester = userById[String(pr.requestor_id)];
    const department = deptById[String(pr.dept_id)];
    const lineItems = (itemsByPrId[String(pr.pr_id)] || []).map((li) => {
      const item = itemById[String(li.item_id)];
      return {
        ...li,
        itemName: item?.name || li.item_name || "Unknown",
        itemSku: item?.sku || li.item_sku || "",
      };
    });

    const totalAmount = lineItems.reduce((sum, li) => sum + (Number(li.est_total_cost) || 0), 0);

    approvals.push({
      stageinstanceId: stage.stageinstance_id,
      instanceId: stage.instance_id,
      documentId: instance.document_id,
      prId: pr.pr_id,
      prNo: pr.pr_no || pr.pr_id,
      prDate: pr.pr_date,
      priority: pr.priority,
      remarks: pr.remarks,
      requestorId: pr.requestor_id,
      deptId: pr.dept_id,
      createdAt: pr.created_at,
      requesterName: requester ? `${requester.first_name} ${requester.last_name}`.trim() : pr.requestor_id,
      departmentName: department?.dept_name || pr.dept_id,
      stageCreatedAt: stage.created_at,
      lineItems,
      totalAmount,
    });
  }

  return { approvals, error: null };
}

/**
 * Record an approval or rejection against a workflow stage instance.
 * Updates wfk_t_stageinstance with the acting user, timestamp, comments and
 * a new status_id derived from the supplied status name.
 */
export async function actOnPurchaseRequestApprovalAction({
  stageinstanceId,
  decision, // "approve" | "reject"
  comments = "",
  actorUserId,
  statusName,
}) {
  const supabase = getSupabaseAdmin();

  if (!stageinstanceId) throw new Error("Stage instance ID is required.");
  if (!["approve", "reject"].includes(decision)) throw new Error("Decision must be 'approve' or 'reject'.");

  const resolvedStatusName = decision === "approve" ? statusName || "Approved" : statusName || "Rejected";
  const statusId = await resolveStatusIdByName(resolvedStatusName);

  const { error } = await supabase
    .from("wfk_t_stageinstance")
    .update({
      acted_at: new Date().toISOString(),
      acted_by: actorUserId || null,
      comments: comments || null,
      status_id: statusId,
      updated_at: new Date().toISOString(),
    })
    .eq("stageinstance_id", stageinstanceId);

  if (error) throw new Error(`Failed to ${decision} approval: ${error.message}`);
}

//#endregion

//#region ─── PROJECT BOM ────────────────────────────────────────────

export async function saveProjectBomAction(payload) {
  const supabase = getSupabaseAdmin();

  // 1. Insert BOM header into inv_t_bom
  const { data: bom, error: bomError } = await supabase
    .from("inv_t_bom")
    .insert([{
      project_id: payload?.projectId || null,
      bom_no: payload?.bomNo || null,
      status_Id: payload?.statusId || null,
      remarks: payload?.remarks || null,
      created_by: payload?.createdBy || null,
      bom_temp_id: payload?.bomTempId || null,
      bomt_spec: payload?.bomtSpec || null,
    }])
    .select()
    .single();

  if (bomError) throw new Error(`Failed to save BOM: ${bomError.message}`);
  if (!bom) throw new Error("Failed to save BOM: no data returned.");

  const bomId = bom.bom_id;

  // 2. Insert BOM line items into inv_t_bom_details
  const lineItems = (payload?.lineItems || []).filter((li) => li.itemId);
  if (lineItems.length > 0) {
    const detailRows = lineItems.map((li) => ({
      bom_id: bomId,
      item_id: li.itemId,
      quantity: Number(li.quantity) || 0,
      uom_id: li.uomId || null,
      remarks: li.remarks || null,
    }));

    const { error: detailsError } = await supabase
      .from("inv_t_bom_details")
      .insert(detailRows);

    if (detailsError) {
      // Rollback header on line item failure
      await supabase.from("inv_t_bom").delete().eq("bom_id", bomId);
      throw new Error(`Failed to save BOM line items: ${detailsError.message}`);
    }
  }

  return bom;
}

export async function loadProjectBomByIdAction(bomId) {
  const supabase = getSupabaseAdmin();

  // 1. Fetch BOM header with joined project info
  const { data: bom, error: bomError } = await supabase
    .from("inv_t_bom")
    .select("*, proj_t_projects(client_name, formatted_address, city, state_code, address_line_1, state, postal_code, country, dealer, invoice_number, order_received_at)")
    .eq("bom_id", bomId)
    .single();

  if (bomError) throw new Error(`Failed to load BOM: ${bomError.message}`);
  if (!bom) throw new Error("BOM not found.");

  // 2. Fetch line items with joined item and unit info
  let details = [];
  try {
    const { data: detailsData, error: detailsError } = await supabase
      .from("inv_t_bom_details")
      .select("*, inv_s_inventoryitem(sku, name, cost), inv_s_unit(unit_id, name, abbreviation)")
      .eq("bom_id", bomId)
      .order("bom_details_id", { ascending: true });

    if (!detailsError && detailsData) {
      details = detailsData;
    } else if (detailsError) {
      console.warn("[loadProjectBomByIdAction] Details query failed, returning BOM without line items:", detailsError.message);
    }
  } catch (err) {
    console.warn("[loadProjectBomByIdAction] Details query threw, returning BOM without line items:", err);
  }

  return {
    id: bom.bom_id,
    bomNo: bom.bom_no || "—",
    projectId: bom.project_id,
    projectName: bom.proj_t_projects?.client_name || "—",
    spec: bom.proj_t_projects?.formatted_address || "—",
    statusId: bom.status_Id,
    statusName: "Draft",
    remarks: bom.remarks || "",
    createdBy: bom.created_by,
    createdAt: bom.created_at,
    bomTempId: bom.bom_temp_id || null,
    bomtSpec: bom.bomt_spec || null,
    customer: bom.proj_t_projects ? {
      clientName: bom.proj_t_projects.client_name,
      formattedAddress: bom.proj_t_projects.formatted_address,
      city: bom.proj_t_projects.city,
      stateCode: bom.proj_t_projects.state_code,
      addressLine1: bom.proj_t_projects.address_line_1,
      state: bom.proj_t_projects.state,
      postalCode: bom.proj_t_projects.postal_code,
      country: bom.proj_t_projects.country,
      dealer: bom.proj_t_projects.dealer,
      invoiceNumber: bom.proj_t_projects.invoice_number,
      orderReceivedAt: bom.proj_t_projects.order_received_at,
    } : null,
    lineItems: details.map((d) => ({
      id: d.bom_details_id,
      itemId: d.item_id,
      sku: d.inv_s_inventoryitem?.sku || "",
      name: d.inv_s_inventoryitem?.name || "",
      cost: d.inv_s_inventoryitem?.cost || 0,
      quantity: Number(d.quantity) || 0,
      uomId: d.uom_id || null,
      uomName: d.inv_s_unit?.name || "",
      uomAbbreviation: d.inv_s_unit?.abbreviation || "",
      remarks: d.remarks || "",
    })),
  };
}

export async function updateProjectBomAction(bomId, payload) {
  const supabase = getSupabaseAdmin();

  // 1. Update BOM header
  const patch = {};
  if (payload?.bomNo !== undefined) patch.bom_no = payload.bomNo;
  if (payload?.projectId !== undefined) patch.project_id = payload.projectId;
  if (payload?.statusId !== undefined) patch.status_Id = payload.statusId;
  if (payload?.remarks !== undefined) patch.remarks = payload.remarks;
  if (payload?.bomTempId !== undefined) patch.bom_temp_id = payload.bomTempId;
  if (payload?.bomtSpec !== undefined) patch.bomt_spec = payload.bomtSpec;

  if (Object.keys(patch).length > 0) {
    const { error: headerError } = await supabase
      .from("inv_t_bom")
      .update(patch)
      .eq("bom_id", bomId);

    if (headerError) throw new Error(`Failed to update BOM: ${headerError.message}`);
  }

  // 2. Replace line items if provided
  if (payload?.lineItems !== undefined) {
    // Delete existing
    const { error: deleteError } = await supabase
      .from("inv_t_bom_details")
      .delete()
      .eq("bom_id", bomId);

    if (deleteError) throw new Error(`Failed to clear BOM details: ${deleteError.message}`);

    // Insert new set
    const items = (payload.lineItems || []).filter((li) => li.itemId);
    if (items.length > 0) {
      const detailRows = items.map((li) => ({
        bom_id: bomId,
        item_id: li.itemId,
        quantity: Number(li.quantity) || 0,
        uom_id: li.uomId || null,
        remarks: li.remarks || null,
      }));

      const { error: insertError } = await supabase
        .from("inv_t_bom_details")
        .insert(detailRows);

      if (insertError) throw new Error(`Failed to save BOM line items: ${insertError.message}`);
    }
  }

  // Return updated BOM (reload may fail if details table has issues, but data is already saved)
  try {
    return await loadProjectBomByIdAction(bomId);
  } catch (reloadErr) {
    console.warn("[updateProjectBomAction] BOM saved but reload failed:", reloadErr.message);
    // Return a minimal success object so the client doesn't throw
    return { id: bomId, remarks: payload?.remarks || "", lineItems: payload?.lineItems || [] };
  }
}

export async function loadProjectBomDataAction() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inv_t_bom")
    .select("*, proj_t_projects(client_name, formatted_address, city, state_code)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadProjectBomDataAction]", error);
    return [];
  }

  return (data || []).map((r) => ({
    id: r.bom_id,
    bomNo: r.bom_no || "—",
    projectId: r.project_id,
    projectName: r.proj_t_projects?.client_name || "—",
    spec: r.proj_t_projects?.formatted_address || "—",
    statusId: r.status_Id,
    statusName: "Draft",
    remarks: r.remarks || "",
    createdBy: r.created_by,
    createdAt: r.created_at,
    bomTempId: r.bom_temp_id || null,
    bomtSpec: r.bomt_spec || null,
  }));
}

//#region ─── CUSTOMER SEARCH (proj_t_projects) ──────────────────────

export async function searchCustomersAction(query) {
  const supabase = getSupabaseAdmin();
  const trimmed = (query || "").trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("proj_t_projects")
    .select("id, client_name, formatted_address, address_line_1, city, state, state_code, postal_code, country, dealer, order_received_at, scheduled_project_start, install_start, project_subtotal, status_id, invoice_number")
    .ilike("client_name", `%${trimmed}%`)
    .order("client_name", { ascending: true })
    .limit(20);

  if (error) {
    console.error("[searchCustomersAction]", error);
    return [];
  }
  return data ?? [];
}

//#endregion

//#region ─── PO RECEIVING ───────────────────────────────────────────

export async function loadOpenPOsAction() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inv_t_purchaseorder")
    .select("*, inv_s_supplier(name), inv_s_status(name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadOpenPOsAction]", error);
    return [];
  }

  // Filter to open POs (not completed/cancelled/recalled) using actual status name from inv_s_status
  const openPOs = (data || []).filter((po) => {
    const statusName = (po.inv_s_status?.name || "").toLowerCase();
    return statusName !== "completed" && statusName !== "cancelled" && statusName !== "recalled";
  });

  // Fetch line items for each open PO
  const poIds = openPOs.map((po) => po.po_id);
  let allItems = [];
  if (poIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("inv_t_purchasorder_items")
      .select("*, inv_s_inventoryitem(sku, name), inv_s_unit(unit_id, name, abbreviation)")
      .in("po_id", poIds)
      .order("poitem_id", { ascending: true });

    if (!itemsError && items) {
      allItems = items;
    }
  }

  // Get already received quantities from stock levels
  const { data: stockLevels } = await supabase
    .from("inv_t_stockslevels")
    .select("item_id, quantity, po_no")
    .in("po_no", openPOs.map((po) => po.po_no).filter(Boolean));

  const receivedByPoAndItem = {};
  if (stockLevels) {
    for (const sl of stockLevels) {
      if (!sl.po_no) continue;
      const key = `${sl.po_no}_${sl.item_id}`;
      receivedByPoAndItem[key] = (receivedByPoAndItem[key] || 0) + (Number(sl.quantity) || 0);
    }
  }

  return openPOs.map((po) => {
    const poItems = allItems
      .filter((i) => i.po_id === po.po_id)
      .map((i) => {
        const key = `${po.po_no}_${i.item_id}`;
        return {
          id: i.poitem_id,
          itemId: i.item_id,
          sku: i.inv_s_inventoryitem?.sku || "",
          name: i.inv_s_inventoryitem?.name || "",
          orderedQty: Number(i.quantity) || 0,
          uomId: i.uom_id || null,
          uomName: i.inv_s_unit?.name || "",
          uomAbbreviation: i.inv_s_unit?.abbreviation || "",
          unitPrice: i.est_unit_cost || 0,
          receivedQty: receivedByPoAndItem[key] || 0,
        };
      });

    return {
      id: po.po_id,
      poNo: po.po_no || "—",
      supplierId: po.supplier_id,
      supplierName: po.inv_s_supplier?.name || "Unknown",
      status: po.status || po.po_status || "Draft",
      estTotalCost: po.est_total_cost || 0,
      remarks: po.remarks || "",
      createdAt: po.created_at,
      deliveryLocation: po.delivery_location || "",
      lineItems: poItems,
    };
  });
}

export async function receivePOItemsAction(poId, payload) {
  const supabase = getSupabaseAdmin();
  const { items = [], warehouseId, deliveryNo, remarks } = payload || {};

  if (!items.length) throw new Error("No items to receive.");

  // Get PO info for logging
  const { data: po } = await supabase
    .from("inv_t_purchaseorder")
    .select("po_no, supplier_id")
    .eq("po_id", poId)
    .single();

  const poNo = po?.po_no || "";

  for (const item of items) {
    const qty = Number(item.receiveQty) || 0;
    if (qty <= 0) continue;

    // Get item info
    const { data: invItem } = await supabase
      .from("inv_s_inventoryitem")
      .select("name, sku, unit_id")
      .eq("item_id", item.itemId)
      .maybeSingle();

    // Create stock level record
    await createStockLevelAction({
      itemId: item.itemId,
      warehouseId: warehouseId || null,
      quantity: qty,
      unitId: invItem?.unit_id || item.uomId || null,
      supplierId: po?.supplier_id || null,
      poNo: poNo,
      deliveryNo: deliveryNo || null,
      remarks: remarks || null,
    });

    // Log transaction
    await logTransactionAction({
      type: "Stock In",
      itemId: item.itemId,
      itemName: invItem?.name || item.name || "Unknown",
      sku: invItem?.sku || item.sku || "",
      warehouseId: warehouseId || null,
      detail: `PO Receiving: +${qty} (${poNo})`,
      qtyChange: qty,
    }).catch(() => {});
  }

  // Determine PO status based on total received vs total ordered
  const { data: poItems } = await supabase
    .from("inv_t_purchasorder_items")
    .select("item_id, quantity")
    .eq("po_id", poId);

  const totalOrdered = (poItems || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  const { data: receivedLevels } = await supabase
    .from("inv_t_stockslevels")
    .select("quantity")
    .eq("po_no", poNo);

  const totalReceived = (receivedLevels || []).reduce((sum, sl) => sum + (Number(sl.quantity) || 0), 0);

  const statusName = totalReceived >= totalOrdered ? "Completed" : "Partial";
  const statusId = await resolveStatusIdByName(statusName);

  if (statusId) {
    await supabase
      .from("inv_t_purchaseorder")
      .update({ status_id: statusId })
      .eq("po_id", poId);
  }

  return { success: true, poNo, statusName };
}

//#endregion

//#region ─── BOM ALLOCATION ─────────────────────────────────────────

export async function allocateBomStockAction(bomId, payload) {
  const supabase = getSupabaseAdmin();
  const { warehouseId, lineItems = [] } = payload || {};

  if (!bomId) throw new Error("BOM ID is required for allocation.");
  if (!lineItems.length) throw new Error("No line items to allocate.");

  // Resolve "Allocated" status ID
  const statusId = await resolveStatusIdByName("Allocated");
  if (!statusId) {
    console.warn("[allocateBomStockAction] 'Allocated' status not found in inv_s_status. Allocation will proceed without status_id.");
  }

  for (const li of lineItems) {
    const qty = Number(li.quantity) || 0;
    if (qty <= 0) continue;

    const { error } = await supabase
      .from("inv_t_allocation")
      .insert([{
        bom_id: bomId,
        bom_details_id: li.bomDetailsId || null,
        warehouse_id: warehouseId || null,
        item_id: li.itemId || null,
        quantity: qty,
        status_id: statusId || null,
        created_by: null,
      }]);

    if (error) {
      console.error("[allocateBomStockAction] Failed to insert allocation:", error.message);
      throw new Error(`Failed to allocate item ${li.itemId}: ${error.message}`);
    }

    // Log transaction
    await logTransactionAction({
      type: "Allocation",
      itemId: li.itemId,
      itemName: li.itemName || "",
      sku: li.sku || "",
      warehouseId: warehouseId || null,
      detail: `Allocated ${qty} for BOM ${bomId}`,
      qtyChange: -qty,
    }).catch(() => {});
  }

  return { success: true, allocatedCount: lineItems.length };
}

//#endregion

//#region ─── BOM RELEASE ────────────────────────────────────────────

export async function loadBOMsForReleaseAction() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inv_t_bom")
    .select("*, proj_t_projects(client_name, formatted_address)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadBOMsForReleaseAction]", error);
    return [];
  }

  const boms = data || [];
  const bomIds = boms.map((b) => b.bom_id);

  // Fetch line items for all BOMs
  let allDetails = [];
  if (bomIds.length > 0) {
    const { data: details, error: detailsError } = await supabase
      .from("inv_t_bom_details")
      .select("*, inv_s_inventoryitem(sku, name), inv_s_unit(unit_id, name, abbreviation)")
      .in("bom_id", bomIds)
      .order("bom_details_id", { ascending: true });

    if (!detailsError && details) {
      allDetails = details;
    }
  }

  // Get available stock per item (all stock levels)
  const { data: stockLevels } = await supabase
    .from("inv_t_stockslevels")
    .select("item_id, quantity, remarks");

  const availableByItem = {};
  const releasedByBomAndItem = {}; // key: "bomNo_itemId" → total released qty
  if (stockLevels) {
    for (const sl of stockLevels) {
      availableByItem[sl.item_id] = (availableByItem[sl.item_id] || 0) + (Number(sl.quantity) || 0);
      // Track released quantities (negative stock levels with BOM Release remarks)
      if (sl.remarks && sl.remarks.includes("BOM Release:")) {
        const bomNoFromRemarks = sl.remarks.split("BOM Release: ")[1]?.trim();
        if (bomNoFromRemarks) {
          const key = `${bomNoFromRemarks}_${sl.item_id}`;
          releasedByBomAndItem[key] = (releasedByBomAndItem[key] || 0) + Math.abs(Number(sl.quantity) || 0);
        }
      }
    }
  }

  // Get allocated quantities per item
  const { data: allocations } = await supabase
    .from("inv_t_allocation")
    .select("item_id, quantity");

  const allocatedByItem = {};
  if (allocations) {
    for (const a of allocations) {
      allocatedByItem[a.item_id] = (allocatedByItem[a.item_id] || 0) + (Number(a.quantity) || 0);
    }
  }

  return boms.map((bom) => {
    const bomDetails = allDetails.filter((d) => d.bom_id === bom.bom_id);
    return {
      id: bom.bom_id,
      bomNo: bom.bom_no || "—",
      projectName: bom.proj_t_projects?.client_name || "—",
      spec: bom.proj_t_projects?.formatted_address || bom.bomt_spec || "—",
      createdAt: bom.created_at,
      lineItems: bomDetails.map((d) => {
        const key = `${bom.bom_no}_${d.item_id}`;
        const totalStock = availableByItem[d.item_id] || 0;
        const allocated = allocatedByItem[d.item_id] || 0;
        return {
          id: d.bom_details_id,
          itemId: d.item_id,
          sku: d.inv_s_inventoryitem?.sku || "",
          name: d.inv_s_inventoryitem?.name || "",
          requiredQty: Number(d.quantity) || 0,
          uomId: d.uom_id || null,
          uomName: d.inv_s_unit?.name || "",
          uomAbbreviation: d.inv_s_unit?.abbreviation || "",
          availableQty: Math.max(0, totalStock - allocated),
          releasedQty: releasedByBomAndItem[key] || 0,
        };
      }),
    };
  });
}

export async function releaseBOMItemsAction(bomId, payload) {
  const supabase = getSupabaseAdmin();
  const { items = [], warehouseId, remarks } = payload || {};

  if (!items.length) throw new Error("No items to release.");

  // Get BOM info for logging
  const { data: bom } = await supabase
    .from("inv_t_bom")
    .select("bom_no")
    .eq("bom_id", bomId)
    .single();

  const bomNo = bom?.bom_no || "";

  for (const item of items) {
    const qty = Number(item.releaseQty) || 0;
    if (qty <= 0) continue;

    // Get item info
    const { data: invItem } = await supabase
      .from("inv_s_inventoryitem")
      .select("name, sku, unit_id")
      .eq("item_id", item.itemId)
      .maybeSingle();

    // Create stock level record with negative quantity (stock out)
    await createStockLevelAction({
      itemId: item.itemId,
      warehouseId: warehouseId || null,
      quantity: -qty,
      unitId: invItem?.unit_id || item.uomId || null,
      poNo: null,
      deliveryNo: null,
      remarks: remarks || `BOM Release: ${bomNo}`,
    });

    // Log transaction
    await logTransactionAction({
      type: "Stock Out",
      itemId: item.itemId,
      itemName: invItem?.name || item.name || "Unknown",
      sku: invItem?.sku || item.sku || "",
      warehouseId: warehouseId || null,
      detail: `BOM Release: -${qty} (${bomNo})`,
      qtyChange: -qty,
    }).catch(() => {});

    // Update allocation: deduct released qty from allocated quantity
    if (item.bomDetailsId) {
      const { data: allocation } = await supabase
        .from("inv_t_allocation")
        .select("allocation_id, quantity")
        .eq("bom_details_id", item.bomDetailsId)
        .eq("item_id", item.itemId)
        .maybeSingle();

      if (allocation) {
        const newQty = Math.max(0, (Number(allocation.quantity) || 0) - qty);
        const { data: currentAlloc } = await supabase
          .from("inv_t_allocation")
          .select("released_qty")
          .eq("allocation_id", allocation.allocation_id)
          .maybeSingle();
        const newReleasedQty = (Number(currentAlloc?.released_qty) || 0) + qty;
        await supabase
          .from("inv_t_allocation")
          .update({ quantity: newQty, released_qty: newReleasedQty })
          .eq("allocation_id", allocation.allocation_id);
      }
    }
  }

  return { success: true, bomNo };
}

//#endregion

//#region ─── ALL MATERIALS ──────────────────────────────────────────

export async function loadAllMaterialsAction() {
  const supabase = getSupabaseAdmin();

  // 1. Get all materials
  const { data: items, error: itemsError } = await supabase
    .from("inv_s_inventoryitem")
    .select("*")
    .eq("classification", "Material")
    .order("name", { ascending: true });

  if (itemsError) {
    console.error("[loadAllMaterialsAction]", itemsError);
    return [];
  }

  const materialItems = items || [];
  const itemIds = materialItems.map((i) => i.item_id);

  // 2. Get stock level details per item (with warehouse and supplier)
  const { data: stockLevels } = await supabase
    .from("inv_t_stockslevels")
    .select("*, inv_s_warehouse(name), inv_s_supplier(name), inv_s_unit(unit_id, name, abbreviation)");

  const totalStockByItem = {};
  const stockDetailsByItem = {};
  if (stockLevels) {
    for (const sl of stockLevels) {
      totalStockByItem[sl.item_id] = (totalStockByItem[sl.item_id] || 0) + (Number(sl.quantity) || 0);
      if (!stockDetailsByItem[sl.item_id]) stockDetailsByItem[sl.item_id] = [];
      stockDetailsByItem[sl.item_id].push({
        id: sl.id,
        warehouseName: sl.inv_s_warehouse?.name || "—",
        binLocation: sl.bin_location || "—",
        quantity: Number(sl.quantity) || 0,
        uomName: sl.inv_s_unit?.name || "",
        uomAbbreviation: sl.inv_s_unit?.abbreviation || "",
        poNo: sl.po_no || "—",
        deliveryNo: sl.delivery_no || "—",
        supplierName: sl.inv_s_supplier?.name || "—",
        remarks: sl.remarks || "—",
        createdAt: sl.created_at || null,
      });
    }
  }

  // 3. Get allocated quantities
  const { data: allocations } = await supabase
    .from("inv_t_allocation")
    .select("item_id, quantity");

  const allocatedByItem = {};
  if (allocations) {
    for (const a of allocations) {
      allocatedByItem[a.item_id] = (allocatedByItem[a.item_id] || 0) + (Number(a.quantity) || 0);
    }
  }

  // 4. Get released quantities (negative stock levels from BOM releases)
  const releasedByItem = {};
  if (stockLevels) {
    for (const sl of stockLevels) {
      if (sl.quantity < 0) {
        releasedByItem[sl.item_id] = (releasedByItem[sl.item_id] || 0) + Math.abs(Number(sl.quantity) || 0);
      }
    }
  }

  return materialItems.map((item) => {
    const totalStock = totalStockByItem[item.item_id] || 0;
    const allocated = allocatedByItem[item.item_id] || 0;
    const released = releasedByItem[item.item_id] || 0;
    const available = totalStock - allocated - released;

    return {
      id: item.item_id,
      name: item.name || "",
      sku: item.sku || "",
      description: item.description || "",
      categoryId: item.category_id,
      unitId: item.unit_id,
      cost: item.cost || 0,
      totalStock,
      allocated,
      released,
      available,
      minThreshold: item.min_threshold || 0,
      maxThreshold: item.max_threshold || 0,
      warehouseId: item.warehouse_id,
      isActive: item.is_active,
      stockDetails: stockDetailsByItem[item.item_id] || [],
    };
  });
}

//#endregion

//#region ─── ALLOCATED QUANTITIES ───────────────────────────────────

export async function loadAllocatedQuantitiesAction() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inv_t_allocation")
    .select("item_id, quantity");

  if (error) {
    console.error("[loadAllocatedQuantitiesAction]", error);
    return {};
  }

  const allocatedByItem = {};
  if (data) {
    for (const a of data) {
      allocatedByItem[a.item_id] = (allocatedByItem[a.item_id] || 0) + (Number(a.quantity) || 0);
    }
  }

  return allocatedByItem;
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