/**
 * Client Helpers — inventory.data.js
 *
 * Runs in the browser. Helper functions for the Inventory View.
 * NO database calls here — that belongs in inventory.actions.js.
 */

import { isEntityActive } from "./inventoryHelpers.data";

// ─── NAVIGATION ─────────────────────────────────────────────

export const INVENTORY_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard", group: "Dashboard" },
  { id: "stockIn", label: "Stock In", icon: "ArrowDownCircle", group: "Transactions" },
  { id: "stockOut", label: "Stock Out", icon: "ArrowUpCircle", group: "Transactions" },
  { id: "materials", label: "Materials", icon: "Package", group: "Master Data" },
  { id: "equipment", label: "Equipment", icon: "Wrench", group: "Master Data" },
  { id: "warehouses", label: "Warehouse", icon: "Warehouse", group: "Master Data" },
  { id: "suppliers", label: "Suppliers", icon: "Truck", group: "Master Data" },
  { id: "stocklevels", label: "Stock levels", icon: "BarChart3", group: "Inventory" },
  { id: "bom", label: "Bill of Materials", icon: "Layers", group: "Transactions" },
  { id: "log", label: "Activity log", icon: "ClipboardList", group: "Activity" },
  { id: "boards", label: "Boards", icon: "Columns", group: "Configuration" },
  { id: "boardSetup", label: "Board Setup", icon: "Settings", group: "Configuration" },
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

export function getTrackingType(configData, typeKey) {
  return buildConfigLookup(configData, "trackingtype")[typeKey] || typeKey || "";
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
