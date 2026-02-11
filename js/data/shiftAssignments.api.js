// js/data/shiftAssignments.api.js
import { getSupabase } from "../core/supabaseClient.js";

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
