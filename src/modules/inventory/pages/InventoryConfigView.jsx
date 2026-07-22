/**
 * Client Component — InventoryConfigView.jsx
 *
 * Configuration page for inventory master data.
 * Follows the same batch-editing pattern as admin/application-setup.
 *
 * Manages: Categories, Units of Measure, Equipment Statuses, Warehouse Types.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  ENTITY_CONFIGS, ENTITY_KEYS, getEntityConfig,
  mapEntityRow, isSameId, compareText, buildOrderSignature,
  removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_ENTITY_PREFIX, createTempId,
  isTempEntityId, createEmptyBatchState, executeBatchSave,
} from "../data/inventoryHelpers.data.js";
import {
  createEntityAction,
  updateEntityAction,
  deactivateEntityAction,
  hardDeleteEntityAction,
  saveEntityOrderAction,
} from "../data/inventoryConfig.actions.js";

// ─── HOOK: useEntityConfig ──────────────────────────────────

function useEntityConfig({ seedData = {} }) {
  const [activeEntityKey, setActiveEntityKey] = useState("categories");
  const [orderedRows, setOrderedRows] = useState({});
  const [persistedOrderSig, setPersistedOrderSig] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingBatch, setPendingBatch] = useState({});
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [draft, setDraft] = useState({ name: "", key: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const batchActiveRef = useRef(false);

  // Initialize seed data
  useEffect(() => {
    const initialRows = {};
    const initialSigs = {};
    ENTITY_KEYS.forEach((key) => {
      const rows = (seedData[key] || []).map((r, i) => mapEntityRow(r, i));
      initialRows[key] = rows;
      initialSigs[key] = buildOrderSignature(rows);
    });
    setOrderedRows(initialRows);
    setPersistedOrderSig(initialSigs);
    setPendingBatch({});
    setDialog(EMPTY_DIALOG);
    setDraft({ name: "", key: "", description: "" });
    setEditingId(null);
    setIsSaving(false);
    setIsMutating(false);
  }, [seedData]);

  const currentRows = orderedRows[activeEntityKey] || [];
  const currentSeed = useMemo(
    () => (seedData[activeEntityKey] || []).map((r, i) => mapEntityRow(r, i)),
    [seedData, activeEntityKey],
  );

  const currentOrderSig = useMemo(() => {
    const excluded = new Set([
      ...(pendingBatch[activeEntityKey]?.creates || []).map((e) => String(e?.tempId ?? "")),
      ...(pendingBatch[activeEntityKey]?.deactivations || []).map((id) => String(id ?? "")),
      ...(pendingBatch[activeEntityKey]?.hardDeletes || []).map((id) => String(id ?? "")),
    ]);
    return buildOrderSignature(currentRows.filter((r) => !excluded.has(String(r?.id ?? ""))));
  }, [currentRows, pendingBatch, activeEntityKey]);

  const persistedOrderSigFiltered = useMemo(() => {
    const excluded = new Set([
      ...(pendingBatch[activeEntityKey]?.deactivations || []).map((id) => String(id ?? "")),
      ...(pendingBatch[activeEntityKey]?.hardDeletes || []).map((id) => String(id ?? "")),
    ]);
    return buildOrderSignature(currentSeed.filter((r) => !excluded.has(String(r?.id ?? ""))));
  }, [currentSeed, pendingBatch, activeEntityKey]);

  const hasOrderChanges = persistedOrderSigFiltered !== currentOrderSig;

  const pendingSummary = useMemo(() => {
    const batch = pendingBatch[activeEntityKey] || createEmptyBatchState();
    const a = batch.creates.length;
    const e = Object.entries(batch.updates || {}).filter(([id, patch]) => {
      const seed = currentSeed.find((r) => isSameId(r?.id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const d = batch.deactivations.length;
    const h = (batch.hardDeletes || []).length;
    const o = hasOrderChanges ? 1 : 0;
    return { added: a, edited: e, deactivated: d, hardDeleted: h, orderChanged: o, total: a + e + d + h + o };
  }, [pendingBatch, activeEntityKey, currentSeed, hasOrderChanges]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedIds = useMemo(
    () => new Set((pendingBatch[activeEntityKey]?.deactivations || []).map((id) => String(id ?? ""))),
    [pendingBatch, activeEntityKey],
  );
  const pendingHardDeletedIds = useMemo(
    () => new Set((pendingBatch[activeEntityKey]?.hardDeletes || []).map((id) => String(id ?? ""))),
    [pendingBatch, activeEntityKey],
  );

  const decoratedRows = useMemo(() => {
    const batch = pendingBatch[activeEntityKey] || createEmptyBatchState();
    const cIds = new Set((batch.creates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(batch.updates || {}).filter(([id, patch]) => {
      const seed = currentSeed.find((r) => isSameId(r?.id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((batch.deactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((batch.hardDeletes || []).map((e) => String(e ?? "")));
    return currentRows.map((row) => {
      const id = String(row?.id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [currentRows, pendingBatch, activeEntityKey, currentSeed]);

  const getBatch = useCallback((key) => pendingBatch[key] || createEmptyBatchState(), [pendingBatch]);
  const setBatch = useCallback((key, updater) => {
    setPendingBatch((prev) => ({ ...prev, [key]: updater(prev[key] || createEmptyBatchState()) }));
  }, []);

  const handleReorder = useCallback((next) => {
    if (isSaving || isMutating) return;
    setOrderedRows((prev) => ({
      ...prev,
      [activeEntityKey]: (Array.isArray(next) ? next : []).map((r, i) => ({ ...r, display_order: i + 1 })),
    }));
  }, [isSaving, isMutating, activeEntityKey]);

  const handleCancel = useCallback(() => {
    if (isSaving || isMutating) return;
    batchActiveRef.current = false;
    setOrderedRows((prev) => ({ ...prev, [activeEntityKey]: [...currentSeed] }));
    setPendingBatch((prev) => ({ ...prev, [activeEntityKey]: createEmptyBatchState() }));
    setDialog(EMPTY_DIALOG);
    setDraft({ name: "", key: "", description: "" });
    setEditingId(null);
  }, [isSaving, isMutating, activeEntityKey, currentSeed]);

  const handleSave = useCallback(async () => {
    if (!hasPendingChanges || isSaving || isMutating) return;
    setIsSaving(true);
    setIsMutating(true);
    try {
      const batch = pendingBatch[activeEntityKey] || createEmptyBatchState();
      const serverActions = {
        createAction: (payload) => createEntityAction(activeEntityKey, payload),
        updateAction: (id, updates) => updateEntityAction(activeEntityKey, id, updates),
        deactivateAction: (id) => deactivateEntityAction(activeEntityKey, id),
        hardDeleteAction: (id) => hardDeleteEntityAction(activeEntityKey, id),
        saveOrderAction: (entityKey, ids) => saveEntityOrderAction(entityKey, ids),
      };
      await executeBatchSave(activeEntityKey, batch, currentRows, serverActions);
      setPendingBatch((prev) => ({ ...prev, [activeEntityKey]: createEmptyBatchState() }));
      setPersistedOrderSig((prev) => ({ ...prev, [activeEntityKey]: currentOrderSig }));
      batchActiveRef.current = false;
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutating(false);
      setIsSaving(false);
      setEditingId(null);
    }
  }, [hasPendingChanges, isSaving, isMutating, pendingBatch, activeEntityKey, currentRows, currentOrderSig, pendingSummary.total]);

  const openAddDialog = useCallback(() => {
    if (isSaving || isMutating) return;
    setDraft({ name: "", key: "", description: "" });
    setDialog({ kind: "add", target: null, nextIsActive: true });
  }, [isSaving, isMutating]);

  const openEditDialog = useCallback((row) => {
    if (isSaving || isMutating) return;
    const config = getEntityConfig(activeEntityKey);
    setDraft({
      name: String(row?.name || ""),
      key: String(row?.[config?.keyField || "key"] || ""),
      description: String(row?.description || ""),
    });
    setDialog({ kind: "edit", target: row, nextIsActive: null });
  }, [isSaving, isMutating, activeEntityKey]);

  const openToggleDialog = useCallback((row) => {
    if (isSaving || isMutating) return;
    const id = String(row?.id ?? "");
    if (pendingDeactivatedIds.has(id)) {
      setBatch(activeEntityKey, (prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((did) => !isSameId(did, id)),
      }));
      toastSuccess("Deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isSaving, isMutating, activeEntityKey, pendingDeactivatedIds, setBatch]);

  const openDeactivateDialog = useCallback((row) => {
    if (isSaving || isMutating) return;
    setDialog({ kind: "deactivate", target: row, nextIsActive: null });
  }, [isSaving, isMutating]);

  const stageHardDelete = useCallback((row) => {
    const id = String(row?.id ?? "");
    if (!id || isSaving || isMutating) return;
    if (isTempEntityId(id)) {
      setOrderedRows((prev) => ({
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].filter((r) => !isSameId(r?.id, id)).map((r, i) => ({ ...r, display_order: i + 1 })),
      }));
      setBatch(activeEntityKey, (prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, id)),
        updates: removeObjectKey(prev.updates, id),
      }));
      toastSuccess("Staged item removed.", "Batching");
      return;
    }
    setBatch(activeEntityKey, (prev) => ({
      ...prev,
      updates: removeObjectKey(prev.updates, id),
      deactivations: (prev.deactivations || []).filter((did) => !isSameId(did, id)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], id),
    }));
    toastSuccess("Deletion staged for Save Batch.", "Batching");
  }, [isSaving, isMutating, activeEntityKey, setBatch]);

  const unstageHardDelete = useCallback((row) => {
    const id = String(row?.id ?? "");
    if (!id || isSaving || isMutating) return;
    setBatch(activeEntityKey, (prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((hid) => !isSameId(hid, id)),
    }));
    toastSuccess("Deletion un-staged.", "Batching");
  }, [isSaving, isMutating, activeEntityKey, setBatch]);

  const submitAdd = useCallback(() => {
    const name = String(draft.name || "").trim();
    if (!name) { toastError("Name is required."); return; }
    const config = getEntityConfig(activeEntityKey);
    const key = String(draft.key || "").trim();
    const description = String(draft.description || "").trim();
    const tempId = createTempId(TEMP_ENTITY_PREFIX);
    const newRow = mapEntityRow({
      id: tempId,
      name,
      key,
      abbreviation: key,
      description,
      display_order: currentRows.length + 1,
      is_active: true,
    }, currentRows.length);
    setOrderedRows((prev) => ({ ...prev, [activeEntityKey]: [...prev[activeEntityKey], newRow] }));
    setBatch(activeEntityKey, (prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId, payload: { name, key, abbreviation: key, description, is_active: true } }],
    }));
    setDialog(EMPTY_DIALOG);
    setDraft({ name: "", key: "", description: "" });
    toastSuccess("Item staged for Save Batch.", "Batching");
  }, [draft, activeEntityKey, currentRows.length, setBatch]);

  const submitEdit = useCallback(() => {
    const row = dialog?.target;
    if (!row?.id) { toastError("Invalid item."); return; }
    const name = String(draft.name || "").trim();
    if (!name) { toastError("Name is required."); return; }
    const config = getEntityConfig(activeEntityKey);
    const key = String(draft.key || "").trim();
    const description = String(draft.description || "").trim();
    const id = row.id;
    const keyField = config?.keyField || "key";
    setOrderedRows((prev) => ({
      ...prev,
      [activeEntityKey]: prev[activeEntityKey].map((r) => isSameId(r?.id, id) ? mapEntityRow({ ...r, name, [keyField]: key, description }, r.display_order - 1) : r),
    }));
    setBatch(activeEntityKey, (prev) => {
      if (isTempEntityId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, id) ? { ...e, payload: { ...e.payload, name, key, abbreviation: key, description } } : e),
          updates: removeObjectKey(prev.updates, id),
        };
      }
      return { ...prev, updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { name, key, abbreviation: key, description }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Update staged for Save Batch.", "Batching");
  }, [dialog, draft, activeEntityKey, setBatch]);

  const submitToggle = useCallback(() => {
    const row = dialog?.target;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.id) { toastError("Invalid item."); return; }
    const id = row.id;
    setOrderedRows((prev) => ({
      ...prev,
      [activeEntityKey]: prev[activeEntityKey].map((r) => isSameId(r?.id, id) ? mapEntityRow({ ...r, is_active: nextIsActive }, r.display_order - 1) : r),
    }));
    setBatch(activeEntityKey, (prev) => {
      if (isTempEntityId(id)) {
        return { ...prev, creates: prev.creates.map((e) => isSameId(e?.tempId, id) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e), updates: removeObjectKey(prev.updates, id) };
      }
      return { ...prev, updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { is_active: nextIsActive }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`${nextIsActive ? "Enable" : "Disable"} staged for Save Batch.`, "Batching");
  }, [dialog, activeEntityKey, setBatch]);

  const submitDeactivate = useCallback(() => {
    const row = dialog?.target;
    if (!row?.id) { toastError("Invalid item."); return; }
    const id = row.id;
    if (isTempEntityId(id)) {
      setOrderedRows((prev) => ({
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].filter((r) => !isSameId(r?.id, id)).map((r, i) => ({ ...r, display_order: i + 1 })),
      }));
      setBatch(activeEntityKey, (prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, id)),
        updates: removeObjectKey(prev.updates, id),
        deactivations: (prev.deactivations || []).filter((did) => !isSameId(did, id)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Deactivation staged for Save Batch.", "Batching");
      return;
    }
    setBatch(activeEntityKey, (prev) => ({
      ...prev,
      updates: removeObjectKey(prev.updates, id),
      deactivations: appendUniqueId(prev.deactivations, id),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Deactivation staged for Save Batch.", "Batching");
  }, [dialog, activeEntityKey, setBatch]);

  const handleInlineEdit = useCallback((row, key, value) => {
    const id = row?.id;
    if (!id || isSaving || isMutating) return;
    setOrderedRows((prev) => ({
      ...prev,
      [activeEntityKey]: prev[activeEntityKey].map((r, i) => isSameId(r?.id, id) ? mapEntityRow({ ...r, [key]: value || null }, i) : r),
    }));
    setBatch(activeEntityKey, (prev) => {
      if (isTempEntityId(id)) {
        return { ...prev, creates: prev.creates.map((e) => isSameId(e?.tempId, id) ? { ...e, payload: { ...e.payload, [key]: value || null } } : e) };
      }
      return { ...prev, updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { [key]: value || null }) } };
    });
  }, [isSaving, isMutating, activeEntityKey, setBatch]);

  return {
    activeEntityKey, setActiveEntityKey,
    decoratedRows, dialog, draft, isSaving, isMutating,
    pendingSummary, hasPendingChanges, pendingDeactivatedIds, pendingHardDeletedIds,
    setDialog, setDraft,
    handleReorder, handleCancel, handleSave,
    openAddDialog, openEditDialog, openToggleDialog, openDeactivateDialog,
    stageHardDelete, unstageHardDelete,
    submitAdd, submitEdit, submitToggle, submitDeactivate,
    handleInlineEdit,
    editingId, setEditingId,
  };
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function batchMarker(batchState) {
  if (batchState === "hardDeleted") return { text: "Deleted", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "deleted") return { text: "Deactivated", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "created") return { text: "New", cls: "psb-batch-marker psb-batch-marker-new" };
  if (batchState === "updated") return { text: "Edited", cls: "psb-batch-marker psb-batch-marker-edited" };
  return { text: "", cls: "" };
}

function ConfigHeader({ hasPendingChanges, pendingSummary, isSaving, isMutating, handleSave, handleCancel, openAddDialog, entityLabel }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Configuration and Settings</h1>
        <p className="text-muted mb-0">Manage master data tables for the Inventory module.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
          {isMutating || isSaving ? "Saving batch..." : hasPendingChanges ? `${pendingSummary.total} staged change(s)` : "No changes"}
        </span>
        {hasPendingChanges ? (
          <>
            {pendingSummary.added > 0 ? <span className="psb-batch-chip psb-batch-chip-added">+{pendingSummary.added} Added</span> : null}
            {pendingSummary.edited > 0 ? <span className="psb-batch-chip psb-batch-chip-edited">~{pendingSummary.edited} Edited</span> : null}
            {pendingSummary.deactivated > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.deactivated} Deactivated</span> : null}
            {pendingSummary.orderChanged > 0 ? <span className="psb-batch-chip psb-batch-chip-order">Reordered</span> : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSaving} disabled={!hasPendingChanges || isSaving || isMutating} onClick={handleSave}>Save Batch</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSaving || isMutating} onClick={handleCancel}>Cancel Batch</Button>
        <Button type="button" size="sm" variant="success" disabled={isSaving || isMutating} onClick={openAddDialog}>+ Add {entityLabel}</Button>
      </div>
    </div>
  );
}

function ConfigSideNav({ activeEntityKey, onSelect, pendingSummaryMap }) {
  const navItems = ENTITY_KEYS.map((key) => {
    const config = getEntityConfig(key);
    const summary = pendingSummaryMap[key] || { total: 0 };
    return { key, label: config?.label || key, hasChanges: summary.total > 0 };
  });

  return (
    <div className="setup-side-nav">
      <div className="setup-side-nav-label">Master Data</div>
      <div className="setup-side-nav-list">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`setup-side-nav-item${activeEntityKey === item.key ? " is-active" : ""}`}
          >
            <span className="setup-side-nav-item-main">
              <span className="setup-side-nav-item-title">{item.label}</span>
            </span>
            <span className="setup-side-nav-item-end">
              {item.hasChanges && <span className="setup-side-nav-dirty-dot" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfigTable({
  rows, entityKey, isSaving, isMutating,
  pendingDeactivatedIds,
  editingId, onStartEditing, onStopEditing, onInlineEdit,
  openEditDialog, openToggleDialog, openDeactivateDialog, stageHardDelete, onUndoBatchAction,
  handleReorder,
}) {
  const config = getEntityConfig(entityKey);

  const columns = useMemo(() => {
    const cols = [
      {
        key: "name", label: "Name", width: "28%", sortable: true,
        render: (row) => {
          const m = batchMarker(row?.__batchState || "");
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          const editDisabled = !isEditing || isSaving || isMutating;
          return (
            <span>
              <InlineEditCell value={row?.name || ""} onCommit={(val) => onInlineEdit?.(row, "name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {m.text ? <span className={m.cls}>{m.text}</span> : null}
            </span>
          );
        },
      },
    ];

    if (config?.hasKey || config?.hasAbbreviation) {
      cols.push({
        key: config.keyField, label: config.keyLabel, width: "18%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          const editDisabled = !isEditing || isSaving || isMutating;
          return <InlineEditCell value={row?.[config.keyField] || ""} onCommit={(val) => onInlineEdit?.(row, config.keyField, val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      });
    }

    cols.push({
      key: "description", label: "Description", width: "34%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.id ?? "") === String(editingId ?? "");
        const editDisabled = !isEditing || isSaving || isMutating;
        return <InlineEditCell value={row?.description || ""} onCommit={(val) => onInlineEdit?.(row, "description", val)} onCancel={onStopEditing} disabled={editDisabled} />;
      },
    });

    cols.push({
      key: "is_active_bool", label: "Active", width: "12%", sortable: true, align: "center",
      render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
    });

    return cols;
  }, [editingId, isSaving, isMutating, onInlineEdit, onStopEditing, config]);

  const actions = useMemo(() => [
    {
      key: "edit", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isSaving || isMutating,
      onClick: (r) => onStartEditing(r),
    },
    {
      key: "cancel-edit", label: "Cancel", type: "secondary", icon: "xmark",
      visible: (r) => String(r?.id ?? "") === String(editingId ?? ""),
      onClick: () => onStopEditing(),
    },
    {
      key: "restore", label: "Restore", type: "secondary", icon: "rotate-left",
      visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedIds.has(String(r?.id ?? ""))) && String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isSaving || isMutating,
      onClick: (r) => openToggleDialog(r),
    },
    {
      key: "deactivate", label: "Deactivate", type: "secondary", icon: "ban",
      visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedIds.has(String(r?.id ?? "")) && String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isSaving || isMutating,
      onClick: (r) => openDeactivateDialog(r),
    },
    {
      key: "delete", label: "Delete", type: "danger", icon: "trash",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      confirm: true,
      confirmMessage: (r) => `Permanently delete ${r?.name || "this item"}? This action cannot be undone.`,
      disabled: () => isSaving || isMutating,
      onClick: (r) => stageHardDelete(r),
    },
  ], [editingId, isSaving, isMutating, onStartEditing, onStopEditing, openDeactivateDialog, openToggleDialog, pendingDeactivatedIds, stageHardDelete]);

  return (
    <TableZ
      columns={columns}
      data={rows}
      rowIdKey="id"
      actions={actions}
      hideFooter
      draggable={!isSaving && !isMutating}
      onReorder={handleReorder}
      emptyMessage={`No ${config?.label?.toLowerCase() || "items"} found.`}
      onUndoBatchAction={onUndoBatchAction}
    />
  );
}

function ConfigDialog({ dialog, draft, entityKey, isMutating, setDraft, closeDialog, submitAdd, submitEdit, submitToggle, submitDeactivate }) {
  const kind = dialog?.kind;
  const config = getEntityConfig(entityKey);

  const dialogTitle = useMemo(() => {
    const titles = {
      add: `Add ${config?.label || "Item"}`,
      edit: `Edit ${config?.label || "Item"}`,
      toggle: `${dialog?.nextIsActive ? "Enable" : "Disable"} ${config?.label || "Item"}`,
      deactivate: `Deactivate ${config?.label || "Item"}`,
    };
    return titles[kind] || "";
  }, [kind, config?.label, dialog?.nextIsActive]);

  if (!kind) return null;
  const isBusy = isMutating;
  const submitMap = { add: submitAdd, edit: submitEdit, toggle: submitToggle, deactivate: submitDeactivate };
  const footerConfig = {
    add: { label: `Add ${config?.label || "Item"}`, variant: "success" },
    edit: { label: "Save", variant: "primary" },
    toggle: { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" },
    deactivate: { label: "Deactivate", variant: "warning" },
  };
  const fc = footerConfig[kind] || { label: "OK", variant: "primary" };
  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
      <Button type="button" variant={fc.variant} onClick={submitMap[kind]} loading={isBusy}>{fc.label}</Button>
    </>
  );
  const isForm = kind === "add" || kind === "edit";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} footer={footer}>
      {isForm ? (
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label mb-1">Name</label>
            <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder={config?.namePlaceholder || "Enter name"} autoFocus />
          </div>
          {(config?.hasKey || config?.hasAbbreviation) ? (
            <div>
              <label className="form-label mb-1">{config.keyLabel}</label>
              <Input value={draft.key} onChange={(e) => setDraft((p) => ({ ...p, key: e.target.value }))} placeholder={config?.keyPlaceholder || "Enter key"} />
              <small className="text-muted d-block mt-1">Unique identifier used internally.</small>
            </div>
          ) : null}
          <div>
            <label className="form-label mb-1">Description</label>
            <Input as="textarea" rows={3} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Enter description" />
          </div>
        </div>
      ) : null}
      {kind === "toggle" ? <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} <strong>{dialog?.target?.name || ""}</strong>?</p> : null}
      {kind === "deactivate" ? <p className="mb-0 text-danger">Deactivate <strong>{dialog?.target?.name || ""}</strong>?</p> : null}
    </Modal>
  );
}

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryConfigView({ configData }) {
  const h = useEntityConfig({ seedData: configData });

  const entityConfig = getEntityConfig(h.activeEntityKey);
  const entityLabel = entityConfig?.label || "Item";

  // Build pending summary map for side nav
  const pendingSummaryMap = useMemo(() => {
    const map = {};
    ENTITY_KEYS.forEach((key) => {
      const batch = h.pendingBatch?.[key];
      if (!batch) { map[key] = { total: 0 }; return; }
      const total = (batch.creates?.length || 0) + Object.keys(batch.updates || {}).length + (batch.deactivations?.length || 0) + (batch.hardDeletes?.length || 0);
      map[key] = { total };
    });
    return map;
  }, [h.pendingBatch]);

  return (
    <main className="container py-4">
      <ConfigHeader
        hasPendingChanges={h.hasPendingChanges}
        pendingSummary={h.pendingSummary}
        isSaving={h.isSaving}
        isMutating={h.isMutating}
        handleSave={h.handleSave}
        handleCancel={h.handleCancel}
        openAddDialog={h.openAddDialog}
        entityLabel={entityLabel}
      />

      <div className="setup-split-layout">
        <ConfigSideNav
          activeEntityKey={h.activeEntityKey}
          onSelect={h.setActiveEntityKey}
          pendingSummaryMap={pendingSummaryMap}
        />

        <div className="setup-content-pane">
          <div className="setup-content-panel">
            <div className="setup-editor-card">
              <div className="setup-table-header">
                <div>
                  <div className="setup-editor-title">{entityConfig?.label || "Items"}</div>
                  <div className="setup-editor-description">{entityConfig?.description || ""}</div>
                </div>
              </div>

              <ConfigTable
                rows={h.decoratedRows}
                entityKey={h.activeEntityKey}
                isSaving={h.isSaving}
                isMutating={h.isMutating}
                pendingDeactivatedIds={h.pendingDeactivatedIds}
                editingId={h.editingId}
                onStartEditing={h.setEditingId}
                onStopEditing={() => h.setEditingId(null)}
                onInlineEdit={h.handleInlineEdit}
                openEditDialog={h.openEditDialog}
                openToggleDialog={h.openToggleDialog}
                openDeactivateDialog={h.openDeactivateDialog}
                stageHardDelete={h.stageHardDelete}
                onUndoBatchAction={h.unstageHardDelete}
                handleReorder={h.handleReorder}
              />
            </div>
          </div>
        </div>
      </div>

      <ConfigDialog
        dialog={h.dialog}
        draft={h.draft}
        entityKey={h.activeEntityKey}
        isMutating={h.isMutating}
        setDraft={h.setDraft}
        closeDialog={() => h.setDialog(EMPTY_DIALOG)}
        submitAdd={h.submitAdd}
        submitEdit={h.submitEdit}
        submitToggle={h.submitToggle}
        submitDeactivate={h.submitDeactivate}
      />
    </main>
  );
}