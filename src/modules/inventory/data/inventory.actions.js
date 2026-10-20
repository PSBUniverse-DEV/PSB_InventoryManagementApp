/**
 * Server Actions — inventory.actions.js
 *
 * Runs on the server. This is the ONLY place you talk to the database.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { getCurrentSession } from "@/core/auth/session.service";
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

//#region ─── WORKFLOW INSTANCE ──────────────────────────────────────

/**
 * Global helper (server-only).
 * Returns the ID for a status in `wfk_s_status` by name (case-insensitive).
 *
 * `wfk_t_workflowinstance.status_id` and `wfk_t_stageinstance.status_id` both
 * reference `wfk_s_status(status_id)`, so workflow-instance status lookups
 * must resolve against this table (NOT `inv_s_status`).
 */
export async function resolveWfStatusIdByName(name) {
  const statusName = String(name || "").trim();
  if (!statusName) return null;

  const supabase = getSupabaseAdmin();

  // 1. Exact case-insensitive match.
  const { data: exact, error: exactError } = await supabase
    .from("wfk_s_status")
    .select("status_id")
    .ilike("status_name", statusName)
    .maybeSingle();

  if (exactError) throw new Error(`Failed to resolve workflow status: ${exactError.message}`);
  if (exact?.status_id != null) return exact.status_id;

  // 2. Fall back to a contains match.
  const { data: contains, error: containsError } = await supabase
    .from("wfk_s_status")
    .select("status_id")
    .ilike("status_name", `%${statusName}%`)
    .limit(1)
    .maybeSingle();

  if (containsError) throw new Error(`Failed to resolve workflow status: ${containsError.message}`);
  if (contains?.status_id != null) return contains.status_id;

  // 3. Log a warning so mismatches are easy to spot.
  console.warn(`[resolveWfStatusIdByName] No status found matching "${statusName}" in wfk_s_status.`);
  return null;
}

/**
 * Resolve the approval workflow details for a purchase request submission
 * from the vw_wfk_workflow_setup view.
 *
 * Finds the active "Purchase Request Approval" workflow (scoped to the
 * inventory module), deduplicates the per-participant rows into an ordered
 * stage list (stage_order ascending) and returns the entry stage plus the
 * "Pending Approval" status from wfk_s_status.
 *
 * Returns null fields (never throws) when the workflow is not configured or
 * the lookup fails, so callers can decide how to handle it.
 */
async function resolvePrApprovalWorkflow(supabase) {
  const empty = { appId: null, wfId: null, firstWfsId: null, statusId: null };

  // 1. "Pending Approval" status from wfk_s_status (FK target of both instance tables).
  let statusId = null;
  try {
    statusId = (await resolveWfStatusIdByName("Pending Approval")) ?? (await resolveWfStatusIdByName("Pending"));
  } catch (err) {
    console.warn("[resolvePrApprovalWorkflow] Workflow status lookup failed:", err.message);
    return empty;
  }

  // 2. Workflow + stage details from the view.  The view emits one row per
  //    stage participant, so dedupe into an ordered unique stage list.
  const cols = "workflow_id, workflow_stage_id, app_id, module_key, stage_order, workflow_is_active, stage_is_active, stageparticipant_is_active";
  let rows = [];
  try {
    const scoped = await supabase
      .from("vw_wfk_workflow_setup")
      .select(cols)
      .eq("wf_name", "Purchase Request Approval")
      .eq("workflow_is_active", true)
      .eq("stage_is_active", true)
      .eq("stageparticipant_is_active", true)
      .eq("module_key", "inventory")
      .order("stage_order", { ascending: true });
    if (scoped.error) throw new Error(scoped.error.message);
    rows = scoped.data ?? [];

    if (!rows.length) {
      // Fall back to an unscoped lookup (module_key may not be set on the workflow).
      const unscoped = await supabase
        .from("vw_wfk_workflow_setup")
        .select(cols)
        .eq("wf_name", "Purchase Request Approval")
        .eq("workflow_is_active", true)
        .eq("stage_is_active", true)
        .eq("stageparticipant_is_active", true)
        .order("stage_order", { ascending: true });
      if (unscoped.error) throw new Error(unscoped.error.message);
      rows = unscoped.data ?? [];
    }
  } catch (err) {
    console.warn("[resolvePrApprovalWorkflow] vw_wfk_workflow_setup lookup failed:", err.message);
    return empty;
  }

  if (!rows.length) {
    console.warn('[resolvePrApprovalWorkflow] No active "Purchase Request Approval" workflow found in vw_wfk_workflow_setup.');
    return empty;
  }

  const firstRow = rows[0];
  const seen = new Set();
  const stageIds = [];
  for (const r of rows) {
    const key = String(r.workflow_stage_id);
    if (!seen.has(key)) {
      seen.add(key);
      stageIds.push(r.workflow_stage_id);
    }
  }

  // 3. app_id comes straight from the view; keep a psb_s_application fallback.
  let appId = firstRow.app_id ?? null;
  if (appId == null) {
    const { data: app } = await supabase
      .from("psb_s_application")
      .select("app_id")
      .eq("module_key", "inventory")
      .eq("is_active", true)
      .maybeSingle();
    appId = app?.app_id ?? null;
  }

  return { appId, wfId: firstRow.workflow_id, firstWfsId: stageIds[0], statusId };
}

/**
 * Create the approval workflow records for a submitted purchase request:
 * one `wfk_t_workflowinstance` row plus one `wfk_t_stageinstance` row for the
 * first (entry) stage of the "Purchase Request Approval" workflow.
 *
 * Throws when the workflow is not configured or an insert fails (fail-fast
 * policy) so callers can roll the submission back.  If the stage-instance
 * insert fails, the just-created workflow instance is removed again so the
 * two tables never diverge.
 *
 * Returns the new workflow instance id.
 */
async function createPurchaseRequestApprovalWorkflow(supabase, { prId, requestorId, resolved }) {
  const wf = resolved ?? (await resolvePrApprovalWorkflow(supabase));
  const { appId, wfId, firstWfsId, statusId } = wf;

  if (!appId || !wfId || !firstWfsId || !statusId) {
    throw new Error('No active "Purchase Request Approval" workflow is configured. Please set it up in Workflow Setup before submitting purchase requests.');
  }

  // 1. Workflow instance — the header of the approval process.
  const { data: instance, error: instanceError } = await supabase
    .from("wfk_t_workflowinstance")
    .insert([{
      app_id: appId,
      wf_id: wfId,
      status_id: statusId,
      current_wfs_id: firstWfsId,
      document_id: prId,
      started_at: new Date().toISOString(),
      created_by: requestorId || null,
    }])
    .select("instance_id")
    .single();

  if (instanceError) throw new Error(`Failed to create workflow instance: ${instanceError.message}`);
  const instanceId = instance?.instance_id;
  if (instanceId == null) throw new Error("Failed to create workflow instance: no instance_id returned.");

  // 2. Pending stage instance for the entry stage.
  const { error: stageError } = await supabase
    .from("wfk_t_stageinstance")
    .insert([{
      instance_id: instanceId,
      wfs_id: firstWfsId,
      status_id: statusId,
      comments: null,
      acted_at: null,
      acted_by: null,
      is_active: true,
    }]);

  if (stageError) {
    // Keep the two tables from diverging: remove the orphaned instance.
    await supabase.from("wfk_t_workflowinstance").delete().eq("instance_id", instanceId);
    throw new Error(`Failed to create workflow stage instance: ${stageError.message}`);
  }

  return instanceId;
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

  // 0. Fail-fast for submissions: resolve the approval workflow BEFORE saving
  //    anything so a missing/incomplete workflow setup never leaves a
  //    submitted PR outside the approval process.
  let workflowData = null;
  if (!payload?.isDraft) {
    workflowData = await resolvePrApprovalWorkflow(supabase);
    const { appId, wfId, firstWfsId, statusId: wfStatusId } = workflowData;
    if (!appId || !wfId || !firstWfsId || !wfStatusId) {
      throw new Error('No active "Purchase Request Approval" workflow is configured. Please set it up in Workflow Setup before submitting purchase requests.');
    }
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

  // 3. Create the approval workflow records for non-draft submissions.
  //    Fail-fast: if the workflow records cannot be created, the whole
  //    submission is rolled back (line items + header) and the error is
  //    surfaced to the caller.
  if (!payload?.isDraft) {
    try {
      await createPurchaseRequestApprovalWorkflow(supabase, {
        prId,
        requestorId: payload?.requestorId || null,
        resolved: workflowData,
      });
    } catch (err) {
      // Rollback the PR so nothing is left half-submitted.
      await supabase.from("inv_t_purchaserequest_items").delete().eq("pr_id", prId);
      await supabase.from("inv_t_purchaserequest").delete().eq("pr_id", prId);
      throw new Error(`Purchase request was not submitted: ${err.message}`);
    }
  }

  return header;
}

export async function updatePurchaseRequestAction(prId, payload) {
  const supabase = getSupabaseAdmin();

  // Resolve status ID from inv_s_status — the same behavior as the create page.
  // - Saving as draft → "Saved" (falls back to "Pending Approval" if not found).
  // - Submitting → "Pending Approval".
  let statusId;
  if (payload?.isDraft) {
    statusId = (await resolveStatusIdByName("Saved")) ?? (await resolveStatusIdByName("Pending Approval"));
  } else {
    statusId = await resolveStatusIdByName("Pending Approval");
  }

  // 0. Fail-fast for submissions: create the approval workflow records BEFORE
  //    touching the PR so a workflow failure never leaves a submitted PR
  //    outside the approval process.  Every submission from the edit page
  //    (including resubmissions after a recall/return) starts a fresh approval
  //    process — the same as a brand-new submission.
  let createdWorkflowInstanceId = null;
  const rollbackWorkflow = async () => {
    if (createdWorkflowInstanceId == null) return;
    await supabase.from("wfk_t_stageinstance").delete().eq("instance_id", createdWorkflowInstanceId);
    await supabase.from("wfk_t_workflowinstance").delete().eq("instance_id", createdWorkflowInstanceId);
    createdWorkflowInstanceId = null;
  };

  if (!payload?.isDraft) {
    const workflowData = await resolvePrApprovalWorkflow(supabase);

    // Supersede any stale workflow records from a previous submission cycle so
    // the approvers' pending queue never shows outdated stages.
    const { data: existing } = await supabase
      .from("wfk_t_workflowinstance")
      .select("instance_id")
      .eq("document_id", prId);

    const existingIds = (existing ?? []).map((r) => r.instance_id).filter((id) => id != null);
    if (existingIds.length > 0) {
      await supabase.from("wfk_t_stageinstance").delete().in("instance_id", existingIds);
      await supabase.from("wfk_t_workflowinstance").delete().in("instance_id", existingIds);
    }

    // Insert a fresh workflow instance + stage instance.
    createdWorkflowInstanceId = await createPurchaseRequestApprovalWorkflow(supabase, {
      prId,
      requestorId: payload?.requestorId || null,
      resolved: workflowData,
    });
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
  // Same status behavior as the create page ("Pending Approval" on submit,
  // "Saved" on draft).  Never blank an existing status if the lookup failed.
  if (statusId != null) {
    patch.status_id = statusId;
  } else if (payload?.statusId != null) {
    patch.status_id = payload.statusId;
  }
  patch.updated_at = new Date().toISOString();

  const { data: header, error: headerError } = await supabase
    .from("inv_t_purchaserequest")
    .update(patch)
    .eq("pr_id", prId)
    .select("*")
    .single();

  if (headerError) {
    await rollbackWorkflow();
    throw new Error(`Failed to insert purchase request: ${headerError.message}`);
  }
  if (!header) {
    await rollbackWorkflow();
    throw new Error("Failed to update purchase request: no data returned.");
  }

  const items = (payload?.items || []).filter((i) => i.itemId || (i.isNewItem && i.newItemName));

  // 2. Replace line items: delete existing, then insert new set.
  const { error: deleteError } = await supabase
    .from("inv_t_purchaserequest_items")
    .delete()
    .eq("pr_id", prId);

  if (deleteError) {
    await rollbackWorkflow();
    throw new Error(`Failed to update purchase request items: ${deleteError.message}`);
  }

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
      await rollbackWorkflow();
      throw new Error(`Failed to update purchase request items: ${itemsError.message}`);
    }
  }

  // 3. Workflow records were already created in step 0 (before the update) —
  //    nothing left to do here for submissions.

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
    statusId = await resolveStatusIdByName("Open");
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
    statusId = await resolveStatusIdByName("Open");
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
  const pendingStatusId = (await resolveWfStatusIdByName("Pending Approval")) ?? (await resolveWfStatusIdByName("Pending"));

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
 * Record an approval or rejection against a workflow stage instance and then
 * advance / restart / finalize the workflow:
 *
 *  - approve: mark the current stage "Approved", then create a fresh pending
 *    stage instance for the next approver (and move the workflow's current
 *    stage pointer).  When the current approver is the LAST stage, the
 *    workflow is finalized ("Approved") and the linked purchase request is
 *    marked "Approved".
 *  - reject: mark the current stage "Rejected", restart the whole workflow at
 *    its first stage (a fresh pending stage instance), and mark the document
 *    "Returned" so the requester knows to rework and resubmit.
 *
 * Returns `{ decision, advanced, completed, restarted }` so callers can show
 * an accurate status message.
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

  // Resolve the acting user when the caller does not supply one, so the
  // approver is always recorded on the stage instance.
  let resolvedActorId = actorUserId || null;
  if (!resolvedActorId) {
    try {
      const session = await getCurrentSession();
      resolvedActorId = session?.userId ?? null;
    } catch (err) {
      console.warn("[actOnPurchaseRequestApprovalAction] Session lookup failed:", err?.message);
    }
  }

  // 1. Load the current stage instance, its workflow instance, and the
  //    workflow's ordered active stages so we can find the next / first stage.
  const { data: stage, error: stageLoadError } = await supabase
    .from("wfk_t_stageinstance")
    .select("stageinstance_id, instance_id, wfs_id, status_id")
    .eq("stageinstance_id", stageinstanceId)
    .maybeSingle();

  if (stageLoadError) throw new Error(`Failed to load stage instance: ${stageLoadError.message}`);
  if (!stage) throw new Error("Stage instance not found.");

  const { data: instance, error: instanceLoadError } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id, wf_id, document_id, current_wfs_id")
    .eq("instance_id", stage.instance_id)
    .maybeSingle();

  if (instanceLoadError) throw new Error(`Failed to load workflow instance: ${instanceLoadError.message}`);
  if (!instance) throw new Error("Workflow instance not found.");

  const orderedStages = await resolveOrderedActiveStages(supabase, instance.wf_id);
  const currentStage = orderedStages.find((s) => String(s.wfs_id) === String(stage.wfs_id));
  const currentOrder = Number(currentStage?.stage_order ?? 0);
  const firstStage = orderedStages[0] ?? null;
  const nextStage = orderedStages.find((s) => Number(s.stage_order) > currentOrder) ?? null;

  // 2. Advance (approve → next) or restart (reject → first) BEFORE recording
  //    the decision, so a failure here leaves the current stage untouched and
  //    the approver can safely retry.
  const originalCurrentWfsId = instance.current_wfs_id ?? null;
  let createdStageId = null;

  const rollbackAdvance = async () => {
    if (createdStageId != null) {
      await supabase.from("wfk_t_stageinstance").delete().eq("stageinstance_id", createdStageId);
    }
    if (originalCurrentWfsId != null) {
      await supabase
        .from("wfk_t_workflowinstance")
        .update({ current_wfs_id: originalCurrentWfsId })
        .eq("instance_id", stage.instance_id);
    }
  };

  try {
    const targetWfsId = decision === "approve" ? (nextStage?.wfs_id ?? null) : (firstStage?.wfs_id ?? null);
    if (targetWfsId != null) {
      createdStageId = await insertPendingStageInstance(supabase, stage.instance_id, targetWfsId);
      await updateWorkflowCurrentStage(supabase, stage.instance_id, targetWfsId);
    }

    // 3. Record the decision on the current stage instance.
    const resolvedStatusName = decision === "approve" ? statusName || "Approved" : statusName || "Rejected";
    const statusId = await resolveWfStatusIdByName(resolvedStatusName);

    const { error: updateError } = await supabase
      .from("wfk_t_stageinstance")
      .update({
        acted_at: new Date().toISOString(),
        acted_by: resolvedActorId,
        comments: comments || null,
        status_id: statusId,
      })
      .eq("stageinstance_id", stageinstanceId);

    if (updateError) throw new Error(`Failed to ${decision} approval: ${updateError.message}`);
    createdStageId = null; // decision recorded — keep the newly created stage.

    // 4. Finalize (last approval) or mark the document as returned for rework.
    if (decision === "approve") {
      if (nextStage == null) {
        const finalWfStatusId = await resolveWfStatusIdByName("Approved");
        await updateWorkflowInstanceStatus(supabase, stage.instance_id, finalWfStatusId ?? statusId);

        const docStatusId = await resolveInventoryStatusId(["Approved"]);
        if (docStatusId != null) {
          await updatePurchaseRequestStatus(supabase, instance.document_id, docStatusId);
        }
        return { decision, advanced: false, completed: true, restarted: false };
      }
      return { decision, advanced: true, completed: false, restarted: false };
    }

    // Reject → document returned to the requester for rework.
    const docStatusId = await resolveInventoryStatusId(["Returned", "Rework", "Rejected"]);
    if (docStatusId != null) {
      await updatePurchaseRequestStatus(supabase, instance.document_id, docStatusId);
    } else {
      console.warn(
        '[actOnPurchaseRequestApprovalAction] No "Returned"/"Rework"/"Rejected" status found in inv_s_status; document status left unchanged.'
      );
    }
    return { decision, advanced: false, completed: false, restarted: true };
  } catch (err) {
    await rollbackAdvance();
    throw err;
  }
}

/**
 * Resolve the active workflow stages for a workflow, ordered by stage_order
 * ascending.  Returns [] (never throws) when the workflow has no active
 * stages or the lookup fails, so approval actions degrade gracefully.
 */
async function resolveOrderedActiveStages(supabase, wfId) {
  if (wfId == null) return [];
  const { data, error } = await supabase
    .from("wfk_s_workflowstages")
    .select("wfs_id, stage_order")
    .eq("wf_id", wfId)
    .eq("is_active", true)
    .order("stage_order", { ascending: true });

  if (error) {
    console.warn("[resolveOrderedActiveStages] Stage lookup failed:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Insert a fresh pending stage instance for a workflow instance.  Returns the
 * new stageinstance_id so callers can clean it up if a later write fails.
 */
async function insertPendingStageInstance(supabase, instanceId, wfsId) {
  const pendingStatusId = (await resolveWfStatusIdByName("Pending Approval")) ?? (await resolveWfStatusIdByName("Pending"));
  if (!pendingStatusId) throw new Error('Unable to resolve "Pending Approval" status for the workflow stage.');

  const { data, error } = await supabase
    .from("wfk_t_stageinstance")
    .insert([{
      instance_id: instanceId,
      wfs_id: wfsId,
      status_id: pendingStatusId,
      comments: null,
      acted_at: null,
      acted_by: null,
      is_active: true,
    }])
    .select("stageinstance_id")
    .single();

  if (error) throw new Error(`Failed to create workflow stage instance: ${error.message}`);
  if (!data?.stageinstance_id) throw new Error("Failed to create workflow stage instance: no stageinstance_id returned.");
  return data.stageinstance_id;
}

/** Update the workflow instance's current stage pointer. */
async function updateWorkflowCurrentStage(supabase, instanceId, wfsId) {
  const { error } = await supabase
    .from("wfk_t_workflowinstance")
    .update({ current_wfs_id: wfsId })
    .eq("instance_id", instanceId);
  if (error) throw new Error(`Failed to update workflow current stage: ${error.message}`);
}

/** Update the workflow instance's status (e.g. final "Approved"). */
async function updateWorkflowInstanceStatus(supabase, instanceId, statusId) {
  const { error } = await supabase
    .from("wfk_t_workflowinstance")
    .update({ status_id: statusId })
    .eq("instance_id", instanceId);
  if (error) throw new Error(`Failed to update workflow instance status: ${error.message}`);
}

/**
 * Resolve an inventory status id from the first available status name in
 * `names`.  Returns null (never throws) when none resolve, so a missing
 * status in inv_s_status degrades gracefully instead of failing the decision.
 */
async function resolveInventoryStatusId(names) {
  for (const name of names) {
    try {
      const id = await resolveStatusIdByName(name);
      if (id != null) return id;
    } catch (err) {
      console.warn(`[resolveInventoryStatusId] Failed to resolve "${name}":`, err?.message);
    }
  }
  return null;
}

/** Update a purchase request's status (final approval / return for rework). */
async function updatePurchaseRequestStatus(supabase, prId, statusId) {
  if (prId == null || statusId == null) return;
  const { error } = await supabase
    .from("inv_t_purchaserequest")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("pr_id", prId);
  if (error) throw new Error(`Failed to update purchase request status: ${error.message}`);
}

//#endregion

//#region ─── MY PENDING APPROVALS ───────────────────────────────────

/**
 * Map a workflow's `wf_name` to the document-type label shown in the
 * consolidated approver queue. Falls back to a generic label so unknown
 * document types still render rather than being dropped.
 */
function documentTypeFromWorkflow(wfName) {
  const name = String(wfName || "").toLowerCase();
  if (name.includes("purchase request")) return "Purchase Request";
  if (name.includes("purchase order")) return "Purchase Order";
  if (name.includes("bom") || name.includes("bill of material")) return "BOM Release";
  return wfName || "Document";
}

/**
 * Load the consolidated queue of documents that are pending the CURRENT
 * user's approval.
 *
 * A stage is pending the current user when its `wfk_t_stageinstance` is still
 * awaiting action (status "Pending Approval"/"Pending", `acted_at` null) AND the
 * stage is assigned to an org role the current user holds. The user's org roles
 * come from `wfk_m_userorgrole` and the stage→role assignment from
 * `wfk_m_stageparticipant`.
 *
 * Rows are shaped for `ApprovalsView`:
 *   { documentType, documentNo, description, requestedBy, department,
 *     dateSubmitted, amount, priority, currentStage }
 *
 * Purchase requests are enriched from `inv_t_purchaserequest` + line items.
 * Other document types (once they flow through the workflow engine) still
 * appear with basic fields. Every lookup degrades gracefully to an empty queue
 * so the page renders even if a workflow table is missing.
 */
export async function loadMyPendingApprovalsAction() {
  const supabase = getSupabaseAdmin();

  // 0. Identify the current user (business user id).
  let currentUserId = null;
  try {
    const session = await getCurrentSession();
    currentUserId = session?.userId ?? null;
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] Session lookup failed:", err?.message);
  }
  if (currentUserId == null) return { documents: [], error: null };

  // 1. Pending status id for a stage instance.
  let pendingStatusId = null;
  try {
    pendingStatusId = (await resolveWfStatusIdByName("Pending Approval")) ?? (await resolveWfStatusIdByName("Pending"));
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] Status lookup failed:", err?.message);
  }
  if (pendingStatusId == null) return { documents: [], error: null };

  // 2. Org roles the current user holds (active only).
  let roleIds = [];
  try {
    const { data, error } = await supabase
      .from("wfk_m_userorgrole")
      .select("role_id")
      .eq("user_id", currentUserId)
      .eq("is_active", true);
    if (error) {
      console.warn("[loadMyPendingApprovalsAction] User org role query failed:", error.message);
      return { documents: [], error: null };
    }
    roleIds = [...new Set((data ?? []).map((r) => r.role_id).filter((id) => id != null))];
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] User org role query threw:", err?.message);
    return { documents: [], error: null };
  }
  if (!roleIds.length) return { documents: [], error: null };

  // 3. Stages the user can act on (active stage participants for those roles).
  let stageIds = [];
  try {
    const { data, error } = await supabase
      .from("wfk_m_stageparticipant")
      .select("wfs_id")
      .in("orgrole_id", roleIds)
      .eq("is_active", true);
    if (error) {
      console.warn("[loadMyPendingApprovalsAction] Stage participant query failed:", error.message);
      return { documents: [], error: null };
    }
    stageIds = [...new Set((data ?? []).map((p) => p.wfs_id).filter((id) => id != null))];
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] Stage participant query threw:", err?.message);
    return { documents: [], error: null };
  }
  if (!stageIds.length) return { documents: [], error: null };

  // 4. Pending stage instances on those stages.
  let stages = [];
  try {
    const { data, error } = await supabase
      .from("wfk_t_stageinstance")
      .select("stageinstance_id, instance_id, wfs_id, status_id, created_at, acted_at")
      .in("wfs_id", stageIds)
      .is("acted_at", null)
      .eq("status_id", pendingStatusId);
    if (error) {
      console.warn("[loadMyPendingApprovalsAction] Stage instance query failed:", error.message);
      return { documents: [], error: null };
    }
    stages = data ?? [];
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] Stage instance query threw:", err?.message);
    return { documents: [], error: null };
  }
  if (!stages.length) return { documents: [], error: null };

  // 5. Workflow instances → document_id / wf_id / created_by.
  const instanceIds = stages.map((s) => s.instance_id).filter(Boolean);
  let instances = [];
  try {
    const { data, error } = await supabase
      .from("wfk_t_workflowinstance")
      .select("instance_id, document_id, app_id, wf_id, status_id, started_at, created_by")
      .in("instance_id", instanceIds);
    if (error) {
      console.warn("[loadMyPendingApprovalsAction] Workflow instance query failed:", error.message);
      return { documents: [], error: null };
    }
    instances = data ?? [];
  } catch (err) {
    console.warn("[loadMyPendingApprovalsAction] Workflow instance query threw:", err?.message);
    return { documents: [], error: null };
  }

  const instanceById = Object.fromEntries(instances.map((i) => [String(i.instance_id), i]));
  const prIds = [...new Set(instances.map((i) => Number(i.document_id)).filter((id) => Number.isFinite(id)))];

  // 6. Reference + document data for enrichment.
  const [stageNamesRes, workflowsRes, usersRes, deptsRes, itemMasterRes, wfStatusRes, prHeadersRes, prItemsRes, historyRes, stageParticipantsRes, userOrgRolesRes] = await Promise.all([
    safeQuery(() => supabase.from("wfk_s_workflowstages").select("wfs_id, stage_name")),
    safeQuery(() => supabase.from("wfk_s_workflow").select("wf_id, wf_name")),
    safeQuery(() => supabase.from("psb_s_user").select("user_id, first_name, last_name, email")),
    safeQuery(() => supabase.from("psb_s_department").select("dept_id, dept_name")),
    safeQuery(() => supabase.from("inv_s_inventoryitem").select("item_id, name, sku")),
    safeQuery(() => supabase.from("wfk_s_status").select("status_id, status_name")),
    prIds.length ? safeQuery(() => supabase.from("inv_t_purchaserequest").select("*").in("pr_id", prIds)) : [],
    prIds.length ? safeQuery(() => supabase.from("inv_t_purchaserequest_items").select("*").in("pr_id", prIds)) : [],
    safeQuery(() => supabase.from("wfk_t_stageinstance")
      .select("stageinstance_id, instance_id, wfs_id, status_id, created_at, acted_at, acted_by, comments")
      .in("instance_id", instanceIds)
      .order("created_at", { ascending: true })
      .order("stageinstance_id", { ascending: true })),
    safeQuery(() => supabase.from("wfk_m_stageparticipant").select("wfs_id, orgrole_id, is_active").eq("is_active", true)),
    safeQuery(() => supabase.from("wfk_m_userorgrole").select("user_id, role_id, is_active").eq("is_active", true)),
  ]);

  const stageNameById = Object.fromEntries(stageNamesRes.map((r) => [String(r.wfs_id), r.stage_name]));
  const wfNameById = Object.fromEntries(workflowsRes.map((r) => [String(r.wf_id), r.wf_name]));
  const userById = Object.fromEntries(usersRes.map((r) => [String(r.user_id), r]));
  const deptById = Object.fromEntries(deptsRes.map((r) => [String(r.dept_id), r]));
  const itemById = Object.fromEntries(itemMasterRes.map((r) => [String(r.item_id), r]));
  const wfStatusById = Object.fromEntries(wfStatusRes.map((r) => [String(r.status_id), r.status_name]));
  const prById = Object.fromEntries(prHeadersRes.map((pr) => [String(pr.pr_id), pr]));

  // Approver resolution: stage → org roles → users → names.
  const roleIdsByStage = {};
  for (const sp of stageParticipantsRes) {
    if (sp?.wfs_id == null || sp?.orgrole_id == null) continue;
    const key = String(sp.wfs_id);
    if (!roleIdsByStage[key]) roleIdsByStage[key] = new Set();
    roleIdsByStage[key].add(String(sp.orgrole_id));
  }
  const userIdsByRole = {};
  for (const uor of userOrgRolesRes) {
    if (uor?.role_id == null || uor?.user_id == null) continue;
    const key = String(uor.role_id);
    if (!userIdsByRole[key]) userIdsByRole[key] = new Set();
    userIdsByRole[key].add(String(uor.user_id));
  }
  const approverNamesForStage = (wfsId) => {
    const roleIds = roleIdsByStage[String(wfsId)] || new Set();
    const userIds = new Set();
    for (const roleId of roleIds) {
      for (const uid of (userIdsByRole[roleId] || new Set())) userIds.add(uid);
    }
    const names = [];
    for (const uid of userIds) {
      const u = userById[String(uid)];
      names.push(u ? `${u.first_name} ${u.last_name}`.trim() : uid);
    }
    return names.filter(Boolean);
  };

  const itemsByPrId = {};
  for (const item of prItemsRes) {
    const key = String(item.pr_id);
    if (!itemsByPrId[key]) itemsByPrId[key] = [];
    const master = itemById[String(item.item_id)];
    itemsByPrId[key].push({
      ...item,
      itemName: master?.name || item.item_name || "Unknown",
      itemSku: master?.sku || item.item_sku || "",
    });
  }

  // Approval history per workflow instance (chronological stage trail).
  const historyByInstanceId = {};
  for (const h of historyRes) {
    const key = String(h.instance_id);
    if (!historyByInstanceId[key]) historyByInstanceId[key] = [];
    const actor = userById[String(h.acted_by)];
    const actorName = actor ? `${actor.first_name} ${actor.last_name}`.trim() : "";
    const assignedNames = approverNamesForStage(h.wfs_id);
    historyByInstanceId[key].push({
      stageinstanceId: h.stageinstance_id,
      stageName: stageNameById[String(h.wfs_id)] || "",
      statusName: wfStatusById[String(h.status_id)] || "",
      actorName: actorName || (h.acted_by ?? ""),
      approverName: h.acted_at ? (actorName || assignedNames.join(", ")) : assignedNames.join(", "),
      actedAt: h.acted_at,
      createdAt: h.created_at,
      comments: h.comments || "",
      isPending: !h.acted_at,
    });
  }

  // 7. Build rows shaped for ApprovalsView.
  const documents = [];
  for (const stage of stages) {
    const instance = instanceById[String(stage.instance_id)];
    if (!instance) continue;

    const pr = prById[String(instance.document_id)];
    const wfName = wfNameById[String(instance.wf_id)];
    const currentStage = stageNameById[String(stage.wfs_id)] || "";

    if (pr) {
      const requester = userById[String(pr.requestor_id)];
      const department = deptById[String(pr.dept_id)];
      const lineItems = itemsByPrId[String(pr.pr_id)] || [];
      const amount = lineItems.reduce((sum, li) => sum + (Number(li.est_total_cost) || 0), 0);

      documents.push({
        stageinstanceId: stage.stageinstance_id,
        instanceId: stage.instance_id,
        documentType: documentTypeFromWorkflow(wfName) || "Purchase Request",
        documentNo: pr.pr_no || pr.pr_id,
        description: pr.remarks || "",
        requestedBy: requester ? `${requester.first_name} ${requester.last_name}`.trim() : (pr.requestor_id ?? ""),
        department: department?.dept_name || pr.dept_id || "",
        dateSubmitted: pr.created_at || pr.pr_date || stage.created_at,
        amount,
        priority: pr.priority || "",
        currentStage,
        lineItems,
        history: historyByInstanceId[String(stage.instance_id)] || [],
      });
      continue;
    }

    // Non-PR (or unresolved) document — keep it in the queue with basic fields
    // so nothing the user is assigned ever disappears from "all pending approvals".
    const createdBy = userById[String(instance.created_by)];
    documents.push({
      stageinstanceId: stage.stageinstance_id,
      instanceId: stage.instance_id,
      documentType: documentTypeFromWorkflow(wfName),
      documentNo: instance.document_id ?? "",
      description: wfName || "",
      requestedBy: createdBy ? `${createdBy.first_name} ${createdBy.last_name}`.trim() : (instance.created_by ?? ""),
      department: "",
      dateSubmitted: instance.started_at || stage.created_at,
      amount: 0,
      priority: "",
      currentStage,
      lineItems: [],
      history: historyByInstanceId[String(stage.instance_id)] || [],
    });
  }

  return { documents, error: null };
}

/**
 * Load the approval history for a single purchase request.
 *
 * Finds the PR's latest workflow instance (`document_id` = pr_id) and returns
 * its chronological stage trail enriched with stage names, workflow status
 * names, and approver names (stage → org role → user).  Returns an empty list
 * when the PR has never been submitted to a workflow.
 */
export async function loadPurchaseRequestApprovalHistoryAction(prId) {
  const supabase = getSupabaseAdmin();

  if (prId == null || prId === "") return { history: [] };

  // 1. Latest workflow instance for this document.
  const { data: instance, error: instanceError } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id, wf_id, document_id, started_at")
    .eq("document_id", prId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (instanceError) {
    console.warn("[loadPurchaseRequestApprovalHistoryAction] Workflow instance lookup failed:", instanceError.message);
    return { history: [] };
  }
  if (!instance) return { history: [] };

  // 2. Stage instances for that workflow instance, chronological.
  const { data: stageRows, error: stagesError } = await supabase
    .from("wfk_t_stageinstance")
    .select("stageinstance_id, instance_id, wfs_id, status_id, created_at, acted_at, acted_by, comments")
    .eq("instance_id", instance.instance_id)
    .order("created_at", { ascending: true })
    .order("stageinstance_id", { ascending: true });

  if (stagesError) {
    console.warn("[loadPurchaseRequestApprovalHistoryAction] Stage instance lookup failed:", stagesError.message);
    return { history: [] };
  }
  const stages = stageRows ?? [];
  if (!stages.length) return { history: [] };

  // 3. Reference data for enrichment.
  const [stageNamesRes, wfStatusRes, usersRes, stageParticipantsRes, userOrgRolesRes] = await Promise.all([
    safeQuery(() => supabase.from("wfk_s_workflowstages").select("wfs_id, stage_name")),
    safeQuery(() => supabase.from("wfk_s_status").select("status_id, status_name")),
    safeQuery(() => supabase.from("psb_s_user").select("user_id, first_name, last_name, email")),
    safeQuery(() => supabase.from("wfk_m_stageparticipant").select("wfs_id, orgrole_id, is_active").eq("is_active", true)),
    safeQuery(() => supabase.from("wfk_m_userorgrole").select("user_id, role_id, is_active").eq("is_active", true)),
  ]);

  const stageNameById = Object.fromEntries(stageNamesRes.map((r) => [String(r.wfs_id), r.stage_name]));
  const wfStatusById = Object.fromEntries(wfStatusRes.map((r) => [String(r.status_id), r.status_name]));
  const userById = Object.fromEntries(usersRes.map((r) => [String(r.user_id), r]));

  // 4. Approver resolution: stage → org roles → users → names.
  const roleIdsByStage = {};
  for (const sp of stageParticipantsRes) {
    if (sp?.wfs_id == null || sp?.orgrole_id == null) continue;
    const key = String(sp.wfs_id);
    if (!roleIdsByStage[key]) roleIdsByStage[key] = new Set();
    roleIdsByStage[key].add(String(sp.orgrole_id));
  }
  const userIdsByRole = {};
  for (const uor of userOrgRolesRes) {
    if (uor?.role_id == null || uor?.user_id == null) continue;
    const key = String(uor.role_id);
    if (!userIdsByRole[key]) userIdsByRole[key] = new Set();
    userIdsByRole[key].add(String(uor.user_id));
  }
  const approverNamesForStage = (wfsId) => {
    const roleIds = roleIdsByStage[String(wfsId)] || new Set();
    const userIds = new Set();
    for (const roleId of roleIds) {
      for (const uid of (userIdsByRole[roleId] || new Set())) userIds.add(uid);
    }
    const names = [];
    for (const uid of userIds) {
      const u = userById[String(uid)];
      names.push(u ? `${u.first_name} ${u.last_name}`.trim() : uid);
    }
    return names.filter(Boolean);
  };

  // 5. Build history entries.
  const history = stages.map((h) => {
    const actor = userById[String(h.acted_by)];
    const actorName = actor ? `${actor.first_name} ${actor.last_name}`.trim() : "";
    const assignedNames = approverNamesForStage(h.wfs_id);
    return {
      stageinstanceId: h.stageinstance_id,
      stageName: stageNameById[String(h.wfs_id)] || "",
      statusName: wfStatusById[String(h.status_id)] || "",
      actorName: actorName || (h.acted_by ?? ""),
      approverName: h.acted_at ? (actorName || assignedNames.join(", ")) : assignedNames.join(", "),
      actedAt: h.acted_at,
      createdAt: h.created_at,
      comments: h.comments || "",
      isPending: !h.acted_at,
    };
  });

  return { history };
}

//#endregion

//#region ─── PROJECT BOM ────────────────────────────────────────────

export async function saveProjectBomAction(payload) {
  const supabase = getSupabaseAdmin();

  // 0. Insert customer snapshot into inv_t_projects (if customer data provided)
  let projectId = payload?.projectId || null;
  let customerSnapshotId = null;

  if (payload?.customer) {
    const c = payload.customer;
    const { data: snapshot, error: snapshotError } = await supabase
      .from("inv_t_projects")
      .insert([{
        client_name: c.client_name || "",
        formatted_address: c.formatted_address || null,
        address_line_1: c.address_line_1 || null,
        city: c.city || null,
        state: c.state || null,
        state_code: c.state_code || null,
        postal_code: c.postal_code || null,
        country: c.country || null,
        status_id: c.status_id || null,
        delear: c.dealer || null,
        invoice_no: c.invoice_number || null,
        order_received_at: c.order_received_at || null,
      }])
      .select()
      .single();

    if (snapshotError) throw new Error(`Failed to save customer snapshot: ${snapshotError.message}`);
    if (!snapshot) throw new Error("Failed to save customer snapshot: no data returned.");

    customerSnapshotId = snapshot.id;
    projectId = customerSnapshotId;
  }

  // 1. Insert BOM header into inv_t_bom
  const { data: bom, error: bomError } = await supabase
    .from("inv_t_bom")
    .insert([{
      project_id: projectId,
      bom_no: payload?.bomNo || null,
      status_Id: payload?.statusId || null,
      remarks: payload?.remarks || null,
      created_by: payload?.createdBy || null,
      bom_temp_id: payload?.bomTempId || null,
      bomt_spec: payload?.bomtSpec || null,
    }])
    .select()
    .single();

  if (bomError) {
    // Rollback customer snapshot on BOM header failure
    if (customerSnapshotId) {
      await supabase.from("inv_t_projects").delete().eq("id", customerSnapshotId);
    }
    throw new Error(`Failed to save BOM: ${bomError.message}`);
  }
  if (!bom) {
    // Rollback customer snapshot on BOM header failure
    if (customerSnapshotId) {
      await supabase.from("inv_t_projects").delete().eq("id", customerSnapshotId);
    }
    throw new Error("Failed to save BOM: no data returned.");
  }

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
      // Rollback header and customer snapshot on line item failure
      await supabase.from("inv_t_bom").delete().eq("bom_id", bomId);
      if (customerSnapshotId) {
        await supabase.from("inv_t_projects").delete().eq("id", customerSnapshotId);
      }
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
    .select("*, inv_t_projects(client_name, formatted_address, city, state_code, address_line_1, state, postal_code, country, delear, invoice_no, order_received_at)")
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
    projectName: bom.inv_t_projects?.client_name || "—",
    spec: bom.inv_t_projects?.formatted_address || "—",
    statusId: bom.status_Id,
    statusName: "Draft",
    remarks: bom.remarks || "",
    createdBy: bom.created_by,
    createdAt: bom.created_at,
    bomTempId: bom.bom_temp_id || null,
    bomtSpec: bom.bomt_spec || null,
    customer: bom.inv_t_projects ? {
      clientName: bom.inv_t_projects.client_name,
      formattedAddress: bom.inv_t_projects.formatted_address,
      city: bom.inv_t_projects.city,
      stateCode: bom.inv_t_projects.state_code,
      addressLine1: bom.inv_t_projects.address_line_1,
      state: bom.inv_t_projects.state,
      postalCode: bom.inv_t_projects.postal_code,
      country: bom.inv_t_projects.country,
      dealer: bom.inv_t_projects.delear,
      invoiceNumber: bom.inv_t_projects.invoice_no,
      orderReceivedAt: bom.inv_t_projects.order_received_at,
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
    .select("*, inv_t_projects(client_name, formatted_address, city, state_code)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadProjectBomDataAction]", error);
    return [];
  }

  return (data || []).map((r) => ({
    id: r.bom_id,
    bomNo: r.bom_no || "—",
    projectId: r.project_id,
    projectName: r.inv_t_projects?.client_name || "—",
    spec: r.inv_t_projects?.formatted_address || "—",
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

  // Exclude dead POs (cancelled/recalled). Completed POs are returned too so the
  // UI can toggle them on/off; the view hides them by default.
  const openPOs = (data || []).filter((po) => {
    const statusName = (po.inv_s_status?.name || "").toLowerCase();
    return statusName !== "cancelled" && statusName !== "recalled";
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
      status: po.inv_s_status?.name || po.status || po.po_status || "Draft",
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

  // Determine PO status per item (mirrors the BOM release auto-status logic):
  // "Completed" only when every line item is fully received, else "Partial".
  const { data: poItems } = await supabase
    .from("inv_t_purchasorder_items")
    .select("item_id, quantity")
    .eq("po_id", poId);

  const { data: receivedLevels } = await supabase
    .from("inv_t_stockslevels")
    .select("item_id, quantity")
    .eq("po_no", poNo);

  const requiredByItem = {};
  for (const i of poItems || []) {
    requiredByItem[i.item_id] = (requiredByItem[i.item_id] || 0) + (Number(i.quantity) || 0);
  }

  const receivedByItem = {};
  for (const sl of receivedLevels || []) {
    receivedByItem[sl.item_id] = (receivedByItem[sl.item_id] || 0) + (Number(sl.quantity) || 0);
  }

  const itemIds = Object.keys(requiredByItem);
  const fullyReceived = itemIds.length > 0 && itemIds.every(
    (itemId) => (receivedByItem[itemId] || 0) >= requiredByItem[itemId],
  );

  const statusName = fullyReceived ? "Completed" : "Partial";
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
    .select("*, inv_t_projects(client_name, formatted_address)")
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
        const bomNoFromRemarks = parseBomReleaseRemarks(sl.remarks);
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

  // Resolve status names (inv_t_bom.status_Id → inv_s_status.name)
  let statusNameById = {};
  try {
    const { data: statuses, error: statusError } = await supabase
      .from("inv_s_status")
      .select("id, name");
    if (statusError) {
      console.warn("[loadBOMsForReleaseAction] Status lookup failed:", statusError.message);
    } else {
      statusNameById = Object.fromEntries((statuses || []).map((s) => [String(s.id), s.name]));
    }
  } catch (err) {
    console.warn("[loadBOMsForReleaseAction] Status lookup threw:", err.message);
  }

  return boms.map((bom) => {
    const bomDetails = allDetails.filter((d) => d.bom_id === bom.bom_id);
    return {
      id: bom.bom_id,
      bomNo: bom.bom_no || "—",
      projectName: bom.inv_t_projects?.client_name || "—",
      spec: bom.inv_t_projects?.formatted_address || bom.bomt_spec || "—",
      createdAt: bom.created_at,
      status: statusNameById[String(bom.status_Id)] || "Draft",
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

/**
 * Parse a stock-level remarks value written by a BOM release and return the BOM
 * number it refers to (or null). Handles both the legacy "BOM Release: <bomNo>"
 * format and "BOM Release: <bomNo> | <user notes>".
 */
function parseBomReleaseRemarks(remarksValue) {
  const rest = String(remarksValue || "").split("BOM Release: ")[1];
  if (!rest) return null;
  return rest.split(" | ")[0].trim() || null;
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
      remarks: remarks ? `BOM Release: ${bomNo} | ${remarks}` : `BOM Release: ${bomNo}`,
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

  // ─── Auto-status: if every line item is fully released, mark BOM "Released" ───
  let fullyReleased = false;
  let statusName = null;
  try {
    const { data: bomDetails } = await supabase
      .from("inv_t_bom_details")
      .select("item_id, quantity")
      .eq("bom_id", bomId);

    // Cumulative released qty per item, from all BOM release stock movements.
    const { data: releaseLevels } = await supabase
      .from("inv_t_stockslevels")
      .select("item_id, quantity, remarks")
      .like("remarks", `BOM Release: ${bomNo}%`);

    const releasedByItem = {};
    for (const sl of releaseLevels || []) {
      if (parseBomReleaseRemarks(sl.remarks) !== bomNo) continue;
      releasedByItem[sl.item_id] = (releasedByItem[sl.item_id] || 0) + Math.abs(Number(sl.quantity) || 0);
    }

    const requiredByItem = {};
    for (const d of bomDetails || []) {
      requiredByItem[d.item_id] = (requiredByItem[d.item_id] || 0) + (Number(d.quantity) || 0);
    }

    const itemIds = Object.keys(requiredByItem);
    fullyReleased = itemIds.length > 0 && itemIds.every(
      (itemId) => (releasedByItem[itemId] || 0) >= requiredByItem[itemId],
    );

    if (fullyReleased) {
      const statusId = await resolveStatusIdByName("Released");
      if (statusId) {
        await supabase
          .from("inv_t_bom")
          .update({ status_Id: statusId })
          .eq("bom_id", bomId);
        statusName = "Released";
      } else {
        console.warn('[releaseBOMItemsAction] No "Released" status found in inv_s_status; BOM status left unchanged.');
      }
    }
  } catch (err) {
    console.warn("[releaseBOMItemsAction] Auto-status check failed:", err?.message);
  }

  return { success: true, bomNo, fullyReleased, statusName };
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