/**
 * printPurchaseOrder — builds the Purchase Order body HTML and opens the
 * browser-native print window.
 *
 * Follows the PSB print function pattern:
 *   - Takes data as parameters (never closes over component state)
 *   - Builds a self-contained bodyHtml string
 *   - Delegates to the shared printDocument() utility
 *
 * @param {Object}   po          - Purchase Order header row
 * @param {Array}    lineItems   - Purchase Order line items
 * @param {Object}   [options]
 * @param {Object}   [options.unitById] - Map of unit id -> abbreviation/name
 */
import { printDocument } from "./printDocument";

function formatCurrency(value) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export function printPurchaseOrder(po, lineItems = [], options = {}) {
  const { unitById = {} } = options;

  const poNo = po?.po_no || po?.id || "—";
  const supplierName = po?.supplierName || displayValue(po?.supplier_id);
  const poDate = formatDate(po?.po_date || po?.created_at);
  const deliveryDate = formatDate(po?.delivery_date);
  const paymentTerms = displayValue(po?.payment_terms);
  const shippingMethod = displayValue(po?.delivery_location);
  const remarks = displayValue(po?.remarks);

  // Compute line item totals
  const items = (lineItems || []).map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    const unitCost = Number(item.est_unit_cost) || 0;
    const total = qty * unitCost;
    return {
      lineNo: idx + 1,
      name: item.itemName || "—",
      sku: displayValue(item.itemSku),
      qty,
      unit: unitById[String(item.uom_id)] || displayValue(item.uom_id),
      unitCost,
      total,
    };
  });

  const subtotal = items.reduce((sum, it) => sum + it.total, 0);

  const itemsRows = items.length
    ? items.map((it) => `
      <tr>
        <td>${it.lineNo}</td>
        <td class="desc-col">${it.name}${it.sku !== "—" ? ` (${it.sku})` : ""}</td>
        <td>${it.qty}</td>
        <td>${it.unit}</td>
        <td>${formatCurrency(it.unitCost)}</td>
        <td>${formatCurrency(it.total)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px;">No items for this order.</td></tr>`;

  const headerHtml = `
  <table class="header-table">
    <tr>
      <td style="width:60%;">
        <p class="company-name">Premium Steel Buildings Inc.</p>
        <p class="company-details">1810 Troy Ave,</p>
        <p class="company-details">New Castle, IN 47362,United States</p>
        <!--<p class="company-details">Phone: (555) 123-4567 &nbsp;|&nbsp; Email: accounts@psbuniverse.com</p>-->
      </td>
      <td style="width:40%; vertical-align:middle;">
        <div class="po-title">PURCHASE ORDER</div>
      </td>
    </tr>
  </table>

  <div class="spacer"></div>`;

  const bodyHtml = `
  <!-- PO Meta -->
  <table class="meta-table">
    <tr>
      <td class="label">PO Number:</td>
      <td class="value">${poNo}</td>
      <td class="label">Date:</td>
      <td class="value">${poDate}</td>
    </tr>
    <tr>
      <td class="label">Vendor:</td>
      <td class="value">${supplierName}</td>
      <td class="label">Delivery Date:</td>
      <td class="value">${deliveryDate}</td>
    </tr>
    <tr>
      <td class="label">Payment Terms:</td>
      <td class="value">${paymentTerms}</td>
      <td class="label">Shipping Method:</td>
      <td class="value">${shippingMethod}</td>
    </tr>
  </table>

  <div class="spacer"></div>

  <!-- Vendor / Ship To (commented out for now)
  <table class="addr-table">
    <tr>
      <td>
        <p class="addr-title">VENDOR</p>
        <p class="field">${supplierName}</p>
        <p class="field">${displayValue(po?.supplier_contact)}</p>
        <p class="field">${displayValue(po?.supplier_address)}</p>
        <p class="field">${displayValue(po?.supplier_phone)}</p>
      </td>
      <td>
        <p class="addr-title">SHIP TO</p>
        <p class="field">${shippingMethod}</p>
        <p class="field">${displayValue(po?.delivery_contact)}</p>
        <p class="field">${displayValue(po?.delivery_address)}</p>
        <p class="field">${displayValue(po?.delivery_phone)}</p>
      </td>
    </tr>
  </table>
  -->

  <div class="spacer"></div>

  <!-- Line items -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:8 %;">No</th>
        <th class="desc-col" style="width:38%;">Description</th>
        <th style="width:10%;">Qty</th>
        <th style="width:13%;">Unit</th>
        <th style="width:16%;">Unit Price</th>
        <th style="width:16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <!-- Totals -->
  <table class="totals-table">
    <tr><td class="label">Subtotal</td><td class="value">${formatCurrency(subtotal)}</td></tr>
    <tr><td class="label">Shipping & Handling</td><td class="value">—</td></tr>
    <tr><td class="label">Tax</td><td class="value">—</td></tr>
    <tr class="total-row"><td class="label">TOTAL</td><td class="value">${formatCurrency(subtotal)}</td></tr>
  </table>

  <!-- Notes -->
  <p class="notes-label">Notes / Special Instructions:</p>
  <div class="notes-line">${remarks}</div>
  <div class="notes-line"></div>`;

  const signoffHtml = `
  <table class="sig-table">
    <tr>
      <td>
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature / Date</div>
      </td>
      <td>
        <div class="sig-line"></div>
        <div class="sig-label">Vendor Acceptance / Date</div>
      </td>
    </tr>
  </table>`;

  printDocument({
    title: `Purchase Order — ${poNo}`,
    docTitle: "Purchase Order",
    docKicker: "PSB Universe",
    printLabel: "Print PO",
    bodyHtml,
    headerHtml,
    signoffHtml,
    footerHtml: "",
  });
}