// js/pages/bo.reports.page.js
// BO Reports: Labour cost, estimated revenue (from hourly rates), profit overview
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { getSupabase } from "../core/supabaseClient.js";

await requireRole(["BO"]);

const org = await loadOrgContext();
const supabase = getSupabase();

document.body.prepend(
  renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;
main.querySelector("#wlSidebar").append(renderSidebar("BO"));

const content = main.querySelector("#wlContent");

const now = new Date();
const thisYear = now.getFullYear();

content.innerHTML = `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Reports</h1>
      <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Labour costs and timesheet overview for <strong>${escapeHtml(org.name)}</strong></p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <label style="font-size:13px;font-weight:600;">Period:</label>
      <select id="periodSelect" style="padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
        <option value="month">This month</option>
        <option value="ytd">Year to date</option>
        <option value="year">Full year ${thisYear}</option>
      </select>
    </div>
  </div>

  <!-- YTD summary cards (same as BO dashboard vision) -->
  <div class="wl-cards" style="margin-bottom:24px;">
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Labour Cost (YTD)</div>
      <div id="cardLabour" style="font-size:30px;font-weight:900;">—</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">From scheduled shifts</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Total Hours</div>
      <div id="cardHours" style="font-size:30px;font-weight:900;">—</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">Across all employees</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Approved Timesheets</div>
      <div id="cardApproved" style="font-size:30px;font-weight:900;">—</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">Processed</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Pending Approval</div>
      <div id="cardPending" style="font-size:30px;font-weight:900;">—</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">Awaiting review</div>
    </div>
  </div>

  <!-- Employee breakdown table -->
  <div class="wl-card wl-panel" style="margin-bottom:20px;">
    <h2 style="margin-top:0;">Employee Labour Breakdown</h2>
    <div id="breakdownTable"><div style="color:var(--muted);">Loading…</div></div>
  </div>

  <!-- Monthly trend (simple list) -->
  <div class="wl-card wl-panel">
    <h2 style="margin-top:0;">Monthly Breakdown</h2>
    <div id="monthlyBreakdown"><div style="color:var(--muted);">Loading…</div></div>
  </div>
`;

async function loadReport() {
  const period = content.querySelector("#periodSelect").value;
  const nowDate = new Date();

  let dateFrom, dateTo;
  if (period === "month") {
    dateFrom = `${thisYear}-${pad(nowDate.getMonth() + 1)}-01`;
    dateTo = `${thisYear}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
  } else if (period === "ytd") {
    dateFrom = `${thisYear}-01-01`;
    dateTo = `${thisYear}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
  } else {
    dateFrom = `${thisYear}-01-01`;
    dateTo = `${thisYear}-12-31`;
  }

  try {
    const { data: shifts, error: shiftErr } = await supabase
      .from("shifts")
      .select("id, title, shift_date, start_at, end_at, hourly_rate, status")
      .eq("organization_id", org.id)
      .gte("shift_date", dateFrom)
      .lte("shift_date", dateTo)
      .neq("status", "CANCELLED");

    if (shiftErr) throw shiftErr;

    const shiftIds = (shifts || []).map(s => s.id);
    const shiftMap = new Map((shifts || []).map(s => [s.id, s]));

    let assignments = [];
    if (shiftIds.length) {
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("shift_id, employee_user_id")
        .in("shift_id", shiftIds);
      if (error) throw error;
      assignments = data || [];
    }

    let timesheets = [];
    if (shiftIds.length) {
      const { data, error } = await supabase
        .from("timesheets")
        .select("shift_id, employee_user_id, status")
        .eq("organization_id", org.id)
        .in("shift_id", shiftIds);
      if (error) throw error;
      timesheets = data || [];
    }

    // Aggregate by employee
    const empMap = new Map();
    for (const a of assignments) {
      const s = shiftMap.get(a.shift_id);
      if (!s) continue;
      const hrs = calcHours(s.start_at, s.end_at);
      const cost = hrs * parseFloat(s.hourly_rate || 0);
      if (!empMap.has(a.employee_user_id)) {
        empMap.set(a.employee_user_id, { userId: a.employee_user_id, hours: 0, cost: 0, approved: 0, pending: 0 });
      }
      const e = empMap.get(a.employee_user_id);
      e.hours += hrs;
      e.cost += cost;
    }

    let totalApproved = 0, totalPending = 0;
    for (const ts of timesheets) {
      if (ts.status === "APPROVED") totalApproved++;
      if (ts.status === "SUBMITTED") totalPending++;
      if (empMap.has(ts.employee_user_id)) {
        const e = empMap.get(ts.employee_user_id);
        if (ts.status === "APPROVED") e.approved++;
        else if (ts.status === "SUBMITTED") e.pending++;
      }
    }

    const rows = [...empMap.values()];
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);

    content.querySelector("#cardLabour").textContent = "$" + totalCost.toFixed(2);
    content.querySelector("#cardHours").textContent = totalHours.toFixed(1) + "h";
    content.querySelector("#cardApproved").textContent = totalApproved;
    content.querySelector("#cardPending").textContent = totalPending;

    // Employee breakdown
    const breakdownEl = content.querySelector("#breakdownTable");
    if (!rows.length) {
      breakdownEl.innerHTML = `<div style="color:var(--muted);padding:20px 0;">No data for this period.</div>`;
    } else {
      rows.sort((a, b) => b.cost - a.cost);
      breakdownEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid var(--wl-border);">
                <th style="padding:8px 12px;text-align:left;font-weight:700;">Employee</th>
                <th style="padding:8px 12px;text-align:right;font-weight:700;">Hours</th>
                <th style="padding:8px 12px;text-align:right;font-weight:700;">Labour Cost</th>
                <th style="padding:8px 12px;text-align:right;font-weight:700;">Approved</th>
                <th style="padding:8px 12px;text-align:right;font-weight:700;">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr style="border-bottom:1px solid var(--wl-border);${i % 2 === 0 ? "background:var(--surface-2,#f9fafb);" : ""}">
                  <td style="padding:8px 12px;"><code style="font-size:11px;">${escapeHtml(r.userId)}</code></td>
                  <td style="padding:8px 12px;text-align:right;">${r.hours.toFixed(1)}h</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:700;">$${r.cost.toFixed(2)}</td>
                  <td style="padding:8px 12px;text-align:right;color:#16a34a;">${r.approved}</td>
                  <td style="padding:8px 12px;text-align:right;color:#d97706;">${r.pending}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--wl-border);font-weight:800;">
                <td style="padding:10px 12px;">Total</td>
                <td style="padding:10px 12px;text-align:right;">${totalHours.toFixed(1)}h</td>
                <td style="padding:10px 12px;text-align:right;">$${totalCost.toFixed(2)}</td>
                <td style="padding:10px 12px;text-align:right;color:#16a34a;">${totalApproved}</td>
                <td style="padding:10px 12px;text-align:right;color:#d97706;">${totalPending}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }

    // Monthly breakdown
    const monthlyEl = content.querySelector("#monthlyBreakdown");
    const byMonth = new Map();
    for (const a of assignments) {
      const s = shiftMap.get(a.shift_id);
      if (!s || !s.shift_date) continue;
      const month = s.shift_date.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, { hours: 0, cost: 0 });
      const m = byMonth.get(month);
      m.hours += calcHours(s.start_at, s.end_at);
      m.cost += calcHours(s.start_at, s.end_at) * parseFloat(s.hourly_rate || 0);
    }

    const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!months.length) {
      monthlyEl.innerHTML = `<div style="color:var(--muted);padding:20px 0;">No monthly data.</div>`;
    } else {
      monthlyEl.innerHTML = `<div style="display:grid;gap:8px;">
        ${months.map(([month, data]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--wl-border);">
            <span style="font-weight:600;">${formatMonth(month)}</span>
            <div style="display:flex;gap:24px;">
              <span style="color:var(--muted);font-size:13px;">${data.hours.toFixed(1)}h</span>
              <span style="font-weight:700;">$${data.cost.toFixed(2)}</span>
            </div>
          </div>`).join("")}
      </div>`;
    }

  } catch (err) {
    content.querySelector("#breakdownTable").innerHTML =
      `<div style="color:#dc2626;">Failed to load report: ${escapeHtml(err?.message || "")}</div>`;
  }
}

content.querySelector("#periodSelect").addEventListener("change", loadReport);

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

function formatMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function pad(n) { return String(n).padStart(2, "0"); }

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

await loadReport();
