// js/pages/manager/recurring-series.page.js
// Manager page: list all recurring series, show status, allow setting end date
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
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">♻ Recurring Series</h1>
      <p class="wl-subtext" style="margin:4px 0 0;">
        Manage open-ended recurring shifts. Set an end date when you know it — future occurrences
        beyond that date will be cancelled automatically.
      </p>
    </div>
    <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← Back to shifts</a>
  </div>

  <div id="listWrap" style="margin-top:16px;"></div>
`;

const listWrap = content.querySelector("#listWrap");

await loadSeries();

async function loadSeries() {
  listWrap.innerHTML = `<div class="wl-subtext">Loading…</div>`;

  // Load series + latest occurrence date for each
  const { data: series, error } = await supabase
    .from("recurring_series")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    listWrap.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load series: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!series?.length) {
    listWrap.innerHTML = `
      <div class="wl-card wl-panel" style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:10px;">♻</div>
        <div style="font-weight:700;">No recurring series yet</div>
        <div class="wl-subtext" style="margin-top:6px;">Create a recurring shift from the shifts page to see it here.</div>
        <a class="wl-btn wl-btn--primary" href="${path("/app/manager/create-shift.html")}" style="display:inline-block;margin-top:16px;">
          + Create recurring shift
        </a>
      </div>`;
    return;
  }

  // Fetch latest occurrence date for each series in parallel
  const latestDates = await Promise.all(series.map(async s => {
    const { data } = await supabase
      .from("shifts")
      .select("shift_date")
      .eq("recurring_group_id", s.id)
      .not("status", "eq", "CANCELLED")
      .order("shift_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.shift_date || null;
  }));

  // Fetch total occurrence count per series
  const counts = await Promise.all(series.map(async s => {
    const { count } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("recurring_group_id", s.id)
      .not("status", "eq", "CANCELLED");
    return count || 0;
  }));

  const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  listWrap.innerHTML = series.map((s, i) => {
    const ongoing       = !s.recur_end_date;
    const latestDate    = latestDates[i];
    const occCount      = counts[i];
    const daysLabel     = (s.recur_days || []).sort().map(d => DAY_NAMES[d]).join(", ");
    const startTime     = s.start_at?.slice(0, 5) || "";
    const endTime       = s.end_at?.slice(0, 5)   || "";
    const rate          = Number(s.hourly_rate || 0).toFixed(2);

    const statusBadge = ongoing
      ? `<span style="
          padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;
          background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">
          ♻ Ongoing · auto-generating
         </span>`
      : `<span style="
          padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;
          background:#f0f9f0;border:1.5px solid #a3d9a5;color:#2d8c34;">
          Ends ${escapeHtml(s.recur_end_date)}
         </span>`;

    return `
      <div class="wl-card wl-panel" style="margin-bottom:12px;" data-series-id="${s.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <strong style="font-size:16px;">${escapeHtml(s.title)}</strong>
              ${statusBadge}
            </div>
            <div class="wl-subtext" style="display:flex;flex-wrap:wrap;gap:16px;">
              <span>📅 ${escapeHtml(daysLabel)}</span>
              <span>🕐 ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</span>
              <span>💷 £${escapeHtml(rate)}/hr</span>
              <span>📋 ${occCount} occurrence${occCount===1?"":"s"}</span>
              ${latestDate ? `<span>📌 Latest: ${escapeHtml(latestDate)}</span>` : ""}
            </div>
            ${s.location ? `<div class="wl-subtext" style="margin-top:4px;">📍 ${escapeHtml(s.location)}</div>` : ""}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;min-width:200px;">
            ${ongoing ? `
              <div id="setEndForm-${s.id}">
                <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">
                  Set end date
                </label>
                <div style="display:flex;gap:6px;">
                  <input type="date" id="endDateInput-${s.id}" class="wl-input"
                    style="flex:1;font-size:13px;padding:6px 10px;" />
                  <button class="wl-btn wl-btn--primary" style="font-size:13px;padding:6px 12px;"
                    onclick="setEndDate('${s.id}')">
                    Save
                  </button>
                </div>
                <div id="endDateMsg-${s.id}" style="font-size:12px;margin-top:4px;"></div>
              </div>
            ` : `
              <button class="wl-btn" style="font-size:13px;" onclick="clearEndDate('${s.id}')">
                Remove end date
              </button>
            `}
            <button class="wl-btn" style="font-size:13px;color:var(--error, #c0392b);"
              onclick="deactivateSeries('${s.id}', '${escapeHtml(s.title)}')">
              Stop series
            </button>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ── Set end date ─────────────────────────────────────────── */
window.setEndDate = async function(seriesId) {
  const input  = document.getElementById(`endDateInput-${seriesId}`);
  const msgEl  = document.getElementById(`endDateMsg-${seriesId}`);
  const endDate = input?.value;
  if (!endDate) { msgEl.textContent = "Please pick a date."; msgEl.style.color = "var(--error, red)"; return; }

  msgEl.textContent = "Saving…"; msgEl.style.color = "var(--muted)";

  try {
    // Update the series template
    const { error: serErr } = await supabase
      .from("recurring_series")
      .update({ recur_end_date: endDate, updated_at: new Date().toISOString() })
      .eq("id", seriesId);
    if (serErr) throw serErr;

    // Update is_recurring / recur_end_date on existing shifts in the series
    await supabase
      .from("shifts")
      .update({ recur_end_date: endDate })
      .eq("recurring_group_id", seriesId);

    // Cancel any shifts already created beyond the new end date
    const { error: cancelErr } = await supabase
      .from("shifts")
      .update({ status: "CANCELLED" })
      .eq("recurring_group_id", seriesId)
      .gt("shift_date", endDate);
    if (cancelErr) throw cancelErr;

    msgEl.textContent = "Saved ✅"; msgEl.style.color = "green";
    setTimeout(() => loadSeries(), 800);
  } catch(e) {
    msgEl.textContent = e.message || "Failed to save."; msgEl.style.color = "var(--error, red)";
  }
};

/* ── Remove end date (revert to ongoing) ─────────────────── */
window.clearEndDate = async function(seriesId) {
  if (!confirm("Remove the end date? This series will become ongoing again — future occurrences will be auto-generated.")) return;
  try {
    await supabase.from("recurring_series")
      .update({ recur_end_date: null, updated_at: new Date().toISOString() })
      .eq("id", seriesId);
    await supabase.from("shifts")
      .update({ recur_end_date: null })
      .eq("recurring_group_id", seriesId);
    await loadSeries();
  } catch(e) { alert("Error: " + e.message); }
};

/* ── Stop / deactivate a series ──────────────────────────── */
window.deactivateSeries = async function(seriesId, title) {
  if (!confirm(`Stop the "${title}" recurring series?\n\nThis will cancel all future shifts in this series. Past shifts are kept.`)) return;
  const today = isoDateOf(new Date());
  try {
    await supabase.from("recurring_series")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", seriesId);
    // Cancel future shifts (today+1 and beyond)
    await supabase.from("shifts")
      .update({ status: "CANCELLED" })
      .eq("recurring_group_id", seriesId)
      .gt("shift_date", today);
    await loadSeries();
  } catch(e) { alert("Error: " + e.message); }
};

/* ── Utils ────────────────────────────────────────────────── */
function isoDateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
