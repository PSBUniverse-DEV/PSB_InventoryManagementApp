/**
 * Inventory Configuration — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and batch save orchestration.
 * Follows the same pattern as admin/application-setup/data.
 */

// ─── ENTITY CONFIG ──────────────────────────────────────────

// Each master data entity shares a common schema pattern:
//   { id, name, key/abbreviation, description, display_order, is_active }
// These helpers map server rows to client-friendly objects.

export function isEntityActive(row) {
  if (row?.is_active === false || row?.is_active === 0) return false;
  const text = String(row?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getEntityDisplayName(row) {
  return row?.name || "Unknown";
}

export function getEntityDisplayOrder(row, fallback = 0) {
  const candidates = [row?.display_order, row?.sort_order];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function mapEntityRow(row, index) {
  return {
    ...row,
    id: row?.id ?? `entity-${index}`,
    name: getEntityDisplayName(row),
    display_order: getEntityDisplayOrder(row, index + 1),
    is_active_bool: isEntityActive(row),
  };
}

// ─── ENTITY DEFINITIONS ─────────────────────────────────────

export const ENTITY_CONFIGS = {
  categories: {
    label: "Categories",
    description: "Item categories used to classify inventory (e.g. Material, Equipment).",
    keyField: "key",
    hasKey: true,
    hasAbbreviation: false,
    keyPlaceholder: "e.g. material",
    keyLabel: "Key",
    namePlaceholder: "e.g. Materials",
  },
  units: {
    label: "Units of Measure",
    description: "Units used for material quantities (e.g. pcs, ft, bags).",
    keyField: "abbreviation",
    hasKey: false,
    hasAbbreviation: true,
    keyPlaceholder: "e.g. pcs",
    keyLabel: "Abbreviation",
    namePlaceholder: "e.g. Pieces",
  },
  statuses: {
    label: "Equipment Statuses",
    description: "Lifecycle statuses for equipment items (e.g. Available, In Use, Maintenance).",
    keyField: "key",
    hasKey: true,
    hasAbbreviation: false,
    keyPlaceholder: "e.g. available",
    keyLabel: "Key",
    namePlaceholder: "e.g. Available",
  },
  warehouseTypes: {
    label: "Warehouse Types",
    description: "Classifications for storage locations (e.g. Yard, Distribution Center).",
    keyField: "key",
    hasKey: true,
    hasAbbreviation: false,
    keyPlaceholder: "e.g. yard",
    keyLabel: "Key",
    namePlaceholder: "e.g. Storage Yard",
  },
};

export const ENTITY_KEYS = Object.keys(ENTITY_CONFIGS);

export function getEntityConfig(entityKey) {
  return ENTITY_CONFIGS[entityKey] || null;
}

// ─── UTILITY HELPERS ────────────────────────────────────────

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
}

export function buildOrderSignature(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => String(r?.id || "")).join("|");
}

export function removeObjectKey(obj, key) {
  const k = String(key ?? "");
  const next = {};
  Object.entries(obj || {}).forEach(([k2, v]) => { if (k2 !== k) next[k2] = v; });
  return next;
}

export function mergeUpdatePatch(prev, patch) {
  const merged = { ...(prev || {}) };
  Object.entries(patch || {}).forEach(([k, v]) => { if (v !== undefined) merged[k] = v; });
  return merged;
}

export function appendUniqueId(list, value) {
  const v = String(value ?? "");
  if (!v) return Array.isArray(list) ? [...list] : [];
  const arr = Array.isArray(list) ? list : [];
  if (arr.some((e) => isSameId(e, v))) return [...arr];
  return [...arr, v];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_ENTITY_PREFIX = "tmp-entity-";

export function createEmptyBatchState() {
  return {
    creates: [],
    updates: {},
    deactivations: [],
    hardDeletes: [],
  };
}

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempEntityId(v) {
  return String(v ?? "").startsWith(TEMP_ENTITY_PREFIX);
}

export function mapServerRow(row, index) {
  return {
    ...row,
    id: row?.id ?? row?.[`${Object.keys(row).find(k => k.endsWith('_id')) || 'id'}`] ?? `tmp-${index}`,
    name: row?.name || "",
    description: row?.description || row?.desc || "",
    key: row?.key || row?.abbreviation || "",
    abbreviation: row?.abbreviation || "",
    display_order: getEntityDisplayOrder(row, index + 1),
    is_active_bool: isEntityActive(row),
  };
}

// ─── BATCH SAVE ─────────────────────────────────────────────

export async function executeBatchSave(entityKey, pendingBatch, orderedRows, serverActions) {
  const idMap = new Map();
  const deactivatedSet = new Set(
    [...(pendingBatch.deactivations || []), ...(pendingBatch.hardDeletes || [])].map((id) => String(id ?? "")),
  );

  const { createAction, updateAction, deactivateAction, hardDeleteAction, saveOrderAction } = serverActions;

  for (const entry of pendingBatch.creates || []) {
    const created = await createAction(entry.payload);
    const id = created?.id;
    if (id == null || id === "") throw new Error(`Created ${entityKey} response is invalid.`);
    idMap.set(String(entry.tempId), id);
  }

  for (const [rowId, updates] of Object.entries(pendingBatch.updates || {})) {
    if (deactivatedSet.has(String(rowId)) || !Object.keys(updates || {}).length) continue;
    const resolved = idMap.get(String(rowId)) ?? rowId;
    await updateAction(resolved, updates);
  }

  for (const rowId of pendingBatch.deactivations || []) {
    if (isTempEntityId(rowId)) continue;
    await deactivateAction(rowId);
  }

  for (const rowId of pendingBatch.hardDeletes || []) {
    if (isTempEntityId(rowId)) continue;
    await hardDeleteAction(rowId);
  }

  const orderedPersistedIds = orderedRows
    .map((row) => row?.id)
    .map((id) => idMap.get(String(id ?? "")) ?? id)
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedSet.has(String(id)))
    .filter((id) => !isTempEntityId(id));

  if (orderedPersistedIds.length > 0) {
    await saveOrderAction(entityKey, orderedPersistedIds);
  }

  return { idMap, deactivatedSet, orderedPersistedIds };
}