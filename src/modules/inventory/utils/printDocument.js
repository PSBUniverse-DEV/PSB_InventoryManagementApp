/**
 * printDocument — opens a new window and writes a standalone, printable
 * HTML document. Framework-agnostic (browser-native API).
 *
 * Follows the PSB print function pattern:
 *   1. Opens a new browser window (window.open)
 *   2. Writes a complete, standalone HTML document (with inline CSS)
 *   3. Lets the user print via the browser's native print dialog (window.print())
 *
 * The document shell is generic and reusable. The header, signature lines,
 * and footer are rendered only when the corresponding options are provided,
 * so document-specific builders (e.g. printPurchaseOrder) can supply their
 * own header/signature layout via bodyHtml.
 *
 * @param {Object}   options
 * @param {string}   options.title        - Browser tab title
 * @param {string}   options.logoSrc      - Public URL to a logo image (optional)
 * @param {string}   options.docTitle     - Big document title (e.g. "Purchase Order")
 * @param {string}   options.docKicker    - Small uppercase label above title (optional)
 * @param {string}   options.printLabel   - Text for the Print button
 * @param {string}   options.bodyHtml     - The main document body HTML (fully built by caller)
 * @param {string}   [options.headerHtml] - Optional custom header HTML (replaces default doc-header)
 * @param {string}   [options.signoffHtml]- Optional custom signature HTML (replaces default signoff)
 * @param {string}   [options.footerHtml] - Optional custom footer HTML (replaces default doc-footer)
 */
export function printDocument({
  title,
  logoSrc = "/images/psb-logo.png",
  docTitle,
  docKicker = "",
  printLabel = "Print",
  bodyHtml,
  headerHtml,
  signoffHtml,
  footerHtml,
}) {
  const now = new Date();
  const printDate = now.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  const defaultHeader = `
  <div class="doc-header">
    <div style="display: flex; align-items: center; gap: 10px;">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="height: 48px; width: auto; display: block;" />` : ""}
      <div>
        ${docKicker ? `<div class="doc-kicker">${docKicker}</div>` : ""}
        <div class="doc-title">${docTitle}</div>
      </div>
    </div>
  </div>`;

  const defaultSignoff = `
  <div class="signoff">
    <div class="sig-line">Prepared by</div>
    <div class="sig-line">Received by</div>
  </div>`;

  const defaultFooter = `
  <div class="doc-footer">
    <span>PSB Universe &middot; Inventory Management</span>
  </div>`;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    :root {
      --navy: #1F3864;
      --light-gray: #F2F2F2;
      --mid-gray: #D9D9D9;
      --border: #B7B7B7;
      --text-muted: #555555;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Georgia, 'Times New Roman', serif;
      color: #111111;
      max-width: 900px;
      margin: 40px auto;
      padding: 40px;
      background: #ffffff;
      font-size: 14px;
      line-height: 1.4;
    }

    table { width: 100%; border-collapse: collapse; }

    /* Toolbar (hidden when printing) */
    .no-print.toolbar {
      display: flex; justify-content: center; gap: 8px;
      margin-bottom: 16px; padding: 8px;
      background: #eef2f8; border: 1px solid var(--navy); border-radius: 6px;
    }
    .toolbar button {
      padding: 6px 18px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer;
    }
    .btn-primary { border: none; background: var(--navy); color: #fff; }
    .btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--navy); }

    /* Default document header (used when no custom headerHtml) */
    .doc-header {
      display: flex; align-items: flex-end; justify-content: space-between;
      padding-bottom: 10px; margin-bottom: 10px;
      border-bottom: 2px solid var(--navy);
    }
    .doc-kicker {
      font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      color: var(--text-muted); margin-bottom: 3px;
    }
    .doc-title { font-size: 20px; font-weight: 800; color: var(--navy); letter-spacing: -0.3px; }

    .printed-line {
      font-size: 8.5px; color: var(--text-muted); text-align: right; margin: 4px 0 10px;
    }

    /* Default signature / footer */
    .signoff {
      margin-top: 26px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }
    .sig-line {
      border-top: 1px solid var(--navy);
      padding-top: 5px;
      text-align: center;
      font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
      color: var(--text-muted);
    }
    .doc-footer {
      margin-top: 18px; padding-top: 6px; border-top: 1px solid var(--border);
      display: flex; justify-content: space-between;
      font-size: 8px; color: var(--text-muted);
    }

    /* ---- Purchase Order specific styles ---- */
    .header-table td { border: none; vertical-align: top; padding: 0; }
    .company-name {
      font-size: 22px; font-weight: bold; color: var(--navy); margin: 0 0 4px 0;
    }
    .company-details { font-size: 12px; color: var(--text-muted); margin: 0; }
    .po-title {
      font-size: 24px; font-weight: bold; color: var(--navy);
      text-align: right; letter-spacing: 1px;
    }

    .spacer { height: 20px; }
    .spacer-sm { height: 10px; }

    .meta-table, .addr-table, .items-table, .totals-table { border: 1px solid var(--border); }
    .meta-table td, .addr-table td, .items-table th, .items-table td, .totals-table td {
      border: 1px solid var(--border);
      padding: 8px 10px;
      font-size: 13px;
    }
    .meta-table td.label { background: var(--light-gray); font-weight: bold; width: 15%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .meta-table td.value { width: 35%; }

    .addr-table td { width: 50%; vertical-align: top; padding: 12px 14px; }
    .addr-title { font-weight: bold; color: var(--navy); font-size: 14px; margin: 0 0 8px 0; }
    .addr-table .field { margin: 3px 0; color: #222; }

    .items-table th {
      background: var(--navy); color: #ffffff; text-align: center;
      font-size: 13px; padding: 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .items-table th.desc-col, .items-table td.desc-col { text-align: left; }
    .items-table td { text-align: center; height: 26px; }
    .items-table td.desc-col { text-align: left; }

    .totals-table { width: 45%; margin-left: auto; margin-top: 10px; }
    .totals-table td.label { text-align: right; width: 70%; }
    .totals-table td.value { width: 30%; }
    .totals-table tr.total-row td { background: var(--light-gray); font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .notes-label { font-style: italic; color: #777777; font-size: 13px; margin: 20px 0 6px 0; }
    .notes-line { border-bottom: 1px solid var(--border); height: 24px; }

    .sig-table { margin-top: 40px; }
    .sig-table td { border: none; width: 50%; padding: 0 14px; }
    .sig-line { border-bottom: 1px solid #000000; height: 30px; }
    .sig-label { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

  <div class="no-print toolbar">
    <button class="btn-primary" onclick="window.print()">${printLabel}</button>
    <button class="btn-secondary" onclick="window.close()">Close</button>
  </div>

  ${headerHtml || defaultHeader}

  <div class="printed-line">Printed ${printDate}</div>

  ${bodyHtml}

  ${signoffHtml || defaultSignoff}

  ${footerHtml || defaultFooter}

</body>
</html>`);
  printWindow.document.close();
}