  "use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, FileText, Plus, RefreshCw, X, Save, Trash2,
  ArrowLeft, TrendingUp, TrendingDown, Clock, CheckCircle,
  AlertTriangle, DollarSign, Package, Truck, BarChart3,
  ArrowRight,
} from "lucide-react";
import {
  Button, Card, Input, Modal, Badge, toastError, toastSuccess,
} from "@/shared/components/ui";
import TableZ from "@/shared/components/ui/table/TableZ";
import { createPurchaseRequestAction, updatePurchaseRequestAction, createPurchaseOrderAction, updatePurchaseOrderAction } from "../data/inventory.actions";
import "./InventoryView.css";
import "./SharedTransactionForm.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PR_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const PO_PAYMENT_TERMS = ["Net 15", "Net 30", "Net 60", "COD", "50% Advance"];

function generatePRNo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `PR-${num}`;
}

function generatePONo() {
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `PO-${num}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

const DEFAULT_PR_EMPTY_ROWS = 5;

function createEmptyPrLineItem(index) {
  return {
    id: `pr-empty-${Date.now()}-${index}`,
    itemId: "",
    quantity: "",
    unitId: "",
    estUnitCost: "",
  };
}

function createDefaultPrLineItems(count = DEFAULT_PR_EMPTY_ROWS) {
  return Array.from({ length: count }, (_, i) => createEmptyPrLineItem(i));
}

function isPrLineItemEmpty(li) {
  if (li?.isNewItem) {
    return !li.newItemName || !String(li.newItemName).trim();
  }
  return !li.itemId;
}

function PriorityBadge({ priority }) {
  const level = String(priority || "").toLowerCase();
  let className = "proc-priority";
  if (level === "low") className += " proc-priority--low";
  else if (level === "medium") className += " proc-priority--medium";
  else if (level === "high") className += " proc-priority--high";
  else if (level === "urgent") className += " proc-priority--urgent";
  else className += " proc-priority--default";
  return <span className={className}>{priority || "—"}</span>;
}

const PENDING_STATUS_NAMES = new Set([
  "pending",
  "pending approval",
  "for approval",
  "submitted",
  "pending review",
  "for review",
]);

function statusTone(name) {
  const level = String(name || "").toLowerCase();
  if (PENDING_STATUS_NAMES.has(level) || level === "draft") return "pending";
  if (level === "approved" || level === "completed" || level === "fulfilled" || level === "received") return "approved";
  if (level === "rejected" || level === "cancelled" || level === "canceled" || level === "denied") return "rejected";
  if (level === "saved" || level === "draft") return "saved";
  return "default";
}

function StatusBadge({ name }) {
  const level = String(name || "").toLowerCase();
  let variant = { bg: "secondary", text: "light" };
  if (PENDING_STATUS_NAMES.has(level) || level === "draft") variant = { bg: "warning", text: "dark" };
  else if (level === "approved" || level === "completed" || level === "fulfilled" || level === "received") variant = { bg: "success", text: "white" };
  else if (level === "rejected" || level === "cancelled" || level === "canceled" || level === "denied") variant = { bg: "danger", text: "white" };
  else if (level === "saved") variant = { bg: "info", text: "dark" };
  return <Badge bg={variant.bg} text={variant.text}>{name || "—"}</Badge>;
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------
export default function ProcurementView({ initialData, hideSidebar = false, onNavigate, defaultView = "dashboard", editingPr = null, initialPrId = null, editingPo = null, viewingPr = null, viewingPo = null }) {
  const router = useRouter();
  const data = initialData;
  const [isBusy, setIsBusy] = useState(false);
  const [view, setView] = useState(defaultView); // "dashboard" | "pr" | "po"
  const [expandedPrIds, setExpandedPrIds] = useState(new Set());
  const [expandedPoIds, setExpandedPoIds] = useState(new Set());
  const [showPrSubmitConfirm, setShowPrSubmitConfirm] = useState(false);
  const [prPage, setPrPage] = useState(1);
  const [poPage, setPoPage] = useState(1);

  const isEditing = Boolean(editingPr);
  const isEditingPo = Boolean(editingPo);
  const isViewingPr = Boolean(viewingPr);
  const isViewingPo = Boolean(viewingPo);

  const items = data?.items || [];
  const warehouses = data?.warehouses || [];
  const suppliers = data?.suppliers || [];
  const users = data?.users || [];
  const departments = data?.departments || [];
  const config = data?.config || {};

  // Filter to materials only
  const materialItems = useMemo(
    () => items.filter((i) => (i.classification || "").toLowerCase() === "material"),
    [items]
  );

  // Lookups
  const itemMap = useMemo(() => {
    const map = {};
    items.forEach((i) => { map[String(i.id)] = i; });
    return map;
  }, [items]);

  const unitLookup = useMemo(() => {
    const map = {};
    (config?.units || []).forEach((u) => { map[String(u.id)] = u.abbreviation || u.name; });
    return map;
  }, [config]);

  const unitForItem = useCallback(
    (itemId) => {
      const item = itemMap[String(itemId)];
      return item ? unitLookup[String(item.unit_id)] || "pcs" : "pcs";
    },
    [itemMap, unitLookup]
  );

  const unitIdForItem = useCallback(
    (itemId) => {
      const item = itemMap[String(itemId)];
      return item ? String(item.unit_id || "") : "";
    },
    [itemMap]
  );

  // ─── Purchase Request Lookups ──────────────────────────────
  const purchaseRequests = data?.purchaseRequests || [];
  const purchaseRequestItems = data?.purchaseRequestItems || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const purchaseOrderItems = data?.purchaseOrderItems || [];

  const userById = useMemo(() => {
    const map = {};
    (users || []).forEach((u) => { map[String(u.id)] = u; });
    return map;
  }, [users]);

  const deptById = useMemo(() => {
    const map = {};
    (departments || []).forEach((d) => { map[String(d.id)] = d; });
    return map;
  }, [departments]);

  const prItemsByPrId = useMemo(() => {
    const map = {};
    (purchaseRequestItems || []).forEach((item) => {
      const prId = String(item.pr_id);
      if (!map[prId]) map[prId] = [];
      map[prId].push(item);
    });
    return map;
  }, [purchaseRequestItems]);

  const poItemsByPoId = useMemo(() => {
    const map = {};
    (purchaseOrderItems || []).forEach((item) => {
      const poId = String(item.po_id);
      if (!map[poId]) map[poId] = [];
      map[poId].push(item);
    });
    return map;
  }, [purchaseOrderItems]);

  // Resolve inv_s_status rows so PR status_id → status name/color.
  const purchaseRequestStatuses = data?.purchaseRequestStatuses || [];
  const statusById = useMemo(() => {
    const map = {};
    (purchaseRequestStatuses || []).forEach((s) => { map[String(s.id)] = s; });
    return map;
  }, [purchaseRequestStatuses]);

  const statusNameForPr = useCallback((pr) => {
    if (pr.status_id == null) return null;
    const status = statusById[String(pr.status_id)];
    return status?.name || null;
  }, [statusById]);

  // PRs with these statuses are editable when opened in the view page.
  const PR_EDITABLE_STATUSES = new Set(["saved", "recalled", "returned"]);
  const viewingPrStatus = viewingPr
    ? String(viewingPr.statusName || statusNameForPr(viewingPr) || "").toLowerCase()
    : "";
  const isViewingPrEditable = isViewingPr && PR_EDITABLE_STATUSES.has(viewingPrStatus);
  const prReadOnly = isViewingPr && !isViewingPrEditable;

  const statusNameForPo = useCallback((po) => {
    if (po.status_id == null) return null;
    const status = statusById[String(po.status_id)];
    return status?.name || null;
  }, [statusById]);

  const activePurchaseOrders = useMemo(() => {
    const inactive = new Set(["rejected", "cancelled", "canceled", "denied", "completed", "received"]);
    return (purchaseOrders || []).filter((po) => {
      const name = String(statusNameForPo(po) || "").toLowerCase();
      return !inactive.has(name);
    });
  }, [purchaseOrders, statusNameForPo]);

  // ─── Dashboard table pagination ──────────────────────────
  const PROC_PAGE_SIZE = 10;
  const prPageCount = useMemo(
    () => Math.max(1, Math.ceil(purchaseRequests.length / PROC_PAGE_SIZE)),
    [purchaseRequests],
  );
  const paginatedPurchaseRequests = useMemo(() => {
    const start = (prPage - 1) * PROC_PAGE_SIZE;
    return purchaseRequests.slice(start, start + PROC_PAGE_SIZE);
  }, [purchaseRequests, prPage]);

  const poPageCount = useMemo(
    () => Math.max(1, Math.ceil(activePurchaseOrders.length / PROC_PAGE_SIZE)),
    [activePurchaseOrders],
  );
  const paginatedActivePurchaseOrders = useMemo(() => {
    const start = (poPage - 1) * PROC_PAGE_SIZE;
    return activePurchaseOrders.slice(start, start + PROC_PAGE_SIZE);
  }, [activePurchaseOrders, poPage]);

  // Clamp pages if data shrinks
  useEffect(() => {
    if (prPage > prPageCount) setPrPage(prPageCount);
  }, [prPage, prPageCount]);
  useEffect(() => {
    if (poPage > poPageCount) setPoPage(poPageCount);
  }, [poPage, poPageCount]);

  const togglePoExpand = useCallback((poId) => {
    setExpandedPoIds((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  }, []);

  // Approved PRs that do not yet have a linked PO.
  const approvedPrsWithoutPo = useMemo(() => {
    const poPrIds = new Set((purchaseOrders || []).map((po) => String(po.pr_id)));
    return (purchaseRequests || []).filter((pr) => {
      const name = String(statusNameForPr(pr) || "").toLowerCase();
      const isApproved = name === "approved" || name.includes("approved");
      return isApproved && !poPrIds.has(String(pr.id));
    });
  }, [purchaseRequests, purchaseOrders, statusNameForPr]);

  // ─── KPI Metrics ───────────────────────────────────────────
  const kpiPurchaseRequests = purchaseRequests.length;
  const kpiPendingApproval = purchaseRequests.filter((pr) => {
    if (pr.status_id == null) return true;
    return PENDING_STATUS_NAMES.has(String(statusById[String(pr.status_id)]?.name || "").toLowerCase());
  }).length;
  const kpiActivePurchaseOrders = purchaseOrders.length;
  // Procurement Spend = sum of PO est_total_cost for PRs that have a linked PO (treated as approved).
  const kpiProcurementSpend = useMemo(
    () => (purchaseOrders || []).reduce((sum, po) => sum + (Number(po.est_total_cost) || 0), 0),
    [purchaseOrders]
  );

  const togglePrExpand = useCallback((prId) => {
    setExpandedPrIds((prev) => {
      const next = new Set(prev);
      if (next.has(prId)) next.delete(prId);
      else next.add(prId);
      return next;
    });
  }, []);

  // ─── PR Form State ─────────────────────────────────────────
  const [prForm, setPrForm] = useState(() => ({
    refNo: generatePRNo(),
    date: new Date().toISOString().slice(0, 10),
    requestedBy: "",
    department: "",
    requiredDate: "",
    priority: PR_PRIORITIES[1],
    remarks: "",
  }));
  const [prLineItems, setPrLineItems] = useState(() => createDefaultPrLineItems());
  const updatePrForm = useCallback((field, value) => setPrForm((prev) => ({ ...prev, [field]: value })), []);

  // ─── Common ────────────────────────────────────────────────
  const refresh = useCallback(() => router.refresh(), [router]);
  const showToast = useCallback((msg, kind = "success") => {
    if (kind === "error") toastError(msg);
    else toastSuccess(msg);
  }, []);

  // ─── New Material Inline Row ──────────────────────────────
  const defaultCategoryId = useMemo(() => {
    const cats = config?.categories || [];
    const material = cats.find(
      (c) => String(c.key || "").toLowerCase() === "material" || String(c.name || "").toLowerCase() === "material"
    );
    return material ? String(material.id) : (cats[0] ? String(cats[0].id) : "");
  }, [config]);

  const defaultWarehouseId = useMemo(() => {
    return warehouses[0] ? String(warehouses[0].id) : "";
  }, [warehouses]);

  const addNewMaterialItem = useCallback(() => {
    setPrLineItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        itemId: "NEW",
        isNewItem: true,
        newItemName: "",
        newItemSku: "",
        categoryId: defaultCategoryId,
        warehouseId: defaultWarehouseId,
        quantity: "1",
        unitId: "",
        estUnitCost: "",
      },
    ]);
  }, [defaultCategoryId, defaultWarehouseId]);

  // When editing, pre-fill the form from the selected PR.
  useEffect(() => {
    if (!editingPr) return;
    const p = editingPr;
    setPrForm({
      refNo: p.pr_no || p.refNo || "",
      date: (p.pr_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      requestedBy: p.requestor_id != null ? String(p.requestor_id) : "",
      department: p.dept_id != null ? String(p.dept_id) : "",
      requiredDate: (p.date_required || "").slice(0, 10) || "",
      priority: p.priority || PR_PRIORITIES[1],
      remarks: p.remarks || "",
    });
    setPrLineItems(
      (p.lineItems || []).map((li, idx) => ({
        id: Date.now() + idx,
        itemId: li.item_id != null ? String(li.item_id) : "",
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitId: li.uom_id != null ? String(li.uom_id) : "",
        estUnitCost: li.est_unit_cost != null ? String(li.est_unit_cost) : "",
      }))
    );
  }, [editingPr]);

  // When viewing, pre-fill the form from the selected PR (read-only).
  useEffect(() => {
    if (!viewingPr) return;
    const p = viewingPr;
    setPrForm({
      refNo: p.pr_no || p.refNo || "",
      date: (p.pr_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      requestedBy: p.requestor_id != null ? String(p.requestor_id) : "",
      department: p.dept_id != null ? String(p.dept_id) : "",
      requiredDate: (p.date_required || "").slice(0, 10) || "",
      priority: p.priority || PR_PRIORITIES[1],
      remarks: p.remarks || "",
    });
    setPrLineItems(
      (p.lineItems || []).map((li, idx) => ({
        id: Date.now() + idx,
        itemId: li.item_id != null ? String(li.item_id) : "",
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitId: li.uom_id != null ? String(li.uom_id) : "",
        estUnitCost: li.est_unit_cost != null ? String(li.est_unit_cost) : "",
      }))
    );
  }, [viewingPr]);

  // ─── PO Form State ─────────────────────────────────────────
  const [poForm, setPoForm] = useState({
    refNo: generatePONo(),
    date: new Date().toISOString().slice(0, 10),
    supplierId: "",
    prRef: "",
    deliveryDate: "",
    deliveryLocation: "",
    paymentTerms: PO_PAYMENT_TERMS[1],
    remarks: "",
  });
  const [poLineItems, setPoLineItems] = useState([]);
  const updatePoForm = useCallback((field, value) => setPoForm((prev) => ({ ...prev, [field]: value })), []);

  // When editing, pre-fill the PO form from the selected PO.
  useEffect(() => {
    if (!editingPo) return;
    const p = editingPo;
    setPoForm({
      refNo: p.po_no || p.refNo || "",
      date: (p.created_at || p.po_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      supplierId: p.supplier_id != null ? String(p.supplier_id) : "",
      prRef: p.pr_id != null ? String(p.pr_id) : "",
      deliveryDate: (p.delivery_date || "").slice(0, 10) || "",
      deliveryLocation: p.delivery_location != null ? String(p.delivery_location) : "",
      paymentTerms: p.payment_terms || PO_PAYMENT_TERMS[1],
      remarks: p.remarks || "",
    });
    setPoLineItems(
      (p.lineItems || []).map((li, idx) => ({
        id: Date.now() + idx,
        itemId: li.item_id != null ? String(li.item_id) : "",
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitId: li.uom_id != null ? String(li.uom_id) : "",
        unitPrice: li.est_unit_cost != null ? String(li.est_unit_cost) : "",
      }))
    );
  }, [editingPo]);

  // When viewing, pre-fill the PO form from the selected PO (read-only).
  useEffect(() => {
    if (!viewingPo) return;
    const p = viewingPo;
    setPoForm({
      refNo: p.po_no || p.refNo || "",
      date: (p.created_at || p.po_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      supplierId: p.supplier_id != null ? String(p.supplier_id) : "",
      prRef: p.pr_id != null ? String(p.pr_id) : "",
      deliveryDate: (p.delivery_date || "").slice(0, 10) || "",
      deliveryLocation: p.delivery_location != null ? String(p.delivery_location) : "",
      paymentTerms: p.payment_terms || PO_PAYMENT_TERMS[1],
      remarks: p.remarks || "",
    });
    setPoLineItems(
      (p.lineItems || []).map((li, idx) => ({
        id: Date.now() + idx,
        itemId: li.item_id != null ? String(li.item_id) : "",
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitId: li.uom_id != null ? String(li.uom_id) : "",
        unitPrice: li.est_unit_cost != null ? String(li.est_unit_cost) : "",
      }))
    );
  }, [viewingPo]);

  const handlePoPrChange = useCallback((prId) => {
    const pr = purchaseRequests.find((p) => String(p.id) === String(prId));
    updatePoForm("prRef", prId);
    if (!pr) {
      setPoLineItems([]);
      return;
    }
    const lineItems = prItemsByPrId[String(pr.id)] || [];
    setPoLineItems(
      lineItems.map((li, idx) => ({
        id: Date.now() + idx,
        itemId: li.item_id != null ? String(li.item_id) : "",
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitId: li.uom_id != null ? String(li.uom_id) : "",
        unitPrice: li.est_unit_cost != null ? String(li.est_unit_cost) : "",
      }))
    );
  }, [purchaseRequests, prItemsByPrId, updatePoForm]);

  // Pre-select the PR when opening the PO form from a specific request.
  useEffect(() => {
    if (initialPrId) {
      handlePoPrChange(initialPrId);
    }
  }, [initialPrId, handlePoPrChange]);

  // ─── PR Line Item Helpers ──────────────────────────────────
  const addPrLineItem = useCallback(() => {
    setPrLineItems((prev) => [...prev, { id: Date.now(), itemId: "", quantity: "", unitId: "", estUnitCost: "" }]);
  }, []);
  const updatePrLineItem = useCallback((id, field, value) => {
    setPrLineItems((prev) => prev.map((li) => {
      if (li.id !== id) return li;
      const updates = { [field]: value };
      if (field === "itemId" && value && !li.unitId) {
        updates.unitId = unitIdForItem(value);
      }
      return { ...li, ...updates };
    }));
  }, [unitIdForItem]);
  const removePrLineItem = useCallback((id) => {
    setPrLineItems((prev) => prev.filter((li) => li.id !== id));
  }, []);

  // ─── PO Line Item Helpers ──────────────────────────────────
  const addPoLineItem = useCallback(() => {
    setPoLineItems((prev) => [...prev, { id: Date.now(), itemId: "", quantity: "", unitId: "", unitPrice: "" }]);
  }, []);
  const updatePoLineItem = useCallback((id, field, value) => {
    setPoLineItems((prev) => prev.map((li) => {
      if (li.id !== id) return li;
      const updates = { [field]: value };
      if (field === "itemId" && value && !li.unitId) {
        updates.unitId = unitIdForItem(value);
      }
      return { ...li, ...updates };
    }));
  }, [unitIdForItem]);
  const removePoLineItem = useCallback((id) => {
    setPoLineItems((prev) => prev.filter((li) => li.id !== id));
  }, []);

  // ─── PR Form Validation ────────────────────────────────────
  const validatePrForm = useCallback(() => {
    const errors = [];

    if (!prForm.requestedBy) {
      errors.push("Requested By is required.");
    }
    if (!prForm.department) {
      errors.push("Department is required.");
    }
    if (!prForm.requiredDate) {
      errors.push("Required Date is required.");
    }
    const filledLineItems = prLineItems.filter((li) => !isPrLineItemEmpty(li));
    if (filledLineItems.length === 0) {
      errors.push("At least one requested item is required.");
    } else {
      prLineItems.forEach((li, idx) => {
        if (isPrLineItemEmpty(li)) return; // skip empty default rows
        const lineNo = idx + 1;
        if (li.isNewItem) {
          if (!li.newItemName || !li.newItemName.trim()) {
            errors.push(`Line item ${lineNo}: New material name is required.`);
          }
          if (!li.categoryId) {
            errors.push(`Line item ${lineNo}: Please select a category.`);
          }
          if (!li.warehouseId) {
            errors.push(`Line item ${lineNo}: Please select a warehouse.`);
          }
        } else if (!li.itemId) {
          errors.push(`Line item ${lineNo}: Please select an item.`);
        }
        if (!li.quantity || Number(li.quantity) <= 0) {
          errors.push(`Line item ${lineNo}: Quantity must be greater than 0.`);
        }
        if (!li.unitId) {
          errors.push(`Line item ${lineNo}: Please select a unit.`);
        }
        if (li.estUnitCost === "" || li.estUnitCost === null || li.estUnitCost === undefined || Number(li.estUnitCost) < 0) {
          errors.push(`Line item ${lineNo}: Estimated unit cost is required and must be 0 or greater.`);
        }
      });
    }

    return errors;
  }, [prForm, prLineItems]);

  // Draft saves validate the header (Requested By) plus required fields on
  // new-material rows so a new material can't be saved with an empty unit,
  // missing category/warehouse, etc.
  const validatePrDraft = useCallback(() => {
    const errors = [];

    if (!prForm.requestedBy) {
      errors.push("Requested By is required.");
    }

    prLineItems.forEach((li, idx) => {
      if (isPrLineItemEmpty(li)) return; // skip empty default rows
      if (!li.isNewItem) return; // existing items stay lenient on draft
      const lineNo = idx + 1;
      if (!li.newItemName || !li.newItemName.trim()) {
        errors.push(`Line item ${lineNo}: New material name is required.`);
      }
      if (!li.categoryId) {
        errors.push(`Line item ${lineNo}: Please select a category.`);
      }
      if (!li.warehouseId) {
        errors.push(`Line item ${lineNo}: Please select a warehouse.`);
      }
      if (!li.unitId) {
        errors.push(`Line item ${lineNo}: Please select a unit.`);
      }
      if (!li.quantity || Number(li.quantity) <= 0) {
        errors.push(`Line item ${lineNo}: Quantity must be greater than 0.`);
      }
      if (li.estUnitCost === "" || li.estUnitCost === null || li.estUnitCost === undefined || Number(li.estUnitCost) < 0) {
        errors.push(`Line item ${lineNo}: Estimated unit cost is required and must be 0 or greater.`);
      }
    });

    return errors;
  }, [prForm, prLineItems]);

  // ─── Submit Handlers ───────────────────────────────────────
  const handlePrSubmit = useCallback(async (saveAsDraft = false) => {
    if (!saveAsDraft) {
      const errors = validatePrForm();
      if (errors.length > 0) {
        showToast(errors[0], "error");
        return;
      }
    } else {
      const errors = validatePrDraft();
      if (errors.length > 0) {
        showToast(errors[0], "error");
        return;
      }
    }
    setIsBusy(true);
    try {
      const payload = {
        prNo: prForm.refNo,
        prDate: prForm.date,
        requestorId: prForm.requestedBy,
        deptId: prForm.department,
        dateRequired: prForm.requiredDate,
        priority: prForm.priority,
        remarks: prForm.remarks,
        statusId: isEditing && editingPr?.status_id != null ? editingPr.status_id : null,
        items: prLineItems.filter((li) => !isPrLineItemEmpty(li)),
        isDraft: saveAsDraft,
      };

      const prId = (isEditing && editingPr?.id) || (isViewingPrEditable && viewingPr?.id) || null;
      if (prId != null) {
        await updatePurchaseRequestAction(prId, payload);         
        showToast(saveAsDraft ? "Purchase Request updated and saved as draft." : "Purchase Request updated and submitted successfully.");
      } else {
        await createPurchaseRequestAction(payload);
        showToast(saveAsDraft ? "Purchase Request saved as draft." : "Purchase Request submitted successfully.");
      }

      setPrForm({
        refNo: generatePRNo(),
        date: new Date().toISOString().slice(0, 10),
        requestedBy: "",
        department: "",
        requiredDate: "",
        priority: PR_PRIORITIES[1],
        remarks: "",
      });
      setPrLineItems(createDefaultPrLineItems());
      refresh();
      onNavigate ? onNavigate("purchaseRequests") : router.push("/inventory/purchase-requests");
    } catch (err) {
      showToast(err?.message || "Failed to save purchase request.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [prForm, prLineItems, refresh, showToast, isEditing, editingPr, isViewingPrEditable, viewingPr, onNavigate, router, validatePrForm, validatePrDraft]);

  const handlePrSubmitClick = useCallback(() => {
    const errors = validatePrForm();
    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }
    setShowPrSubmitConfirm(true);
  }, [validatePrForm, showToast]);

  const handlePoSubmit = useCallback(async (saveAsDraft = false) => {
    // Validate the form the same way as the PR form.
    const errors = [];

    if (!poForm.supplierId) {
      errors.push("Supplier is required.");
    }
    if (!saveAsDraft) {
      if (poLineItems.length === 0) {
        errors.push("At least one order item is required.");
      } else {
        poLineItems.forEach((li, idx) => {
          const lineNo = idx + 1;
          if (!li.itemId) {
            errors.push(`Line item ${lineNo}: Please select an item.`);
          }
          if (!li.quantity || Number(li.quantity) <= 0) {
            errors.push(`Line item ${lineNo}: Quantity must be greater than 0.`);
          }
        });
      }
    }

    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }

    setIsBusy(true);
    try {
      const estTotalCost = poLineItems.reduce(
        (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
        0
      );

      const payload = {
        poNo: poForm.refNo,
        poDate: poForm.date,
        supplierId: poForm.supplierId,
        prId: poForm.prRef,
        deliveryLocation: poForm.deliveryLocation,
        remarks: poForm.remarks,
        estTotalCost,
        items: poLineItems,
        isDraft: saveAsDraft,
      };

      if (isEditingPo && editingPo?.id != null) {
        await updatePurchaseOrderAction(editingPo.id, payload);
        showToast(saveAsDraft ? "Purchase Order updated and saved as draft." : "Purchase Order updated and submitted successfully.");
      } else {
        await createPurchaseOrderAction(payload);
        showToast(saveAsDraft ? "Purchase Order saved as draft." : "Purchase Order submitted successfully.");
      }

      setPoForm({
        refNo: generatePONo(),
        date: new Date().toISOString().slice(0, 10),
        supplierId: "",
        prRef: "",
        deliveryDate: "",
        deliveryLocation: "",
        paymentTerms: PO_PAYMENT_TERMS[1],
        remarks: "",
      });
      setPoLineItems([]);
      refresh();
      onNavigate ? onNavigate("purchaseOrders") : router.push("/inventory/purchase-orders");
    } catch (err) {
      showToast(err?.message || "Failed to save purchase order.", "error");
    } finally {
      setIsBusy(false);
    }
  }, [poForm, poLineItems, refresh, showToast, onNavigate, router, isEditingPo, editingPo]);

  // ─── PR Line Item Columns ──────────────────────────────────
  const prLineItemColumns = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, width: 320, minWidth: 260, render: (row) => {
      if (row.isNewItem) {
        return (
          <div className="d-flex flex-column gap-1" style={{ minWidth: "260px" }}>
            <div className="d-flex align-items-center gap-2">
              <Badge bg="info" text="dark">NEW</Badge>
              <input
                type="text"
                className="form-control form-control-sm"
                value={row.newItemName || ""}
                onChange={(e) => updatePrLineItem(row.id, "newItemName", e.target.value)}
                placeholder="Material name *"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <div className="d-flex align-items-center gap-2">
              <span style={{ flex: "0 0 39px" }} />
              <input
                type="text"
                className="form-control form-control-sm"
                value={row.newItemSku || ""}
                onChange={(e) => updatePrLineItem(row.id, "newItemSku", e.target.value)}
                placeholder="SKU (auto-generated if empty)"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <div className="d-flex align-items-center gap-2">
              <span style={{ flex: "0 0 39px" }} />
              <select
                className="form-select form-select-sm"
                value={row.categoryId || ""}
                onChange={(e) => updatePrLineItem(row.id, "categoryId", e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">Category *</option>
                {(config?.categories || []).map((c) => (<option key={c.id} value={String(c.id)}>{c.name || c.key}</option>))}
              </select>
              <select
                className="form-select form-select-sm"
                value={row.warehouseId || ""}
                onChange={(e) => updatePrLineItem(row.id, "warehouseId", e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">Warehouse *</option>
                {warehouses.map((w) => (<option key={w.id} value={String(w.id)}>{w.name}</option>))}
              </select>
            </div>
          </div>
        );
      }
      return (
        <select
          className="form-select form-select-sm"
          value={row.itemId}
          onChange={(e) => updatePrLineItem(row.id, "itemId", e.target.value)}
          style={{ width: "100%", minWidth: "180px" }}
        >
          <option value="">Select item</option>
          {materialItems.map((i) => (<option key={i.id} value={String(i.id)}>{i.name} ({i.sku})</option>))}
        </select>
      );
    }},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <div className="d-flex justify-content-center align-items-center">
        <input type="number" className="form-control form-control-sm" value={row.quantity} onChange={(e) => updatePrLineItem(row.id, "quantity", e.target.value)} placeholder="0" min="1" style={{ width: "80px", textAlign: "center" }} />
      </div>
    )},
    { key: "unitId", label: "Unit *", sortable: false, align: "center", render: (row) => (
      <select className="form-select form-select-sm" value={row.unitId} onChange={(e) => updatePrLineItem(row.id, "unitId", e.target.value)} style={{ width: "100%", minWidth: "120px" }}>
        <option value="">Select unit</option>
        {(config?.units || []).map((u) => (<option key={u.id} value={String(u.id)}>{u.abbreviation || u.name}</option>))}
      </select>
    )},
    { key: "estUnitCost", label: "Est. Unit Cost", sortable: false, align: "right", render: (row) => (
      <input type="number" className="form-control form-control-sm" value={row.estUnitCost} onChange={(e) => updatePrLineItem(row.id, "estUnitCost", e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ width: "100px", textAlign: "right" }} />
    )},
    { key: "estTotalCost", label: "Est. Total Cost", sortable: false, align: "right", render: (row) => {
      const qty = Number(row.quantity) || 0;
      const cost = Number(row.estUnitCost) || 0;
      return <span className="inventory-mono fw-semibold">${(qty * cost).toFixed(2)}</span>;
    }},
    { key: "actions", label: "Remove", sortable: false, align: "center", render: (row) => (
      <Button variant="ghost" size="sm" onClick={() => removePrLineItem(row.id)} title="Remove item"><Trash2 size={14} /></Button>
    )},
  ], [materialItems, config, warehouses, updatePrLineItem, removePrLineItem]);

  // Read-only PR line item columns (used when viewing a PR).
  const prLineItemColumnsReadOnly = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, render: (row) => {
      if (row.isNewItem) {
        return (
          <span>
            <Badge bg="info" text="dark">NEW</Badge>{" "}
            {row.newItemName || row.itemName || "—"}
            {row.newItemSku ? ` (${row.newItemSku})` : ""}
          </span>
        );
      }
      const item = itemMap[String(row.itemId)];
      return <span>{item ? `${item.name}${item.sku ? ` (${item.sku})` : ""}` : "—"}</span>;
    }},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <span>{row.quantity || "—"}</span>
    )},
    { key: "unitId", label: "Unit *", sortable: false, align: "center", render: (row) => (
      <span>{unitLookup[String(row.unitId)] || "—"}</span>
    )},
    { key: "estUnitCost", label: "Est. Unit Cost", sortable: false, align: "right", render: (row) => (
      <span className="inventory-mono">${(Number(row.estUnitCost) || 0).toFixed(2)}</span>
    )},
    { key: "estTotalCost", label: "Est. Total Cost", sortable: false, align: "right", render: (row) => {
      const qty = Number(row.quantity) || 0;
      const cost = Number(row.estUnitCost) || 0;
      return <span className="inventory-mono fw-semibold">${(qty * cost).toFixed(2)}</span>;
    }},
  ], [itemMap, unitLookup]);

  // ─── PO Line Item Columns ──────────────────────────────────
  const poLineItemColumns = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, render: (row) => (
      <select className="form-select form-select-sm" value={row.itemId} onChange={(e) => updatePoLineItem(row.id, "itemId", e.target.value)} style={{ width: "100%", minWidth: "180px" }}>
        <option value="">Select item</option>
        {materialItems.map((i) => (<option key={i.id} value={String(i.id)}>{i.name} ({i.sku})</option>))}
      </select>
    )},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
        <input type="number" className="form-control form-control-sm" value={row.quantity} onChange={(e) => updatePoLineItem(row.id, "quantity", e.target.value)} placeholder="0" min="1" style={{ width: "80px", textAlign: "center" }} />
        <span className="text-muted small">{unitForItem(row.itemId)}</span>
      </div>
    )},
    { key: "unitPrice", label: "Unit Price", sortable: false, align: "right", render: (row) => (
      <input type="number" className="form-control form-control-sm" value={row.unitPrice} onChange={(e) => updatePoLineItem(row.id, "unitPrice", e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ width: "100px", textAlign: "right" }} />
    )},
    { key: "total", label: "Total", sortable: false, align: "right", render: (row) => {
      const qty = Number(row.quantity) || 0;
      const price = Number(row.unitPrice) || 0;
      return <span className="inventory-mono fw-semibold">${(qty * price).toFixed(2)}</span>;
    }},
    { key: "actions", label: "Remove", sortable: false, align: "center", render: (row) => (
      <Button variant="ghost" size="sm" onClick={() => removePoLineItem(row.id)} title="Remove item"><Trash2 size={14} /></Button>
    )},
  ], [materialItems, updatePoLineItem, removePoLineItem, unitForItem]);

  // Read-only PO line item columns (used when viewing a PO).
  const poLineItemColumnsReadOnly = useMemo(() => [
    { key: "itemId", label: "Item", sortable: false, render: (row) => {
      const item = itemMap[String(row.itemId)];
      return <span>{item ? `${item.name}${item.sku ? ` (${item.sku})` : ""}` : "—"}</span>;
    }},
    { key: "quantity", label: "Qty", sortable: false, align: "center", render: (row) => (
      <span>{row.quantity || "—"}</span>
    )},
    { key: "unitPrice", label: "Unit Price", sortable: false, align: "right", render: (row) => (
      <span className="inventory-mono">${(Number(row.unitPrice) || 0).toFixed(2)}</span>
    )},
    { key: "total", label: "Total", sortable: false, align: "right", render: (row) => {
      const qty = Number(row.quantity) || 0;
      const price = Number(row.unitPrice) || 0;
      return <span className="inventory-mono fw-semibold">${(qty * price).toFixed(2)}</span>;
    }},
  ], [itemMap]);

  // ─── Render ────────────────────────────────────────────────
  if (hideSidebar) {
    // ─── PR FORM VIEW ────────────────────────────────────────
    if (view === "pr") {
      return (
        <div className="tx-form-page">
          <div className="tx-form-header">
            <div>
              <h1 className="tx-form-title">
                <ClipboardList size={22} style={{ color: "var(--psb-blue, #3b82f6)" }} />
                {isViewingPrEditable ? "Edit Purchase Request" : isViewingPr ? "View Purchase Request" : isEditing ? "Edit Purchase Request" : "New Purchase Request"}
              </h1>
              <p className="tx-form-subtitle">{isViewingPrEditable ? "Update the purchase request details and line items." : isViewingPr ? "Review the purchase request details." : isEditing ? "Update the purchase request details and line items." : "Create a purchase request for materials and supplies."}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate ? onNavigate("purchaseRequests") : router.push("/inventory/purchase-requests")}>
              <ArrowLeft size={14} /> Back to Purchase Requests
            </Button>
          </div>
          <div className="tx-form-layout tx-form-layout--full">
            <div className="tx-form-main">
              <Card className="tx-form-card">
                <div className="tx-form-card-header">
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">PR Reference #</label>
                      <Input value={prForm.refNo} onChange={(e) => updatePrForm("refNo", e.target.value)} placeholder="Auto-generated" disabled={prReadOnly} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Date</label>
                      <input type="date" className="form-control" value={prForm.date} onChange={(e) => updatePrForm("date", e.target.value)} disabled={prReadOnly} />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Requested By *</label>
                      <select className="form-select" value={prForm.requestedBy} onChange={(e) => updatePrForm("requestedBy", e.target.value)} disabled={prReadOnly}>
                        <option value="">Select user</option>
                        {users.map((u) => (<option key={u.id} value={String(u.id)}>{u.first_name} {u.last_name}{u.email ? ` (${u.email})` : ""}</option>))}
                      </select>
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Department *</label>
                      <select className="form-select" value={prForm.department} onChange={(e) => updatePrForm("department", e.target.value)} disabled={prReadOnly}>
                        <option value="">Select department</option>
                        {departments.map((d) => (<option key={d.id} value={String(d.id)}>{d.dept_name}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Required Date *</label>
                      <input type="date" className="form-control" value={prForm.requiredDate} onChange={(e) => updatePrForm("requiredDate", e.target.value)} disabled={prReadOnly} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Priority</label>
                      <select className="form-select" value={prForm.priority} onChange={(e) => updatePrForm("priority", e.target.value)} disabled={prReadOnly}>
                        {PR_PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field" style={{ gridColumn: "1 / -1" }}>
                      <label className="tx-form-label">Remarks</label>
                      <Input value={prForm.remarks} onChange={(e) => updatePrForm("remarks", e.target.value)} placeholder="Justification, special instructions, etc." disabled={prReadOnly} />
                    </div>
                  </div>
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-section-header">
                    <h3>Requested Items *</h3>
                    {!prReadOnly && (
                      <div className="d-flex gap-2">
                        <Button variant="outline-primary" size="sm" onClick={addNewMaterialItem} disabled={isBusy}><Plus size={14} /> Add New Item</Button>
                        <Button variant="success" size="sm" onClick={addPrLineItem} disabled={isBusy}><Plus size={14} /> Add Item</Button>
                      </div>
                    )}
                  </div>
                  {prLineItems.length > 0 && <TableZ data={prLineItems} columns={prReadOnly ? prLineItemColumnsReadOnly : prLineItemColumns} rowIdKey="id" hideSearch hideFooter emptyMessage="" />}
                  {prLineItems.length === 0 && <p className="tx-form-empty">No items added yet. Click "Add Item" to start.</p>}
                </div>
                {!prReadOnly && (
                  <div className="tx-form-actions">
                    {!(isEditing || isViewingPrEditable) && (
                      <Button variant="ghost" size="sm" onClick={() => { setPrLineItems(createDefaultPrLineItems()); updatePrForm("remarks", ""); }} disabled={isBusy}><X size={14} /> Clear Form</Button>
                    )}
                    <Button variant="secondary" size="md" onClick={() => handlePrSubmit(true)} loading={isBusy} disabled={isBusy}><Save size={14} /> {isEditing || isViewingPrEditable ? "Update as Draft" : "Save as Draft"}</Button>
                    <Button variant="danger" size="md" onClick={handlePrSubmitClick} loading={isBusy} disabled={isBusy}><Save size={14} /> {isEditing || isViewingPrEditable ? "Update Purchase Request" : "Submit Purchase Request"}</Button>
                  </div>
                )}
              </Card>
            </div>
          </div>

          <Modal
            show={showPrSubmitConfirm}
            onHide={() => setShowPrSubmitConfirm(false)}
            title="Confirm Purchase Request Submission"
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowPrSubmitConfirm(false)} disabled={isBusy}>Cancel</Button>
                <Button variant="danger" size="md" onClick={() => { setShowPrSubmitConfirm(false); handlePrSubmit(false); }} loading={isBusy} disabled={isBusy}>Confirm & Submit</Button>
              </>
            }
          >
            <p className="text-muted small mb-3">Please review the details below before submitting this purchase request.</p>
            <div className="mb-2">
              <div className="fw-semibold">PR Reference #</div>
              <div>{prForm.refNo || "—"}</div>
            </div>
            <div className="mb-2">
              <div className="fw-semibold">Requested By</div>
              <div>{(() => {
                const u = userById[String(prForm.requestedBy)];
                return u ? `${u.first_name} ${u.last_name}` : "—";
              })()}</div>
            </div>
            <div className="mb-2">
              <div className="fw-semibold">Department</div>
              <div>{(() => {
                const d = deptById[String(prForm.department)];
                return d ? d.dept_name : "—";
              })()}</div>
            </div>
            <div className="mb-2">
              <div className="fw-semibold">Line Items</div>
              <div>{prLineItems.filter((li) => !isPrLineItemEmpty(li)).length}</div>
            </div>
            <div className="mb-2">
              <div className="fw-semibold">Estimated Total Cost</div>
              <div className="inventory-mono fw-semibold">
                ${prLineItems.filter((li) => !isPrLineItemEmpty(li)).reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.estUnitCost) || 0), 0).toFixed(2)}
              </div>
            </div>
          </Modal>

        </div>
      );
    }

    // ─── PO FORM VIEW ────────────────────────────────────────
    if (view === "po") {
      return (
        <div className="tx-form-page">
          <div className="tx-form-header">
            <div> 
              <h1 className="tx-form-title">
                <FileText size={22} style={{ color: "var(--psb-blue, #3b82f6)" }} />
                {isViewingPo ? "View Purchase Order" : isEditingPo ? "Edit Purchase Order" : "New Purchase Order"}
              </h1>
              <p className="tx-form-subtitle">{isViewingPo ? "Review the purchase order details." : isEditingPo ? "Update the purchase order details and line items." : "Create a purchase order from an approved request."}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate ? onNavigate("purchaseOrders") : router.push("/inventory/purchase-orders")}>
              <ArrowLeft size={14} /> Back to Purchase Orders
            </Button>
          </div>
          <div className="tx-form-layout tx-form-layout--full">
            <div className="tx-form-main">
              <Card className="tx-form-card">
                <div className="tx-form-card-header">
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">PO Reference #</label>
                      <Input value={poForm.refNo} onChange={(e) => updatePoForm("refNo", e.target.value)} placeholder="Auto-generated" disabled={isViewingPo} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Date</label>
                      <input type="date" className="form-control" value={poForm.date} onChange={(e) => updatePoForm("date", e.target.value)} disabled={isViewingPo} />
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Supplier *</label>
                      <select className="form-select" value={poForm.supplierId} onChange={(e) => updatePoForm("supplierId", e.target.value)} disabled={isViewingPo}>
                        <option value="">Select supplier</option>
                        {suppliers.map((s) => (<option key={s.id} value={String(s.id)}>{s.name}</option>))}
                      </select>
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">PR Reference</label>
                      <select className="form-select" value={poForm.prRef} onChange={(e) => handlePoPrChange(e.target.value)} disabled={isViewingPo}>
                        <option value="">Select approved PR</option>
                        {approvedPrsWithoutPo.map((pr) => {
                          const requester = userById[String(pr.requestor_id)];
                          const label = requester
                            ? `${pr.pr_no || pr.id} — ${requester.first_name} ${requester.last_name}`
                            : (pr.pr_no || pr.id);
                          return <option key={pr.id} value={String(pr.id)}>{label}</option>;
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Delivery Date</label>
                      <input type="date" className="form-control" value={poForm.deliveryDate} onChange={(e) => updatePoForm("deliveryDate", e.target.value)} disabled={isViewingPo} />
                    </div>
                    <div className="tx-form-field">
                      <label className="tx-form-label">Delivery Location</label>
                      <select className="form-select" value={poForm.deliveryLocation} onChange={(e) => updatePoForm("deliveryLocation", e.target.value)} disabled={isViewingPo}>
                        <option value="">Select delivery location</option>
                        {warehouses.map((w) => (<option key={w.id} value={String(w.id)}>{w.name}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="tx-form-field-row">
                    <div className="tx-form-field">
                      <label className="tx-form-label">Payment Terms</label>
                      <select className="form-select" value={poForm.paymentTerms} onChange={(e) => updatePoForm("paymentTerms", e.target.value)} disabled={isViewingPo}>
                        {PO_PAYMENT_TERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-section-header">
                    <h3>Order Items</h3>
                    {!isViewingPo && <Button variant="success" size="sm" onClick={addPoLineItem} disabled={isBusy}><Plus size={14} /> Add Item</Button>}
                  </div>
                  {poLineItems.length > 0 && <TableZ data={poLineItems} columns={isViewingPo ? poLineItemColumnsReadOnly : poLineItemColumns} rowIdKey="id" hideSearch hideFooter emptyMessage="" />}
                  {poLineItems.length === 0 && <p className="tx-form-empty">No items added yet. Click "Add Item" to start.</p>}
                </div>
                <div className="tx-form-section">
                  <div className="tx-form-field">
                    <label className="tx-form-label">Remarks</label>
                    <Input value={poForm.remarks} onChange={(e) => updatePoForm("remarks", e.target.value)} placeholder="Delivery instructions, special terms, etc." disabled={isViewingPo} />
                  </div>
                </div>
                {!isViewingPo && (
                  <div className="tx-form-actions">
                    <Button variant="ghost" size="sm" onClick={() => { setPoLineItems([]); updatePoForm("remarks", ""); }} disabled={isBusy}><X size={14} /> Clear Form</Button>
                    <Button variant="secondary" size="md" onClick={() => handlePoSubmit(true)} loading={isBusy} disabled={isBusy}><Save size={14} /> {isEditingPo ? "Update as Draft" : "Save as Draft"}</Button>
                    <Button variant="danger" size="md" onClick={() => handlePoSubmit(false)} loading={isBusy} disabled={isBusy}><Save size={14} /> {isEditingPo ? "Update Purchase Order" : "Submit Purchase Order"}</Button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      );
    }

    // ─── DASHBOARD VIEW (default) ────────────────────────────
    return (
      <div className="procurement-page">
        {/* ── Page Header ─────────────────────────────────── */}
        <header className="proc-page-header">
          <div className="proc-page-header__copy">
            <h1 className="proc-page-header__title">Procurement Dashboard</h1>
            <p className="proc-page-header__desc">
              Monitor purchasing activities, approvals and material acquisition across inventory operations.
            </p>
          </div>
          <div className="proc-header-actions">
            
            <Button variant="primary" size="sm" onClick={() => setView("pr")}>
              <Plus size={14} /> New Purchase Request
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={() => setView("po")}>
              <FileText size={14} />New Purchase Order
            </Button>
          </div>
        </header>

        {/* ── KPI Cards ───────────────────────────────────── */}
        <section className="proc-section">
          <div className="proc-kpi-grid">
            <article className="proc-kpi-card">
              <div className="proc-kpi-label">Purchase Requests</div>
              <div className="proc-kpi-value">{kpiPurchaseRequests}</div>
              <div className="proc-kpi-meta">Current period</div>
            </article>
            <article className="proc-kpi-card proc-kpi-card--warning">
              <div className="proc-kpi-label">Pending Approval</div>
              <div className="proc-kpi-value">{kpiPendingApproval}</div>
              <div className="proc-kpi-meta">Requires attention</div>
            </article>
            <article className="proc-kpi-card proc-kpi-card--success">
              <div className="proc-kpi-label">Active Purchase Orders</div>
              <div className="proc-kpi-value">{kpiActivePurchaseOrders}</div>
              <div className="proc-kpi-meta">Current active orders</div>
            </article>
            <article className="proc-kpi-card">
              <div className="proc-kpi-label">Procurement Spend</div>
              <div className="proc-kpi-value">${kpiProcurementSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="proc-kpi-meta">Current period</div>
            </article>
          </div>
        </section>

        {/* ── Recent Purchase Requests ────────────────────── */}
        <section className="proc-section">
          <div className="proc-section-header">
            <div>
              <h2 className="proc-section-title">Recent Purchase Requests</h2>
              <p className="proc-section-desc">Latest purchase requests from the inventory procurement process.</p>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={() => onNavigate ? onNavigate("purchaseRequests") : router.push("/inventory/purchase-requests")}>
              View All <ArrowRight size={14} />
            </Button>
          </div>
          <div className="proc-card">
            <div className="proc-table-container">
              <table className="proc-table proc-table--expandable">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}></th>
                    <th>PR Number</th>
                    <th>Requester</th>
                    <th>Department</th>
                    <th>Date</th>
                    <th>Required Date</th>
                    <th>Priority</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseRequests.length === 0 && (
                    <tr className="proc-table-empty">
                      <td colSpan={9}>
                        <div className="proc-empty-state">
                          <div className="proc-empty-state__icon">—</div>
                          <strong>No purchase requests found.</strong>
                          <span>Purchase request data will appear here when available.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {paginatedPurchaseRequests.map((pr) => {
                    const prId = String(pr.id);
                    const requester = userById[String(pr.requestor_id)];
                    const department = deptById[String(pr.dept_id)];
                    const lineItems = prItemsByPrId[prId] || [];
                    const totalAmount = lineItems.reduce((sum, item) => sum + (Number(item.est_total_cost) || 0), 0);
                    const isExpanded = expandedPrIds.has(prId);
                    return (
                      <React.Fragment key={prId}>
                        <tr onClick={() => togglePrExpand(prId)} className="proc-table-row--clickable">
                          <td>
                            <span className="proc-expand-icon">{isExpanded ? "▼" : "▶"}</span>
                          </td>
                          <td className="fw-semibold">{pr.pr_no || prId}</td>
                          <td>{requester ? `${requester.first_name} ${requester.last_name}` : displayValue(pr.requestor_id)}</td>
                          <td>{department ? department.dept_name : displayValue(pr.dept_id)}</td>
                          <td>{displayValue(pr.pr_date)}</td>
                          <td>{displayValue(pr.date_required)}</td>
                          <td><PriorityBadge priority={pr.priority} /></td>
                          <td className="inventory-mono fw-semibold">${totalAmount.toFixed(2)}</td>
                          <td><StatusBadge name={statusNameForPr(pr)} /></td>
                        </tr>
                        {isExpanded && (
                          <tr className="proc-detail-row">
                            <td colSpan={9}>
                              <div className="proc-detail-panel">
                                <h4 className="proc-detail-title">Requested Items</h4>
                                <table className="proc-detail-table">
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th>SKU</th>
                                      <th>Qty</th>
                                      <th>UOM</th>
                                      <th>Est. Unit Cost</th>
                                      <th>Est. Total Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lineItems.map((item) => (
                                      <tr key={item.id}>
                                        <td>{item.itemName}</td>
                                        <td>{displayValue(item.itemSku)}</td>
                                        <td>{item.quantity}</td>
                                        <td>{unitLookup[String(item.uom_id)] || displayValue(item.uom_id)}</td>
                                        <td className="inventory-mono">${Number(item.est_unit_cost || 0).toFixed(2)}</td>
                                        <td className="inventory-mono fw-semibold">${Number(item.est_total_cost || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    {lineItems.length === 0 && (
                                      <tr><td colSpan={6} className="text-muted text-center py-2">No items for this request.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {purchaseRequests.length > 0 && (
              <div className="proc-pagination">
                <span className="proc-pagination-info">
                  Showing {Math.min((prPage - 1) * PROC_PAGE_SIZE + 1, purchaseRequests.length)}–{Math.min(prPage * PROC_PAGE_SIZE, purchaseRequests.length)} of {purchaseRequests.length}
                </span>
                <div className="proc-pagination-controls">
                  <button
                    type="button"
                    className="proc-pagination-btn"
                    onClick={() => setPrPage((p) => Math.max(1, p - 1))}
                    disabled={prPage <= 1}
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: prPageCount }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`proc-pagination-btn${pageNum === prPage ? " is-active" : ""}`}
                      onClick={() => setPrPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="proc-pagination-btn"
                    onClick={() => setPrPage((p) => Math.min(prPageCount, p + 1))}
                    disabled={prPage >= prPageCount}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Active Purchase Orders ─────────────────────── */}
        <section className="proc-section">
          <div className="proc-section-header">
            <div>
              <h2 className="proc-section-title">Active Purchase Orders</h2>
              <p className="proc-section-desc">Purchase orders currently in progress.</p>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={() => onNavigate ? onNavigate("purchaseOrders") : router.push("/inventory/purchase-orders")}>
              View All <ArrowRight size={14} />
            </Button>
          </div>
          <div className="proc-card">
            <div className="proc-table-container">
              <table className="proc-table proc-table--expandable">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}></th>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activePurchaseOrders.length === 0 && (
                    <tr className="proc-table-empty">
                      <td colSpan={6}>
                        <div className="proc-empty-state">
                          <div className="proc-empty-state__icon">—</div>
                          <strong>No active purchase orders.</strong>
                          <span>Active purchase orders will appear here.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {paginatedActivePurchaseOrders.map((po) => {
                    const poId = String(po.id ?? po.po_id);
                    const isExpanded = expandedPoIds.has(poId);
                    const poItems = poItemsByPoId[poId] || [];
                    return (
                      <React.Fragment key={poId}>
                        <tr onClick={() => togglePoExpand(poId)} className="proc-table-row--clickable">
                          <td>
                            <span className="proc-expand-icon">{isExpanded ? "▼" : "▶"}</span>
                          </td>
                          <td className="fw-semibold">{po.po_no || poId}</td>
                          <td>{po.supplierName || displayValue(po.supplier_id)}</td>
                          <td>{displayValue(po.created_at)}</td>
                          <td className="inventory-mono fw-semibold">${Number(po.est_total_cost || 0).toFixed(2)}</td>
                          <td><StatusBadge name={statusNameForPo(po)} /></td>
                        </tr>
                        {isExpanded && (
                          <tr className="proc-detail-row">
                            <td colSpan={6}>
                              <div className="proc-detail-panel">
                                <h4 className="proc-detail-title">Order Items</h4>
                                <table className="proc-detail-table">
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th>SKU</th>
                                      <th>Qty</th>
                                      <th>UOM</th>
                                      <th>Est. Unit Cost</th>
                                      <th>Est. Total Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {poItems.map((item) => (
                                      <tr key={item.id}>
                                        <td>{item.itemName}</td>
                                        <td>{displayValue(item.itemSku)}</td>
                                        <td>{item.quantity}</td>
                                        <td>{unitLookup[String(item.uom_id)] || displayValue(item.uom_id)}</td>
                                        <td className="inventory-mono">${Number(item.est_unit_cost || 0).toFixed(2)}</td>
                                        <td className="inventory-mono fw-semibold">${Number(item.est_total_cost || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    {poItems.length === 0 && (
                                      <tr><td colSpan={6} className="text-muted text-center py-2">No items for this order.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activePurchaseOrders.length > 0 && (
              <div className="proc-pagination">
                <span className="proc-pagination-info">
                  Showing {Math.min((poPage - 1) * PROC_PAGE_SIZE + 1, activePurchaseOrders.length)}–{Math.min(poPage * PROC_PAGE_SIZE, activePurchaseOrders.length)} of {activePurchaseOrders.length}
                </span>
                <div className="proc-pagination-controls">
                  <button
                    type="button"
                    className="proc-pagination-btn"
                    onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                    disabled={poPage <= 1}
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: poPageCount }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`proc-pagination-btn${pageNum === poPage ? " is-active" : ""}`}
                      onClick={() => setPoPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="proc-pagination-btn"
                    onClick={() => setPoPage((p) => Math.min(poPageCount, p + 1))}
                    disabled={poPage >= poPageCount}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Analytics Grid ──────────────────────────────── */}
        <section className="proc-section">
          <div className="proc-analytics-grid">
            {/* Procurement Spend */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Procurement Spend</h2>
                  <p className="proc-card-subtitle">Spending trend based on actual procurement data.</p>
                </div>
              </div>
              <div className="proc-card-body">
                <div className="proc-spend-summary">
                  <div>
                    <div className="proc-spend-value">—</div>
                    <div className="proc-spend-label">Current period</div>
                  </div>
                </div>
                <div className="proc-chart-placeholder">No procurement spend data available.</div>
              </div>
            </article>

            {/* Procurement Health */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Procurement Health</h2>
                  <p className="proc-card-subtitle">Performance indicators calculated from actual data.</p>
                </div>
              </div>
              <div className="proc-card-body">
                <div className="proc-health-grid">
                  {[
                    { label: "Supplier On-Time Delivery", value: "—", status: "Not available" },
                    { label: "Cost Savings", value: "—", status: "Not available" },
                    { label: "Average Lead Time", value: "—", status: "Not available" },
                    { label: "Delayed Orders", value: "—", status: "Not available" },
                  ].map((item, i) => (
                    <div key={i} className="proc-health-item">
                      <div className="proc-health-label">{item.label}</div>
                      <div className="proc-health-value">{item.value}</div>
                      <div className="proc-health-status">{item.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* ── Bottom Operations ───────────────────────────── */}
        <section className="proc-section">
          <div className="proc-ops-grid">
            {/* Approval Queue */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Approval Queue</h2>
                  <p className="proc-card-subtitle">Purchase requests requiring your attention.</p>
                </div>
                <span className="proc-status proc-status--pending">—</span>
              </div>
              <div className="proc-queue">
                <div className="proc-empty-state">
                  <div className="proc-empty-state__icon">—</div>
                  <strong>No pending approvals.</strong>
                  <span>Assigned approval tasks will appear here.</span>
                </div>
              </div>
            </article>

            {/* Supplier Performance */}
            <article className="proc-card">
              <div className="proc-card-header">
                <div>
                  <h2 className="proc-card-title">Supplier Performance</h2>
                  <p className="proc-card-subtitle">Supplier performance based on actual procurement activity.</p>
                </div>
              </div>
              <div className="proc-supplier-list">
                <div className="proc-supplier-empty">No supplier performance data available.</div>
              </div>
            </article>
          </div>
        </section>

        {/* ── Dashboard-specific CSS ──────────────────────── */}
        <style jsx>{`
          /* =========================================================
             DESIGN TOKENS
          ========================================================= */
          .procurement-page {
            --proc-primary: #1877B9;
            --proc-primary-dark: #0F5D91;
            --proc-black: #111518;
            --proc-charcoal: #1C2227;
            --proc-steel: #39434B;
            --proc-bg: #F3F5F6;
            --proc-surface: #FFFFFF;
            --proc-surface-soft: #F8FAFB;
            --proc-border: #E1E6E9;
            --proc-border-dark: #CBD3D8;
            --proc-text: #172027;
            --proc-text-secondary: #66737C;
            --proc-text-muted: #8A969E;
            --proc-success: #248661;
            --proc-success-bg: #EAF6F1;
            --proc-warning: #C98228;
            --proc-warning-bg: #FFF5E8;
            --proc-danger: #C94E4E;
            --proc-danger-bg: #FDEEEE;
            --proc-radius-sm: 6px;
            --proc-radius-md: 10px;
            --proc-radius-lg: 14px;
            --proc-shadow-sm: 0 2px 8px rgba(17, 21, 24, 0.05);
            --proc-shadow-md: 0 8px 24px rgba(17, 21, 24, 0.07);
            --proc-content-max: 1600px;

            width: 100%;
            min-width: 0;
            max-width: var(--proc-content-max);
            margin: 0 auto;
            padding: 16px;
          }

          /* =========================================================
             PAGE HEADER
          ========================================================= */
          .proc-page-header {
            display: flex;
            flex-direction: column;
            gap: 18px;
            margin-bottom: 20px;
          }
          .proc-page-header__title {
            margin: 0;
            font-size: 26px;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: var(--proc-black);
          }
          .proc-page-header__desc {
            max-width: 650px;
            margin: 8px 0 0;
            color: var(--proc-text-secondary);
            font-size: 14px;
          }
          .proc-header-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          /* =========================================================
             SECTION
          ========================================================= */
          .proc-section { margin-bottom: 18px; }
          .proc-section-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
          }
          .proc-section-title {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: -0.01em;
            color: var(--proc-black);
          }
          .proc-section-desc {
            margin: 3px 0 0;
            color: var(--proc-text-muted);
            font-size: 12px;
          }

          /* =========================================================
             KPI
          ========================================================= */
          .proc-kpi-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .proc-kpi-card {
            position: relative;
            min-width: 0;
            padding: 16px;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-kpi-card::before {
            content: "";
            position: absolute;
            left: 0; top: 12px; bottom: 12px;
            width: 3px;
            background: var(--proc-primary);
            border-radius: 0 3px 3px 0;
          }
          .proc-kpi-card--warning::before { background: var(--proc-warning); }
          .proc-kpi-card--success::before { background: var(--proc-success); }
          .proc-kpi-label {
            margin-left: 7px;
            color: var(--proc-text-secondary);
            font-size: 12px;
            font-weight: 600;
          }
          .proc-kpi-value {
            margin: 8px 0 0 7px;
            font-size: 28px;
            line-height: 1;
            font-weight: 800;
            letter-spacing: -0.04em;
            color: var(--proc-black);
          }
          .proc-kpi-meta {
            margin: 8px 0 0 7px;
            color: var(--proc-text-muted);
            font-size: 11px;
          }

          /* =========================================================
             WORKFLOW
          ========================================================= */
          .proc-workflow-card {
            overflow: hidden;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-workflow-scroll {
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
          }
          .proc-workflow {
            display: flex;
            align-items: stretch;
            min-width: max-content;
            padding: 16px;
          }
          .proc-workflow-step { min-width: 135px; display: flex; align-items: center; }
          .proc-workflow-node { width: 100%; text-align: center; }
          .proc-workflow-icon {
            width: 38px; height: 38px;
            margin: 0 auto 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #EAF3F9;
            color: var(--proc-primary);
            font-size: 13px;
            font-weight: 800;
          }
          .proc-workflow-step--active .proc-workflow-icon {
            background: var(--proc-warning-bg);
            color: var(--proc-warning);
          }
          .proc-workflow-step--complete .proc-workflow-icon {
            background: var(--proc-success-bg);
            color: var(--proc-success);
          }
          .proc-workflow-name {
            color: var(--proc-text);
            font-size: 11px;
            font-weight: 700;
          }
          .proc-workflow-count {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 11px;
          }
          .proc-workflow-connector {
            flex: 0 0 38px;
            height: 1px;
            margin: 19px 8px 0;
            background: var(--proc-border-dark);
          }

          /* =========================================================
             ANALYTICS
          ========================================================= */
          .proc-analytics-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .proc-card {
            min-width: 0;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-md);
            box-shadow: var(--proc-shadow-sm);
          }
          .proc-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 16px 0;
          }
          .proc-card-title {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
            color: var(--proc-black);
          }
          .proc-card-subtitle {
            margin: 3px 0 0;
            color: var(--proc-text-muted);
            font-size: 11px;
          }
          .proc-card-body { padding: 16px; }

          /* =========================================================
             EMPTY STATE
          ========================================================= */
          .proc-empty-state {
            min-height: 150px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            text-align: center;
            color: var(--proc-text-muted);
          }
          .proc-empty-state__icon {
            width: 42px; height: 42px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: var(--proc-surface-soft);
            border: 1px solid var(--proc-border);
            color: var(--proc-text-muted);
            font-size: 16px;
          }
          .proc-empty-state strong {
            color: var(--proc-text-secondary);
            font-size: 13px;
          }
          .proc-empty-state span {
            margin-top: 3px;
            font-size: 11px;
          }

          /* =========================================================
             SPEND SUMMARY
          ========================================================= */
          .proc-spend-summary {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            margin-bottom: 18px;
          }
          .proc-spend-value {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.04em;
            color: var(--proc-black);
          }
          .proc-spend-label {
            color: var(--proc-text-muted);
            font-size: 11px;
          }

          /* =========================================================
             CHART PLACEHOLDER
          ========================================================= */
          .proc-chart-placeholder {
            width: 100%;
            min-height: 190px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed var(--proc-border-dark);
            border-radius: var(--proc-radius-sm);
            background:
              linear-gradient(to bottom,
                transparent 24%, rgba(225,230,233,0.55) 25%, transparent 26%,
                transparent 49%, rgba(225,230,233,0.55) 50%, transparent 51%,
                transparent 74%, rgba(225,230,233,0.55) 75%, transparent 76%);
            color: var(--proc-text-muted);
            font-size: 12px;
          }

          /* =========================================================
             HEALTH METRICS
          ========================================================= */
          .proc-health-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .proc-health-item {
            padding: 13px;
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-sm);
            background: var(--proc-surface-soft);
          }
          .proc-health-label {
            color: var(--proc-text-secondary);
            font-size: 11px;
            font-weight: 600;
          }
          .proc-health-value {
            margin-top: 5px;
            font-size: 20px;
            font-weight: 800;
            color: var(--proc-black);
          }
          .proc-health-status {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 10px;
          }

          /* =========================================================
             TABLE
          ========================================================= */
          .proc-table-container {
            width: 100%;
            overflow-x: auto;
            border-top: 1px solid var(--proc-border);
          }
          .proc-table {
            width: 100%;
            min-width: 760px;
            border-collapse: collapse;
          }
          .proc-table th,
          .proc-table td {
            padding: 13px 16px;
            text-align: left;
            white-space: nowrap;
            border-bottom: 1px solid var(--proc-border);
          }
          .proc-table th {
            background: var(--proc-surface-soft);
            color: var(--proc-text-muted);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .proc-table td {
            color: var(--proc-text-secondary);
            font-size: 12px;
          }
          .proc-table tbody tr {
            transition: background 0.15s ease;
            cursor: pointer;
          }
          .proc-table tbody tr:hover { background: #F8FBFD; }
          .proc-table-empty { cursor: default !important; }
          .proc-table-empty:hover { background: transparent !important; }
          .proc-table-empty td { height: 150px; text-align: center; }

          /* Expandable rows */
          .proc-table-row--clickable { cursor: pointer; }
          .proc-table-row--clickable:hover { background: #F0F6FA; }
          .proc-expand-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            color: var(--proc-text-muted);
            font-size: 11px;
          }
          .proc-detail-row { background: var(--proc-surface-soft) !important; cursor: default !important; }
          .proc-detail-row:hover { background: var(--proc-surface-soft) !important; }
          .proc-detail-panel { padding: 12px 16px 16px; }
          .proc-detail-title {
            margin: 0 0 10px;
            font-size: 12px;
            font-weight: 800;
            color: var(--proc-text-secondary);
          }
          .proc-detail-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--proc-surface);
            border: 1px solid var(--proc-border);
            border-radius: var(--proc-radius-sm);
          }
          .proc-detail-table th,
          .proc-detail-table td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--proc-border);
            font-size: 11px;
          }
          .proc-detail-table th {
            background: var(--proc-surface-soft);
            color: var(--proc-text-muted);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .proc-detail-table tbody tr:last-child td { border-bottom: none; }

          /* =========================================================
             STATUS
          ========================================================= */
          .proc-status {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 700;
          }
          .proc-status::before {
            content: "";
            width: 5px; height: 5px;
            border-radius: 50%;
            background: currentColor;
          }
          .proc-status--pending { background: var(--proc-warning-bg); color: var(--proc-warning); }
          .proc-status--approved { background: var(--proc-success-bg); color: var(--proc-success); }
          .proc-status--rejected { background: var(--proc-danger-bg); color: var(--proc-danger); }
          .proc-status--saved { background: #EAF3F9; color: var(--proc-primary); }
          .proc-status--default { background: #F3F5F6; color: var(--proc-text-secondary); }
          .proc-status--processing { background: #EAF3F9; color: var(--proc-primary); }

          /* Priority badges */
          .proc-priority {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .proc-priority::before {
            content: "";
            width: 5px; height: 5px;
            border-radius: 50%;
            background: currentColor;
          }
          .proc-priority--low { background: #E8F4FD; color: #2E7BB4; }
          .proc-priority--medium { background: #FFF5E8; color: #C98228; }
          .proc-priority--high { background: #FDEEEE; color: #C94E4E; }
          .proc-priority--urgent { background: #F3E8FF; color: #9333EA; }
          .proc-priority--default { background: #F3F5F6; color: var(--proc-text-muted); }

          /* =========================================================
             OPERATIONS GRID
          ========================================================= */
          .proc-ops-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
          }

          /* =========================================================
             APPROVAL QUEUE
          ========================================================= */
          .proc-queue {
            display: flex;
            flex-direction: column;
          }
          .proc-queue-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 64px;
            padding: 11px 16px;
            border-top: 1px solid var(--proc-border);
            cursor: pointer;
            transition: background 0.15s ease;
          }
          .proc-queue-item:hover { background: var(--proc-surface-soft); }
          .proc-queue-info { min-width: 0; }
          .proc-queue-title {
            color: var(--proc-text);
            font-size: 12px;
            font-weight: 750;
          }
          .proc-queue-meta {
            margin-top: 3px;
            color: var(--proc-text-muted);
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .proc-queue-value {
            flex: 0 0 auto;
            color: var(--proc-text);
            font-size: 12px;
            font-weight: 800;
          }

          /* =========================================================
             SUPPLIER
          ========================================================= */
          .proc-supplier-list { display: flex; flex-direction: column; }
          .proc-supplier-empty {
            min-height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--proc-text-muted);
            font-size: 12px;
            text-align: center;
          }

          /* =========================================================
             RESPONSIVE
          ========================================================= */
          @media (min-width: 480px) {
            .procurement-page { padding: 20px; }
            .proc-header-actions {
              grid-template-columns: auto auto;
              justify-content: flex-end;
            }
          }

          @media (min-width: 768px) {
            .procurement-page { padding: 24px; }
            .proc-page-header {
              flex-direction: row;
              align-items: flex-end;
              justify-content: space-between;
            }
            .proc-page-header__copy { min-width: 0; }
            .proc-header-actions { flex: 0 0 auto; }
            .proc-kpi-grid { grid-template-columns: repeat(2, 1fr); }
            .proc-analytics-grid { grid-template-columns: 1.5fr 1fr; }
            .proc-ops-grid { grid-template-columns: 1fr 1fr; }
          }

          @media (min-width: 1024px) {
            .procurement-page { padding: 28px 32px; }
            .proc-kpi-grid { grid-template-columns: repeat(4, 1fr); }
            .proc-page-header__title { font-size: 30px; }
          }

          @media (min-width: 1280px) {
            .procurement-page { padding: 32px 40px; }
            .proc-kpi-card { padding: 18px; }
          }

          /* =========================================================
             REDUCED MOTION
          ========================================================= */
          @media (prefers-reduced-motion: reduce) {
            .procurement-page *,
            .procurement-page *::before,
            .procurement-page *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // Standalone: render with full sidebar navigation (legacy separate page)
  return null;
}