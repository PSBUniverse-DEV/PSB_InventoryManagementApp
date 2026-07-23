/**
 * Client Component — InventoryConfigView.jsx
 *
 * Configuration master data using external batch staging (admin pattern).
 * Every mutation (add, edit, toggle, delete, reorder) stages its change
 * into a pendingBatch. The header shows a summary and "Save Batch" /
 * "Cancel Batch" buttons that commit or discard everything at once.
 */
"use client";

import "./InventoryConfigView.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button, InlineEditCell, Modal, StatusBadge, TableZ, toastError, toastSuccess,
} from "@/shared/components/ui";
import {
  ENTITY_KEYS, getEntityConfig,
  mapEntityRow,
} from "../data/inventoryHelpers.data.js";
import {
  createEntityAction,
  updateEntityAction,
  hardDeleteEntityAction,
  saveEntityOrderAction,
  loadInventoryConfigData,
} from "../data/inventoryConfig.actions.js";

// ─── HELPERS ────────────────────────────────────────────────

const TEMP_PREFIX = "tmp-entity-";
let _tempCounter = 0;
function createTempId() {
  _tempCounter += 1;
  return `${TEMP_PREFIX}${Date.now()}-${_tempCounter}`;
}
function isTempId(id) {
  return String(id ?? "").startsWith(TEMP_PREFIX);
}

function createEmptyDraft(entityKey) {
  const config = getEntityConfig(entityKey);
  return {
    id: createTempId(),
    name: "",
    [config?.keyField || "key"]: "",
    description: "",
    is_active: true,
    is_active_bool: true,
    display_order: 0,
  };
}

function buildPayload(entityKey, row) {
  const config = getEntityConfig(entityKey);
  const payload = {
    name: String(row?.name || "").trim(),
    description: String(row?.description || "").trim() || null,
    is_active: row?.is_active !== false && row?.is_active !== 0,
    display_order: row?.display_order || 0,
  };
  if (config?.hasKey || config?.hasAbbreviation) {
    payload[config.keyField] = String(row?.[config.keyField] || "").trim();
  }
  return payload;
}

function createEmptyBatchState() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

function mergeUpdatePatch(existing = {}, patch = {}) {
  return { ...existing, ...patch };
}

function removeKey(obj, key) {
  if (!obj) return {};
  const { [key]: _, ...rest } = obj;
  return rest;
}

/**
 * Returns a human-readable batch-change text for a table row.
 * Matches the __batchState convention used by the admin page.
 */
function batchMarker(batchState) {
  if (batchState === "hardDeleted") return { text: "Deleted", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "deleted") return { text: "Deactivated", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "created") return { text: "New", cls: "psb-batch-marker psb-batch-marker-new" };
  if (batchState === "updated") return { text: "Edited", cls: "psb-batch-marker psb-batch-marker-edited" };
  return { text: "", cls: "" };
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function ConfigHeader({ hasPendingChanges, pendingSummary, isBusy, onSaveBatch, onCancelBatch, onAdd, entityLabel }) {
  return (
    <div className="inventory-config-header">
      <div>
        <h1 className="inventory-config-title">Configuration and Settings</h1>
        <p className="inventory-config-subtitle">Manage master data tables for the Inventory module.</p>
      </div>
      <div className="inventory-config-actions">
        <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
          {isBusy ? "Saving batch..." : hasPendingChanges ? `${pendingSummary.total} staged change(s)` : "No changes"}
        </span>
        {hasPendingChanges ? (
          <>
            {pendingSummary.created > 0 ? <span className="psb-batch-chip psb-batch-chip-added">+{pendingSummary.created} Added</span> : null}
            {pendingSummary.updated > 0 ? <span className="psb-batch-chip psb-batch-chip-edited">~{pendingSummary.updated} Edited</span> : null}
            {pendingSummary.deactivated > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.deactivated} Deactivated</span> : null}
            {pendingSummary.hardDeleted > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.hardDeleted} Deleted</span> : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isBusy} disabled={!hasPendingChanges || isBusy} onClick={onSaveBatch}>Save Batch</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isBusy} onClick={onCancelBatch}>Cancel Batch</Button>
        <Button type="button" size="sm" variant="success" disabled={isBusy} onClick={onAdd}>+ Add {entityLabel}</Button>
      </div>
    </div>
  );
}

function ConfigSideNav({ activeEntityKey, onSelect }) {
  return (
    <div className="inventory-config-side-nav">
      <div className="inventory-config-side-nav-label">Master Data</div>
      <div className="inventory-config-side-nav-list">
        {ENTITY_KEYS.map((key) => {
          const config = getEntityConfig(key);
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`inventory-config-side-nav-item${activeEntityKey === key ? " is-active" : ""}`}
            >
              <span className="inventory-config-side-nav-item-title">{config?.label || key}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryConfigView({ configData }) {
  const [activeEntityKey, setActiveEntityKey] = useState("categories");
  const [rows, setRows] = useState({});
  const [seedRows, setSeedRows] = useState({});
  const [isBusy, setIsBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pendingBatch, setPendingBatch] = useState(createEmptyBatchState());
  const batchActiveRef = useRef(false);

  // Load seed data on mount / refresh
  useEffect(() => {
    const initial = {};
    ENTITY_KEYS.forEach((key) => {
      initial[key] = (configData[key] || []).map((r) => mapEntityRow(r));
    });
    setRows(initial);
    setSeedRows(initial);
  }, [configData]);

  const currentRows = useMemo(() => rows[activeEntityKey] || [], [rows, activeEntityKey]);
  const currentSeedRows = useMemo(() => seedRows[activeEntityKey] || [], [seedRows, activeEntityKey]);
  const entityConfig = getEntityConfig(activeEntityKey);
  const entityLabel = entityConfig?.label || "Item";

  //#endregion

  // ─── Pending summary ────────────────────────────────────
  const pendingSummary = useMemo(() => {
    const pb = pendingBatch;
    const created = (pb.creates || []).length;
    const updated = Object.entries(pb.updates || {}).filter(([id, patch]) => {
      const seed = currentSeedRows.find((r) => String(r?.id ?? "") === String(id ?? ""));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const deactivated = (pb.deactivations || []).length;
    const hardDeleted = (pb.hardDeletes || []).length;
    return { created, updated, deactivated, hardDeleted, total: created + updated + deactivated + hardDeleted };
  }, [pendingBatch, currentSeedRows]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedIds = useMemo(() => new Set((pendingBatch.deactivations || []).map((id) => String(id ?? ""))), [pendingBatch.deactivations]);
  const pendingHardDeletedIds = useMemo(() => new Set((pendingBatch.hardDeletes || []).map((id) => String(id ?? ""))), [pendingBatch.hardDeletes]);

  // Decorate rows with __batchState for visual markers
  const decoratedRows = useMemo(() => {
    const cIds = new Set((pendingBatch.creates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.updates || {}).filter(([id, patch]) => {
      const seed = currentSeedRows.find((r) => String(r?.id ?? "") === String(id ?? ""));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.deactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.hardDeletes || []).map((e) => String(e ?? "")));
    return currentRows.map((row) => {
      const id = String(row?.id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [currentRows, currentSeedRows, pendingBatch]);

  // ─── State helpers ──────────────────────────────────────
  const setRowsForActive = useCallback((next) => {
    setRows((prev) => ({ ...prev, [activeEntityKey]: typeof next === "function" ? next(prev[activeEntityKey] || []) : next }));
  }, [activeEntityKey]);

  //#region ─── Actions ────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setIsBusy(true);
    try {
      const data = await loadInventoryConfigData();
      const updated = {};
      ENTITY_KEYS.forEach((key) => {
        updated[key] = (data[key] || []).map((r) => mapEntityRow(r));
      });
      setRows(updated);
      setSeedRows(updated);
      setEditingId(null);
      setPendingBatch(createEmptyBatchState());
      batchActiveRef.current = false;
      toastSuccess("Data refreshed.");
    } catch (err) {
      toastError(err?.message || "Failed to refresh data.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const startEdit = useCallback((row) => {
    if (isBusy) return;
    setEditingId(String(row?.id ?? ""));
  }, [isBusy]);

  const stopEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleInlineEdit = useCallback((row, key, value) => {
    const id = row?.id;
    if (!id || isBusy) return;
    const trimmed = String(value ?? "").trim();
    setRowsForActive((prev) =>
      prev.map((r) => String(r?.id) === String(id) ? { ...r, [key]: trimmed } : r)
    );
    setPendingBatch((prev) => {
      if (isTempId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((e) =>
            String(e?.tempId ?? "") === String(id)
              ? { ...e, payload: { ...e.payload, [key]: trimmed } }
              : e
          ),
          updates: removeKey(prev.updates, id),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { [key]: trimmed }),
        },
      };
    });
    setEditingId(null);
  }, [activeEntityKey, isBusy, setRowsForActive]);

  const addRow = useCallback(() => {
    if (isBusy) return;
    const draft = createEmptyDraft(activeEntityKey);
    const mapped = mapEntityRow(draft);
    setRowsForActive((prev) => [mapped, ...prev]);
    setPendingBatch((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: draft.id, payload: buildPayload(activeEntityKey, draft) }],
    }));
    setEditingId(draft.id);
  }, [activeEntityKey, isBusy, setRowsForActive]);

  const toggleActive = useCallback((row) => {
    if (isBusy || !row?.id) return;
    const id = String(row.id);
    const nextIsActive = !row.is_active_bool;

    setRowsForActive((prev) =>
      prev.map((r) => String(r?.id) === id ? { ...r, is_active: nextIsActive, is_active_bool: nextIsActive } : r)
    );
    setPendingBatch((prev) => {
      // If currently pending deactivation, un-stage it (restore)
      if (pendingDeactivatedIds.has(id)) {
        return {
          ...prev,
          deactivations: prev.deactivations.filter((did) => String(did) !== id),
          updates: mergeUpdatePatch(prev.updates, { [id]: { is_active: true } }),
        };
      }
      if (isTempId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((e) =>
            String(e?.tempId ?? "") === id
              ? { ...e, payload: { ...e.payload, is_active: nextIsActive } }
              : e
          ),
          updates: removeKey(prev.updates, id),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { is_active: nextIsActive }),
        },
      };
    });
    toastSuccess(`Item ${nextIsActive ? "enabled" : "disabled"} staged for Save Batch.`, "Batching");
  }, [activeEntityKey, isBusy, pendingDeactivatedIds, setRowsForActive]);

  const confirmDelete = useCallback((row) => {
    if (isBusy || !row?.id) return;
    const id = String(row.id);
    if (isTempId(id)) {
      // Remove temp row immediately
      setRowsForActive((prev) => prev.filter((r) => String(r?.id) !== id));
      setPendingBatch((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => String(e?.tempId ?? "") !== id),
        updates: removeKey(prev.updates, id),
      }));
      toastSuccess("Staged item removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({
      ...prev,
      deactivations: prev.deactivations.filter((did) => String(did) !== id),
      updates: removeKey(prev.updates, id),
      hardDeletes: [...prev.hardDeletes.filter((did) => String(did) !== id), id],
    }));
    toastSuccess("Item deletion staged for Save Batch.", "Batching");
  }, [activeEntityKey, isBusy, setRowsForActive]);
  //#endregion

  //#region ─── Batch save / cancel ────────────────────────────────
  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isBusy) return;
    setIsBusy(true);
    try {
      const { creates, updates, deactivations, hardDeletes } = pendingBatch;

      // Creates
      for (const item of creates || []) {
        await createEntityAction(activeEntityKey, item.payload);
      }

      // Updates
      for (const [id, patch] of Object.entries(updates || {})) {
        await updateEntityAction(activeEntityKey, id, patch);
      }

      // Deactivations (soft-delete)
      for (const id of deactivations || []) {
        await updateEntityAction(activeEntityKey, id, { is_active: false });
      }

      // Hard deletes
      for (const id of hardDeletes || []) {
        await hardDeleteEntityAction(activeEntityKey, id);
      }

      await refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (err) {
      toastError(err?.message || "Failed to save batch.");
    } finally {
      setIsBusy(false);
    }
  }, [activeEntityKey, hasPendingChanges, isBusy, pendingBatch, pendingSummary.total, refresh]);

  const handleCancelBatch = useCallback(() => {
    if (isBusy) return;
    batchActiveRef.current = false;
    setRows((prev) => ({ ...prev, [activeEntityKey]: currentSeedRows }));
    setPendingBatch(createEmptyBatchState());
    setEditingId(null);
  }, [activeEntityKey, currentSeedRows, isBusy]);
//#endregion
  
// ─── Reorder ────────────────────────────────────────────
  const handleReorder = useCallback((nextRows) => {
    if (isBusy) return;
    const reordered = (Array.isArray(nextRows) ? nextRows : []).map((r, i) => ({ ...r, display_order: i + 1 }));
    setRowsForActive(reordered);
  }, [isBusy, setRowsForActive]);

  // ─── Columns ────────────────────────────────────────────
  const columns = useMemo(() => {
    const cols = [
      {
        key: "name",
        label: "Name",
        width: "30%",
        sortable: true,
        render: (row) => {
          const m = batchMarker(row?.__batchState || "");
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          const editDisabled = !isEditing || isBusy;
          return (
            <span>
              <InlineEditCell
                value={row?.name || ""}
                onCommit={(val) => handleInlineEdit(row, "name", val)}
                onCancel={stopEdit}
                disabled={editDisabled}
              />
              {m.text ? <span className={m.cls}>{m.text}</span> : null}
            </span>
          );
        },
      },
    ];

    if (entityConfig?.hasKey || entityConfig?.hasAbbreviation) {
      cols.push({
        key: entityConfig.keyField,
        label: entityConfig.keyLabel,
        width: "20%",
        sortable: true,
        render: (row) => {
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          const editDisabled = !isEditing || isBusy;
          return (
            <InlineEditCell
              value={row?.[entityConfig.keyField] || ""}
              onCommit={(val) => handleInlineEdit(row, entityConfig.keyField, val)}
              onCancel={stopEdit}
              disabled={editDisabled}
            />
          );
        },
      });
    }
//Description column
    cols.push({
      key: "description",
      label: "Description",
      width: "34%",
      sortable: true,
      render: (row) => {
        const isEditing = String(row?.id ?? "") === String(editingId ?? "");
        const editDisabled = !isEditing || isBusy;
        return (
          <InlineEditCell
            value={row?.description || ""}
            onCommit={(val) => handleInlineEdit(row, "description", val)}
            onCancel={stopEdit}
            disabled={editDisabled}
          />
        );
      },
    });
// IsActive column
    cols.push({
      key: "is_active_bool",
      label: "Active",
      width: "12%",
      sortable: true,
      align: "center",
      render: (row) => (
        <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />
      ),
    
    });
// Order Display column
    cols.push({
  key: "display_order",
  label: "Order",
  width: "8%",
  sortable: true,
  align: "center",
  render: (row) => {
    const isEditing = String(row?.id ?? "") === String(editingId ?? "");
    const editDisabled = !isEditing || isBusy;
    return (
      <InlineEditCell
        value={String(row?.display_order ?? "")}
        onCommit={(val) => handleInlineEdit(row, "display_order", val)}
        onCancel={stopEdit}
        disabled={editDisabled}
      />
    );
  },
});


    return cols;
  }, [editingId, entityConfig, isBusy, handleInlineEdit, stopEdit]);

  const actions = useMemo(() => [
    {
      key: "edit",
      label: "Edit",
      type: "secondary",
      icon: "pen",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => startEdit(r),
    },
    {
      key: "cancel-edit",
      label: "Cancel",
      type: "secondary",
      icon: "xmark",
      visible: (r) => String(r?.id ?? "") === String(editingId ?? ""),
      onClick: () => stopEdit(),
    },
    {
      key: "activate",
      label: "Activate",
      type: "secondary",
      icon: "check",
      visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedIds.has(String(r?.id ?? ""))) && String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => toggleActive(r),
    },
    {
      key: "deactivate",
      label: "Deactivate",
      type: "secondary",
      icon: "ban",
      visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedIds.has(String(r?.id ?? "")) && String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => toggleActive(r),
    },
    {
      key: "delete",
      label: "Delete",
      type: "danger",
      icon: "trash",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      confirm: true,
      confirmMessage: (r) => `Permanently delete ${r?.name || "this item"}? This action cannot be undone.`,
      disabled: () => isBusy,
      onClick: (r) => confirmDelete(r),
    },
  ], [editingId, isBusy, pendingDeactivatedIds, startEdit, stopEdit, toggleActive, confirmDelete]);

  // ─── Render ─────────────────────────────────────────────
  return (
    <main className="inventory-config-layout">
      <ConfigHeader
        hasPendingChanges={hasPendingChanges}
        pendingSummary={pendingSummary}
        isBusy={isBusy}
        onSaveBatch={handleSaveBatch}
        onCancelBatch={handleCancelBatch}
        onAdd={addRow}
        entityLabel={entityLabel}
      />

      <div className="inventory-config-split">
        {/* Mobile nav */}
        <div className="inventory-config-mobile-nav">
          <select
            className="form-select"
            value={activeEntityKey}
            onChange={(e) => { setActiveEntityKey(e.target.value); setEditingId(null); }}
            aria-label="Select master data"
          >
            {ENTITY_KEYS.map((key) => (
              <option key={key} value={key}>{getEntityConfig(key)?.label || key}</option>
            ))}
          </select>
        </div>

        <div className="inventory-config-panel">
          <ConfigSideNav
            activeEntityKey={activeEntityKey}
            onSelect={(key) => { setActiveEntityKey(key); setEditingId(null); }}
          />
        </div>

        <div className="inventory-config-content">
          <div className="inventory-config-table-header">
            <div>
              <div className="inventory-config-editor-title">{entityConfig?.label || "Items"}</div>
              <div className="inventory-config-editor-description">{entityConfig?.description || ""}</div>
            </div>
          </div>

          <TableZ
            data={decoratedRows}
            columns={columns}
            rowIdKey="id"
            actions={actions}
            draggable={!isBusy && !hasPendingChanges}
            onReorder={handleReorder}
            hideSearch
            hideFooter
            emptyMessage={`No ${entityConfig?.label?.toLowerCase() || "items"} found.`}
          />
        </div>
      </div>
    </main>
  );
}