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
  const [itemsRes, warehousesRes, transactionsRes, stockLevelsRes, suppliersRes, bomTemplateRes, usersRes, departmentsRes, purchaseRequestsRes, purchaseRequestItemsRes, purchaseOrdersRes, purchaseRequestStatusesRes] = await Promise.all([
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

//#region ─── BOM TEMPLATE DETAILS ─────────────────────────────────

export async function loadBomTemplateDetailsAction(bomTempId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_bom_details_template")
    .select("*, inv_s_inventoryitem(sku, name)")
    .eq("bom_temp_id", bomTempId)
    .order("bom_detial_id", { ascending: true });

  if (error) throw new Error(`Failed to load BOM template details: ${error.message}`);
  return data ?? [];
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

export async function createPurchaseRequestAction(payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID from inv_s_status when saving as draft.
  // Tries "Draft" first, then falls back to "Saved".
  let statusId = payload?.statusId || null;
  if (payload?.isDraft && !statusId) {
    statusId = (await resolveStatusIdByName("Saved")) ?? (await resolveStatusIdByName("Pending Approval"));
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
  const items = (payload?.items || []).filter((i) => i.itemId);

  // 2. Insert line items (if any)
  if (items.length > 0) {
    const lineRows = items.map((i) => ({
      pr_id: prId,
      item_id: i.itemId || null,
      quantity: Number(i.quantity) || 0,
      uom_id: i.unitId || null,
      est_unit_cost: i.estUnitCost ? Number(i.estUnitCost) : null,
      est_total_cost: (Number(i.quantity) || 0) * (i.estUnitCost ? Number(i.estUnitCost) : 0),
    }));

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
  patch.status_id = statusId;
  patch.updated_at = new Date().toISOString();

  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaserequest")
    .update(patch)
    .eq("pr_id", prId)
    .select("*")
    .single();

  if (headerError) throw new Error(`Failed to update purchase request: ${headerError.message}`);
  if (!header) throw new Error("Failed to update purchase request: no data returned.");

  const items = (payload?.items || []).filter((i) => i.itemId);

  // 2. Replace line items: delete existing, then insert new set.
  const { error: deleteError } = await supabase
    .from("inv_t_purchaserequest_items")
    .delete()
    .eq("pr_id", prId);

  if (deleteError) throw new Error(`Failed to update purchase request items: ${deleteError.message}`);

  if (items.length > 0) {
    const lineRows = items.map((i) => ({
      pr_id: prId,
      item_id: i.itemId || null,
      quantity: Number(i.quantity) || 0,
      uom_id: i.unitId || null,
      est_unit_cost: i.estUnitCost ? Number(i.estUnitCost) : null,
      est_total_cost: (Number(i.quantity) || 0) * (i.estUnitCost ? Number(i.estUnitCost) : 0),
    }));

    const { error: itemsError } = await supabase
      .from("inv_t_purchaserequest_items")
      .insert(lineRows);

    if (itemsError) throw new Error(`Failed to update purchase request items: ${itemsError.message}`);
  }

  return header;
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