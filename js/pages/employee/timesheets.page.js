// js/pages/employee/timesheets.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { getSession } from "../../core/session.js";
import { getOrgMember, normalizePaymentFrequency } from "../../data/members.api.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();
const supabase = getSupabase();

document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;
main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">Timesheets</h1>
      <div style="margin-top:6px; color:#64748b; font-size:13px;">View timesheets by pay period and download CSV.</div>
    </div>
    <div id="periodTag"></div>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div style="font-size:14px; color:#64748b;">All-time earnings</div>
      <div id="allTimeEarnings" style="font-size:24px; font-weight:900;">—</div>
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="periodList"><div style="opacity:.85;">Loading timesheets…</div></div>
  </section>
`;

const periodTagEl = document.querySelector("#periodTag");
const allTimeEarningsEl = document.querySelector("#allTimeEarnings");
const periodListEl = document.querySelector("#periodList");

try {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const member = await getOrgMember({ organizationId: org.id, userId });
  const paymentFrequency = normalizePaymentFrequency(member?.payment_frequency);

  periodTagEl.innerHTML = `<span class="wl-badge wl-badge--active">Pay frequency: ${escapeHtml(paymentFrequency)}</span>`;

  const [timesheets, allTime] = await Promise.all([
    loadEmployeeTimesheets({ userId }),
    sumAllTimeEarnings({ userId }),
  ]);

  allTimeEarningsEl.textContent = fmtMoney(allTime);
  renderTimesheetPeriods({ timesheets, paymentFrequency });
} catch (err) {
  console.error(err);
  periodListEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to load timesheets.")}</div>`;
}

async function loadEmployeeTimesheets({ userId }) {
  const { data, error } = await supabase
    .from("timesheets")
    .select(
      `
      id,
      shift_id,
      status,
      submitted_at,
      created_at,
      shift:shifts(title, shift_date, start_at, end_at, location),
      entries:time_entries(id, clock_in, clock_out, break_minutes)
    `
    )
    .eq("organization_id", org.id)
    .eq("employee_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

async function sumAllTimeEarnings({ userId }) {
  const { data, error } = await supabase
    .from("earnings")
    .select("amount")
    .eq("employee_user_id", userId)
    .limit(2000);

  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function renderTimesheetPeriods({ timesheets, paymentFrequency }) {
  const groups = groupByPayPeriod({ timesheets, paymentFrequency });

  if (!groups.length) {
    periodListEl.innerHTML = `<div class="wl-alert">No timesheets for your current pay periods yet.</div>`;
    return;
  }

  periodListEl.innerHTML = groups
    .map((group) => {
      const totalMinutes = group.timesheets.reduce((sum, ts) => sum + getTimesheetWorkedMinutes(ts), 0);
      const csvId = `csv_${group.key}`;

      return `
        <article class="wl-card" style="padding:12px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-size:16px; font-weight:800;">${escapeHtml(group.label)}</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">
                ${group.timesheets.length} timesheet${group.timesheets.length === 1 ? "" : "s"} • ${formatMinutes(totalMinutes)} worked
              </div>
            </div>
            <button class="wl-btn" data-download="${escapeHtml(csvId)}" type="button">Download CSV</button>
          </div>

          <div style="display:grid; gap:8px; margin-top:10px;">
            ${group.timesheets.map(renderTimesheetRow).join("")}
          </div>

          <textarea id="${escapeHtml(csvId)}" style="display:none;">${escapeHtml(toCsv(group))}</textarea>
        </article>
      `;
    })
    .join("");

  periodListEl.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-download");
      const src = document.getElementById(id);
      if (!src) return;
      downloadCsv({
        filename: `${id}.csv`,
        csv: src.value,
      });
    });
  });
}

function renderTimesheetRow(ts) {
  const shift = ts.shift || {};
  const worked = getTimesheetWorkedMinutes(ts);
  const status = String(ts.status || "OPEN").toUpperCase();

  return `
    <div class="wl-card" style="padding:10px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
      <div>
        <div style="font-weight:700;">${escapeHtml(shift.title || "Untitled shift")}</div>
        <div style="font-size:13px; color:#64748b; margin-top:4px;">
          ${escapeHtml(shift.shift_date || "No date")} • ${escapeHtml(shift.start_at || "")} → ${escapeHtml(shift.end_at || "")}
          ${shift.location ? ` • 📍 ${escapeHtml(shift.location)}` : ""}
        </div>
        <div style="font-size:12px; color:#64748b; margin-top:4px;">Worked: <b>${escapeHtml(formatMinutes(worked))}</b></div>
      </div>
      ${renderStatusBadge(status)}
    </div>
  `;
}

function groupByPayPeriod({ timesheets, paymentFrequency }) {
  const now = new Date();
  const grouped = new Map();

  const seed = getPeriodForDate({ date: now, paymentFrequency });
  grouped.set(seed.key, { ...seed, timesheets: [] });

  for (const ts of timesheets) {
    const date = pickTimesheetDate(ts);
    if (!date) continue;
    const p = getPeriodForDate({ date, paymentFrequency });
    if (!grouped.has(p.key)) grouped.set(p.key, { ...p, timesheets: [] });
    grouped.get(p.key).timesheets.push(ts);
  }

  return [...grouped.values()].sort((a, b) => b.from.getTime() - a.from.getTime());
}

function getPeriodForDate({ date, paymentFrequency }) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const freq = normalizePaymentFrequency(paymentFrequency);

  if (freq === "MONTHLY") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return makePeriod({ from, to, freq });
  }

  if (freq === "WEEKLY") {
    const from = startOfWeek(d);
    const to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000);
    return makePeriod({ from, to, freq });
  }

  const weekStart = startOfWeek(d);
  const anchor = new Date(2024, 0, 1);
  anchor.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((weekStart.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  const fortnightIndex = Math.floor(diffDays / 14);
  const from = new Date(anchor.getTime() + fortnightIndex * 14 * 24 * 60 * 60 * 1000);
  const to = new Date(from.getTime() + 13 * 24 * 60 * 60 * 1000);
  return makePeriod({ from, to, freq: "FORTNIGHTLY" });
}

function makePeriod({ from, to, freq }) {
  const key = `${isoDate(from)}_${freq}`;
  const label = `${freq.charAt(0)}${freq.slice(1).toLowerCase()} period • ${isoDate(from)} → ${isoDate(to)}`;
  return { key, from, to, label };
}

function pickTimesheetDate(ts) {
  const shiftDate = ts?.shift?.shift_date;
  if (shiftDate && String(shiftDate).length >= 10) {
    const [y, m, d] = String(shiftDate).split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }

  if (ts?.created_at) {
    const c = new Date(ts.created_at);
    if (Number.isFinite(c.getTime())) return c;
  }

  return null;
}

function getTimesheetWorkedMinutes(ts) {
  const entries = ts?.entries || [];
  return entries.reduce((sum, e) => {
    if (!e.clock_in || !e.clock_out) return sum;
    const start = new Date(e.clock_in).getTime();
    const end = new Date(e.clock_out).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    const gross = Math.round((end - start) / 60000);
    const breakMinutes = Math.max(0, Number(e.break_minutes || 0));
    return sum + Math.max(0, gross - breakMinutes);
  }, 0);
}

function toCsv(group) {
  const header = [
    "timesheet_id",
    "status",
    "shift_title",
    "shift_date",
    "start_at",
    "end_at",
    "location",
    "worked_minutes",
    "submitted_at",
  ];

  const rows = group.timesheets.map((ts) => {
    const shift = ts.shift || {};
    return [
      ts.id,
      String(ts.status || "OPEN"),
      shift.title || "",
      shift.shift_date || "",
      shift.start_at || "",
      shift.end_at || "",
      shift.location || "",
      String(getTimesheetWorkedMinutes(ts)),
      ts.submitted_at || "",
    ];
  });

  return [header, ...rows]
    .map((cols) => cols.map(csvEscape).join(","))
    .join("\n");
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function downloadCsv({ filename, csv }) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderStatusBadge(status) {
  const s = String(status || "OPEN").toUpperCase();
  const cls =
    s === "APPROVED"
      ? "wl-badge--active"
      : s === "REJECTED"
      ? "wl-badge--cancelled"
      : s === "SUBMITTED"
      ? "wl-badge--offered"
      : "wl-badge--draft";

  return `<span class="wl-badge ${cls}">${escapeHtml(s)}</span>`;
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMinutes(totalMins) {
  const mins = Math.max(0, Number(totalMins || 0));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtMoney(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
