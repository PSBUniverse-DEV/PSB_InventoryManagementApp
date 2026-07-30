/**
 * Client Component — BoardManagementView.jsx
 *
 * Board CRUD management: list, create, edit, archive boards.
 */
"use client";

import "./BoardManagementView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, ExternalLink,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import {
  loadAllBoards,
  createBoardAction,
  updateBoardAction,
  deleteBoardAction,
} from "../data/board.actions";

// ─── COLOR OPTIONS ──────────────────────────────────────────

const BOARD_COLORS = [
  { value: "#0d6efd", label: "Blue" },
  { value: "#6610f2", label: "Indigo" },
  { value: "#6f42c1", label: "Purple" },
  { value: "#d63384", label: "Pink" },
  { value: "#dc3545", label: "Red" },
  { value: "#fd7e14", label: "Orange" },
  { value: "#ffc107", label: "Yellow" },
  { value: "#198754", label: "Green" },
  { value: "#20c997", label: "Teal" },
  { value: "#0dcaf0", label: "Cyan" },
  { value: "#6c757d", label: "Gray" },
  { value: "#212529", label: "Dark" },
];

// ─── MAIN VIEW ──────────────────────────────────────────────

export default function BoardManagementView({ onOpenBoard }) {
  const [boards, setBoards] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [editingBoard, setEditingBoard] = useState(null);

  const loadBoards = useCallback(async () => {
    setIsBusy(true);
    try {
      const data = await loadAllBoards();
      setBoards(data);
    } catch (err) {
      toastError(err?.message || "Failed to load boards.", "Board Setup");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  // ─── Modal helpers ────────────────────────────────────────

  const openAddModal = useCallback(() => {
    setForm({ name: "", description: "", color: "#0d6efd", icon: "table" });
    setEditingBoard(null);
    setModal("boardForm");
  }, []);

  const openEditModal = useCallback((board) => {
    setForm({
      name: board.name || "",
      description: board.description || "",
      color: board.color || "#0d6efd",
      icon: board.icon || "table",
    });
    setEditingBoard(board);
    setModal("boardForm");
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setForm({});
    setEditingBoard(null);
  }, []);

  // ─── CRUD handlers ────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toastError("Board name is required.", "Board Setup");
      return;
    }
    setIsBusy(true);
    try {
      if (editingBoard) {
        await updateBoardAction(editingBoard.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color || null,
          icon: form.icon || null,
        });
        toastSuccess(`Board "${form.name}" updated.`, "Board Setup");
      } else {
        await createBoardAction({
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color || null,
          icon: form.icon || null,
        });
        toastSuccess(`Board "${form.name}" created.`, "Board Setup");
      }
      closeModal();
      await loadBoards();
    } catch (err) {
      toastError(err?.message || "Failed to save board.", "Board Setup");
    } finally {
      setIsBusy(false);
    }
  }, [form, editingBoard, loadBoards, closeModal]);

  const handleDelete = useCallback(async (board) => {
    if (!confirm(`Archive board "${board.name}"? All tasks and field data will be hidden.`)) return;
    setIsBusy(true);
    try {
      await deleteBoardAction(board.id);
      toastSuccess(`Board "${board.name}" archived.`, "Board Setup");
      await loadBoards();
    } catch (err) {
      toastError(err?.message || "Failed to archive board.", "Board Setup");
    } finally {
      setIsBusy(false);
    }
  }, [loadBoards]);

  // ─── Table columns ────────────────────────────────────────

  const columns = useMemo(() => [
    {
      key: "name",
      label: "Board",
      sortable: true,
      render: (row) => (
        <div className="board-mgmt-name-cell">
          <span
            className="board-mgmt-color-dot"
            style={{ backgroundColor: row.color || "#0d6efd" }}
          />
          <span className="fw-semibold">{row.name}</span>
        </div>
      ),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (row) => <span className="text-muted">{row.description || "—"}</span>,
    },
    {
      key: "color",
      label: "Color",
      align: "center",
      render: (row) => (
        <span
          className="board-mgmt-color-swatch"
          style={{ backgroundColor: row.color || "#0d6efd" }}
          title={row.color || "Default"}
        />
      ),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (row) => (
        <span className="text-muted small">
          {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
  ], []);

  const actions = useMemo(() => [
    {
      key: "open",
      label: "Open",
      type: "primary",
      icon: "external-link",
      onClick: (r) => onOpenBoard && onOpenBoard(r.id),
    },
    {
      key: "edit",
      label: "Edit",
      type: "secondary",
      icon: "pen",
      onClick: (r) => openEditModal(r),
    },
    {
      key: "delete",
      label: "Archive",
      type: "danger",
      icon: "trash",
      confirm: true,
      confirmMessage: (row) => `Archive board "${row.name}"?`,
      onClick: (r) => handleDelete(r),
    },
  ], [openEditModal, handleDelete, onOpenBoard]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="board-mgmt-view">
      <div className="inventory-view-header">
        <div>
          <h1 className="inventory-page-title" style={{ margin: 0 }}>Board Setup</h1>
          <p className="inventory-page-desc">Create, edit, and manage boards.</p>
        </div>
        <Button variant="success" size="sm" onClick={openAddModal} disabled={isBusy}>
          <Plus size={14} /> Add Board
        </Button>
      </div>

      <TableZ
        data={boards}
        columns={columns}
        actions={actions}
        rowIdKey="id"
        searchPlaceholder="Search boards..."
        emptyMessage="No boards found. Create your first board!"
      />

      {/* Add / Edit Board Modal */}
      <Modal
        show={modal === "boardForm"}
        onHide={closeModal}
        title={editingBoard ? "Edit Board" : "Add Board"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" onClick={handleSave} loading={isBusy}>
              {editingBoard ? "Save Changes" : "Add Board"}
            </Button>
          </>
        }
      >
        <div className="mb-3">
          <label className="form-label board-mgmt-label">Board name *</label>
          <Input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Inventory, Purchase Orders, Assets"
          />
        </div>
        <div className="mb-3">
          <label className="form-label board-mgmt-label">Description</label>
          <Input
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What is this board for?"
          />
        </div>
        <div className="mb-3">
          <label className="form-label board-mgmt-label">Color</label>
          <div className="board-mgmt-colors">
            {BOARD_COLORS.map((c) => (
              <button
                key={c.value}
                className={`board-mgmt-color-btn${form.color === c.value ? " is-active" : ""}`}
                style={{ backgroundColor: c.value }}
                onClick={() => setForm({ ...form, color: c.value })}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label board-mgmt-label">Icon</label>
          <select
            className="form-select"
            value={form.icon || "table"}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
          >
            <option value="table">Table</option>
            <option value="kanban">Kanban</option>
            <option value="list">List</option>
            <option value="grid">Grid</option>
            <option value="box">Box</option>
            <option value="folder">Folder</option>
            <option value="clipboard">Clipboard</option>
            <option value="gear">Gear</option>
          </select>
        </div>
      </Modal>
    </div>
  );
}