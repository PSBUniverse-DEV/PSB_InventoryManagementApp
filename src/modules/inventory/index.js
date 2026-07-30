/**
 * Module Definition — inventory
 * ═══════════════════════════════════════════════════════════
 *
 * This file registers your module with PSBUniverse Core.
 * The route generator reads this to auto-create page files
 * under src/app/ when you run `npm run dev` or `npm run build`.
 *
 * ───────────────────────────────────────────────────────────
 * SETUP CHECKLIST — Verify these are done before your PR
 * ───────────────────────────────────────────────────────────
 *
 * FILES (auto-created by create-module script):
 *   ☐ src/modules/inventory/index.js             ← You are here
 *   ☐ src/modules/inventory/pages/InventoryPage.js              ← Server component (loads data)
 *   ☐ src/modules/inventory/pages/InventoryView.jsx             ← Client component (all UI)
 *   ☐ src/modules/inventory/data/inventory.actions.js  ← Server Actions (DB queries)
 *   ☐ src/modules/inventory/data/inventory.data.js     ← Client helpers (forms, constants)
 *
 * AUTO-GENERATED (do NOT edit — created on npm run dev/build):
 *   ☐ src/app/inventory/page.js       ← Route wrapper
 *   ☐ src/app/rewrites.json                     ← URL rewrites (if psbpages/)
 *
 * DATABASE SETUP (manual — ask senior dev if unsure):
 *   ☐ psb_s_application  → Ensure your app exists (module_key must match below)
 *   ☐ psb_s_appcard      → Add card with route_path = "/inventory"
 *   ☐ psb_m_appcardgroup → Add/use a group for your cards
 *   ☐ psb_m_appcardroleaccess → Assign roles that can see this card
 *   ☐ psb_s_role          → Ensure roles exist for your app
 *   ☐ psb_m_userapproleaccess → Assign users to roles for testing
 *
 * SSO SETUP (centralized authentication):
 *   ☐ Module is registered in psb_s_application with a unique app_id
 *   ☐ API routes use withModuleAuth("INVENTORY", handler)
 *   ☐ Client pages validate session via validateSessionToken() or useAuth()
 *   ☐ .env.local has NEXT_PUBLIC_COOKIE_DOMAIN set (e.g. .psbuniverse.com)
 *
 * HOW TO VERIFY EVERYTHING WORKS:
 *   1. Run `npm run dev`
 *   2. Open http://localhost:3000/inventory
 *   3. You should see "Inventory" heading with "This page is ready."
 *   4. If 404 → check that src/app/inventory/page.js exists (run npm run gen:routes)
 *   5. If "No Access" → check your role mappings in the database
 *   6. If module not on dashboard → check psb_s_appcard has this route_path
 *
 * UPDATING ROUTES:
 *   If you change the path below, just run `npm run dev` or `npm run build`.
 *   The old page wrapper is auto-deleted and a new one is created.
 *   But you MUST also update psb_s_appcard.route_path in the database.
 *
 * DOCS:
 *   - docs/02-architecture/module-system.md
 *   - docs/08-junior-dev-guide/module-creation-checklist.md
 *   - docs/09-sso-architecture/README.md
 * ═══════════════════════════════════════════════════════════
 */
const inventoryModule = {
  key: "inventory",
  module_key: "inventory",
  name: "Inventory",
  description: "Track and manage equipment, materials, and warehouse stock.",
  icon: "box",
  group_name: "Operations",
  group_desc: "Tools for inventory and asset management.",
  order: 200,
  routes: [
    { path: "/inventory", page: "InventoryPage" },
    { path: "/inventory/configure", page: "InventoryConfigPage" },
    { path: "/inventory/board", page: "BoardPage" },
    { path: "/inventory/board/manage", page: "BoardManagementPage" },
  ],
};

export default inventoryModule;
