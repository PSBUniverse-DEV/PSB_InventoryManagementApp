/**
 * Server Actions — inventory.actions.js
 *
 * Runs on the server. This is the ONLY place you talk to the database.
 *
 * WHAT TO DO:
 *   1. Import getSupabaseAdmin from "@/core/supabase/admin"
 *   2. Write one async function per operation:
 *        load___()   → SELECT
 *        create___() → INSERT
 *        update___() → UPDATE
 *        delete___() → DELETE or soft-delete
 *   3. Return clean objects — no raw DB internals.
 *
 * SSO AUTHENTICATION:
 *   - Use getCurrentSession() from "@/core/auth/session.service" to
 *     validate the caller's session and get user/module info
 *   - Example:
 *       const session = await getCurrentSession();
 *       if (!session) throw new Error("Unauthorized");
 *       if (!session.modules.includes("INVENTORY"))
 *         throw new Error("Forbidden");
 *
 * EXAMPLE:
 *   export async function loadInventoryData() {
 *     const supabase = getSupabaseAdmin();
 *     const { data, error } = await supabase
 *       .from("your_table_name")
 *       .select("*")
 *       .order("created_at", { ascending: false });
 *     if (error) throw new Error(error.message);
 *     return { items: data ?? [] };
 *   }
 */
"use server";

// import { getSupabaseAdmin } from "@/core/supabase/admin";
// import { getCurrentSession } from "@/core/auth/session.service";
