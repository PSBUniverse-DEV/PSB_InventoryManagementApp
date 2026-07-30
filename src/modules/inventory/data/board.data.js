/**
 * Client Helpers — board.data.js
 *
 * Runs in the browser. Helper functions for the Board view.
 * NO database calls here — that belongs in board.actions.js.
 */

// ─── FIELD TYPES ────────────────────────────────────────────

export const FIELD_TYPES = [
  { id: "text", label: "Text", icon: "type" },
  { id: "textarea", label: "Text Area", icon: "text-paragraph" },
  { id: "number", label: "Number", icon: "123" },
  { id: "currency", label: "Currency", icon: "currency-dollar" },
  { id: "date", label: "Date", icon: "calendar" },
  { id: "datetime", label: "Date & Time", icon: "calendar-event" },
  { id: "checkbox", label: "Checkbox", icon: "check-square" },
  { id: "select", label: "Select", icon: "list-ul" },
  { id: "multi_select", label: "Multi Select", icon: "list-check" },
  { id: "email", label: "Email", icon: "envelope" },
  { id: "phone", label: "Phone", icon: "telephone" },
  { id: "url", label: "URL", icon: "link-45deg" },
];

// ─── MERGE BOARD DATA ───────────────────────────────────────

/**
 * Merges raw board data into a renderable structure.
 * Returns an object with:
 *   - board: the board record
 *   - fields: custom field definitions (with options attached)
 *   - tasks: task records with fieldValues map attached
 */
export function mergeBoardData(board, tasks, fields, options, taskValues) {
  // Build field options lookup: field_id -> [options]
  const optionsByField = {};
  (options || []).forEach((opt) => {
    if (!optionsByField[opt.field_id]) optionsByField[opt.field_id] = [];
    optionsByField[opt.field_id].push(opt);
  });

  // Attach options to fields
  const fieldsWithOptions = (fields || []).map((f) => ({
    ...f,
    options: optionsByField[f.id] || [],
  }));

  // Build task values lookup: task_id -> { field_id -> value }
  const valuesByTask = {};
  (taskValues || []).forEach((tv) => {
    if (!valuesByTask[tv.task_id]) valuesByTask[tv.task_id] = {};
    valuesByTask[tv.task_id][tv.field_id] = {
      text_value: tv.text_value,
      number_value: tv.number_value,
      date_value: tv.date_value,
      json_value: tv.json_value,
    };
  });

  // Attach field values to tasks
  const tasksWithValues = (tasks || []).map((t) => ({
    ...t,
    fieldValues: valuesByTask[t.id] || {},
  }));

  return {
    board: board || null,
    fields: fieldsWithOptions,
    tasks: tasksWithValues,
  };
}

// ─── GET FIELD VALUE ────────────────────────────────────────

/**
 * Gets the display value for a task's field.
 */
export function getFieldDisplayValue(task, field) {
  const fv = task?.fieldValues?.[field?.id];
  if (!fv) return null;

  switch (field?.type) {
    case "number":
    case "currency":
      return fv.number_value;
    case "date":
    case "datetime":
      return fv.date_value;
    case "checkbox":
      return fv.text_value === "true" || fv.text_value === "1" || fv.number_value === 1;
    case "select":
    case "multi_select":
      return fv.text_value;
    case "json_value":
      return fv.json_value;
    default:
      return fv.text_value;
  }
}

/**
 * Gets the raw value for editing a field.
 */
export function getFieldRawValue(task, field) {
  const fv = task?.fieldValues?.[field?.id];
  if (!fv) return "";

  switch (field?.type) {
    case "number":
    case "currency":
      return fv.number_value ?? "";
    case "date":
    case "datetime":
      return fv.date_value ? fv.date_value.slice(0, 10) : "";
    case "checkbox":
      return fv.text_value === "true" || fv.number_value === 1;
    default:
      return fv.text_value ?? "";
  }
}