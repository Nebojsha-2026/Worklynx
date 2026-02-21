// js/data/notifications.api.js
// All database interactions for the notifications system.

import { getSupabase } from "../core/supabaseClient.js";
import { getSession }  from "../core/session.js";

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Fetch the N most recent notifications for the current user.
 */
export async function listNotifications({ limit = 40 } = {}) {
  const supabase = getSupabase();
  const session  = await getSession();
  const userId   = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Count unread notifications for the current user.
 */
export async function getUnreadCount() {
  const supabase = getSupabase();
  const session  = await getSession();
  const userId   = session?.user?.id;
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function markAsRead(notificationId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllAsRead() {
  const supabase = getSupabase();
  const session  = await getSession();
  const userId   = session?.user?.id;
  if (!userId) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteNotification(id) {
  const supabase = getSupabase();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

export async function clearAllNotifications() {
  const supabase = getSupabase();
  const session  = await getSession();
  const userId   = session?.user?.id;
  if (!userId) return;

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}

// ─── Create (internal) ───────────────────────────────────────────────────────

/**
 * Insert a notification row.
 * Requires INSERT permission (see SQL migration for RLS policy).
 */
async function _insert({ userId, orgId = null, type, title, body = null, link = null }) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, organization_id: orgId, type, title, body, link });
  if (error) throw error;
}

// ─── Send helpers (call from manager/action code) ────────────────────────────

/**
 * Notify an employee that they've been assigned to a shift.
 */
export async function notifyShiftAssigned({ employeeUserId, orgId, shiftTitle, shiftDate, shiftId }) {
  await _insert({
    userId: employeeUserId,
    orgId,
    type:  "SHIFT_ASSIGNED",
    title: "You've been assigned to a shift",
    body:  `${shiftTitle} · ${formatDate(shiftDate)}`,
    link:  `/app/employee/shifts.html`,
  });
}

/**
 * Notify an employee that their shift has been cancelled.
 */
export async function notifyShiftCancelled({ employeeUserId, orgId, shiftTitle, shiftDate }) {
  await _insert({
    userId: employeeUserId,
    orgId,
    type:  "SHIFT_CANCELLED",
    title: "Shift cancelled",
    body:  `${shiftTitle} · ${formatDate(shiftDate)} has been cancelled`,
    link:  null,
  });
}

/**
 * Notify an employee that a shift they're on has been updated.
 */
export async function notifyShiftUpdated({ employeeUserId, orgId, shiftTitle, shiftDate, shiftId }) {
  await _insert({
    userId: employeeUserId,
    orgId,
    type:  "SHIFT_UPDATED",
    title: "Shift details have changed",
    body:  `${shiftTitle} · ${formatDate(shiftDate)} was updated`,
    link:  `/app/employee/shifts.html`,
  });
}

/**
 * Notify a manager that an employee submitted a timesheet.
 */
export async function notifyTimesheetSubmitted({ managerUserId, orgId, employeeName, shiftTitle }) {
  await _insert({
    userId: managerUserId,
    orgId,
    type:  "TIMESHEET_SUBMITTED",
    title: "Timesheet submitted",
    body:  `${employeeName} submitted a timesheet for ${shiftTitle}`,
    link:  `/app/manager/approvals.html`,
  });
}

/**
 * Generic notification — use for one-off messages.
 */
export async function sendNotification({ userId, orgId, type, title, body, link }) {
  await _insert({ userId, orgId, type, title, body, link });
}

// ─── Realtime subscription ───────────────────────────────────────────────────

/**
 * Subscribe to new notifications for the current user.
 * Returns an async unsubscribe function — call it on page unload.
 *
 * @param {(notification: object) => void} onNew
 */
export async function subscribeToNotifications(onNew) {
  const supabase = getSupabase();
  const session  = await getSession();
  const userId   = session?.user?.id;
  if (!userId) return () => {};

  const channel = supabase
    .channel(`notifications:user:${userId}`)
    .on(
      "postgres_changes",
      {
        event:  "INSERT",
        schema: "public",
        table:  "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new)
    )
    .subscribe();

  return async () => {
    await supabase.removeChannel(channel);
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
}
