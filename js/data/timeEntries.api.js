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

// Add this near the bottom of js/data/timeEntries.api.js

export async function getTimeEntryById({ timeEntryId }) {
  const supabase = getSupabase();
  if (!timeEntryId) throw new Error("Missing timeEntryId.");

  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", timeEntryId)
    .single();

  if (error) throw error;
  return data;
}

export async function addBreakMinutes({ timeEntryId, addMinutes }) {
  const supabase = getSupabase();
  if (!timeEntryId) throw new Error("Missing timeEntryId.");

  const mins = Number(addMinutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    throw new Error("Break minutes must be greater than 0.");
  }

  // Read current value
  const current = await getTimeEntryById({ timeEntryId });
  const currentBreak = Number(current.break_minutes || 0);

  const nextBreak = currentBreak + Math.round(mins);

  const { data, error } = await supabase
    .from("time_entries")
    .update({ break_minutes: nextBreak })
    .eq("id", timeEntryId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
