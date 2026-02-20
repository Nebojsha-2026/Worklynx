// js/pages/manager/approvals.page.js
// Manager approvals: Review and approve submitted timesheets from their employees
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";

await requireRole(["MANAGER", "BM", "BO"]);

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
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Timesheet Approvals</h1>
      <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Review and approve submitted timesheets from your team</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <select id="filterStatus" style="padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
        <option value="SUBMITTED">Pending approval</option>
        <option value="APPROVED">Approved</option>
        <option value="">All timesheets</option>
      </select>
    </div>
  </div>

  <!-- Summary counts -->
  <div class="wl-cards" style="margin-bottom:20px;">
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Pending</div>
      <div id="countPending" style="font-size:28px;font-weight:900;">—</div>
    </div>
    <div class="wl-card wl-panel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Approved (this month)</div>
      <div id="countApproved" style="font-size:28px;font-weight:900;">—</div>
    </div>
  </div>

  <div id="approvalsList">
    <div style="padding:20px 0;color:var(--muted);">Loading timesheets…</div>
  </div>
`;

const listEl = content.querySelector("#approvalsList");
const filterEl = content.querySelector("#filterStatus");

async function loadApprovals() {
  const status = filterEl.value;
  listEl.innerHTML = `<div style="padding:20px 0;color:var(--muted);">Loading…</div>`;

  try {
    // Load pending count
    const { count: pendingCount } = await supabase
      .from("timesheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "SUBMITTED");

    content.querySelector("#countPending").textContent = pendingCount ?? "—";

    // Load approved this month count
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { count: approvedCount } = await supabase
      .from("timesheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "APPROVED")
      .gte("submitted_at", monthStart);

    content.querySelector("#countApproved").textContent = approvedCount ?? "—";

    // Main query
    let query = supabase
      .from("timesheets")
      .select(`
        id, status, submitted_at, created_at,
        shift_id, employee_user_id,
        shifts ( title, shift_date, start_at, end_at, hourly_rate, location )
      `)
      .eq("organization_id", org.id)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(150);

    if (status) query = query.eq("status", status);

    const { data: timesheets, error } = await query;
    if (error) throw error;

    if (!timesheets || timesheets.length === 0) {
      listEl.innerHTML = `
        <div class="wl-card wl-panel" style="text-align:center;padding:40px 20px;color:var(--muted);">
          <div style="font-size:36px;margin-bottom:10px;">✅</div>
          <div style="font-weight:700;font-size:16px;">All clear!</div>
          <div style="margin-top:6px;font-size:13px;">No timesheets to review right now.</div>
        </div>`;
      return;
    }

    listEl.innerHTML = `<div style="display:grid;gap:10px;">${timesheets.map(renderCard).join("")}</div>`;

    listEl.querySelectorAll("[data-approve]").forEach(btn => {
      btn.addEventListener("click", () => handleApprove(btn.getAttribute("data-approve"), btn));
    });

  } catch (err) {
    listEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load timesheets: ${escapeHtml(err?.message || "")}</div>`;
  }
}

function renderCard(ts) {
  const shift = ts.shifts || {};
  const shiftDate = shift.shift_date ? formatDate(shift.shift_date) : "Unknown date";
  const timeRange = shift.start_at && shift.end_at
    ? `${formatTime(shift.start_at)} – ${formatTime(shift.end_at)}`
    : "";
  const hours = shift.start_at && shift.end_at ? calcHours(shift.start_at, shift.end_at) : 0;
  const rate = parseFloat(shift.hourly_rate || 0);
  const earnings = hours * rate;

  const isPending = ts.status === "SUBMITTED";

  const badge = isPending
    ? `<span style="background:#fef3c7;border:1.5px solid #fcd34d;color:#92400e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏳ Pending</span>`
    : `<span style="background:#dcfce7;border:1.5px solid #86efac;color:#166534;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">✓ Approved</span>`;

  return `
    <div class="wl-card wl-panel" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <span style="font-weight:800;font-size:15px;">${escapeHtml(shift.title || "Shift")}</span>
          ${badge}
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);">
          <span>📅 ${shiftDate}</span>
          ${timeRange ? `<span>🕐 ${timeRange}</span>` : ""}
          ${shift.location ? `<span>📍 ${escapeHtml(shift.location)}</span>` : ""}
          ${hours > 0 ? `<span>⏱ ${hours.toFixed(1)}h @ $${rate.toFixed(2)}/hr</span>` : ""}
          ${earnings > 0 ? `<span style="font-weight:700;color:var(--fg);">💰 $${earnings.toFixed(2)}</span>` : ""}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--muted);">
          Employee: <code>${escapeHtml(ts.employee_user_id)}</code>
          ${ts.submitted_at ? ` · Submitted ${formatDatetime(ts.submitted_at)}` : ""}
        </div>
      </div>
      ${isPending ? `
        <button class="wl-btn wl-btn--primary" data-approve="${escapeHtml(ts.id)}"
          style="padding:10px 18px;font-size:13px;white-space:nowrap;flex-shrink:0;">
          Approve
        </button>` : ""}
    </div>`;
}

async function handleApprove(timesheetId, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Approving…";
  try {
    const { error } = await supabase
      .from("timesheets")
      .update({ status: "APPROVED" })
      .eq("id", timesheetId)
      .eq("organization_id", org.id);

    if (error) throw error;
    await loadApprovals();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    alert(err?.message || "Failed to approve timesheet.");
  }
}

filterEl.addEventListener("change", loadApprovals);

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "pm" : "am"}`;
}
function formatDatetime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

await loadApprovals();
