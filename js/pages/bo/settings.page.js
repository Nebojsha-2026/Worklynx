// js/pages/bo/settings.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader, updateHeaderOrg } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext, refreshOrgContext } from "../../core/orgContext.js";
import { updateOrganization } from "../../data/organizations.api.js";

await requireRole(["BO"]);

const org = await loadOrgContext();

// Header + footer
document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

// Shell
const main = document.querySelector("main");
main.querySelector("#wlSidebar").append(renderSidebar("BO"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div class="wl-card wl-panel">
    <h1 style="margin:0;">Company settings</h1>
    <div class="wl-subtext">Manage your organization profile and branding.</div>

    <div class="wl-alert wl-alert--success" id="successBox" style="display:none; margin-top:12px;"></div>
    <div class="wl-alert wl-alert--error" id="errorBox" style="display:none; margin-top:12px;"></div>

    <div class="wl-form" style="margin-top:14px;">
      <div>
        <label>Company name</label>
        <input id="companyName" type="text" placeholder="Company name" />
      </div>

      <div>
        <label>Company logo URL</label>
        <input id="companyLogoUrl" type="url" placeholder="https://..." />
        <div class="wl-subtext">Later we can replace this with upload to Supabase Storage.</div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Brand color</label>
          <input id="brandColor" type="color" />
        </div>
        <div>
          <label>Preview</label>
          <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
            <span class="wl-badge wl-badge--active">Active</span>
            <button class="wl-btn wl-btn--primary" type="button">Primary button</button>
          </div>
        </div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
        <button class="wl-btn wl-btn--primary" id="saveBtn" type="button">Save changes</button>
        <button class="wl-btn" id="resetBtn" type="button">Reset</button>
      </div>
    </div>
  </div>
`;

const $ = (sel) => document.querySelector(sel);

const nameEl = $("#companyName");
const logoEl = $("#companyLogoUrl");
const brandEl = $("#brandColor");
const saveBtn = $("#saveBtn");
const resetBtn = $("#resetBtn");

const successBox = $("#successBox");
const errorBox = $("#errorBox");

function showSuccess(msg) {
  successBox.style.display = "block";
  errorBox.style.display = "none";
  successBox.textContent = msg;
}

function showError(msg) {
  errorBox.style.display = "block";
  successBox.style.display = "none";
  errorBox.textContent = msg;
}

function hexToRgb(hex) {
  const x = String(hex || "").replace("#", "").trim();
  if (x.length !== 6) return null;
  const r = parseInt(x.slice(0, 2), 16);
  const g = parseInt(x.slice(2, 4), 16);
  const b = parseInt(x.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function buildThemeFromBrandHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  return {
    brand: hex,
    brandSoft: `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`,
    brandBorder: `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
  };
}

function applyThemeVars(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.brand) root.style.setProperty("--brand", theme.brand);
  if (theme.brandSoft) root.style.setProperty("--brand-soft", theme.brandSoft);
  if (theme.brandBorder) root.style.setProperty("--brand-border", theme.brandBorder);
}

function fillForm(fromOrg) {
  nameEl.value = fromOrg?.name || "";
  logoEl.value = fromOrg?.company_logo_url || "";

  const brand = fromOrg?.theme?.brand || "#6d28d9";
  brandEl.value = brand;

  // apply loaded theme to preview instantly
  applyThemeVars(buildThemeFromBrandHex(brand) || fromOrg?.theme);
}

fillForm(org);

brandEl.addEventListener("input", () => {
  const theme = buildThemeFromBrandHex(brandEl.value);
  if (!theme) return;
  applyThemeVars(theme);
});

resetBtn.addEventListener("click", async () => {
  try {
    const fresh = await refreshOrgContext();
    fillForm(fresh);

    // ✅ update ONLY org area (center)
    updateHeaderOrg(fresh);

    showSuccess("Reset to saved settings.");
  } catch (e) {
    console.error(e);
    showError(e?.message || "Failed to reset.");
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    saveBtn.disabled = true;

    const newName = nameEl.value.trim();
    if (!newName) throw new Error("Company name is required.");

    const logoUrl = logoEl.value.trim();
    const theme = buildThemeFromBrandHex(brandEl.value);
    if (!theme) throw new Error("Invalid brand color.");

    await updateOrganization(org.id, {
      name: newName,
      company_logo_url: logoUrl || null,
      theme,
    });

    // refresh cached org + apply theme
    const fresh = await refreshOrgContext();

    // ✅ update ONLY org area (center) — does NOT touch WorkLynx left branding
    updateHeaderOrg(fresh);

    showSuccess("Saved successfully.");
  } catch (e) {
    console.error(e);
    showError(e?.message || "Failed to save settings.");
  } finally {
    saveBtn.disabled = false;
  }
});
