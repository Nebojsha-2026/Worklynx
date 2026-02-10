// js/data/shiftAssignments.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

export async function listMyShiftAssignments() {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("shift_id, status, created_at")
    .eq("employee_user_id", userId);

  if (error) throw error;
  return data || [];
}
