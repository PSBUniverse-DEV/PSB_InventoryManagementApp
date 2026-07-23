"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  ENTITY_CONFIGS, ENTITY_KEYS, getEntityConfig,
  mapEntityRow, isEntityActive,
} from "../data/inventoryHelpers.data.js";
import {
  createEntityAction,
  updateEntityAction,
  deactivateEntityAction,
  hardDeleteEntityAction,
  saveEntityOrderAction,
  loadUnitOfMeasures,
  // loadInventoryConfigData,
} from "../data/inventoryConfig.actions.js";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function ConfigHeader({ hasChanges, isBusy, onRefresh, openAddDialog, entityLabel }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Configuration and Settings</h1>
        <p className="text-muted mb-0">Manage master data tables for the Inventory module.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={onRefresh}>Refresh</Button>
        <Button type="button" size="sm" variant="success" disabled={isBusy} onClick={openAddDialog}>+ Add {entityLabel}</Button>
      </div>
    </div>
  );
}

function ConfigSideNav({ activeEntityKey, onSelect }) {
  return (
    <div className="setup-side-nav">
      <div className="setup-side-nav-label">Master Data</div>
      <div className="setup-side-nav-list">
        {ENTITY_KEYS.map((key) => {
          const config = getEntityConfig(key);
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`setup-side-nav-item${activeEntityKey === key ? " is-active" : ""}`}
            >
              <span className="setup-side-nav-item-main">
                <span className="setup-side-nav-item-title">{config?.label || key}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfigTable({
  rows, entityKey, isBusy, editingId, onStartEdit, onStopEdit, onInlineEdit,
  openToggleDialog, onDelete, handleReorder, onRefresh,
}) {
  const config = getEntityConfig(entityKey);

  const columns = useMemo(() => {
    const cols = [
      {
        key: "name", label: "Name", width: "28%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          return (
            <InlineEditCell
              value={row?.name || ""}
              onCommit={(val) => onInlineEdit?.(row, "name", val)}
              onCancel={onStopEdit}
              disabled={!isEditing || isBusy}
            />
          );
        },
      },
    ];

    if (config?.hasKey || config?.hasAbbreviation) {
      cols.push({
        key: config.keyField, label: config.keyLabel, width: "18%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.id ?? "") === String(editingId ?? "");
          return (
            <InlineEditCell
              value={row?.[config.keyField] || ""}
              onCommit={(val) => onInlineEdit?.(row, config.keyField, val)}
              onCancel={onStopEdit}
              disabled={!isEditing || isBusy}
            />
          );
        },
      });
    }

    cols.push({
      key: "description", label: "Description", width: "34%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.id ?? "") === String(editingId ?? "");
        return (
          <InlineEditCell
            value={row?.description || ""}
            onCommit={(val) => onInlineEdit?.(row, "description", val)}
            onCancel={onStopEdit}
            disabled={!isEditing || isBusy}
          />
        );
      },
    });

    cols.push({
      key: "is_active_bool", label: "Active", width: "12%", sortable: true, align: "center",
      render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
    });

    return cols;
  }, [editingId, isBusy, onInlineEdit, onStopEdit, config]);

  const actions = useMemo(() => [
    {
      key: "edit", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => onStartEdit(r),
    },
    {
      key: "cancel-edit", label: "Cancel", type: "secondary", icon: "xmark",
      visible: (r) => String(r?.id ?? "") === String(editingId ?? ""),
      onClick: () => onStopEdit(),
    },
    {
      key: "toggle", label: (r) => r?.is_active_bool ? "Deactivate" : "Activate",
      type: "secondary", icon: (r) => r?.is_active_bool ? "ban" : "check",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      disabled: () => isBusy,
      onClick: (r) => openToggleDialog(r),
    },
    {
      key: "delete", label: "Delete", type: "danger", icon: "trash",
      visible: (r) => String(r?.id ?? "") !== String(editingId ?? ""),
      confirm: true,
      confirmMessage: (r) => `Permanently delete ${r?.name || "this item"}? This cannot be undone.`,
      disabled: () => isBusy,
      onClick: (r) => onDelete(r),
    },
  ], [editingId, isBusy, onStartEdit, onStopEdit, openToggleDialog, onDelete]);

  return (
    <TableZ
      columns={columns}
      data={rows}
      rowIdKey="id"
      actions={actions}
      hideFooter
      draggable={!isBusy}
      onReorder={handleReorder}
      emptyMessage={`No ${config?.label?.toLowerCase() || "items"} found.`}
    />
  );
}

function ConfigDialog({ dialog, draft, entityKey, isBusy, setDraft, closeDialog, onConfirm }) {
  const kind = dialog?.kind;
  const config = getEntityConfig(entityKey);

  if (!kind) return null;

  const title = kind === "add" ? `Add ${config?.label || "Item"}`
    : kind === "edit" ? `Edit ${config?.label || "Item"}`
    : kind === "toggle" ? `${dialog?.nextIsActive ? "Activate" : "Deactivate"} ${config?.label || "Item"}`
    : "";

  const confirmLabel = kind === "add" ? `Add ${config?.label || "Item"}`
    : kind === "edit" ? "Save"
    : kind === "toggle" ? (dialog?.nextIsActive ? "Activate" : "Deactivate")
    : "OK";

  const confirmVariant = kind === "add" ? "success" : kind === "edit" ? "primary" : "warning";

  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
      <Button type="button" variant={confirmVariant} onClick={onConfirm} loading={isBusy}>{confirmLabel}</Button>
    </>
  );

  const isForm = kind === "add" || kind === "edit";

  return (
    <Modal show onHide={closeDialog} title={title} footer={footer}>
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
      {kind === "toggle" ? (
        <p className="mb-0">{dialog?.nextIsActive ? "Activate" : "Deactivate"} <strong>{dialog?.target?.name || ""}</strong>?</p>
      ) : null}
    </Modal>
  );
}

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function InventoryConfigView({ configData }) {
  const [activeEntityKey, setActiveEntityKey] = useState("categories");
  const [rows, setRows] = useState({});

  useEffect(() => {
    const initial = {};
    ENTITY_KEYS.forEach((key) => {
      initial[key] = (configData[key] || []).map((r, i) => mapEntityRow(r, i));
    });
    setRows(initial);
  }, [configData]);
  const [isBusy, setIsBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [dialog, setDialog] = useState({ kind: null, target: null, nextIsActive: null });
  const [draft, setDraft] = useState({ name: "", key: "", description: "" });

  const currentRows = (rows[activeEntityKey] || []);
  const entityConfig = getEntityConfig(activeEntityKey);
  const entityLabel = entityConfig?.label || "Item";

  async function refresh() {
    setIsBusy(true);
    try {
      const data = await loadInventoryConfigData();
      const updated = {};
      ENTITY_KEYS.forEach((key) => {
        updated[key] = (data[key] || []).map((r, i) => mapEntityRow(r, i));
      });
      setRows(updated);
      toastSuccess("Data refreshed.");
    } catch (err) {
      toastError(err?.message || "Failed to refresh data.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReorder(next) {
    if (isBusy) return;
    const reordered = (Array.isArray(next) ? next : []).map((r, i) => ({ ...r, display_order: i + 1 }));
    setRows((prev) => {
      if (!prev[activeEntityKey]) return prev;
      return { ...prev, [activeEntityKey]: reordered };
    });

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
  }

  async function handleInlineEdit(row, key, value) {
    if (isBusy || !row?.id) return;
    const id = row.id;
    setRows((prev) => {
      if (!prev[activeEntityKey]) return prev;
      return {
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].map((r) =>
          String(r?.id) === String(id) ? { ...r, [key]: value || null } : r
        ),
      };
    });

    setIsBusy(true);
    try {
      await updateEntityAction(activeEntityKey, id, { [key]: value || null });
      toastSuccess("Updated.");
      setEditingId(null);
    } catch (err) {
      toastError(err?.message || "Failed to update.");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }

  function openAddDialog() {
    setDraft({ name: "", key: "", description: "" });
    setDialog({ kind: "add", target: null, nextIsActive: true });
  }

  function openEditDialog(row) {
    if (isBusy) return;
    const config = getEntityConfig(activeEntityKey);
    setDraft({
      name: String(row?.name || ""),
      key: String(row?.[config?.keyField || "key"] || ""),
      description: String(row?.description || ""),
    });
    setEditingId(row?.id);
  }

  function openToggleDialog(row) {
    if (isBusy) return;
    setDialog({ kind: "toggle", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }

  async function confirmDialog() {
    const kind = dialog?.kind;
    if (!kind) return;

    if (kind === "add") {
      const name = String(draft.name || "").trim();
      if (!name) { toastError("Name is required."); return; }
      const key = String(draft.key || "").trim();
      const description = String(draft.description || "").trim();

      setIsBusy(true);
      try {
        const created = await createEntityAction(activeEntityKey, { name, key, description });
        setRows((prev) => {
          const current = prev[activeEntityKey] || [];
          return { ...prev, [activeEntityKey]: [...current, mapEntityRow(created, current.length)] };
        });
        setDialog({ kind: null, target: null, nextIsActive: null });
        setDraft({ name: "", key: "", description: "" });
        toastSuccess(`"${name}" added.`);
      } catch (err) {
        toastError(err?.message || "Failed to add item.");
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (kind === "edit") {
      const row = dialog?.target;
      if (!row?.id) { toastError("Invalid item."); return; }
      const name = String(draft.name || "").trim();
      if (!name) { toastError("Name is required."); return; }
      const key = String(draft.key || "").trim();
      const description = String(draft.description || "").trim();
      const id = row.id;
      const keyField = entityConfig?.keyField || "key";

      setRows((prev) => {
        if (!prev[activeEntityKey]) return prev;
        return {
          ...prev,
          [activeEntityKey]: prev[activeEntityKey].map((r) =>
            String(r?.id) === String(id) ? { ...r, name, [keyField]: key, description } : r
          ),
        };
      });

      setIsBusy(true);
      try {
        await updateEntityAction(activeEntityKey, id, { name, key, description });
        setDialog({ kind: null, target: null, nextIsActive: null });
        setEditingId(null);
        toastSuccess(`"${name}" updated.`);
      } catch (err) {
        toastError(err?.message || "Failed to update.");
        await refresh();
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (kind === "toggle") {
      const row = dialog?.target;
      if (!row?.id) { toastError("Invalid item."); return; }
      const nextIsActive = Boolean(dialog?.nextIsActive);
      const id = row.id;

      setRows((prev) => {
        if (!prev[activeEntityKey]) return prev;
        return {
          ...prev,
          [activeEntityKey]: prev[activeEntityKey].map((r) =>
            String(r?.id) === String(id) ? { ...r, is_active: nextIsActive, is_active_bool: nextIsActive } : r
          ),
        };
      });

      setIsBusy(true);
      try {
        if (nextIsActive) {
          await updateEntityAction(activeEntityKey, id, { is_active: true });
        } else {
          await deactivateEntityAction(activeEntityKey, id);
        }
        setDialog({ kind: null, target: null, nextIsActive: null });
        toastSuccess(`"${row.name}" ${nextIsActive ? "activated" : "deactivated"}.`);
      } catch (err) {
        toastError(err?.message || "Failed to update status.");
        await refresh();
      } finally {
        setIsBusy(false);
      }
      return;
    }
  }

  async function handleDelete(row) {
    if (isBusy || !row?.id) return;
    const id = row.id;
    const name = row.name;

    setRows((prev) => {
      if (!prev[activeEntityKey]) return prev;
      return {
        ...prev,
        [activeEntityKey]: prev[activeEntityKey].filter((r) => String(r?.id) !== String(id)),
      };
    });

    setIsBusy(true);
    try {
      await hardDeleteEntityAction(activeEntityKey, id);
      toastSuccess(`"${name}" deleted.`);
    } catch (err) {
      toastError(err?.message || "Failed to delete.");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="container py-4">
      <ConfigHeader
        hasChanges={false}
        isBusy={isBusy}
        onRefresh={refresh}
        openAddDialog={openAddDialog}
        entityLabel={entityLabel}
      />

      <div className="setup-split-layout">
        <ConfigSideNav
          activeEntityKey={activeEntityKey}
          onSelect={(key) => { setActiveEntityKey(key); setEditingId(null); }}
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
                rows={currentRows}
                entityKey={activeEntityKey}
                isBusy={isBusy}
                editingId={editingId}
                onStartEdit={(r) => openEditDialog(r)}
                onStopEdit={() => setEditingId(null)}
                onInlineEdit={handleInlineEdit}
                openToggleDialog={openToggleDialog}
                onDelete={handleDelete}
                handleReorder={handleReorder}
                onRefresh={refresh}
              />
            </div>
          </div>
        </div>
      </div>

      <ConfigDialog
        dialog={dialog}
        draft={draft}
        entityKey={activeEntityKey}
        isBusy={isBusy}
        setDraft={setDraft}
        closeDialog={() => setDialog({ kind: null, target: null, nextIsActive: null })}
        onConfirm={confirmDialog}
      />
    </main>
  );
}