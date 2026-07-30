/**
 * Server Actions — board.actions.js
 *
 * Runs on the server. Handles all board, task, custom field, and field value operations.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── LOAD BOARD DATA ────────────────────────────────────────

export async function loadAllBoards() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_t_board")
    .select("*")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load boards: ${error.message}`);
  return data ?? [];
}

export async function loadBoardData(boardId) {
  const supabase = getSupabaseAdmin();

  const [boardRes, tasksRes, fieldsRes, valuesRes] = await Promise.all([
    safeQuery(() => supabase.from("inv_t_board").select("*").eq("id", boardId).single()),
    safeQuery(() => supabase.from("inv_t_task").select("*").eq("board_id", boardId).eq("is_archived", false).order("position", { ascending: true })),
    safeQuery(() => supabase.from("inv_s_customfields").select("*").eq("board_id", boardId).eq("is_visible", true).order("order_no", { ascending: true })),
    safeQuery(() => supabase.from("inv_t_task_field_values").select("*, field:field_id(*)").in("task_id", [])),
  ]);

  const tasks = tasksRes ?? [];
  const fields = fieldsRes ?? [];

  // Load field options for select/multi_select fields
  const selectFields = fields.filter((f) => f.type === "select" || f.type === "multi_select");
  let options = [];
  if (selectFields.length > 0) {
    const fieldIds = selectFields.map((f) => f.id);
    const { data: optsData } = await supabase
      .from("inv_s_customfield_options")
      .select("*")
      .in("field_id", fieldIds)
      .order("order_no", { ascending: true });
    options = optsData ?? [];
  }

  // Load task field values for all tasks
  let taskValues = [];
  if (tasks.length > 0) {
    const taskIds = tasks.map((t) => t.id);
    const { data: valsData } = await supabase
      .from("inv_t_task_field_values")
      .select("*")
      .in("task_id", taskIds);
    taskValues = valsData ?? [];
  }

  return {
    board: boardRes ?? null,
    tasks,
    fields,
    options,
    taskValues,
  };
}

// ─── BOARD CRUD ─────────────────────────────────────────────

export async function createBoardAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_t_board")
    .insert([{
      name: payload?.name || "",
      description: payload?.description || null,
      color: payload?.color || null,
      icon: payload?.icon || null,
      created_by: payload?.createdBy || null,
      is_archived: false,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create board: ${error.message}`);
  return data;
}

export async function deleteBoardAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inv_t_board")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to archive board: ${error.message}`);
}

export async function updateBoardAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.name !== undefined) patch.name = updates.name;
  if (updates?.description !== undefined) patch.description = updates.description;
  if (updates?.color !== undefined) patch.color = updates.color;
  if (updates?.icon !== undefined) patch.icon = updates.icon;
  if (updates?.isArchived !== undefined) patch.is_archived = updates.isArchived;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("inv_t_board")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(`Failed to update board: ${error.message}`);
}

// ─── TASK CRUD ──────────────────────────────────────────────

export async function createTaskAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_t_task")
    .insert([{
      board_id: payload?.boardId,
      list_id: payload?.listId || null,
      title: payload?.title || "",
      description: payload?.description || null,
      position: payload?.position || 0,
      created_by: payload?.createdBy || null,
      is_archived: false,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data;
}

export async function updateTaskAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.title !== undefined) patch.title = updates.title;
  if (updates?.description !== undefined) patch.description = updates.description;
  if (updates?.position !== undefined) patch.position = updates.position;
  if (updates?.listId !== undefined) patch.list_id = updates.listId;
  if (updates?.isArchived !== undefined) patch.is_archived = updates.isArchived;
  if (updates?.updatedBy !== undefined) patch.updated_by = updates.updatedBy;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("inv_t_task")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(`Failed to update task: ${error.message}`);
}

export async function deleteTaskAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inv_t_task")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to delete task: ${error.message}`);
}

// ─── CUSTOM FIELDS CRUD ─────────────────────────────────────

export async function createCustomFieldAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_customfields")
    .insert([{
      board_id: payload?.boardId,
      name: payload?.name || "",
      type: payload?.type || "text",
      order_no: payload?.orderNo || 0,
      is_required: payload?.isRequired || false,
      is_visible: true,
      is_system: false,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create custom field: ${error.message}`);
  return data;
}

export async function updateCustomFieldAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const patch = {};
  if (updates?.name !== undefined) patch.name = updates.name;
  if (updates?.type !== undefined) patch.type = updates.type;
  if (updates?.orderNo !== undefined) patch.order_no = updates.orderNo;
  if (updates?.isRequired !== undefined) patch.is_required = updates.isRequired;
  if (updates?.isVisible !== undefined) patch.is_visible = updates.isVisible;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("inv_s_customfields")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(`Failed to update custom field: ${error.message}`);
}

export async function deleteCustomFieldAction(id) {
  const supabase = getSupabaseAdmin();
  // Delete field options first, then the field itself
  await supabase.from("inv_s_customfield_options").delete().eq("field_id", id).then(() => {}).catch(() => {});
  await supabase.from("inv_t_task_field_values").delete().eq("field_id", id).then(() => {}).catch(() => {});

  const { error } = await supabase
    .from("inv_s_customfields")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete custom field: ${error.message}`);
}

// ─── FIELD OPTIONS CRUD ─────────────────────────────────────

export async function addFieldOptionAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("inv_s_customfield_options")
    .insert([{
      field_id: payload?.fieldId,
      label: payload?.label || "",
      value: payload?.value || payload?.label || "",
      color: payload?.color || null,
      order_no: payload?.orderNo || 0,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to add field option: ${error.message}`);
  return data;
}

export async function deleteFieldOptionAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inv_s_customfield_options")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete field option: ${error.message}`);
}

// ─── TASK FIELD VALUES ──────────────────────────────────────

export async function upsertTaskFieldValueAction(taskId, fieldId, value) {
  const supabase = getSupabaseAdmin();

  // Determine value type and set the appropriate column
  const patch = { task_id: taskId, field_id: fieldId };

  if (value === null || value === undefined || value === "") {
    // Clear all value columns
    patch.text_value = null;
    patch.number_value = null;
    patch.date_value = null;
    patch.json_value = null;
  } else if (typeof value === "number") {
    patch.number_value = value;
    patch.text_value = null;
    patch.date_value = null;
    patch.json_value = null;
  } else if (value instanceof Date || (!isNaN(Date.parse(value)) && typeof value === "string" && value.includes("-"))) {
    patch.date_value = value;
    patch.text_value = null;
    patch.number_value = null;
    patch.json_value = null;
  } else if (typeof value === "object") {
    patch.json_value = value;
    patch.text_value = null;
    patch.number_value = null;
    patch.date_value = null;
  } else {
    patch.text_value = String(value);
    patch.number_value = null;
    patch.date_value = null;
    patch.json_value = null;
  }

  // Check if a value already exists
  const { data: existing } = await supabase
    .from("inv_t_task_field_values")
    .select("id")
    .eq("task_id", taskId)
    .eq("field_id", fieldId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("inv_t_task_field_values")
      .update(patch)
      .eq("id", existing.id);

    if (error) throw new Error(`Failed to update field value: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("inv_t_task_field_values")
      .insert([patch]);

    if (error) throw new Error(`Failed to insert field value: ${error.message}`);
  }
}

// ─── HELPERS ────────────────────────────────────────────────

async function safeQuery(queryFn) {
  try {
    const { data, error } = await queryFn();
    if (error) {
      console.error("safeQuery error:", error);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("safeQuery exception:", err);
    return [];
  }
}