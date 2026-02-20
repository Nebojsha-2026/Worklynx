// js/pages/manager/recurring-series.page.js
import { requireRole }    from "../../core/guards.js";
import { renderHeader }   from "../../ui/header.js";
import { renderFooter }   from "../../ui/footer.js";
import { renderSidebar }  from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { path }           from "../../core/config.js";
import { getSupabase }    from "../../core/supabaseClient.js";

await requireRole(["BO", "BM", "MANAGER"]);
const org      = await loadOrgContext();
const supabase = getSupabase();

document.body.prepend(renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url }));
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `<div class="wl-shell"><div id="wlSidebar"></div><div id="wlContent"></div></div>`;
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">♻ Recurring Series</h1>
      <p class="wl-subtext" style="margin:4px 0 0;">
        Auto-generating shift series — set an end date or stop a series at any time.
      </p>
    </div>
    <div style="display:flex;gap:8px;">
      <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← All shifts</a>
      <a class="wl-btn wl-btn--primary" href="${path("/app/manager/create-shift.html")}">+ New recurring shift</a>
    </div>
  </div>

  <!-- Search + filter -->
  <div class="wl-card wl-panel" style="margin-bottom:16px;">
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Search</label>
        <input id="seriesSearch" type="search" placeholder="Title or location…"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);" />
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Status</label>
        <select id="seriesFilter"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="all">All series</option>
          <option value="ongoing">Ongoing only</option>
          <option value="ending">With end date</option>
        </select>
      </div>
      <button id="clearSeriesFilters" class="wl-btn" style="padding:8px 14px;font-size:13px;">Clear</button>
    </div>
    <div id="seriesSummary" style="margin-top:10px;font-size:13px;color:var(--muted);"></div>
  </div>

  <!-- Stats strip -->
  <div id="statsStrip" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;"></div>

  <!-- Series list -->
  <div id="listWrap"></div>
`;

const listWrap    = content.querySelector("#listWrap");
const statsStrip  = content.querySelector("#statsStrip");

let allSeries      = [];
let latestDates    = [];
let counts         = [];

await loadSeries();

async function loadSeries() {
  listWrap.innerHTML = `<div class="wl-subtext" style="padding:20px 0;">Loading series…</div>`;

  const { data: series, error } = await supabase
    .from("recurring_series")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    listWrap.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load: ${escapeHtml(error.message)}</div>`;
    return;
  }

  allSeries = series || [];

  // Fetch latest occurrence + count for each series in parallel
  [latestDates, counts] = await Promise.all([
    Promise.all(allSeries.map(async s => {
      const { data } = await supabase.from("shifts").select("shift_date")
        .eq("recurring_group_id", s.id).not("status","eq","CANCELLED")
        .order("shift_date", { ascending: false }).limit(1).maybeSingle();
      return data?.shift_date || null;
    })),
    Promise.all(allSeries.map(async s => {
      const { count } = await supabase.from("shifts").select("id", { count:"exact", head:true })
        .eq("recurring_group_id", s.id).not("status","eq","CANCELLED");
      return count || 0;
    })),
  ]);

  renderStats();
  renderSeries();
  wireFilters();
}

function renderStats() {
  const ongoing = allSeries.filter(s => !s.recur_end_date).length;
  const ending  = allSeries.filter(s =>  s.recur_end_date).length;
  const total   = counts.reduce((a, b) => a + b, 0);

  statsStrip.innerHTML = [
    { label: "Active series",         value: allSeries.length, icon: "♻" },
    { label: "Ongoing (no end date)", value: ongoing,          icon: "∞" },
    { label: "Total occurrences",     value: total,            icon: "📋" },
  ].map(({ label, value, icon }) => `
    <div class="wl-card wl-panel" style="text-align:center;padding:14px;">
      <div style="font-size:22px;margin-bottom:4px;">${icon}</div>
      <div style="font-size:26px;font-weight:900;line-height:1;">${value}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">${label}</div>
    </div>`).join("");
}

function getFiltered() {
  const search = document.getElementById("seriesSearch")?.value.trim().toLowerCase() || "";
  const filter = document.getElementById("seriesFilter")?.value || "all";

  return allSeries.filter((s, i) => {
    if (search) {
      const hay = `${s.title || ""} ${s.location || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (filter === "ongoing" &&  s.recur_end_date) return false;
    if (filter === "ending"  && !s.recur_end_date) return false;
    return true;
  });
}

function renderSeries() {
  const filtered = getFiltered();

  document.getElementById("seriesSummary").textContent =
    filtered.length === allSeries.length
      ? `${allSeries.length} series`
      : `${filtered.length} of ${allSeries.length} series`;

  if (!allSeries.length) {
    listWrap.innerHTML = `
      <div class="wl-card wl-panel" style="text-align:center;padding:48px 20px;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;">♻</div>
        <div style="font-weight:800;font-size:16px;">No recurring series yet</div>
        <div class="wl-subtext" style="margin-top:8px;">Create a recurring shift to see it managed here.</div>
        <a class="wl-btn wl-btn--primary" href="${path("/app/manager/create-shift.html")}"
          style="display:inline-block;margin-top:16px;">+ Create recurring shift</a>
      </div>`;
    return;
  }

  if (!filtered.length) {
    listWrap.innerHTML = `
      <div class="wl-card wl-panel" style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:10px;">🔍</div>
        <div style="font-weight:700;">No series match your filters</div>
      </div>`;
    return;
  }

  const DAY_NAMES = ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  listWrap.innerHTML = filtered.map(s => {
    const i          = allSeries.indexOf(s);
    const ongoing    = !s.recur_end_date;
    const latestDate = latestDates[i];
    const occCount   = counts[i];
    const daysLabel  = (s.recur_days || []).sort().map(d => DAY_NAMES[d]).join(" · ");
    const startTime  = formatTime(s.start_at);
    const endTime    = formatTime(s.end_at);
    const rate       = Number(s.hourly_rate || 0).toFixed(2);

    const statusPill = ongoing
      ? `<span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;
          background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">
          ♻ Ongoing
         </span>`
      : `<span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;
          background:#f0fdf4;border:1.5px solid #86efac;color:#16a34a;">
          Ends ${formatDateShort(s.recur_end_date)}
         </span>`;

    return `
      <div class="wl-card wl-panel" style="margin-bottom:12px;" data-series-id="${s.id}">
        
        <!-- Card header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <strong style="font-size:16px;font-weight:800;">${escapeHtml(s.title)}</strong>
              ${statusPill}
            </div>

            <!-- Meta row -->
            <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--muted);">
              <span title="Days">📅 ${escapeHtml(daysLabel) || "—"}</span>
              <span title="Time">🕐 ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</span>
              <span title="Rate">💰 $${escapeHtml(rate)}/hr</span>
              <span title="Occurrences">📋 ${occCount} occurrence${occCount !== 1 ? "s" : ""}</span>
              ${latestDate ? `<span title="Latest shift">📌 Next/latest: ${formatDateShort(latestDate)}</span>` : ""}
              ${s.location ? `<span title="Location">📍 ${escapeHtml(s.location)}</span>` : ""}
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:8px;flex-shrink:0;align-items:center;">
            ${ongoing ? `
              <button class="wl-btn" style="font-size:13px;" onclick="showEndDateForm('${s.id}')">
                Set end date
              </button>
            ` : `
              <button class="wl-btn" style="font-size:13px;" onclick="clearEndDate('${s.id}')">
                Remove end date
              </button>
            `}
            <button class="wl-btn" style="font-size:13px;color:var(--error,#dc2626);border-color:rgba(220,38,38,.3);"
              onclick="deactivateSeries('${s.id}', '${escapeHtml(s.title)}')">
              Stop series
            </button>
          </div>
        </div>

        <!-- Inline end date form (hidden by default) -->
        <div id="endDateForm-${s.id}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--wl-border);">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">
            Set end date — future shifts beyond this date will be cancelled
          </label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="date" id="endDateInput-${s.id}"
              style="padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);" />
            <button class="wl-btn wl-btn--primary" style="font-size:13px;" onclick="setEndDate('${s.id}')">Save</button>
            <button class="wl-btn" style="font-size:13px;" onclick="hideEndDateForm('${s.id}')">Cancel</button>
          </div>
          <div id="endDateMsg-${s.id}" style="font-size:12px;margin-top:6px;"></div>
        </div>
      </div>`;
  }).join("");
}

function wireFilters() {
  document.getElementById("seriesSearch")?.addEventListener("input", renderSeries);
  document.getElementById("seriesFilter")?.addEventListener("change", renderSeries);
  document.getElementById("clearSeriesFilters")?.addEventListener("click", () => {
    document.getElementById("seriesSearch").value  = "";
    document.getElementById("seriesFilter").value  = "all";
    renderSeries();
  });
}

// ── End date form toggle ───────────────────────────────────────────────────
window.showEndDateForm = function(id) {
  document.getElementById(`endDateForm-${id}`).style.display = "block";
};
window.hideEndDateForm = function(id) {
  document.getElementById(`endDateForm-${id}`).style.display = "none";
};

// ── Set end date ───────────────────────────────────────────────────────────
window.setEndDate = async function(seriesId) {
  const input   = document.getElementById(`endDateInput-${seriesId}`);
  const msgEl   = document.getElementById(`endDateMsg-${seriesId}`);
  const endDate = input?.value;

  if (!endDate) { msgEl.textContent = "Please pick a date."; msgEl.style.color = "var(--error,red)"; return; }

  msgEl.textContent = "Saving…"; msgEl.style.color = "var(--muted)";

  try {
    const { error: serErr } = await supabase.from("recurring_series")
      .update({ recur_end_date: endDate, updated_at: new Date().toISOString() })
      .eq("id", seriesId);
    if (serErr) throw serErr;

    await supabase.from("shifts").update({ recur_end_date: endDate }).eq("recurring_group_id", seriesId);
    await supabase.from("shifts").update({ status: "CANCELLED" })
      .eq("recurring_group_id", seriesId).gt("shift_date", endDate);

    msgEl.textContent = "Saved ✅"; msgEl.style.color = "green";
    setTimeout(() => loadSeries(), 700);
  } catch(e) {
    msgEl.textContent = e.message || "Failed."; msgEl.style.color = "var(--error,red)";
  }
};

// ── Clear end date ─────────────────────────────────────────────────────────
window.clearEndDate = async function(seriesId) {
  if (!confirm("Remove the end date? This series will become ongoing again.")) return;
  try {
    await supabase.from("recurring_series")
      .update({ recur_end_date: null, updated_at: new Date().toISOString() }).eq("id", seriesId);
    await supabase.from("shifts").update({ recur_end_date: null }).eq("recurring_group_id", seriesId);
    await loadSeries();
  } catch(e) { alert("Error: " + e.message); }
};

// ── Stop series ────────────────────────────────────────────────────────────
window.deactivateSeries = async function(seriesId, title) {
  if (!confirm(`Stop the "${title}" series?\n\nFuture shifts will be cancelled. Past shifts are kept.`)) return;
  const today = isoToday();
  try {
    await supabase.from("recurring_series")
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", seriesId);
    await supabase.from("shifts").update({ status: "CANCELLED" })
      .eq("recurring_group_id", seriesId).gt("shift_date", today);
    await loadSeries();
  } catch(e) { alert("Error: " + e.message); }
};

// ── Utils ──────────────────────────────────────────────────────────────────
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2,"0"); }

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "pm" : "am"}`;
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" });
}

function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
