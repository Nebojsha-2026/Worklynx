// js/data/shiftAssignments.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

/**
 * Returns assignments for the current logged-in EMPLOYEE.
 * We only need shift_id (and maybe created_at later).
 *
 * NOTE: your table does NOT have created_at (you hit that error earlier),
 * so we only select shift_id here.
 */
export async function listMyShiftAssignments() {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) throw new Error("Not authenticated.");

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("shift_id")
    .eq("employee_user_id", userId);

  if (error) throw error;
  return data || [];
}

/**
 * For manager pages: load assignments for many shifts
 */
export async function listAssignmentsForShifts({ shiftIds = [] }) {
  const supabase = getSupabase();
  if (!shiftIds.length) return [];

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("shift_id, employee_user_id")
    .in("shift_id", shiftIds);

  if (error) throw error;
  return data || [];
}

/**
 * For manager shift details: load assignments for one shift
 */
export async function listAssignmentsForShift({ shiftId }) {
  const supabase = getSupabase();
  if (!shiftId) return [];

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("shift_id, employee_user_id")
    .eq("shift_id", shiftId);

  if (error) throw error;
  return data || [];
}
