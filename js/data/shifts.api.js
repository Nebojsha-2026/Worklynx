// js/data/shifts.api.js
// js/data/shifts.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

export async function createShift(payload) {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) throw new Error("Not authenticated.");

  // Ensure created_by_user_id is always set
  const insertPayload = {
    ...payload,
    created_by_user_id: userId,
  };

  const { data, error } = await supabase
    .from("shifts")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listShifts({ organizationId, limit = 50 }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("shift_date", { ascending: true })
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function cancelShift({ shiftId }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("shifts")
    .update({ status: "CANCELLED" })
    .eq("id", shiftId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

