// js/pages/employee/my-shifts.page.js
import { getSupabase } from "../../core/supabaseClient.js";
import { listMyShiftAssignments } from "../../data/shiftAssignments.api.js";
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { path } from "../../core/config.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();

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
  <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">My shifts</h1>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">
        Shifts you’ve been assigned to.
      </div>
    </div>

    <div class="wl-filter-group" id="shiftFilter">
      <button class="wl-filter is-active" data-filter="active" type="button">
        Active
      </button>
      <button class="wl-filter" data-filter="all" type="button">
        All
      </button>
    </div>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="shiftsList" style="display:grid; gap:10px;"></div>
  </section>
`;

const listEl = document.querySelector("#shiftsList");

let allShifts = [];
let currentFilter = "active";

/* --------------------------
   Filter buttons
--------------------------- */
document.querySelectorAll("#shiftFilter .wl-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#shiftFilter .wl-filter")
      .forEach((b) => b.classList.remove("is-active"));

    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter || "active";
    render();
  });
});

try {
  await load();
} catch (err) {
  console.error(err);
  listEl.innerHTML = `
    <div class="wl-alert wl-alert--error">
      Failed to load shifts. ${escapeHtml(err?.message || "")}
    </div>
  `;
}

/* --------------------------
   Data loading
--------------------------- */
async function load() {
  listEl.innerHTML = `<div style="opacity:.85;">Loading your shifts…</div>`;

  const assigns = await listMyShiftAssignments();
  const ids = (assigns || []).map((a) => a.shift_id).filter(Boolean);

  if (!ids.length) {
    allShifts = [];
    render();
    return;
  }

  const supabase = getSupabase();
  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("*")
    .in("id", ids)
    .limit(200);

  if (error) throw error;

  allShifts = shifts || [];
  render();
}

/* --------------------------
   Rendering
--------------------------- */
function render() {
  const filtered = allShifts.filter((s) => {
    const status = String(s.status || "PUBLISHED").toUpperCase();

    if (currentFilter === "active" && status === "CANCELLED") {
      return false;
    }

    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        No shifts to show.
        <div style="font-size:13px; opacity:.85; margin-top:6px;">
          If you believe this is incorrect, contact your manager.
        </div>
      </div>
    `;
    return;
  }

  // Sort: non-cancelled first, then by date, then start time
  filtered.sort((a, b) => {
    const as = String(a.status || "PUBLISHED").toUpperCase();
    const bs = String(b.status || "PUBLISHED").toUpperCase();

    const aCancelled = as === "CANCELLED";
    const bCancelled = bs === "CANCELLED";
    if (aCancelled !== bCancelled) return aCancelled ? 1 : -1;

    const ad = String(a.shift_date || "");
    const bd = String(b.shift_date || "");
    if (ad !== bd) return ad.localeCompare(bd);

    return String(a.start_at || "").localeCompare(String(b.start_at || ""));
  });

  listEl.innerHTML = filtered.map(renderShiftRow).join("");
}

function renderShiftRow(s) {
  const href = path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`);

  const status = String(s.status || "PUBLISHED").toUpperCase();
  const isCancelled = status === "CANCELLED";

  const title = s.title || "Untitled shift";
  const date = s.shift_date || "";
  const start = s.start_at || "";
  const end = s.end_at || "";

  const whenLabel = formatWhenLabel(date);

  return `
    <a class="wl-card wl-panel ${isCancelled ? "is-cancelled" : ""}"
       href="${href}"
       style="display:block;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(title)}
          </div>

          <div style="opacity:.85; font-size:13px; margin-top:4px;">
            <b>${escapeHtml(whenLabel)}</b> • ${escapeHtml(start)} → ${escapeHtml(end)}
            ${s.location ? ` • ${escapeHtml(s.location)}` : ""}
          </div>

          <div style="font-size:13px; opacity:.9; margin-top:6px;">
            ✅ Assigned to you
          </div>

          ${
            isCancelled
              ? `<div style="font-size:13px; margin-top:6px; opacity:.85;">
                   This shift was cancelled.
                 </div>`
              : ""
          }
        </div>

        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:0 0 auto;">
          ${renderStatusBadge(status)}
          <div style="opacity:.8; font-size:13px;">View →</div>
        </div>
      </div>
    </a>
  `;
}

/* --------------------------
   Helpers
--------------------------- */
function renderStatusBadge(status) {
  const map = {
    PUBLISHED: { cls: "wl-badge--active", label: "Active" },
    ACTIVE: { cls: "wl-badge--active", label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT: { cls: "wl-badge--draft", label: "Draft" },
    OFFERED: { cls: "wl-badge--offered", label: "Offered" },
  };

  const s = map[status] || { cls: "", label: status };
  return `<span class="wl-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

function formatWhenLabel(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return String(yyyyMmDd || "");

  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return String(yyyyMmDd);

  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dt = new Date(y, m - 1, d).getTime();
  const diffDays = Math.round((dt - t0) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

  return String(yyyyMmDd);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
