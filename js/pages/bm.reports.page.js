// js/pages/bm.reports.page.js
// Reports: Hours worked and estimated earnings by period and employee
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { getSupabase } from "../core/supabaseClient.js";

await requireRole(["BM", "BO"]);

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
main.querySelector("#wlSidebar").append(renderSidebar("BM"));

const content = main.querySelector("#wlContent");

const nowDate = new Date();
const thisYear = nowDate.getFullYear();
const thisMonthStart = `${thisYear}-${pad(nowDate.getMonth() + 1)}-01`;
const yearStart = `${thisYear}-01-01`;
const yearEnd = `${thisYear}-12-31`;

content.innerHTML = `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Reports</h1>
      <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Hours worked and estimated labour costs by employee</p>
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

  <!-- Summary cards -->
  <div class="wl-cards" style="margin-bottom:20px;">
    <div class="wl-card wl-panel">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Total Hours</div>
      <div id="summaryHours" style="font-size:28px;font-weight:900;margin-top:6px;">—</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Labour Cost</div>
      <div id="summaryCost" style="font-size:28px;font-weight:900;margin-top:6px;">—</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Approved Timesheets</div>
      <div id="summaryApproved" style="font-size:28px;font-weight:900;margin-top:6px;">—</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Pending Approval</div>
      <div id="summaryPending" style="font-size:28px;font-weight:900;margin-top:6px;">—</div>
    </div>
  </div>

  <!-- Employee breakdown -->
  <div class="wl-card wl-panel">
    <h2 style="margin-top:0;">Employee Breakdown</h2>
    <div id="employeeBreakdown"><div style="color:var(--muted);">Loading…</div></div>
  </div>
`;

async function loadReport() {
  const period = content.querySelector("#periodSelect").value;

  let dateFrom, dateTo;
  if (period === "month") {
    dateFrom = thisMonthStart;
    dateTo = `${thisYear}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
  } else if (period === "ytd") {
    dateFrom = yearStart;
    dateTo = `${thisYear}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
  } else {
    dateFrom = yearStart;
    dateTo = yearEnd;
  }

  try {
    // Load shifts in range
    const { data: shifts, error: shiftErr } = await supabase
      .from("shifts")
      .select("id, title, shift_date, start_at, end_at, hourly_rate, status")
      .eq("organization_id", org.id)
      .gte("shift_date", dateFrom)
      .lte("shift_date", dateTo)
      .neq("status", "CANCELLED");

    if (shiftErr) throw shiftErr;

    const shiftIds = (shifts || []).map(s => s.id);

    // Load assignments
    let assignments = [];
    if (shiftIds.length) {
      const { data: assigns, error: assignErr } = await supabase
        .from("shift_assignments")
        .select("shift_id, employee_user_id")
        .in("shift_id", shiftIds);
      if (assignErr) throw assignErr;
      assignments = assigns || [];
    }

    // Load timesheets
    let timesheets = [];
    if (shiftIds.length) {
      const { data: ts, error: tsErr } = await supabase
        .from("timesheets")
        .select("shift_id, employee_user_id, status")
        .eq("organization_id", org.id)
        .in("shift_id", shiftIds);
      if (tsErr) throw tsErr;
      timesheets = ts || [];
    }

    // Build shift map
    const shiftMap = new Map((shifts || []).map(s => [s.id, s]));

    // Per employee aggregation
    const employeeData = new Map();

    for (const a of assignments) {
      const shift = shiftMap.get(a.shift_id);
      if (!shift) continue;

      const hours = calcHours(shift.start_at, shift.end_at);
      const rate = parseFloat(shift.hourly_rate || 0);
      const earning = hours * rate;

      if (!employeeData.has(a.employee_user_id)) {
        employeeData.set(a.employee_user_id, { userId: a.employee_user_id, hours: 0, cost: 0, approved: 0, pending: 0 });
      }
      const emp = employeeData.get(a.employee_user_id);
      emp.hours += hours;
      emp.cost += earning;
    }

    for (const ts of timesheets) {
      if (!employeeData.has(ts.employee_user_id)) continue;
      const emp = employeeData.get(ts.employee_user_id);
      if (ts.status === "APPROVED") emp.approved++;
      else if (ts.status === "SUBMITTED") emp.pending++;
    }

    const rows = [...employeeData.values()];
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const totalApproved = rows.reduce((s, r) => s + r.approved, 0);
    const totalPending = rows.reduce((s, r) => s + r.pending, 0);

    content.querySelector("#summaryHours").textContent = totalHours.toFixed(1) + "h";
    content.querySelector("#summaryCost").textContent = "$" + totalCost.toFixed(2);
    content.querySelector("#summaryApproved").textContent = totalApproved;
    content.querySelector("#summaryPending").textContent = totalPending;

    const breakdownEl = content.querySelector("#employeeBreakdown");
    if (!rows.length) {
      breakdownEl.innerHTML = `<div style="color:var(--muted);padding:20px 0;">No shift data for this period.</div>`;
      return;
    }

    rows.sort((a, b) => b.cost - a.cost);

    breakdownEl.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--wl-border);text-align:left;">
              <th style="padding:8px 12px;font-weight:700;">Employee</th>
              <th style="padding:8px 12px;font-weight:700;text-align:right;">Hours</th>
              <th style="padding:8px 12px;font-weight:700;text-align:right;">Labour Cost</th>
              <th style="padding:8px 12px;font-weight:700;text-align:right;">Approved</th>
              <th style="padding:8px 12px;font-weight:700;text-align:right;">Pending</th>
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

  } catch (err) {
    content.querySelector("#employeeBreakdown").innerHTML =
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

function pad(n) { return String(n).padStart(2, "0"); }

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

await loadReport();
