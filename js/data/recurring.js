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
  const daySet  = new Set((series.recur_days || []).map(Number));

  // All patterns except legacy CUSTOM require at least one selected day
  if (pattern !== "CUSTOM" && !daySet.size) return 0;
  if (pattern === "CUSTOM"  && !daySet.size) return 0;

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
    // Find next selected weekday after latest (handles multi-day correctly)
    nextDate = nextOccurrenceAfter(latest.shift_date, daySet);
  } else if (pattern === "FORTNIGHTLY") {
    nextDate = nextFortnightlyOccurrence(latest.shift_date, daySet);
  } else if (pattern === "MONTHLY") {
    nextDate = nextMonthlyWeekdayOccurrence(latest.shift_date, daySet);
  } else {
    // CUSTOM (legacy) — find next day-of-week match
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

// ── Date arithmetic & occurrence helpers ──────────────────────────────────────

function addDaysToDateStr(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return isoDateOf(d);
}

/**
 * Returns the next date after `afterDateStr` whose ISO week-day is in `daySet`.
 * Used by WEEKLY and legacy CUSTOM patterns.
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

/**
 * FORTNIGHTLY: from the latest shift, find the next occurrence.
 * Each selected weekday has its own 14-day cycle.
 * Within the same week we pick the next later day; otherwise we jump +14
 * from the earliest selected day's anchor in the current/prev week.
 */
function nextFortnightlyOccurrence(latestStr, daySet) {
  const date = parseLocalDate(latestStr);
  const dow  = isoWeekDay(date);
  // Any selected day later in the same week?
  const laterDays = [...daySet].filter(d => d > dow).sort((a, b) => a - b);
  if (laterDays.length > 0) {
    return addDaysToDateStr(latestStr, laterDays[0] - dow);
  }
  // All selected days for this week are done — jump to earliest day +14
  const earliestDay = Math.min(...daySet);
  const daysBack    = (dow - earliestDay + 7) % 7; // how far back is the anchor
  const anchorStr   = addDaysToDateStr(latestStr, -daysBack);
  return addDaysToDateStr(anchorStr, 14);
}

/**
 * Returns the Nth occurrence (1-based) of `weekday` (1=Mon…7=Sun) in the given month.
 * Falls back one week if the Nth occurrence doesn't exist in that month.
 */
function getNthWeekdayOfMonth(year, month0, weekday, n) {
  const firstOfMonth = new Date(year, month0, 1);
  const daysToFirst  = (weekday - isoWeekDay(firstOfMonth) + 7) % 7;
  const result       = new Date(year, month0, 1 + daysToFirst + (n - 1) * 7);
  if (result.getMonth() !== month0) result.setDate(result.getDate() - 7);
  return result;
}

/**
 * MONTHLY: from the latest shift, find the next occurrence.
 * Derives the week-of-month (N) from the latest shift's date and finds
 * the Nth occurrence of the next selected weekday in the same or next month.
 */
function nextMonthlyWeekdayOccurrence(latestStr, daySet) {
  const date = parseLocalDate(latestStr);
  const dow  = isoWeekDay(date);
  const n    = Math.ceil(date.getDate() / 7); // 1 for days 1-7, 2 for 8-14 …
  // Any selected day later this same Nth-week slot?
  const laterDays = [...daySet].filter(d => d > dow).sort((a, b) => a - b);
  if (laterDays.length > 0) {
    const candidate = new Date(date);
    candidate.setDate(candidate.getDate() + (laterDays[0] - dow));
    // Confirm it's still within the same week-of-month
    if (Math.ceil(candidate.getDate() / 7) === n) return isoDateOf(candidate);
  }
  // Move to next month: find Nth occurrence of earliest selected day
  let nextM0 = date.getMonth() + 1;
  let nextY  = date.getFullYear();
  if (nextM0 > 11) { nextM0 = 0; nextY++; }
  const earliestDay = Math.min(...daySet);
  return isoDateOf(getNthWeekdayOfMonth(nextY, nextM0, earliestDay, n));
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function isoWeekDay(d)   { return d.getDay() === 0 ? 7 : d.getDay(); }
function parseLocalDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function isoDateOf(d)    {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
