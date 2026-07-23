/**
 * Client Helpers — inventory.data.js
 *
 * Runs in the browser. Helper functions for the Inventory View.
 * NO database calls here — that belongs in inventory.actions.js.
 */

import { isEntityActive } from "./inventoryHelpers.data";

// ─── NAVIGATION ─────────────────────────────────────────────

export const INVENTORY_VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "materials", label: "Materials" },
  { id: "equipment", label: "Equipment" },
  { id: "warehouses", label: "Locations" },
  { id: "log", label: "Activity log" },
];

// ─── STATUS MAP ─────────────────────────────────────────────

export function getEquipmentStatusColor(status) {
  switch (status) {
    case "Available":
      return "active";
    case "In Use":
      return "pending";
    case "Maintenance":
      return "failed";
    default:
      return "inactive";
  }
}

// ─── CONFIG LOOKUPS ─────────────────────────────────────────

export function buildConfigLookup(configData, entityKey, keyField = "key") {
  const rows = configData?.[entityKey] ?? [];
  return Object.fromEntries(
    rows
      .filter((r) => isEntityActive(r))
      .map((r) => [r[keyField], r.name]),
  );
}

export function getCategoryName(configData, categoryKey) {
  return buildConfigLookup(configData, "categories")[categoryKey] || categoryKey || "Unknown";
}

export function getUnitName(configData, unitKey) {
  return buildConfigLookup(configData, "units", "abbreviation")[unitKey] || unitKey || "pcs";
}

export function getStatusName(configData, statusKey) {
  return buildConfigLookup(configData, "statuses")[statusKey] || statusKey || "Unknown";
}

export function getWarehouseTypeName(configData, typeKey) {
  return buildConfigLookup(configData, "warehouseTypes")[typeKey] || typeKey || "";
}

// ─── EMPTY DATA SHAPE ───────────────────────────────────────

export function createEmptyInventoryData() {
  return {
    warehouses: [],
    items: [],
    transactions: [],
    config: {
      categories: [],
      units: [],
      statuses: [],
      warehouseTypes: [],
    },
  };
}

// ─── MERGE SERVER + LOCAL DATA ──────────────────────────────

export function mergeInventoryData(serverData, localData) {
  return {
    warehouses: serverData?.warehouses?.length ? serverData.warehouses : localData?.warehouses ?? [],
    items: serverData?.items?.length ? serverData.items : localData?.items ?? [],
    transactions: serverData?.transactions?.length
      ? serverData.transactions
      : localData?.transactions ?? [],
    config: serverData?.config ?? localData?.config ?? createEmptyInventoryData().config,
  };
}

// ─── FORMATTING ─────────────────────────────────────────────

export function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}
