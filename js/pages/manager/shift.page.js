// js/pages/manager/shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";
import { cancelShift } from "../../data/shifts.api.js";
import {
  assignShiftToEmployee,
  unassignShiftFromEmployee,
} from "../../data/assignments.api.js";
import { listOrgMembers } from "../../data/members.api.js";

await requireRole(["BO", "BM", "MANAGER"]);

const params = new URLSearchParams(window.location.search);
const shiftId = params.get("id");

if (!shiftId) {
  window.location.replace(path("/app/manager/dashboard.html"));
  throw new Error("Missing shift id");
}

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
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

// Load shift
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

// Load employees for dropdown
let employees = [];
let employeesLoadError = null;

try {
  const members = await listOrgMembers({ organizationId: org.id }); // no roles param
  employees = (members || []).filter((m) => String(m.role).toUpperCase() === "EMPLOYEE");
} catch (e) {
  employeesLoadError = e;
  employees = [];
}

content.innerHTML = `
  <h1>${escapeHtml(shift.title || "Untitled shift")}</h1>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Status:</b> ${escapeHtml(String(shift.status || "ACTIVE"))}</div>
      <div><b>Date:</b> ${escapeHtml(shift.shift_date)}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>` : ""}
      ${shift.description ? `<div><b>Description:</b><br/>${escapeHtml(shift.description)}</div>` : ""}
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <h2 style="margin:0 0 10px;">Assign employee</h2>

    ${
      employees.length
        ? `
      <form id="assignForm" class="wl-form">
        <label>Select employee</label>
        <select id="employeeSelect" required>
          <option value="" selected disabled>Choose an employee…</option>
          ${employees
            .map(
              (m) =>
                `<option value="${escapeHtml(m.user_id)}">${escapeHtml(
                  m.full_name || m.email || m.user_id
                )}</option>`
            )
            .join("")}
        </select>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="wl-btn" type="submit">Assign</button>
          <button id="unassignBtn" class="wl-btn" type="button">Unassign</button>
        </div>
      </form>
      <div id="assignMsg" style="margin-top:10px;"></div>
    `
        : `
      <div class="wl-alert wl-alert--error">
        Could not load employees. (Make sure you have employee accounts in this company.)
      </div>
    `
    }
  </section>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← Back</a>
    <button id="cancelBtn" class="wl-btn" type="button">Cancel shift</button>
  </div>

  <div id="actionMsg" style="margin-top:10px;"></div>
`;

// Only bind handlers if dropdown exists
const assignForm = document.querySelector("#assignForm");
const employeeSelect = document.querySelector("#employeeSelect");
const assignMsg = document.querySelector("#assignMsg");
const unassignBtn = document.querySelector("#unassignBtn");

if (assignForm && employeeSelect && assignMsg && unassignBtn) {
  assignForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const employeeUserId = employeeSelect.value;
    if (!employeeUserId) return;

    try {
      assignMsg.innerHTML = `<div style="opacity:.85;">Assigning…</div>`;
      const row = await assignShiftToEmployee({ shiftId, employeeUserId });

      assignMsg.innerHTML = `
        <div class="wl-alert wl-alert--success">
          Assigned ✅<br/>
          <div style="font-size:13px; opacity:.9; margin-top:6px;">
            employee_user_id: <code>${escapeHtml(row.employee_user_id)}</code><br/>
            assigned_by_user_id: <code>${escapeHtml(row.assigned_by_user_id)}</code>
          </div>
        </div>
      `;
    } catch (err) {
      console.error(err);
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to assign."
      )}</div>`;
    }
  });

  unassignBtn.addEventListener("click", async () => {
    const employeeUserId = employeeSelect.value;
    if (!employeeUserId) {
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">Choose an employee first.</div>`;
      return;
    }

    const ok = confirm("Unassign this employee from the shift?");
    if (!ok) return;

    try {
      assignMsg.innerHTML = `<div style="opacity:.85;">Unassigning…</div>`;
      await unassignShiftFromEmployee({ shiftId, employeeUserId });
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--success">Unassigned ✅</div>`;
    } catch (err) {
      console.error(err);
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to unassign."
      )}</div>`;
    }
  });
}

/* Cancel handler */
const cancelBtn = document.querySelector("#cancelBtn");
const msgEl = document.querySelector("#actionMsg");

if (String(shift.status).toUpperCase() === "CANCELLED") {
  cancelBtn.disabled = true;
  cancelBtn.textContent = "Cancelled";
} else {
  cancelBtn.addEventListener("click", async () => {
    const ok = confirm("Cancel this shift? Employees will no longer be able to work it.");
    if (!ok) return;

    try {
      cancelBtn.disabled = true;
      msgEl.innerHTML = `<div style="opacity:.85;">Cancelling…</div>`;

      const updated = await cancelShift({ shiftId });

      msgEl.innerHTML = `<div class="wl-alert wl-alert--success">Shift cancelled.</div>`;
      shift.status = updated.status;
      cancelBtn.textContent = "Cancelled";
    } catch (err) {
      console.error(err);
      cancelBtn.disabled = false;
      msgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to cancel shift."
      )}</div>`;
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
