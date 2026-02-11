// js/data/timesheets.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

/**
 * Finds an existing timesheet for (shiftId + current employee).
 * If not found, creates it.
 *
 * IMPORTANT: This assumes your `timesheets` table has:
 * - id (uuid)
 * - shift_id (uuid)
 * - employee_user_id (uuid)
 * - organization_id (uuid)  (optional but common)
 *
 * If your column names differ, you’ll get a “column does not exist” error.
 */
export async function getOrCreateTimesheetForShift({ shiftId, organizationId }) {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");
  if (!shiftId) throw new Error("Missing shiftId.");

  // 1) Try find existing
  let q = supabase
    .from("timesheets")
    .select("id")
    .eq("shift_id", shiftId)
    .eq("employee_user_id", userId)
    .limit(1);

  if (organizationId) q = q.eq("organization_id", organizationId);

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) return existing.id;

  // 2) Create new
  const insertPayload = {
    shift_id: shiftId,
    employee_user_id: userId,
  };
  if (organizationId) insertPayload.organization_id = organizationId;

  const { data: created, error: insErr } = await supabase
    .from("timesheets")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr) throw insErr;
  return created.id;
}
