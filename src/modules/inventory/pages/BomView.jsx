/**
 * Client Component — BomView.jsx
 *
 * BOM (Bill of Materials) page. Ties a project to the materials it needs,
 * with template loading, manual line-item editing, and stock status per SKU.
 * Line items use batch edit mode: draft/baseline/diff with Save Batch.
 */
"use client";

import "./BomView.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, X, Menu,
  LayoutDashboard, BarChart3, Package, Wrench,
  Warehouse, Truck, ClipboardList, Columns, Settings,
  ArrowLeftRight, FileText, Download, Save, AlertTriangle,
  PackageCheck, Layers, RotateCcw,
} from "lucide-react";
import {
  Button, Card, Input, Badge, Modal, toastSuccess, toastError,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import { useRouter } from "next/navigation";
import { INVENTORY_VIEWS } from "../data/inventory.data";
import {
  loadBomTemplateDetailsAction,
  createBomTemplateAction,
  saveBomLineItemsAction,
  searchCustomersAction,
  saveProjectBomAction,
  allocateBomStockAction,
} from "../data/inventory.actions";

// ─── SUB-COMPONENTS ─────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label inventory-form-label">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent, danger }) {
  return (
    <Card className={`bom-stat-card${danger ? " bom-stat-card--danger" : ""}`}>
      <div className="bom-stat-label">{label}</div>
      <div className="bom-stat-value" style={{ color: danger ? "var(--psb-status-suspended)" : (accent || "var(--psb-gold)") }}>{value}</div>
    </Card>
  );
}

// ─── Status badge helper ────────────────────────────────────

function LineStatusBadge({ required, available, hasActivePO, hasActivePR, poNumbers, prNumbers }) {
  const inStock = available >= required;
  if (inStock) {
    return (
      <Badge variant="active" className="bom-status-badge">
        In stock
      </Badge>
    );
  }
  if (hasActivePO) {
    const poList = (poNumbers || []).join(", ");
    return (
      <Badge variant="info" className="bom-status-badge">
        On Order{poList ? ` (${poList})` : " (PO)"}
      </Badge>
    );
  }
  if (hasActivePR) {
    const prList = (prNumbers || []).join(", ");
    return (
      <Badge variant="warning" className="bom-status-badge">
        Requested{prList ? ` (${prList})` : " (PR)"}
      </Badge>
    );
  }
  return (
    <Badge variant="pending" className="bom-status-badge">
      Short
    </Badge>
  );
}

// ─── Batch helpers ──────────────────────────────────────────

const TEMP_ID_PREFIX = "tmp-";

function isTempId(value) {
  return String(value || "").startsWith(TEMP_ID_PREFIX);
}

function createTempId() {
  return `${TEMP_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneBatchRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...(row || {}),
    __pendingRemove: false,
  }));
}

function buildBatchDiff(draftRows, baselineRows) {
  const baselineMap = new Map(
    baselineRows.filter((row) => !isTempId(row?.id))
      .map((row) => [String(row.id), row])
  );

  const byId = new Map();
  let newRows = 0;
  let modifiedRows = 0;
  let removedRows = 0;

  const fields = ["sku", "name", "requiredQty", "warehouseId", "uomId"];

  draftRows.forEach((row) => {
    const rowId = String(row?.id ?? "");
    const baselineRow = baselineMap.get(rowId);
    const isNew = isTempId(rowId) || !baselineRow;
    const isPendingRemove = Boolean(row?.__pendingRemove);
    const changedColumns = new Set();

    if (!isNew && baselineRow) {
      fields.forEach((field) => {
        const draftVal = String(row?.[field] ?? "").trim();
        const baseVal = String(baselineRow?.[field] ?? "").trim();
        if (draftVal !== baseVal) {
          changedColumns.add(field);
        }
      });
    }

    const isChanged = isNew || changedColumns.size > 0;

    if (isPendingRemove && !isNew) removedRows++;
    else if (isNew && !isPendingRemove) newRows++;
    else if (changedColumns.size > 0 && !isPendingRemove) modifiedRows++;

    byId.set(rowId, { isNew, isChanged, isPendingRemove, changedColumns });
  });

  return {
    byId,
    newRows,
    modifiedRows,
    removedRows,
    hasPendingChanges: newRows > 0 || modifiedRows > 0 || removedRows > 0,
  };
}

//#region ─── MAIN VIEW ──────────────────────────────────────────────

export default function BomView({ initialData, hideSidebar = false }) {
  const router = useRouter();
  const data = initialData;
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState("bom");

  // Destructure server-loaded data
  const items = data?.items || [];
  const allWarehouses = data?.warehouses || [];
  const stockLevels = data?.stockLevels || [];
  const bomTemplates = data?.bomTemplates || [];
  const units = data?.units || [];
  const purchaseRequests = data?.purchaseRequests || [];
  const purchaseRequestItems = data?.purchaseRequestItems || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const purchaseOrderItems = data?.purchaseOrderItems || [];

  // ─── BOM state ──────────────────────────────────────────────

  const [projectTitle, setProjectTitle] = useState("");
  const [projectSpec, setProjectSpec] = useState("");
  const [assignedWarehouse, setAssignedWarehouse] = useState("");
  const [bomTempId, setBomTempId] = useState(null);

  // Batch edit state
  const [draft, setDraft] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [busy, setBusy] = useState(false);

  // Template search state
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Create-new-BOM state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    buildingSpec: "",
    size: "",
    gauge: "",
  });

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  // Save BOM confirmation state
  const [showSaveBomConfirm, setShowSaveBomConfirm] = useState(false);
  const [saveBomBusy, setSaveBomBusy] = useState(false);
  const [savedBomId, setSavedBomId] = useState(null);
  const [allocateBusy, setAllocateBusy] = useState(false);

  // Loaded flag
  useEffect(() => { setLoaded(true); }, []);

  // Auto-open drawer on desktop; close on mobile; respond to resize
  useEffect(() => {
    const checkWidth = () => {
      setDrawerOpen(window.innerWidth >= 992);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Auto-select first warehouse
  useEffect(() => {
    if (!assignedWarehouse && allWarehouses.length > 0) {
      setAssignedWarehouse(String(allWarehouses[0].id));
    }
  }, [allWarehouses, assignedWarehouse]);

  // ─── Navigation ─────────────────────────────────────────────

  const handleNavClick = useCallback((viewId) => {
    if (viewId === "boards") {
      router.push("/inventory/board");
      return;
    }
    if (viewId === "boardSetup") {
      router.push("/inventory/board/manage");
      return;
    }
    if (viewId === "transaction") {
      router.push("/inventory/transaction");
      return;
    }
    if (viewId === "bom") {
      return; // Already here
    }
    router.push("/inventory");
  }, [router]);

  // ─── Warehouse helpers ──────────────────────────────────────

  // Get available quantity for an item at a warehouse
  const getAvailableQty = useCallback(
    (itemId, whId) => {
      const stock = stockLevels.find(
        (sl) =>
          String(sl.item_id) === String(itemId) &&
          String(sl.warehouse_id) === String(whId),
      );
      return stock?.quantity || 0;
    },
    [stockLevels],
  );

  // ─── Active PR/PO lookup per item SKU ──────────────────────

  const itemProcurementStatus = useMemo(() => {
    const map = new Map(); // key: itemSku → { hasActivePR, hasActivePO, prNumbers, poNumbers }

    // Build a lookup of PR id → pr_no for active PRs
    const activePRMap = new Map();
    for (const pr of purchaseRequests) {
      const status = (pr.status || pr.pr_status || "").toLowerCase();
      if (status !== "completed" && status !== "cancelled") {
        activePRMap.set(pr.id, pr.pr_no || "");
      }
    }

    for (const pri of purchaseRequestItems) {
      const prId = pri.pr_id ?? pri.purchaseRequestId;
      const prNo = activePRMap.get(prId);
      if (prId != null && prNo != null) {
        const sku = pri.itemSku || pri.item_sku || "";
        if (sku) {
          const entry = map.get(sku) || { hasActivePR: false, hasActivePO: false, prNumbers: [], poNumbers: [] };
          entry.hasActivePR = true;
          if (!entry.prNumbers.includes(prNo)) entry.prNumbers.push(prNo);
          map.set(sku, entry);
        }
      }
    }

    // Build a lookup of PO id → po_no for active POs
    const activePOMap = new Map();
    for (const po of purchaseOrders) {
      const status = (po.status || po.po_status || "").toLowerCase();
      if (status !== "completed" && status !== "cancelled") {
        activePOMap.set(po.id, po.po_no || "");
      }
    }

    for (const poi of purchaseOrderItems) {
      const poId = poi.po_id ?? poi.purchaseOrderId;
      const poNo = activePOMap.get(poId);
      if (poId != null && poNo != null) {
        const sku = poi.itemSku || poi.item_sku || "";
        if (sku) {
          const entry = map.get(sku) || { hasActivePR: false, hasActivePO: false, prNumbers: [], poNumbers: [] };
          entry.hasActivePO = true;
          if (!entry.poNumbers.includes(poNo)) entry.poNumbers.push(poNo);
          map.set(sku, entry);
        }
      }
    }

    return map;
  }, [purchaseRequests, purchaseRequestItems, purchaseOrders, purchaseOrderItems]);

  // ─── Normalize DB templates into shape expected by dropdown ──

  const templates = useMemo(
    () =>
      (bomTemplates || []).map((t) => ({
        id: t.id,
        name: t.project_name || t.name || "",
        spec: t.spec || "",
      })),
    [bomTemplates],
  );

  // ─── Template search filtering ──────────────────────────────

  const filteredTemplates = useMemo(() => {
    const q = (templateSearch || "").trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.spec.toLowerCase().includes(q),
    );
  }, [templateSearch, templates]);

  // ─── Set both draft and baseline from a lines array ─────────

  const setLinesFromArray = useCallback((lines) => {
    const cloned = cloneBatchRows(lines);
    setDraft(cloned);
    setBaseline(cloneBatchRows(lines));
  }, []);

  const handleClearTemplate = useCallback(() => {
    setSelectedTemplate(null);
    setBomTempId(null);
    setProjectTitle("");
    setProjectSpec("");
    setTemplateSearch("");
    setDraft([]);
    setBaseline([]);
  }, []);

  // ─── Customer search handler ────────────────────────────────

  const handleCustomerSearch = useCallback(async (query) => {
    setCustomerSearch(query);
    if (!query || query.trim().length < 2) {
      setCustomerResults([]);
      setCustomerDropdownOpen(false);
      return;
    }
    setCustomerDropdownOpen(true);
    setCustomerLoading(true);
    try {
      const results = await searchCustomersAction(query);
      setCustomerResults(results || []);
    } catch (err) {
      console.error("Customer search failed:", err);
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  const handleSelectCustomer = useCallback((customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.client_name || "");
    setCustomerDropdownOpen(false);
    setCustomerResults([]);
  }, []);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerDropdownOpen(false);
  }, []);

  const handleLoadTemplate = useCallback(async (templateId) => {
    const targetId = templateId ?? selectedTemplate;
    if (!targetId) {
      toastError("Please select a template first.");
      return;
    }
    try {
      const details = await loadBomTemplateDetailsAction(targetId);
      if (!details || details.length === 0) {
        toastError("No line items found for the selected template.");
        return;
      }
      const lines = details.map((d, idx) => ({
        id: d.bom_detial_id ?? Date.now() + idx,
        sku: d.inv_s_inventoryitem?.sku || "",
        name: d.inv_s_inventoryitem?.name || "",
        requiredQty: Number(d.required_qty) || 1,
        warehouseId: assignedWarehouse,
        uomId: d.uomId || d.uom_id || null,
      }));
      const template = templates.find((t) => t.id === targetId);
      setBomTempId(targetId);
      setProjectTitle(template?.name || "");
      setProjectSpec(template?.spec || template?.name || "");
      setLinesFromArray(lines);
      setTemplateSearch("");
      setTemplateDropdownOpen(false);
      setSelectedTemplate(null);
      toastSuccess(`Template "${template?.name}" loaded.`);
    } catch (err) {
      toastError("Failed to load template details.");
      console.error(err);
    }
  }, [selectedTemplate, assignedWarehouse, templates, setLinesFromArray]);

  // ─── Line item helpers (operate on draft) ───────────────────

  const addLineItem = useCallback(() => {
    setDraft((prev) => [...prev, {
      id: createTempId(),
      sku: "",
      name: "",
      requiredQty: 1,
      warehouseId: assignedWarehouse,
      uomId: null,
      __pendingRemove: false,
    }]);
  }, [assignedWarehouse]);

  const updateLineItem = useCallback((id, field, value) => {
    setDraft((prev) =>
      prev.map((item) =>
        String(item.id) === String(id) ? { ...item, [field]: value } : item,
      ),
    );
  }, []);

  const removeLineItem = useCallback((id) => {
    setDraft((prev) =>
      prev.map((item) =>
        String(item.id) === String(id) ? { ...item, __pendingRemove: true } : item,
      ),
    );
  }, []);

  // ─── Batch diff ─────────────────────────────────────────────

  const diff = useMemo(
    () => buildBatchDiff(draft, baseline),
    [draft, baseline],
  );

  // ─── Computed metrics (based on draft, excluding pending-remove) ──

  const visibleDraft = useMemo(
    () => draft.filter((item) => !item.__pendingRemove),
    [draft],
  );

  const metrics = useMemo(() => {
    const lineCount = visibleDraft.length;
    const estMaterialCost = visibleDraft.reduce((sum, item) => {
      const dbItem = items.find((i) => String(i.sku) === String(item.sku));
      const cost = dbItem?.cost || 0;
      return sum + (Number(item.requiredQty) || 0) * cost;
    }, 0);
    const itemsShort = visibleDraft.filter((item) => {
      const available = getAvailableQty(item.sku
        ? (items.find((i) => String(i.sku) === String(item.sku))?.id)
        : null, item.warehouseId);
      return Number(item.requiredQty) > available;
    }).length;
    return { lineCount, estMaterialCost, itemsShort };
  }, [visibleDraft, items, getAvailableQty]);

  // ─── Handlers ───────────────────────────────────────────────

  const handleExport = useCallback(() => {
    toastSuccess("Export triggered (PDF/CSV — placeholder).");
  }, []);

  const handleSaveAsTemplate = useCallback(() => {
    toastSuccess("BOM saved as new template (placeholder).");
  }, []);

  const handleAllocateStock = useCallback(async () => {
    if (!savedBomId) {
      toastError("Please save the BOM first before allocating stock.");
      return;
    }
    if (visibleDraft.length === 0) {
      toastError("No line items to allocate.");
      return;
    }
    if (metrics.itemsShort > 0) {
      toastError(`${metrics.itemsShort} item(s) are short — resolve before allocating.`);
      return;
    }

    setAllocateBusy(true);
    try {
      const lineItems = visibleDraft
        .filter((row) => row.sku)
        .map((row) => {
          const dbItem = items.find((i) => String(i.sku) === String(row.sku));
          return {
            bomDetailsId: null,
            itemId: dbItem?.id || dbItem?.item_id || null,
            itemName: dbItem?.name || row.name || "",
            sku: row.sku || "",
            quantity: Number(row.requiredQty) || 0,
          };
        })
        .filter((li) => li.itemId);

      if (lineItems.length === 0) {
        toastError("No valid line items to allocate.");
        setAllocateBusy(false);
        return;
      }

      await allocateBomStockAction(savedBomId, {
        warehouseId: assignedWarehouse || null,
        lineItems,
      });

      toastSuccess(`${lineItems.length} item(s) allocated successfully.`);
    } catch (err) {
      toastError("Failed to allocate stock.");
      console.error(err);
    } finally {
      setAllocateBusy(false);
    }
  }, [savedBomId, visibleDraft, metrics.itemsShort, items, assignedWarehouse]);

  const handleCreateNewBom = useCallback(async () => {
    if (!createForm.buildingSpec || !createForm.size || !createForm.gauge) {
      toastError("Please fill in building spec, size, and gauge.");
      return;
    }
    const title = `${createForm.buildingSpec} ${createForm.size} ${createForm.gauge}`;
    try {
      const created = await createBomTemplateAction({
        projectName: title,
        projectDescription: null,
      });
      setProjectTitle(created?.project_name || title);
      setProjectSpec(title);
      setBomTempId(created?.bom_temp_id || null);
      setLinesFromArray([]);
      setShowCreateForm(false);
      setCreateForm({ buildingSpec: "", size: "", gauge: "" });
      toastSuccess("New BOM template created with pre-filled structural items. Save Batch to persist line items.");
      router.refresh();
    } catch (err) {
      toastError("Failed to create BOM template.");
      console.error(err);
    }
  }, [createForm, assignedWarehouse, router, setLinesFromArray]);

  // ─── Save Project BOM ───────────────────────────────────────

  const handleSaveProjectBom = useCallback(async () => {
    if (!bomTempId || visibleDraft.length === 0) {
      toastError("No active BOM template or line items to save.");
      return;
    }
    if (!selectedCustomer) {
      toastError("Please select a customer before saving the BOM.");
      return;
    }

    setSaveBomBusy(true);
    try {
      // Generate BOM number
      const bomNo = `BOM-${Date.now().toString().slice(-6)}`;

      // Map draft line items to inv_t_bom_details shape
      const lineItems = visibleDraft
        .filter((row) => row.sku)
        .map((row) => {
          const dbItem = items.find((i) => String(i.sku) === String(row.sku));
          return {
            itemId: dbItem?.id || dbItem?.item_id || null,
            quantity: Number(row.requiredQty) || 0,
            uomId: row.uomId || null,
            remarks: null,
          };
        })
        .filter((li) => li.itemId);

      if (lineItems.length === 0) {
        toastError("No valid line items with SKUs to save.");
        setSaveBomBusy(false);
        return;
      }

      const savedBom = await saveProjectBomAction({
        projectId: selectedCustomer?.id || null,
        bomNo,
        statusId: null, // status resolved server-side if needed
        remarks: null,
        createdBy: null,
        bomTempId: bomTempId || null,
        bomtSpec: projectSpec || null,
        lineItems,
      });

      setSavedBomId(savedBom?.bom_id || null);
      setShowSaveBomConfirm(false);
      toastSuccess(`BOM ${bomNo} saved successfully.`);
      router.refresh();
    } catch (err) {
      toastError("Failed to save BOM.");
      console.error(err);
    } finally {
      setSaveBomBusy(false);
    }
  }, [bomTempId, visibleDraft, items, selectedCustomer, router]);

  // ─── Batch save / cancel ────────────────────────────────────

  const handleSaveBatch = useCallback(async () => {
    if (!diff.hasPendingChanges) return;

    setBusy(true);
    try {
      let activeBomId = bomTempId;

      // Require an active BOM template — Save Batch only saves line items
      if (!activeBomId) {
        toastError("No active BOM template. Load a template or create a new BOM first.");
        setBusy(false);
        return;
      }

      const created = [];
      const updated = [];
      const deleted = [];

      draft.forEach((row) => {
        const rowId = String(row.id);
        const rowDiff = diff.byId.get(rowId);
        if (row.__pendingRemove && !isTempId(rowId)) {
          deleted.push(row);
        } else if (isTempId(rowId) && !row.__pendingRemove) {
          created.push(row);
        } else if (rowDiff?.isChanged && !row.__pendingRemove && !isTempId(rowId)) {
          updated.push(row);
        }
      });

      const fresh = await saveBomLineItemsAction(activeBomId, {
        created,
        updated,
        deleted,
      });

      // Reset baseline from fresh server data
      const freshLines = (fresh || []).map((d) => ({
        id: d.bom_detial_id,
        sku: d.inv_s_inventoryitem?.sku || "",
        name: d.inv_s_inventoryitem?.name || "",
        requiredQty: Number(d.required_qty) || 1,
        warehouseId: assignedWarehouse,
        uomId: d.uom_id || d.uomId || null,
      }));
      const cloned = cloneBatchRows(freshLines);
      setDraft(cloned);
      setBaseline(cloneBatchRows(freshLines));
      toastSuccess("Line items saved.");
    } catch (err) {
      toastError("Failed to save line items.");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [bomTempId, diff, draft, assignedWarehouse, projectTitle, projectSpec]);

  const handleCancelBatch = useCallback(() => {
    if (!diff.hasPendingChanges) return;
    setDraft(cloneBatchRows(baseline));
    toastSuccess("Staged changes discarded.");
  }, [diff.hasPendingChanges, baseline]);

  // ─── Change summary text ────────────────────────────────────

  const changeSummary = useMemo(() => {
    if (!diff.hasPendingChanges) return "No changes";
    const parts = [];
    if (diff.newRows > 0) parts.push(`${diff.newRows} new`);
    if (diff.modifiedRows > 0) parts.push(`${diff.modifiedRows} modified`);
    if (diff.removedRows > 0) parts.push(`${diff.removedRows} removed`);
    return parts.join(", ");
  }, [diff]);

  // ─── TableZ columns & actions ───────────────────────────────

  const tableRows = useMemo(() => {
    return draft.map((item) => {
      const rowId = String(item.id);
      const rowDiff = diff.byId.get(rowId);
      const dbItem = items.find((i) => String(i.sku) === String(item.sku));
      const available = dbItem ? getAvailableQty(dbItem.id, item.warehouseId) : 0;
      const procurement = itemProcurementStatus.get(item.sku) || { hasActivePR: false, hasActivePO: false, prNumbers: [], poNumbers: [] };
      return {
        ...item,
        _rowId: rowId,
        _isNew: rowDiff?.isNew || false,
        _isChanged: rowDiff?.isChanged || false,
        _isPendingRemove: rowDiff?.isPendingRemove || false,
        _changedCols: rowDiff?.changedColumns || new Set(),
        _available: available,
        _dbItem: dbItem,
        _hasActivePR: procurement.hasActivePR,
        _hasActivePO: procurement.hasActivePO,
        _prNumbers: procurement.prNumbers,
        _poNumbers: procurement.poNumbers,
      };
    });
  }, [draft, diff, items, getAvailableQty, itemProcurementStatus]);

  const columns = useMemo(
    () => [
      {
        key: "itemSku",
        label: "Item",
        sortable: true,
        render: (row) => (
          <select
            className="form-select form-select-sm"
            value={row.sku || ""}
            onChange={(e) => {
              const selectedItem = items.find((i) => String(i.sku) === e.target.value);
              updateLineItem(row.id, "sku", e.target.value);
              updateLineItem(row.id, "name", selectedItem?.name || "");
              updateLineItem(row.id, "uomId", selectedItem?.unit_id || null);
            }}
            disabled={row._isPendingRemove}
          >
            <option value="">— Select item —</option>
            {items.map((item) => (
              <option key={item.id} value={item.sku}>
                {item.name} ({item.sku})
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "uom",
        label: "UOM",
        sortable: true,
        align: "center",
        render: (row) => {
          const unit = units.find((u) => String(u.id) === String(row.uomId));
          return (
            <span style={{ fontSize: "0.82rem", color: "var(--psb-muted)" }}>
              {unit?.abbreviation || unit?.name || "—"}
            </span>
          );
        },
      },
      {
        key: "requiredQty",
        label: "Required",
        sortable: true,
        align: "center",
        render: (row) => (
          <input
            type="number"
            className="form-control form-control-sm bom-input-num"
            value={row.requiredQty}
            onChange={(e) => updateLineItem(row.id, "requiredQty", e.target.value)}
            min={0}
            disabled={row._isPendingRemove}
            style={{ width: "80px", display: "inline-block" }}
          />
        ),
      },
      {
        key: "available",
        label: "Available",
        sortable: true,
        align: "center",
        render: (row) => (
          <span className={row._available < (Number(row.requiredQty) || 0) ? "bom-short" : ""}>
            {row._available}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        align: "center",
        render: (row) => (
          <LineStatusBadge
            required={Number(row.requiredQty) || 0}
            available={row._available}
            hasActivePO={row._hasActivePO}
            hasActivePR={row._hasActivePR}
            poNumbers={row._poNumbers}
            prNumbers={row._prNumbers}
          />
        ),
      },
    ],
    [allWarehouses, items, units, updateLineItem],
  );

  const actions = useMemo(
    () => [
      {
        key: "remove",
        label: "Remove",
        type: "danger",
        icon: "xmark",
        onClick: (row) => removeLineItem(row.id),
      },
    ],
    [removeLineItem],
  );

  if (!loaded) {
    return <div className="inventory-loading">Loading BOM screen...</div>;
  }

  //#endregion

  // --- BOM content (shared between standalone and embedded) ---
  const bomContent = (
    <div>
      {/* ═══ PAGE HEADER ═══ */}
      <div className="bom-page-header">
        <div className="bom-header-left">
          <div className="bom-header-meta">
            <span className="bom-header-meta-label">Assigned warehouse:</span>
            <select
              className="form-select bom-warehouse-select"
              value={assignedWarehouse}
              onChange={(e) => setAssignedWarehouse(e.target.value)}
            >
              <option value="">Select warehouse</option>
              {allWarehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bom-header-actions">
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={handleExport}
            disabled={visibleDraft.length === 0}
          >
            <Download size={14} /> Export
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            disabled={!bomTempId || visibleDraft.length === 0 || !selectedCustomer}
            onClick={() => setShowSaveBomConfirm(true)}
          >
            <Save size={14} /> Save Project BOM
          </Button>
        </div>
      </div>

      {/* ═══ TWO PATHS — Load template OR Create new BOM ═══ */}
      <div className="bom-entry-section">
        {/* Path A — Load template */}
        <div className="bom-entry-card">
          <div className="bom-entry-card-header">
            <FileText size={18} />
            <span>Load a predefined template</span>
          </div>
          <div className="bom-entry-card-body">
            <div className="bom-template-search-wrap">
              <Search size={16} className="bom-template-search-icon" />
              <input
                type="text"
                className="form-control bom-template-search-input"
                placeholder='Search templates, e.g. "AFV 24×50 14G"'
                value={templateSearch}
                onChange={(e) => {
                  setTemplateSearch(e.target.value);
                  setTemplateDropdownOpen(e.target.value.trim().length > 0);
                  setSelectedTemplate(null);
                }}
                onFocus={() => {
                  if (templateSearch.trim().length > 0) setTemplateDropdownOpen(true);
                }}
              />
              {templateDropdownOpen && filteredTemplates.length > 0 && (
                <ul className="bom-template-dropdown">
                  {filteredTemplates.map((t) => (
                    <li
                      key={t.id}
                      className={`bom-template-dropdown-item${selectedTemplate === t.id ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedTemplate(t.id);
                        setBomTempId(t.id);
                        setProjectTitle(t.name || "");
                        setProjectSpec(t.spec || t.name || "");
                        setTemplateSearch(t.name);
                        setTemplateDropdownOpen(false);
                        handleLoadTemplate(t.id);
                      }}
                    >
                      <span className="bom-template-dd-name">{t.name}</span>
                      <span className="bom-template-dd-spec">{t.spec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                type="button"
                variant="success"
                size="sm"
                className="bom-entry-btn"
                onClick={handleLoadTemplate}
              >
                <Layers size={14} /> Load template
              </Button>
              <Button
                type="button"
                variant="outline-secondary"
                size="sm"
                onClick={handleClearTemplate}
                disabled={!bomTempId && !selectedTemplate && draft.length === 0}
              >
                <X size={14} /> Clear
              </Button>
            </div>
          </div>
        </div>

        {/* "Or" divider */}
        <div className="bom-or-divider">
          <span className="bom-or-divider-text">or</span>
        </div>

        {/* Path B — Create new BOM */}
        <div className="bom-entry-card">
          <div className="bom-entry-card-header">
            <Plus size={18} />
            <span>Create new BOM</span>
          </div>
          <div className="bom-entry-card-body">
            {!showCreateForm ? (
              <Button
                type="button"
                variant="primary"
                 size="sm"
                className="bom-entry-btn"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus size={14} /> Create new BOM
              </Button>
            ) : (
              <div className="bom-create-form">
                <Field label="Building spec">
                  <Input
                    value={createForm.buildingSpec}
                    onChange={(e) => setCreateForm({ ...createForm, buildingSpec: e.target.value })}
                    placeholder='e.g. AFV, RV Carport, Utility'
                  />
                </Field>
                <Field label="Size">
                  <Input
                    value={createForm.size}
                    onChange={(e) => setCreateForm({ ...createForm, size: e.target.value })}
                    placeholder="e.g. 24' × 50'"
                  />
                </Field>
                <Field label="Gauge">
                  <select
                    className="form-select"
                    value={createForm.gauge}
                    onChange={(e) => setCreateForm({ ...createForm, gauge: e.target.value })}
                  >
                    <option value="">Select gauge</option>
                    <option value="14G">14 Gauge</option>
                    <option value="12G">12 Gauge</option>
                    <option value="16G">16 Gauge</option>
                  </select>
                </Field>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={handleCreateNewBom}
                  >
                    Create BOM
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACTIVE PROJECT DETAILS (two-column) ═══ */}
      {(bomTempId || selectedTemplate) && (() => {
        const selected = selectedTemplate ? templates.find((t) => t.id === selectedTemplate) : null;
        const displayTitle = bomTempId ? projectTitle : (selected?.name || "—");
        const displaySpec = bomTempId ? projectSpec : (selected?.spec || "—");
        const displayId = bomTempId || "—";
        return (
          <div className="bom-detail-panels">
            {/* Left — Active BOM / Template */}
            <Card className="bom-project-detail-card">
              <div className="bom-project-detail-header">
                <Layers size={18} />
                <span> &nbsp; <strong>Template</strong></span>
                <br/><br/>
              </div>
              <div className="bom-project-detail-body">
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Specs: </span>
                  <span className="bom-project-detail-value"><b>{displayTitle}</b></span>
                </div>
                {/* <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Building Spec </span>
                  <span className="bom-project-detail-value"><b>{displaySpec}</b></span>
                </div> */}
                <div className="bom-project-detail-row">
                  <span className="bom-project-detail-label">Template ID </span>
                  <span className="bom-project-detail-value bom-project-detail-mono"><b>{displayId}</b></span>
                </div>
              </div>
            </Card>

            {/* Right — Customer Information */}
            <Card className="bom-project-info-card">
              <div className="bom-project-detail-header">
                <FileText size={18} />
                <span> &nbsp; <strong>Customer Information</strong></span>
                <br/><br/>
              </div>
              <div className="bom-project-detail-body">
                {/* Customer search bar */}
                <div className="bom-customer-search-wrap">
                  <Search size={16} className="bom-customer-search-icon" />
                  <input
                    type="text"
                    className="form-control bom-customer-search-input"
                    placeholder='Search customer name...'
                    value={customerSearch}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                    onFocus={() => {
                      if (customerSearch.trim().length >= 2 && customerResults.length > 0) {
                        setCustomerDropdownOpen(true);
                      }
                    }}
                  />
                  {customerDropdownOpen && customerResults.length > 0 && (
                    <ul className="bom-customer-dropdown">
                      {customerResults.map((c) => (
                        <li
                          key={c.id}
                          className="bom-customer-dropdown-item"
                          onClick={() => handleSelectCustomer(c)}
                        >
                          <span className="bom-customer-dd-name">{c.client_name}</span>
                          <span className="bom-customer-dd-addr">{c.city}{c.state_code ? `, ${c.state_code}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {customerLoading && (
                    <div className="bom-customer-loading">Searching...</div>
                  )}
                </div>
                {selectedCustomer ? (
                  <>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Client Name </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.client_name || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Address </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.formatted_address || selectedCustomer.address_line_1 || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">City </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.city || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">State </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.state || "—"}{selectedCustomer.state_code ? ` (${selectedCustomer.state_code})` : ""}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Postal Code </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.postal_code || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Country </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.country || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Dealer </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.dealer || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Invoice # </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.invoice_number || "—"}</b></span>
                    </div>
                    <div className="bom-project-detail-row">
                      <span className="bom-project-detail-label">Order Received </span>
                      <span className="bom-project-detail-value"><b>{selectedCustomer.order_received_at ? new Date(selectedCustomer.order_received_at).toLocaleDateString() : "—"}</b></span>
                    </div>
                    <div style={{ marginTop: "0.5rem" }}>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        size="sm"
                        onClick={handleClearCustomer}
                      >
                        <X size={14} /> Clear
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="bom-customer-empty">
                    Search and select a customer to view details.
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ═══ SUMMARY METRICS ═══ */}
      <div className="bom-stat-row">
        <StatCard label="Line items" value={metrics.lineCount} />
        <StatCard label="Est. material cost" value={`$${metrics.estMaterialCost.toFixed(2)}`} />
        <StatCard label="Items short" value={metrics.itemsShort} danger={metrics.itemsShort > 0} />
      </div>

      {/* ═══ LINE-ITEM TABLE ═══ */}
      <Card className="bom-table-card">
        <div className="bom-table-toolbar">
          <span className="bom-table-title">Line items</span>
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            onClick={addLineItem}
          >
            <Plus size={14} /> Add item
          </Button>
        </div>
        <br/>
        <TableZ
          data={tableRows}
          columns={columns}
          actions={actions}
          rowIdKey="id"
          searchPlaceholder="Search line items..."
          emptyMessage="No line items yet. Load a template, create a new BOM, or add items manually."
        />
        

        {/* ═══ BATCH ACTION BAR ═══ */}
        <div className="bom-batch-actions">
          <span className={`bom-change-summary${diff.hasPendingChanges ? " is-dirty" : ""}`}>
            {changeSummary}
          </span>
          <div className="bom-batch-buttons">
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={handleSaveBatch}
              disabled={!diff.hasPendingChanges || busy}
            >
              {busy ? "Saving..." : "Save Batch"}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={handleCancelBatch}
              disabled={!diff.hasPendingChanges || busy}
            >
              Cancel Batch
            </Button>
          </div>
        </div>
      </Card>

      {/* ═══ ALLOCATE STOCK ═══ */}
      <div className="bom-allocate-section">
        <Button
          type="button"
          variant="success"
          className="bom-allocate-btn"
          onClick={handleAllocateStock}
          disabled={!savedBomId || visibleDraft.length === 0 || allocateBusy}
        >
          <PackageCheck size={18} /> Allocate stock
        </Button>
        {metrics.itemsShort > 0 && visibleDraft.length > 0 && (
          <div className="bom-short-warning">
            <AlertTriangle size={14} />
            <span>{metrics.itemsShort} item(s) are short — review before allocating.</span>
          </div>
        )}
      </div>

      {/* ═══ SAVE BOM CONFIRMATION MODAL ═══ */}
      <Modal
        show={showSaveBomConfirm}
        onHide={() => setShowSaveBomConfirm(false)}
        title="Confirm Save BOM"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowSaveBomConfirm(false)} disabled={saveBomBusy}>Cancel</Button>
            <Button variant="success" size="md" onClick={handleSaveProjectBom} loading={saveBomBusy} disabled={saveBomBusy}>Confirm & Save</Button>
          </>
        }
      >
        <p className="text-muted small mb-3">Please review the details below before saving this BOM.</p>
        <div className="mb-2">
          <div className="fw-semibold">Customer</div>
          <div>{selectedCustomer?.client_name || "—"}</div>
        </div>
        <div className="mb-2">
          <div className="fw-semibold">Template</div>
          <div>{projectTitle || "—"}</div>
        </div>
        <div className="mb-2">
          <div className="fw-semibold">Line Items</div>
          <div>{visibleDraft.length}</div>
        </div>
        <div className="mb-2">
          <div className="fw-semibold">Estimated Material Cost</div>
          <div className="inventory-mono fw-semibold">
            ${metrics.estMaterialCost.toFixed(2)}
          </div>
        </div>
      </Modal>
    </div>
  );

  // --- Embedded mode: no sidebar, no layout wrapper ---
  if (hideSidebar) {
    return bomContent;
  }

  // --- Standalone: full layout with sidebar ---
  return (
    <div className="inventory-module-layout">
      <div
        className={`inventory-drawer-overlay${drawerOpen ? " is-open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
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
            <div className="inventory-sidebar-title">PSB IMS</div>
          </div>
        </div>
        <nav className="inventory-sidebar-nav">
          {INVENTORY_VIEWS.map((n) => {
            const iconMap = {
              LayoutDashboard, BarChart3, Package, Wrench,
              Warehouse, Truck, ArrowLeftRight, ClipboardList, Columns, Settings,
              Layers,
            };
            const isActive = n.id === "bom" || view === n.id;
            const IconComponent = iconMap[n.icon];
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
      <main className="inventory-main">
        <button
          className="inventory-drawer-toggle-mobile"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        {bomContent}
      </main>
    </div>
  );
}

//#endregion