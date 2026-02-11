// js/data/timeEntries.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

export async function createTimeEntry(payload) {
  const supabase = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) throw new Error("Not authenticated.");

  // Enforce employee ownership server-side via RLS too
  const insertPayload = {
    ...payload,
    employee_user_id: userId,
  };

  const { data, error } = await supabase
    .from("time_entries")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
