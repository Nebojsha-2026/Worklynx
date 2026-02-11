// js/data/timeEntries.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

/**
 * Creates a time entry against an existing timesheet.
 */
export async function createTimeEntry({
  timesheetId,
  clockInIso,
  clockOutIso = null,
  breakMinutes = 0,
  notes = "",
}) {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  if (!timesheetId) throw new Error("Missing timesheetId.");
  if (!clockInIso) throw new Error("Missing clockIn.");

  const payload = {
    timesheet_id: timesheetId,
    clock_in: clockInIso,
    clock_out: clockOutIso,
    break_minutes: breakMinutes,
    notes,
  };

  const { data, error } = await supabase
    .from("time_entries")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
