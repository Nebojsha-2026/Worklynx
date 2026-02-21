// js/data/recurring.js
// Shared utility called on page load by shifts.page.js + dashboard.page.js
// For every open-ended recurring series, if the latest shift starts within
// 24h, creates the NEXT occurrence according to the series' pattern.
// Safe to call multiple times — idempotent (checks for existing date first).
import { getSupabase } from "../core/supabaseClient.js";

/**
 * Main entry point. Call once on page load.
 * @param {string} orgId
 * @returns {Promise<number>} number of new shift rows created
 */
export async function tickRecurringSeries(orgId) {
  if (!orgId) return 0;
  const supabase = getSupabase();

  const { data: series, error } = await supabase
    .from("recurring_series")
    .select("*")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .is("recur_end_date", null);  // only open-ended series

  if (error) { console.warn("[recurring] load series failed:", error.message); return 0; }
  if (!series?.length) return 0;

  let created = 0;
  for (const s of series) {
    try { created += await tickOne(supabase, s); }
    catch (e) { console.warn(`[recurring] tick failed for series ${s.id}:`, e.message); }
  }
  if (created > 0) console.log(`[recurring] auto-created ${created} occurrence(s)`);
  return created;
}

async function tickOne(supabase, series) {
  const pattern = series.recurrence_pattern || "CUSTOM";

  // CUSTOM pattern requires at least one recur_day
  if (pattern === "CUSTOM") {
    const daySet = new Set((series.recur_days || []).map(Number));
    if (!daySet.size) return 0;
  }

  // Find the latest non-cancelled shift in this series
  const { data: latest } = await supabase
    .from("shifts")
    .select("id, shift_date, start_at")
    .eq("recurring_group_id", series.id)
    .not("status", "eq", "CANCELLED")
    .order("shift_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return 0;

  // Only fire if we are within 24h of the latest shift starting
  const latestStart = new Date(`${latest.shift_date}T${latest.start_at}`);
  const threshold   = new Date(latestStart.getTime() - 24 * 3600 * 1000);
  if (new Date() < threshold) return 0;

  // Calculate next occurrence date based on pattern
  let nextDate;
  if (pattern === "WEEKLY") {
    nextDate = addDaysToDateStr(latest.shift_date, 7);
  } else if (pattern === "FORTNIGHTLY") {
    nextDate = addDaysToDateStr(latest.shift_date, 14);
  } else if (pattern === "MONTHLY") {
    nextDate = addMonthToDateStr(latest.shift_date);
  } else {
    // CUSTOM — find next day-of-week match
    const daySet = new Set((series.recur_days || []).map(Number));
    nextDate = nextOccurrenceAfter(latest.shift_date, daySet);
  }

  if (!nextDate) return 0;

  // Guard: don't double-create
  const { data: dupe } = await supabase
    .from("shifts")
    .select("id")
    .eq("recurring_group_id", series.id)
    .eq("shift_date", nextDate)
    .maybeSingle();
  if (dupe?.id) return 0;

  // Create the next shift
  const { data: newShift, error: createErr } = await supabase
    .from("shifts")
    .insert({
      organization_id:    series.organization_id,
      title:              series.title,
      description:        series.description,
      location:           series.location,
      hourly_rate:        series.hourly_rate,
      shift_date:         nextDate,
      end_date:           nextDate,
      start_at:           series.start_at,
      end_at:             series.end_at,
      break_minutes:      series.break_minutes,
      break_is_paid:      series.break_is_paid,
      track_time:         series.track_time,
      is_recurring:       true,
      recur_days:         series.recur_days,
      recur_end_date:     null,
      recurrence_pattern: pattern,
      recurring_group_id: series.id,
      status:             "PUBLISHED",
      created_by_user_id: series.created_by_user_id,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;

  // Auto-assign stored employee via RPC (handles organization_id,
  // assigned_by_user_id, and timesheet creation in one call)
  if (series.assigned_employee_id) {
    const { error: assignErr } = await supabase.rpc("assign_shift_to_employee", {
      p_shift_id:         newShift.id,
      p_employee_user_id: series.assigned_employee_id,
    });
    if (assignErr) console.warn(`[recurring] assign failed for shift ${newShift.id}:`, assignErr.message);
  }
  return 1;
}

// ── Date arithmetic ───────────────────────────────────────────────────────────

function addDaysToDateStr(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return isoDateOf(d);
}

function addMonthToDateStr(dateStr) {
  const [y, m, day] = dateStr.split("-").map(Number);
  // Clamp to last day of the target month (e.g. Jan 31 + 1 month → Feb 28)
  const maxDay = new Date(y, m, 0).getDate(); // last day of month m (1-based → 0th of next)
  const target = new Date(y, m, Math.min(day, maxDay)); // month m is already +1 (0-indexed)
  return isoDateOf(target);
}

/**
 * Returns the next date after `afterDateStr` whose ISO week-day is in `daySet`.
 */
function nextOccurrenceAfter(afterDateStr, daySet) {
  const cursor = parseLocalDate(afterDateStr);
  cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (daySet.has(isoWeekDay(cursor))) return isoDateOf(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function isoWeekDay(d)   { return d.getDay() === 0 ? 7 : d.getDay(); }
function parseLocalDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function isoDateOf(d)    {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
