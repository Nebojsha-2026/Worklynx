// js/data/shiftNotifications.js
//
// Time-based shift notification ticker — call on every employee page load.
//
// Each notification type fires AT MOST ONCE per shift per employee (deduped by
// shift_id + type in the notifications table). Wide time windows ensure the
// notification is still sent even if the employee doesn't open the app at the
// exact right moment.
//
// Requires a `shift_id uuid` column on the notifications table:
//   ALTER TABLE public.notifications
//     ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE;

import { getSupabase } from "../core/supabaseClient.js";
import { getSession }  from "../core/session.js";
import { path }        from "../core/config.js";

// ── Windows (milliseconds) ───────────────────────────────────────────────────
const MIN = 60_000;
const BEFORE_START_WINDOW  = 30 * MIN;  // send pre-shift reminder up to 30 min before
const AFTER_START_WINDOW   = 30 * MIN;  // send "started" notif up to 30 min after
const CLOCK_IN_MISSED_MIN  = 10 * MIN;  // wait at least 10 min before warning of no clock-in
const CLOCK_IN_MISSED_MAX  = 60 * MIN;  // stop warning after 60 min
const BEFORE_END_WINDOW    = 30 * MIN;  // send "ending soon" up to 30 min before
const AFTER_END_WINDOW     = 30 * MIN;  // send "ended" notif up to 30 min after
const CLOCK_OUT_REMIND_MIN = 30 * MIN;  // start clock-out reminder 30 min after end
const CLOCK_OUT_REMIND_MAX = 120 * MIN; // stop after 120 min

/**
 * Main entry point — call once on every employee page load.
 * Silently no-ops if the user has no shifts today or on DB errors.
 *
 * @param {string} orgId
 */
export async function tickShiftNotifications(orgId) {
  try {
    const supabase = getSupabase();
    const session  = await getSession();
    const userId   = session?.user?.id;
    if (!userId || !orgId) return;

    const todayStr = isoDateOf(new Date());
    const now      = new Date();

    // Load today's assigned shifts for this employee
    const { data: rows, error } = await supabase
      .from("shift_assignments")
      .select(`
        shift_id,
        shifts!inner (
          id, title, location, shift_date, end_date,
          start_at, end_at, track_time, status
        )
      `)
      .eq("employee_user_id", userId)
      .eq("shifts.shift_date", todayStr)
      .neq("shifts.status", "CANCELLED");

    if (error) { console.warn("[shiftNotif] failed to load shifts:", error.message); return; }
    if (!rows?.length) return;

    for (const row of rows) {
      try {
        await _checkOne(supabase, userId, orgId, row.shifts, now);
      } catch (e) {
        console.warn(`[shiftNotif] check failed for shift ${row.shift_id}:`, e.message);
      }
    }
  } catch (e) {
    console.warn("[shiftNotif] ticker error:", e.message);
  }
}

// ── Per-shift logic ───────────────────────────────────────────────────────────

async function _checkOne(supabase, userId, orgId, shift, now) {
  const startDt  = localDt(shift.shift_date,               shift.start_at);
  const endDt    = localDt(shift.end_date || shift.shift_date, shift.end_at);
  const dStart   = startDt - now; // positive → start is in future
  const dEnd     = endDt   - now; // positive → end is in future

  const link = path("/app/employee/my-shifts.html");
  const loc  = shift.location ? ` · 📍 ${shift.location}` : "";

  // ── 1. Pre-shift reminder (within 30 min before start) ───────────────────
  if (dStart > 0 && dStart <= BEFORE_START_WINDOW) {
    const mins     = Math.max(1, Math.round(dStart / MIN));
    const timeLeft = `${mins} minute${mins === 1 ? "" : "s"}`;
    await _maybeSend(supabase, {
      userId, orgId, shiftId: shift.id,
      type:  "SHIFT_REMINDER",
      title: `⏰ Your ${shift.title} shift starts in ${timeLeft}`,
      body:  shift.track_time
        ? `Starts at ${fmt(shift.start_at)}${loc}. Don't forget to clock in when your shift begins.`
        : `Starts at ${fmt(shift.start_at)}${loc}. No time tracking required — just show up!`,
      link,
    });
  }

  // ── 2. Shift has started (within 30 min after start) ─────────────────────
  if (dStart <= 0 && dStart > -AFTER_START_WINDOW) {
    await _maybeSend(supabase, {
      userId, orgId, shiftId: shift.id,
      type:  "SHIFT_STARTED",
      title: shift.track_time
        ? `🟢 Your ${shift.title} shift has started — clock in now`
        : `🟢 Your ${shift.title} shift has started`,
      body:  shift.track_time
        ? `Your shift started at ${fmt(shift.start_at)}${loc}. Head to My Shifts and tap Clock In to start tracking your time.`
        : `Your shift started at ${fmt(shift.start_at)}${loc}. No time tracking required — get started and good luck!`,
      link,
    });
  }

  // ── 3. Missed clock-in warning (10-60 min after start, tracking only) ────
  if (shift.track_time && dStart <= -CLOCK_IN_MISSED_MIN && dStart > -CLOCK_IN_MISSED_MAX) {
    const tsId = await _getTimesheetId(supabase, shift.id, userId);
    if (tsId) {
      const hasEntry = await _hasAnyTimeEntry(supabase, tsId);
      if (!hasEntry) {
        await _maybeSend(supabase, {
          userId, orgId, shiftId: shift.id,
          type:  "SHIFT_CLOCK_IN_MISSED",
          title: `⚠️ You haven't clocked in for your ${shift.title} shift`,
          body:  `Your shift started at ${fmt(shift.start_at)} and it looks like you haven't clocked in yet. Please clock in now so your time is tracked correctly.`,
          link,
        });
      }
    }
  }

  // ── 4. Shift ending soon (within 30 min before end, after shift started) ─
  if (dEnd > 0 && dEnd <= BEFORE_END_WINDOW && dStart <= 0) {
    const mins     = Math.max(1, Math.round(dEnd / MIN));
    const timeLeft = `${mins} minute${mins === 1 ? "" : "s"}`;
    await _maybeSend(supabase, {
      userId, orgId, shiftId: shift.id,
      type:  "SHIFT_ENDING_SOON",
      title: `⏳ Your ${shift.title} shift ends in ${timeLeft}`,
      body:  shift.track_time
        ? `Your shift ends at ${fmt(shift.end_at)}. Start wrapping up and remember to clock out before you leave.`
        : `Your shift ends at ${fmt(shift.end_at)}. Almost there — start wrapping up!`,
      link,
    });
  }

  // ── 5. Shift has ended (within 30 min after end) ──────────────────────────
  if (dEnd <= 0 && dEnd > -AFTER_END_WINDOW) {
    await _maybeSend(supabase, {
      userId, orgId, shiftId: shift.id,
      type:  "SHIFT_ENDED",
      title: shift.track_time
        ? `🔴 Your ${shift.title} shift has ended — clock out now`
        : `✅ Your ${shift.title} shift has ended`,
      body:  shift.track_time
        ? `Your shift ended at ${fmt(shift.end_at)}. Please clock out from My Shifts to finalise your timesheet.`
        : `Your shift ended at ${fmt(shift.end_at)}. Great work today — you're all done!`,
      link,
    });
  }

  // ── 6. Forgot to clock out (30-120 min after end, still has open entry) ──
  if (shift.track_time && dEnd <= -CLOCK_OUT_REMIND_MIN && dEnd > -CLOCK_OUT_REMIND_MAX) {
    const tsId = await _getTimesheetId(supabase, shift.id, userId);
    if (tsId) {
      const open = await _hasOpenTimeEntry(supabase, tsId);
      if (open) {
        await _maybeSend(supabase, {
          userId, orgId, shiftId: shift.id,
          type:  "CLOCK_OUT_REMINDER",
          title: `⚠️ You're still clocked in — did you forget to clock out?`,
          body:  `Your ${shift.title} shift ended at ${fmt(shift.end_at)}, but you still have an active clock-in. Please clock out now — only leave it open if you're still working on-site.`,
          link,
        });
      }
    }
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Inserts a notification only if one with the same type + shift_id + user
 * doesn't already exist (prevents duplicates across page reloads).
 */
async function _maybeSend(supabase, { userId, orgId, shiftId, type, title, body, link }) {
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type",    type)
    .eq("shift_id", shiftId)
    .maybeSingle();
  if (existing?.id) return; // already sent

  const { error } = await supabase.from("notifications").insert({
    user_id:         userId,
    organization_id: orgId,
    type,
    title,
    body,
    link,
    shift_id:        shiftId,
  });
  if (error) console.warn(`[shiftNotif] insert ${type} failed:`, error.message);
}

async function _getTimesheetId(supabase, shiftId, userId) {
  const { data } = await supabase
    .from("timesheets")
    .select("id")
    .eq("shift_id",          shiftId)
    .eq("employee_user_id",  userId)
    .maybeSingle();
  return data?.id ?? null;
}

async function _hasAnyTimeEntry(supabase, timesheetId) {
  const { data } = await supabase
    .from("time_entries")
    .select("id")
    .eq("timesheet_id", timesheetId)
    .limit(1)
    .maybeSingle();
  return !!data?.id;
}

async function _hasOpenTimeEntry(supabase, timesheetId) {
  const { data } = await supabase
    .from("time_entries")
    .select("id")
    .eq("timesheet_id", timesheetId)
    .is("clock_out", null)
    .maybeSingle();
  return !!data?.id;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function localDt(dateStr, timeStr) { return new Date(`${dateStr}T${timeStr}`); }
function fmt(t) { return (t || "").slice(0, 5); }
function isoDateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
