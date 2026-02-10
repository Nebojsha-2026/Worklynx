// js/data/assignments.api.js
import { getSupabase } from "../core/supabaseClient.js";

export async function assignShiftToEmployee({ shiftId, employeeUserId }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("assign_shift_to_employee", {
    p_shift_id: shiftId,
    p_employee_user_id: employeeUserId,
  });
  if (error) throw error;
  return data;
}
