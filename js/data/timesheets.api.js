// js/data/timesheets.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

/**
 * Find or create the timesheet for the current logged-in employee + shift.
 * Uses unique constraint: (shift_id, employee_user_id)
 */
export async function getOrCreateTimesheetForShift({ shiftId, organizationId }) {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) throw new Error("Not authenticated.");
  if (!shiftId) throw new Error("Missing shiftId.");
  if (!organizationId) throw new Error("Missing organizationId.");

  // 1) Try to find existing timesheet
  const { data: existing, error: findErr } = await supabase
    .from("timesheets")
    .select("id, status, submitted_at, created_at")
    .eq("organization_id", organizationId)
    .eq("shift_id", shiftId)
    .eq("employee_user_id", userId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return existing; // return whole row (useful later)

  // 2) Create new timesheet
  const payload = {
    organization_id: organizationId,
    shift_id: shiftId,
    employee_user_id: userId,
    // status defaults to OPEN in DB
  };

  const { data: created, error: insErr } = await supabase
    .from("timesheets")
    .insert(payload)
    .select("id, status, submitted_at, created_at")
    .single();

  if (insErr) throw insErr;
  return created;
}
