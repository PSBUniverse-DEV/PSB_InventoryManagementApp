/**
 * Client Component — BoardView.jsx
 *
 * Dynamic board view with custom fields, inline editing, and field management.
 */
"use client";

import "./BoardView.css";
import "./InventoryView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Check, GripVertical,
  List, Calendar, Mail, Phone, Link,
  CheckSquare, Type, Text, DollarSign,
  Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Warehouse, Truck, ClipboardList, Columns, Settings,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import {
  loadBoardData,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  createCustomFieldAction,
  updateCustomFieldAction,
  deleteCustomFieldAction,
  addFieldOptionAction,
  deleteFieldOptionAction,
  upsertTaskFieldValueAction,
} from "../data/board.actions";
import { FIELD_TYPES, mergeBoardData, getFieldRawValue } from "../data/board.data";
import { INVENTORY_VIEWS } from "../data/inventory.data";
import { useRouter } from "next/navigation";

// ─── FIELD TYPE ICON MAP ────────────────────────────────────

const FIELD_ICONS = {
  text: Type,
  textarea: Text,
  number: List,
  currency: DollarSign,
  date: Calendar,
  datetime: Calendar,
  checkbox: CheckSquare,
  select: List,
  multi_select: List,
  email: Mail,
  phone: Phone,
  url: Link,
};

// ─── SUB-COMPONENTS: CELL RENDERERS ─────────────────────────

function TextCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="board-cell-editor">
        <input
          className="board-cell-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="board-cell-display" onClick={() => setEditing(true)} title="Click to edit">
      {value || <span className="board-cell-empty">—</span>}
    </div>
  );
}

function NumberCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => {
    const num = draft === "" ? null : Number(draft);
    onSave(isNaN(num) ? draft : num);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="board-cell-editor">
        <input
          className="board-cell-input board-cell-input-narrow"
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          onBlur={handleSave}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="board-cell-display board-cell-number" onClick={() => setEditing(true)} title="Click to edit">
      {value !== null && value !== undefined && value !== "" ? value : <span className="board-cell-empty">—</span>}
    </div>
  );
}

function DateCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => {
    onSave(draft || null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="board-cell-editor">
        <input
          className="board-cell-input board-cell-input-narrow"
          type="date"
          value={draft ? draft.slice(0, 10) : ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          autoFocus
        />
      </div>
    );
  }

  const displayVal = value ? new Date(value).toLocaleDateString() : null;
  return (
    <div className="board-cell-display" onClick={() => setEditing(true)} title="Click to edit">
      {displayVal || <span className="board-cell-empty">—</span>}
    </div>
  );
}

function CheckboxCell({ value, onSave }) {
  const checked = value === true || value === "true" || value === 1;
  return (
    <div className="board-cell-display board-cell-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onSave(!checked)}
        className="board-cell-checkbox"
      />
    </div>
  );
}

function SelectCell({ value, onSave, options }) {
  const [editing, setEditing] = useState(false);

  const handleSelect = (val) => {
    onSave(val === value ? null : val);
    setEditing(false);
  };

  const selectedLabel = (options || []).find((o) => o.value === value || o.label === value)?.label || value;

  return (
    <div className="board-cell-display" onClick={() => setEditing(true)}>
      {selectedLabel ? (
        <span className="board-cell-select-value">{selectedLabel}</span>
      ) : (
        <span className="board-cell-empty">—</span>
      )}
      {editing && (
        <div className="board-select-popup" onClick={(e) => e.stopPropagation()}>
          {(options || []).map((opt) => (
            <div
              key={opt.id}
              className={`board-select-option${value === opt.value || value === opt.label ? " is-selected" : ""}`}
              onClick={() => handleSelect(opt.value || opt.label)}
            >
              {opt.label}
            </div>
          ))}
          <div className="board-select-option board-select-clear" onClick={() => handleSelect(null)}>
            <X size={12} /> Clear
          </div>
        </div>
      )}
    </div>
  );
}

function CellRenderer({ field, value, onSave }) {
  switch (field.type) {
    case "number":
    case "currency":
      return <NumberCell value={value} onSave={onSave} />;
    case "date":
    case "datetime":
      return <DateCell value={value} onSave={onSave} />;
    case "checkbox":
      return <CheckboxCell value={value} onSave={onSave} />;
    case "select":
    case "multi_select":
      return <SelectCell value={value} onSave={onSave} options={field.options} />;
    default:
      return <TextCell value={value} onSave={onSave} />;
  }
}

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function BoardView({ boards, initialBoardId }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState(initialBoardId || boards?.[0]?.id || null);
  const [boardData, setBoardData] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [search, setSearch] = useState("");

  // Load board data when selected board changes
  const loadBoard = useCallback(async (boardId) => {
    if (!boardId) return;
    setIsBusy(true);
    try {
      const raw = await loadBoardData(boardId);
      const merged = mergeBoardData(raw.board, raw.tasks, raw.fields, raw.options, raw.taskValues);
      setBoardData(merged);
    } catch (err) {
      toastError(err?.message || "Failed to load board.", "Board");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBoardId) loadBoard(selectedBoardId);
  }, [selectedBoardId, loadBoard]);

  const refresh = useCallback(() => {
    if (selectedBoardId) loadBoard(selectedBoardId);
  }, [selectedBoardId, loadBoard]);

  const currentBoard = boardData?.board;
  const fields = boardData?.fields || [];
  const tasks = boardData?.tasks || [];

  // Client-side search filter — checks title and all custom field values
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) => {
      // Check title
      if ((t.title || "").toLowerCase().includes(q)) return true;
      // Check all custom field values
      const fv = t.fieldValues || {};
      for (const fieldId of Object.keys(fv)) {
        const val = fv[fieldId];
        const text = val?.text_value ?? val?.number_value ?? val?.date_value ?? "";
        if (String(text).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [tasks, search]);

  // ─── Task CRUD ────────────────────────────────────────────

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !selectedBoardId || isBusy) return;
    setIsBusy(true);
    try {
      const maxPos = tasks.reduce((max, t) => Math.max(max, t.position || 0), 0);
      await createTaskAction({
        boardId: selectedBoardId,
        title: newTaskTitle.trim(),
        position: maxPos + 1,
      });
      setNewTaskTitle("");
      await loadBoard(selectedBoardId);
      toastSuccess("Task added.", "Board");
    } catch (err) {
      toastError(err?.message || "Failed to add task.", "Board");
    } finally {
      setIsBusy(false);
    }
  }, [newTaskTitle, selectedBoardId, isBusy, tasks, loadBoard]);

  const handleUpdateTaskTitle = useCallback(async (taskId, title) => {
    try {
      await updateTaskAction(taskId, { title });
      setBoardData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, title } : t),
      }));
    } catch (err) {
      toastError(err?.message || "Failed to update task.", "Board");
    }
  }, []);

  const handleDeleteTask = useCallback(async (taskId) => {
    try {
      await deleteTaskAction(taskId);
      setBoardData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      }));
      toastSuccess("Task deleted.", "Board");
    } catch (err) {
      toastError(err?.message || "Failed to delete task.", "Board");
    }
  }, []);

  // ─── Cell value editing ───────────────────────────────────

  const handleCellSave = useCallback(async (taskId, fieldId, value) => {
    try {
      await upsertTaskFieldValueAction(taskId, fieldId, value);
      // Update local state
      setBoardData((prev) => {
        const newTasks = prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const newFieldValues = { ...t.fieldValues };
          newFieldValues[fieldId] = { text_value: String(value), number_value: typeof value === "number" ? value : null, date_value: null, json_value: null };
          return { ...t, fieldValues: newFieldValues };
        });
        return { ...prev, tasks: newTasks };
      });
    } catch (err) {
      toastError(err?.message || "Failed to save cell.", "Board");
    }
  }, []);

  // ─── Custom Fields CRUD ───────────────────────────────────

  const [editingField, setEditingField] = useState(null);

  const openAddFieldModal = useCallback(() => {
    setEditingField(null);
    setForm({ name: "", type: "text" });
    setModal("fieldForm");
  }, []);

  const openEditFieldModal = useCallback((field) => {
    setEditingField(field);
    setForm({ name: field.name || "", type: field.type || "text" });
    setModal("fieldForm");
  }, []);

  const handleSaveField = useCallback(async () => {
    if (!form.name || !selectedBoardId) {
      toastError("Field name is required.", "Board");
      return;
    }
    setIsBusy(true);
    try {
      if (editingField) {
        await updateCustomFieldAction(editingField.id, {
          name: form.name,
          type: form.type,
        });
        toastSuccess(`Field "${form.name}" updated.`, "Board");
      } else {
        const maxOrder = fields.reduce((max, f) => Math.max(max, f.order_no || 0), 0);
        await createCustomFieldAction({
          boardId: selectedBoardId,
          name: form.name,
          type: form.type,
          orderNo: maxOrder + 1,
        });
        toastSuccess(`Field "${form.name}" added.`, "Board");
      }
      setModal(null);
      await loadBoard(selectedBoardId);
    } catch (err) {
      toastError(err?.message || "Failed to save field.", "Board");
    } finally {
      setIsBusy(false);
    }
  }, [form, editingField, selectedBoardId, fields, loadBoard]);

  const handleDeleteField = useCallback(async (fieldId) => {
    if (!confirm("Delete this field? All values in this column will be lost.")) return;
    try {
      await deleteCustomFieldAction(fieldId);
      await loadBoard(selectedBoardId);
      toastSuccess("Field deleted.", "Board");
    } catch (err) {
      toastError(err?.message || "Failed to delete field.", "Board");
    }
  }, [selectedBoardId, loadBoard]);

  // ─── Column drag-and-drop reordering ─────────────────────

  const [dragFieldId, setDragFieldId] = useState(null);
  const [dragOverFieldId, setDragOverFieldId] = useState(null);

  const handleDragStart = useCallback((fieldId) => {
    setDragFieldId(fieldId);
  }, []);

  const handleDragOver = useCallback((e, fieldId) => {
    e.preventDefault();
    if (fieldId !== dragFieldId) {
      setDragOverFieldId(fieldId);
    }
  }, [dragFieldId]);

  const handleDrop = useCallback(async (targetFieldId) => {
    if (!dragFieldId || dragFieldId === targetFieldId) {
      setDragFieldId(null);
      setDragOverFieldId(null);
      return;
    }

    const draggedIndex = fields.findIndex((f) => f.id === dragFieldId);
    const targetIndex = fields.findIndex((f) => f.id === targetFieldId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDragFieldId(null);
      setDragOverFieldId(null);
      return;
    }

    // Reorder locally for instant feedback
    const reordered = [...fields];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setBoardData((prev) => ({
      ...prev,
      fields: reordered,
    }));

    setDragFieldId(null);
    setDragOverFieldId(null);

    // Persist new order to DB
    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order_no !== i + 1) {
          await updateCustomFieldAction(reordered[i].id, { orderNo: i + 1 });
        }
      }
    } catch (err) {
      toastError(err?.message || "Failed to save column order.", "Board");
    }
  }, [dragFieldId, fields]);

  // ─── Navigation ───────────────────────────────────────────

  const handleNavClick = useCallback((viewId) => {
    if (viewId === "boards") return; // already on boards
    if (viewId === "boardSetup") {
      router.push("/inventory/board/manage");
      return;
    }
    router.push("/inventory");
  }, [router]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="inventory-module-layout">
      {/* Drawer overlay (mobile only) */}
      <div
        className={`inventory-drawer-overlay${drawerOpen ? " is-open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer sidebar */}
      <aside className={`inventory-sidebar${drawerOpen ? " is-open" : ""}`}>
        <div className="inventory-sidebar-brand">
          <button
            className="inventory-drawer-toggle"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          >
            <Menu size={18} />
          </button>
          <div className="inventory-sidebar-brand-text">
            <div className="inventory-sidebar-title">Menu</div>
          </div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => {
            const iconMap = {
              LayoutDashboard, BarChart3, Package, Wrench,
              Warehouse, Truck, ClipboardList, Columns, Settings,
            };
            const IconComponent = iconMap[n.icon];
            const isActive = n.id === "boards";
            return (
              <button
                key={n.id}
                onClick={() => handleNavClick(n.id)}
                className={`inventory-sidebar-nav-item${isActive ? " is-active" : ""}`}
                title={n.label}
              >
                {IconComponent && <IconComponent size={18} className="inventory-sidebar-nav-icon" />}
                <span className="inventory-sidebar-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="inventory-main">
        <button
          className="inventory-drawer-toggle-mobile"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div className="board-view">
      {/* Board header */}
      <div className="board-header">
        <div className="board-header-left">
          <h1 className="inventory-page-title" style={{ margin: 0 }}>
            {currentBoard?.name || "Board"}
          </h1>
          {currentBoard?.description && (
            <p className="inventory-page-desc">{currentBoard.description}</p>
          )}
        </div>
        <div className="board-header-actions">
          <select
            className="form-select"
            value={selectedBoardId || ""}
            onChange={(e) => setSelectedBoardId(e.target.value || null)}
            style={{ minWidth: "200px" }}
          >
            <option value="">Select a board...</option>
            {(boards || []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isBusy}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openAddFieldModal}
            disabled={isBusy || !selectedBoardId}
          >
            <Plus size={14} /> Add Field
          </Button>
        </div>
      </div>

      {!selectedBoardId ? (
        <div className="board-empty">
          <p className="text-muted">Select a board to view its tasks.</p>
        </div>
      ) : isBusy && !boardData ? (
        <div className="board-loading">Loading board...</div>
      ) : boardData ? (
        <>
          <div className="board-search-bar">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title or field values..."
            />
            {search && (
              <span className="board-search-results">
                {filteredTasks.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="board-table-wrapper">
            <table className="board-table">
              <thead>
                <tr>
                  <th className="board-th board-th-title">Task</th>
                  {fields.map((field) => (
                  <th
                    key={field.id}
                    className={`board-th board-th-field${dragOverFieldId === field.id ? " board-th-drag-over" : ""}${dragFieldId === field.id ? " board-th-dragging" : ""}`}
                    draggable={!isBusy}
                    onDragStart={() => handleDragStart(field.id)}
                    onDragOver={(e) => handleDragOver(e, field.id)}
                    onDrop={() => handleDrop(field.id)}
                    onDragEnd={() => { setDragFieldId(null); setDragOverFieldId(null); }}
                  >
                    <div className="board-th-content">
                      <span className="board-th-drag-handle" title="Drag to reorder">
                        <GripVertical size={12} />
                      </span>
                        <span className="board-th-label">{field.name}</span>
                        <div className="board-th-actions">
                          <button
                            className="board-th-btn"
                            onClick={() => openEditFieldModal(field)}
                            title="Edit field"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            className="board-th-btn board-th-btn-danger"
                            onClick={() => handleDeleteField(field.id)}
                            title="Delete field"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={fields.length + 2} className="board-empty-cell">
                      <span className="text-muted">{search ? "No tasks match your search." : "No tasks yet. Add one below."}</span>
                    </td>
                  </tr>
                )}
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="board-row">
                    <td className="board-td board-td-title">
                      <div className="board-td-title-inner">
                        <span
                          className="board-task-title"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const val = e.target.textContent.trim();
                            if (val && val !== task.title) handleUpdateTaskTitle(task.id, val);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
                          }}
                        >
                          {task.title}
                        </span>
                      </div>
                    </td>
                    {fields.map((field) => {
                      const fv = task.fieldValues?.[field.id];
                      const raw = fv?.text_value ?? fv?.number_value ?? fv?.date_value ?? "";
                      return (
                        <td key={field.id} className="board-td board-td-cell">
                          <CellRenderer
                            field={field}
                            value={getFieldRawValue(task, field)}
                            onSave={(val) => handleCellSave(task.id, field.id, val)}
                          />
                        </td>
                      );
                    })}
                    <td className="board-td board-td-actions">
                      <button
                        className="board-row-delete"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="board-row-new">
                  <td colSpan={fields.length + 2} className="board-td-new">
                    <div className="board-new-task-row">
                      <Input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="New task name..."
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                      />
                      <Button
                        type="button"
                        variant="success"
                        size="sm"
                        onClick={handleAddTask}
                        disabled={!newTaskTitle.trim() || isBusy}
                      >
                        <Plus size={14} /> Add
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* Add / Edit Field Modal */}
      <Modal
        show={modal === "fieldForm"}
        onHide={() => setModal(null)}
        title={editingField ? "Edit Field" : "Add Custom Field"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModal(null)} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" onClick={handleSaveField} loading={isBusy}>
              {editingField ? "Save Changes" : "Add Field"}
            </Button>
          </>
        }
      >
        <div className="mb-3">
          <label className="form-label board-form-label">Field name</label>
          <Input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Supplier, Quantity, Status"
          />
        </div>
        <div className="mb-3">
          <label className="form-label board-form-label">Field type</label>
          <div className="board-field-types">
            {FIELD_TYPES.map((ft) => {
              const Icon = FIELD_ICONS[ft.id] || Type;
              return (
                <button
                  key={ft.id}
                  className={`board-field-type-btn${form.type === ft.id ? " is-active" : ""}`}
                  onClick={() => setForm({ ...form, type: ft.id })}
                >
                  <Icon size={14} />
                  <span>{ft.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
        </div>
      </main>
    </div>
  );
}
