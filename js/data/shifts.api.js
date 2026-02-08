// js/data/shifts.api.js
import { getSupabase } from "../core/supabaseClient.js";

export async function createShift(payload) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shifts")
    .insert(payload)
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
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
