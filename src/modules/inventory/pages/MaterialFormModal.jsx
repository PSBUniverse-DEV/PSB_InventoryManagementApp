/**
 * Client Component — MaterialFormModal.jsx
 *
 * Standalone create/edit modal for the items/material master table.
 * Covers: basic info, tracking method, stock levels per warehouse, costing & supplier.
 */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal, toastError } from "@/shared/components/ui";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label inventory-form-label">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <h6
      className="fw-bold mb-3"
      style={{
        borderBottom: "1px solid var(--psb-border, #dee2e6)",
        paddingBottom: "0.5rem",
      }}
    >
      {label}
    </h6>
  );
}

// ─── CONSTANTS ──────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  "Cement",
  "Steel",
  "Aggregates",
  "Lumber",
  "Hardware",
  "Electrical",
  "Plumbing",
];

const STATUS_OPTIONS = ["Active", "Discontinued"];

const TRACKING_OPTIONS = [
  { value: "simple", label: "Simple (quantity only)" },
  { value: "batch", label: "Batch/lot tracked" },
  { value: "serial", label: "Serial number tracked" },
];

function getTrackingTypeKey(trackingTypeId, trackingTypes) {
  if (!trackingTypeId) return "simple";
  const found = (trackingTypes || []).find(
    (t) => String(t.id) === String(trackingTypeId)
  );
  if (!found) return "simple";
  const name = (found.name || found.key || "").toLowerCase();
  if (name.includes("serial")) return "serial";
  if (name.includes("batch") || name.includes("lot")) return "batch";
  return "simple";
}

function getTrackingTypeId(trackingKey, trackingTypes) {
  if (trackingKey === "simple") return null;
  const found = (trackingTypes || []).find((t) => {
    const name = (t.name || "").toLowerCase();
    const key = (t.key || "").toLowerCase();
    return name.includes(trackingKey) || key === trackingKey;
  });
  return found?.id ?? null;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────

export default function MaterialFormModal({
  show,
  onHide,
  mode,
  initialItem,
  config,
  warehouses,
  suppliers,
  allItems,
  stockLevels,
  onSave,
}) {
  const isEdit = mode === "edit";

  // Config-derived data
  const trackingTypes = config?.trackingTypes || [];
  const unitOptions = config?.units || [];
  const categoryOptions = config?.categories?.length
    ? config.categories.map((c) => c.name)
    : CATEGORY_OPTIONS;

  // ─── Build initial form ──────────────────────────────────
  const buildInitialForm = useCallback(() => {
    const base = {
      sku: "",
      name: "",
      category: "",
      subCategory: "",
      unitId: "",
      status: "Active",
      trackingTypeKey: "simple",
      barcode: "",
      trackExpiry: false,
      trackQualityCert: false,
      trackWarranty: false,
      warehouseRows: [],
      supplierId: "",
      lastPurchaseCost: "",
      sellingPrice: "",
    };

    if (isEdit && initialItem) {
      const trackingKey = getTrackingTypeKey(
        initialItem.tracking_type_id || initialItem.trackingTypeId,
        trackingTypes
      );

      // Map existing stock levels to warehouse rows
      const itemId = initialItem.id || initialItem.item_id;
      const existingRows = (stockLevels || [])
        .filter((sl) => String(sl.item_id) === String(itemId))
        .map((sl) => ({
          key: sl.id || `${sl.warehouse_id}-${Date.now()}`,
          warehouseId: String(sl.warehouse_id || ""),
          minStock: sl.min_stock ?? sl.minStock ?? 0,
          maxStock: sl.max_stock ?? sl.maxStock ?? 0,
          safetyStock: sl.safety_stock ?? sl.safetyStock ?? 0,
        }));

      return {
        sku: initialItem.sku || "",
        name: initialItem.name || "",
        category: initialItem.category || initialItem.category_name || "",
        subCategory: initialItem.sub_category || initialItem.subCategory || "",
        unitId: String(
          initialItem.unit_id || initialItem.unitId || ""
        ),
        status: initialItem.status_name || initialItem.status || "Active",
        trackingTypeKey: trackingKey,
        barcode: initialItem.barcode || "",
        trackExpiry: initialItem.track_expiry === true,
        trackQualityCert: initialItem.track_quality_cert === true,
        trackWarranty: initialItem.track_warranty === true,
        warehouseRows: existingRows,
        supplierId: String(
          initialItem.supplier_id || initialItem.supplierId || ""
        ),
        lastPurchaseCost:
          initialItem.cost != null ? String(initialItem.cost) : "",
        sellingPrice:
          initialItem.wholesale_price != null
            ? String(initialItem.wholesale_price)
            : initialItem.sellingPrice != null
            ? String(initialItem.sellingPrice)
            : "",
      };
    }

    return base;
  }, [isEdit, initialItem, trackingTypes, stockLevels]);

  const [form, setForm] = useState(buildInitialForm());
  const [isBusy, setIsBusy] = useState(false);

  // Reset form on show/mode change
  useEffect(() => {
    if (show) {
      setForm(buildInitialForm());
    }
  }, [show, buildInitialForm]);

  const updateField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ─── Warehouse row helpers ───────────────────────────────
  const addWarehouseRow = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      warehouseRows: [
        ...prev.warehouseRows,
        {
          key: Date.now().toString(),
          warehouseId: "",
          minStock: 0,
          maxStock: 0,
          safetyStock: 0,
        },
      ],
    }));
  }, []);

  const updateWarehouseRow = useCallback((key, field, value) => {
    setForm((prev) => ({
      ...prev,
      warehouseRows: prev.warehouseRows.map((r) =>
        r.key === key ? { ...r, [field]: value } : r
      ),
    }));
  }, []);

  const removeWarehouseRow = useCallback((key) => {
    setForm((prev) => ({
      ...prev,
      warehouseRows: prev.warehouseRows.filter((r) => r.key !== key),
    }));
  }, []);

  // Available warehouses not yet selected
  const availableWarehouses = useMemo(() => {
    const selectedIds = form.warehouseRows
      .map((r) => r.warehouseId)
      .filter(Boolean);
    return (warehouses || []).filter(
      (w) => !selectedIds.includes(String(w.id))
    );
  }, [warehouses, form.warehouseRows]);

  // ─── Validation ──────────────────────────────────────────
  const validate = useCallback(() => {
    const errors = [];

    if (!form.sku || !form.sku.trim()) {
      errors.push("SKU / item code is required.");
    } else if (!isEdit) {
      // Check uniqueness
      const exists = (allItems || []).some(
        (item) =>
          item.sku?.trim().toLowerCase() === form.sku.trim().toLowerCase()
      );
      if (exists) errors.push("SKU already exists. Item code must be unique.");
    }

    if (!form.name || !form.name.trim()) {
      errors.push("Item name is required.");
    }

    if (!form.category) {
      errors.push("Category is required.");
    }

    if (!form.unitId) {
      errors.push("Unit of measure is required.");
    }

    // Status = Active requires at least one warehouse (unless serial)
    if (form.status === "Active" && form.trackingTypeKey !== "serial") {
      if (form.warehouseRows.length === 0) {
        errors.push(
          "At least one warehouse stock row is required when status is Active."
        );
      }
    }

    // Validate warehouse rows
    for (const row of form.warehouseRows) {
      if (!row.warehouseId) {
        errors.push("Each stock row must have a warehouse selected.");
        break;
      }
      if (
        Number(row.maxStock) > 0 &&
        Number(row.minStock) >= Number(row.maxStock)
      ) {
        errors.push(
          "Max stock must be greater than min stock for each warehouse row."
        );
        break;
      }
    }

    return errors;
  }, [form, allItems, isEdit]);

  // ─── Submit ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const errors = validate();
    if (errors.length > 0) {
      toastError(errors[0]);
      return;
    }

    setIsBusy(true);
    try {
      await onSave({
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category,
        subCategory: form.subCategory,
        unitId: form.unitId ? Number(form.unitId) : null,
        status: form.status,
        trackingTypeId: getTrackingTypeId(form.trackingTypeKey, trackingTypes),
        barcode: form.barcode || null,
        trackExpiry: form.trackingTypeKey === "batch" ? form.trackExpiry : false,
        trackQualityCert:
          form.trackingTypeKey === "batch" ? form.trackQualityCert : false,
        trackWarranty:
          form.trackingTypeKey === "serial" ? form.trackWarranty : false,
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        lastPurchaseCost: form.lastPurchaseCost
          ? Number(form.lastPurchaseCost)
          : 0,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
        warehouseRows: form.warehouseRows.map((r) => ({
          warehouseId: Number(r.warehouseId),
          minStock: Number(r.minStock) || 0,
          maxStock: Number(r.maxStock) || 0,
          safetyStock: Number(r.safetyStock) || 0,
        })),
      });
      onHide();
    } catch (err) {
      toastError(err?.message || "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }, [form, trackingTypes, validate, onSave, onHide]);

  // ─── Tracking conditional UI ─────────────────────────────
  const isBatch = form.trackingTypeKey === "batch";
  const isSerial = form.trackingTypeKey === "serial";
  const showStockLevels = !isSerial;

  // ─── Render ──────────────────────────────────────────────
  return (
    <Modal
      show={show}
      onHide={onHide}
      bodyClassName="inventory-modal-scrollable"
      title={isEdit ? "Edit Material" : "Add Material"}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onHide}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleSave}
            loading={isBusy}
          >
            {isEdit ? "Save changes" : "Add material"}
          </Button>
        </>
      }
    >
      {/* ─── BASIC INFORMATION ─────────────────────────── */}
      <SectionHeader label="Basic information" />

      <Field label="SKU / item code">
        <Input
          value={form.sku}
          onChange={(e) => updateField("sku", e.target.value)}
          placeholder="e.g. CEM-40KG-PORT"
          disabled={isEdit}
        />
      </Field>

      <Field label="Item name">
        <Input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. Portland cement 40kg"
        />
      </Field>

      <Field label="Category">
        <select
          className="form-select"
          value={form.category}
          onChange={(e) => updateField("category", e.target.value)}
        >
          <option value="">Select category</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sub-category">
        <Input
          value={form.subCategory}
          onChange={(e) => updateField("subCategory", e.target.value)}
          placeholder='e.g. "Portland type"'
        />
      </Field>

      <Field label="Unit of measure">
        <select
          className="form-select"
          value={form.unitId}
          onChange={(e) => updateField("unitId", e.target.value)}
        >
          <option value="">Select unit</option>
          {(unitOptions || []).map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name} ({u.abbreviation})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Status">
        <select
          className="form-select"
          value={form.status}
          onChange={(e) => updateField("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {/* ─── TRACKING METHOD ────────────────────────────── */}
      <SectionHeader label="Tracking method" />

      <Field label="Tracking type">
        <select
          className="form-select"
          value={form.trackingTypeKey}
          onChange={(e) => {
            updateField("trackingTypeKey", e.target.value);
            // Reset toggles on change
            updateField("trackExpiry", false);
            updateField("trackQualityCert", false);
            updateField("trackWarranty", false);
          }}
        >
          {TRACKING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Barcode (SKU-level)">
        <Input
          value={form.barcode}
          onChange={(e) => updateField("barcode", e.target.value)}
          placeholder="Manufacturer UPC/EAN or internal code"
        />
      </Field>

      {/* Batch toggles */}
      {isBatch && (
        <>
          <div className="form-check mb-2">
            <input
              type="checkbox"
              className="form-check-input"
              id="trackExpiry"
              checked={form.trackExpiry}
              onChange={(e) =>
                updateField("trackExpiry", e.target.checked)
              }
            />
            <label className="form-check-label" htmlFor="trackExpiry">
              Requires expiry date
            </label>
          </div>
          <div className="form-check mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="trackQualityCert"
              checked={form.trackQualityCert}
              onChange={(e) =>
                updateField("trackQualityCert", e.target.checked)
              }
            />
            <label className="form-check-label" htmlFor="trackQualityCert">
              Requires mill/quality certificate
            </label>
          </div>
        </>
      )}

      {/* Serial toggle */}
      {isSerial && (
        <div className="form-check mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            id="trackWarranty"
            checked={form.trackWarranty}
            onChange={(e) =>
              updateField("trackWarranty", e.target.checked)
            }
          />
          <label className="form-check-label" htmlFor="trackWarranty">
            Requires warranty tracking
          </label>
        </div>
      )}

      {/* ─── STOCK LEVELS PER WAREHOUSE ─────────────────── */}
      {showStockLevels && (
        <>
          <SectionHeader label="Stock levels per warehouse" />

          {form.warehouseRows.map((row) => (
            <div
              key={row.key}
              className="border rounded p-3 mb-3 position-relative"
            >
              <button
                type="button"
                className="btn btn-sm btn-outline-danger position-absolute"
                style={{ top: "0.5rem", right: "0.5rem" }}
                onClick={() => removeWarehouseRow(row.key)}
                title="Remove warehouse"
              >
                <Trash2 size={14} />
              </button>

              <Field label="Warehouse">
                <select
                  className="form-select"
                  value={row.warehouseId}
                  onChange={(e) =>
                    updateWarehouseRow(row.key, "warehouseId", e.target.value)
                  }
                >
                  <option value="">Select warehouse</option>
                  {(warehouses || []).map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <Field label="Min stock">
                  <Input
                    type="number"
                    value={row.minStock}
                    onChange={(e) =>
                      updateWarehouseRow(row.key, "minStock", e.target.value)
                    }
                    min={0}
                  />
                </Field>
                <Field label="Max stock">
                  <Input
                    type="number"
                    value={row.maxStock}
                    onChange={(e) =>
                      updateWarehouseRow(row.key, "maxStock", e.target.value)
                    }
                    min={0}
                  />
                </Field>
                <Field label="Safety stock">
                  <Input
                    type="number"
                    value={row.safetyStock}
                    onChange={(e) =>
                      updateWarehouseRow(row.key, "safetyStock", e.target.value)
                    }
                    min={0}
                  />
                </Field>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            className="w-100 mb-3"
            onClick={addWarehouseRow}
            disabled={availableWarehouses.length === 0}
          >
            <Plus size={14} /> Add warehouse
          </Button>
        </>
      )}

      {/* ─── COSTING & SUPPLIER ─────────────────────────── */}
      <SectionHeader label="Costing & supplier" />

      <Field label="Default supplier">
        <select
          className="form-select"
          value={form.supplierId}
          onChange={(e) => updateField("supplierId", e.target.value)}
        >
          <option value="">Select supplier</option>
          {(suppliers || []).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Last purchase cost">
        <Input
          type="number"
          value={form.lastPurchaseCost}
          onChange={(e) =>
            updateField("lastPurchaseCost", e.target.value)
          }
          min={0}
          step="0.01"
          disabled={isEdit}
          placeholder="Read-only after first receipt"
        />
      </Field>

      <Field label="Selling price">
        <Input
          type="number"
          value={form.sellingPrice}
          onChange={(e) => updateField("sellingPrice", e.target.value)}
          min={0}
          step="0.01"
        />
      </Field>
    </Modal>
  );
}