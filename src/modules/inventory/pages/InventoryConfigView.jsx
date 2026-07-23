/**
 * Client Component — InventoryConfigView.jsx
 *
 * Configuration master data using inline/batch editing.
 * Add, edit, toggle active status, reorder, and delete rows directly in the
 * table, then save the whole batch with one action.
 */
"use client";

import "./InventoryConfigView.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Modal, StatusBadge, TableZ, toastError, toastSuccess,
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

function createEmptyDraft(entityKey) {
  const config = getEntityConfig(entityKey);
  return {
    id: `tmp-${entityKey}-${Date.now()}`,
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
    payload[config.keyField] = String(row?.[config.keyField] || "").trim() || null;
  }
  return payload;
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function ConfigHeader({ isBusy, onRefresh, openAddRow, entityLabel }) {
  return (
    <div className="inventory-config-header">
      <div>
        <h1 className="inventory-config-title">Configuration and Settings</h1>
        <p className="inventory-config-subtitle">Manage master data tables for the Inventory module.</p>
      </div>
      <div className="inventory-config-actions">
        <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={onRefresh}>Refresh</Button>
        <Button type="button" size="sm" variant="success" disabled={isBusy} onClick={openAddRow}>+ Add {entityLabel}</Button>
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

function BatchControls({ diff, onSave, onCancel, isBusy }) {
  if (!diff?.hasPendingChanges) return null;
  return (
    <div className="inventory-config-batch-controls">
      <span className={`inventory-config-batch-summary${diff.hasPendingChanges ? " is-dirty" : ""}`}>
        {diff.newRows > 0 && <span>{diff.newRows} new</span>}
        {diff.modifiedRows > 0 && <span>{diff.modifiedRows} modified</span>}
        {diff.removedRows > 0 && <span>{diff.removedRows} removed</span>}
      </span>
      <div className="inventory-config-batch-actions">
        <Button type="button" size="sm" variant="success" onClick={onSave} loading={isBusy}>Save changes</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isBusy}>Cancel</Button>
      </div>
    </div>
  );
}

function StatusToggle({ active, onChange, disabled }) {
  return (
    <button
      type="button"
      className="inventory-config-status-toggle"
      onClick={onChange}
      disabled={disabled}
      aria-label={active ? "Deactivate" : "Activate"}
    >
      <StatusBadge status={active ? "active" : "inactive"} />
    </button>
  );
}

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryConfigView({ configData }) {
  const [activeEntityKey, setActiveEntityKey] = useState("categories");
  const [rows, setRows] = useState({});
  const [isBusy, setIsBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [dialog, setDialog] = useState({ kind: null, target: null });

  useEffect(() => {
    const initial = {};
    ENTITY_KEYS.forEach((key) => {
      initial[key] = (configData[key] || []).map((r) => mapEntityRow(r));
    });
    setRows(initial);
  }, [configData]);

  const currentRows = useMemo(() => rows[activeEntityKey] || [], [rows, activeEntityKey]);
  const entityConfig = getEntityConfig(activeEntityKey);
  const entityLabel = entityConfig?.label || "Item";

  const batchFields = useMemo(() => {
    const fields = [{ key: "name", type: "text" }];
    if (entityConfig?.hasKey || entityConfig?.hasAbbreviation) {
      fields.push({ key: entityConfig.keyField, type: "text" });
    }
    fields.push({ key: "description", type: "text" });
    fields.push({ key: "is_active", type: "boolean" });
    return fields;
  }, [entityConfig]);

  const refresh = useCallback(async () => {
    setIsBusy(true);
    try {
      const data = await loadInventoryConfigData();
      const updated = {};
      ENTITY_KEYS.forEach((key) => {
        updated[key] = (data[key] || []).map((r) => mapEntityRow(r));
      });
      setRows(updated);
      setEditingId(null);
      toastSuccess("Data refreshed.");
    } catch (err) {
      toastError(err?.message || "Failed to refresh data.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const setRowsForActive = useCallback((next) => {
    setRows((prev) => ({ ...prev, [activeEntityKey]: next }));
  }, [activeEntityKey]);

  const startEdit = useCallback((row) => {
    if (isBusy) return;
    setEditingId(String(row?.id ?? ""));
  }, [isBusy]);

  const stopEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleInlineEdit = useCallback((row, key, value) => {
    const id = row?.id;
    if (!id) return;
    setRows((prev) => ({
      ...prev,
      [activeEntityKey]: prev[activeEntityKey].map((r) =>
        String(r?.id) === String(id) ? { ...r, [key]: value || null } : r
      ),
    }));
    setEditingId(null);
  }, [activeEntityKey]);

  const addRow = useCallback(() => {
    if (isBusy) return;
    const draft = createEmptyDraft(activeEntityKey);
    setRowsForActive([mapEntityRow(draft), ...currentRows]);
    setEditingId(draft.id);
  }, [activeEntityKey, currentRows, isBusy, setRowsForActive]);

  const toggleActive = useCallback((row) => {
    if (isBusy || !row?.id) return;
    const nextIsActive = !row.is_active_bool;
    setRows((prev) => ({
      ...prev,
      [activeEntityKey]: prev[activeEntityKey].map((r) =>
        String(r?.id) === String(row.id)
          ? { ...r, is_active: nextIsActive, is_active_bool: nextIsActive }
          : r
      ),
    }));
  }, [activeEntityKey, isBusy]);

  const confirmDelete = useCallback((row) => {
    if (isBusy || !row?.id) return;
    setDialog({ kind: "delete", target: row });
  }, [isBusy]);

  const handleBatchChange = useCallback((payload) => {
    const { type } = payload || {};
    if (!type) return;

    if (type === "create") {
      setRowsForActive((prev) => [payload.row, ...prev]);
    } else if (type === "delete") {
      setRowsForActive((prev) => prev.filter((r) => String(r?.id) !== String(payload.rowId)));
    } else if (type === "update") {
      setRows((prev) => ({
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].map((r) =>
          String(r?.id) === String(payload.rowId) ? { ...r, ...payload.updates } : r,
        ),
      }));
    } else if (type === "cancel" || type === "reorder") {
      setRows((prev) => ({ ...prev, [activeEntityKey]: payload.rows }));
    }
  }, [activeEntityKey, setRowsForActive]);

  const handleBatchSave = useCallback(async (payload) => {
    setIsBusy(true);
    try {
      const { created, updated, deleted } = payload || {};

      for (const item of created || []) {
        await createEntityAction(activeEntityKey, buildPayload(activeEntityKey, item.data));
      }

      for (const item of updated || []) {
        await updateEntityAction(activeEntityKey, item.id, buildPayload(activeEntityKey, item.data));
      }

      for (const item of deleted || []) {
        await hardDeleteEntityAction(activeEntityKey, item.id);
      }

      await refresh();
      toastSuccess("Changes saved.");
    } catch (err) {
      toastError(err?.message || "Failed to save changes.");
    } finally {
      setIsBusy(false);
    }
  }, [activeEntityKey, refresh]);

  const handleReorder = useCallback(async (nextRows) => {
    if (isBusy) return;
    const reordered = (Array.isArray(nextRows) ? nextRows : []).map((r, i) => ({ ...r, display_order: i + 1 }));
    setRowsForActive(reordered);

    setIsBusy(true);
    try {
      const ids = reordered.map((r) => r.id).filter(Boolean);
      await saveEntityOrderAction(activeEntityKey, ids);
      toastSuccess("Order saved.");
    } catch (err) {
      toastError(err?.message || "Failed to save order.");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [activeEntityKey, isBusy, refresh, setRowsForActive]);

  const executeDelete = useCallback(async () => {
    const row = dialog?.target;
    if (!row?.id) return;
    setDialog({ kind: null, target: null });

    setIsBusy(true);
    try {
      await hardDeleteEntityAction(activeEntityKey, row.id);
      setRows((prev) => ({
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].filter((r) => String(r?.id) !== String(row.id)),
      }));
      toastSuccess(`"${row.name}" deleted.`);
    } catch (err) {
      toastError(err?.message || "Failed to delete.");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [activeEntityKey, dialog, refresh]);

  const columns = useMemo(() => {
    const cols = [
      {
        key: "name",
        label: "Name",
        width: "30%",
        sortable: true,
        render: (row) => {
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          return (
            <InlineEdit
              value={row?.name || ""}
              onCommit={(val) => handleInlineEdit(row, "name", val)}
              onCancel={stopEdit}
              disabled={!isEditing || isBusy}
            />
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
          return (
            <InlineEdit
              value={row?.[entityConfig.keyField] || ""}
              onCommit={(val) => handleInlineEdit(row, entityConfig.keyField, val)}
              onCancel={stopEdit}
              disabled={!isEditing || isBusy}
            />
          );
        },
      });
    }

    cols.push({
      key: "description",
      label: "Description",
      width: "34%",
      sortable: true,
      render: (row) => {
        const isEditing = String(row?.id ?? "") === String(editingId ?? "");
        return (
          <InlineEdit
            value={row?.description || ""}
            onCommit={(val) => handleInlineEdit(row, "description", val)}
            onCancel={stopEdit}
            disabled={!isEditing || isBusy}
          />
        );
      },
    });

    cols.push({
      key: "is_active_bool",
      label: "Active",
      width: "12%",
      sortable: true,
      align: "center",
      render: (row) => (
        <StatusToggle
          active={row?.is_active_bool}
          disabled={isBusy}
          onChange={() => toggleActive(row)}
        />
      ),
    });

    return cols;
  }, [editingId, entityConfig, isBusy, handleInlineEdit, stopEdit, toggleActive]);

  const actions = useMemo(() => [
    {
      key: "edit", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => startEdit(r),
    },
    {
      key: "cancel-edit", label: "Cancel", type: "secondary", icon: "xmark",
      visible: (r) => String(r?.id ?? "") === String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: () => stopEdit(),
    },
    {
      key: "delete", label: "Delete", type: "danger", icon: "trash",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => confirmDelete(r),
    },
  ], [editingId, isBusy, startEdit, stopEdit, confirmDelete]);

  return (
    <main className="inventory-config-layout">
      <ConfigHeader
        isBusy={isBusy}
        onRefresh={refresh}
        openAddRow={addRow}
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

        <ConfigSideNav
          activeEntityKey={activeEntityKey}
          onSelect={(key) => { setActiveEntityKey(key); setEditingId(null); }}
        />

        <div className="inventory-config-content">
          <div className="inventory-config-panel">
            <div className="inventory-config-table-header">
              <div>
                <div className="inventory-config-editor-title">{entityConfig?.label || "Items"}</div>
                <div className="inventory-config-editor-description">{entityConfig?.description || ""}</div>
              </div>
            </div>

            <BatchControls
              diff={null}
              onSave={() => {}}
              onCancel={() => {}}
              isBusy={isBusy}
            />

            <TableZ
              data={currentRows}
              columns={columns}
              rowIdKey="id"
              actions={actions}
              batchMode
              batchFields={batchFields}
              onBatchChange={handleBatchChange}
              onBatchSave={handleBatchSave}
              draggable={!isBusy}
              onReorder={handleReorder}
              hideSearch
              hideFooter
              emptyMessage={`No ${entityConfig?.label?.toLowerCase() || "items"} found.`}
            />
          </div>
        </div>
      </div>

      <Modal
        show={dialog?.kind === "delete"}
        onHide={() => setDialog({ kind: null, target: null })}
        title="Confirm Delete"
        footer={(
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: null, target: null })} disabled={isBusy}>Cancel</Button>
            <Button type="button" variant="danger" size="sm" onClick={executeDelete} loading={isBusy}>Delete</Button>
          </>
        )}
      >
        <p className="mb-0">Permanently delete <strong>{dialog?.target?.name || "this item"}</strong>? This cannot be undone.</p>
      </Modal>
    </main>
  );
}

// ─── INLINE EDIT CELL WRAPPER ───────────────────────────────

function InlineEdit({ value, onCommit, onCancel, disabled, placeholder }) {
  if (!disabled) {
    return (
      <input
        className="form-control form-control-sm inventory-config-inline-input"
        type="text"
        defaultValue={value}
        placeholder={placeholder || "--"}
        autoFocus
        onBlur={(e) => onCommit?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit?.(e.target.value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel?.();
          }
        }}
      />
    );
  }
  return <span className="inventory-config-inline-value">{value || placeholder || "—"}</span>;
}
