/**
 * Inventory Configuration — Data Layer (client-safe utilities)
 *
 * Entity config definitions and basic helpers.
 */

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

// ─── HELPERS ────────────────────────────────────────────────

export function isEntityActive(row) {
  if (row?.is_active === false || row?.is_active === 0) return false;
  const text = String(row?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function mapEntityRow(row) {
  return {
    ...row,
    name: row?.name || "Unknown",
    display_order: row?.display_order || row?.sort_order || 1,
    is_active_bool: isEntityActive(row),
  };
}