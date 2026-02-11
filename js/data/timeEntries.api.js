// js/data/timeEntries.api.js
import { getSupabase } from "../core/supabaseClient.js";

export async function clockIn({ timesheetId }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      timesheet_id: timesheetId,
      clock_in: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function clockOut({ timeEntryId }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("time_entries")
    .update({
      clock_out: new Date().toISOString(),
    })
    .eq("id", timeEntryId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getOpenTimeEntry({ timesheetId }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("timesheet_id", timesheetId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
