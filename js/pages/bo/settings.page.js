// js/pages/bo/settings.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader, updateHeaderOrg } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext, refreshOrgContext } from "../../core/orgContext.js";
import { updateOrganization } from "../../data/organizations.api.js";
import { getSupabase } from "../../core/supabaseClient.js";

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
        <label>Company logo</label>
        <input id="companyLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
        <div class="wl-subtext">Recommended: square PNG 256×256 or 512×512. Max ~2MB.</div>

        <div style="display:flex; gap:12px; align-items:center; margin-top:10px;">
          <img id="logoPreview" alt="Logo preview"
               style="width:44px; height:44px; border-radius:10px; border:1px solid var(--wl-border);
               object-fit:cover; background:#fff;" />
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="wl-btn" id="removeLogoBtn" type="button">Remove logo</button>
            <div class="wl-subtext" id="logoStatus" style="margin:0;"></div>
          </div>
        </div>
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
const brandEl = $("#brandColor");
const logoFileEl = $("#companyLogoFile");
const logoPreviewEl = $("#logoPreview");
const logoStatusEl = $("#logoStatus");
const removeLogoBtn = $("#removeLogoBtn");

const saveBtn = $("#saveBtn");
const resetBtn = $("#resetBtn");

const successBox = $("#successBox");
const errorBox = $("#errorBox");

let selectedLogoFile = null;
let removeLogo = false;

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

function setLogoPreview(url) {
  logoPreviewEl.src = url || "";
}

function fillForm(fromOrg) {
  nameEl.value = fromOrg?.name || "";

  const brand = fromOrg?.theme?.brand || "#6d28d9";
  brandEl.value = brand;
  applyThemeVars(buildThemeFromBrandHex(brand) || fromOrg?.theme);

  setLogoPreview(fromOrg?.company_logo_url || "");
  logoStatusEl.textContent =
    fromOrg?.company_logo_url ? "Current logo loaded." : "No logo set.";

  selectedLogoFile = null;
  removeLogo = false;
  logoFileEl.value = "";
}

fillForm(org);

brandEl.addEventListener("input", () => {
  const theme = buildThemeFromBrandHex(brandEl.value);
  if (!theme) return;
  applyThemeVars(theme);
});

logoFileEl.addEventListener("change", () => {
  const file = logoFileEl.files?.[0] || null;
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    logoFileEl.value = "";
    showError("Logo file is too large. Please keep it under ~2MB.");
    return;
  }

  selectedLogoFile = file;
  removeLogo = false;

  const objectUrl = URL.createObjectURL(file);
  setLogoPreview(objectUrl);
  logoStatusEl.textContent = `Selected: ${file.name}`;
});

removeLogoBtn.addEventListener("click", () => {
  selectedLogoFile = null;
  removeLogo = true;
  logoFileEl.value = "";
  setLogoPreview("");
  logoStatusEl.textContent = "Logo will be removed on Save.";
});

resetBtn.addEventListener("click", async () => {
  try {
    const fresh = await refreshOrgContext();

    org.company_logo_url = fresh.company_logo_url;
    org.name = fresh.name;
    org.theme = fresh.theme;

    fillForm(fresh);
    updateHeaderOrg(fresh);
    showSuccess("Reset to saved settings.");
  } catch (e) {
    console.error(e);
    showError(e?.message || "Failed to reset.");
  }
});

/**
 * Delete any existing logo.* files under this org folder.
 * - If keepObjectPath is provided, deletes all other logo.* except that path.
 * - If keepObjectPath is null, deletes ALL logo.* (used for "Remove logo").
 */
async function deleteOtherOrgLogos({ orgId, keepObjectPath = null }) {
  const supabase = getSupabase();
  const bucket = "org-logos";

  const { data: files, error: listErr } = await supabase.storage
    .from(bucket)
    .list(String(orgId), { limit: 100, offset: 0 });

  if (listErr) throw listErr;

  const toDelete = (files || [])
    .map((f) => `${orgId}/${f.name}`)
    .filter((fullPath) => {
      const name = (fullPath.split("/").pop() || "").toLowerCase();
      const isLogo = name.startsWith("logo.");
      const isKeep = keepObjectPath && fullPath === keepObjectPath;
      return isLogo && !isKeep;
    });

  if (toDelete.length === 0) return;

  const { error: delErr } = await supabase.storage.from(bucket).remove(toDelete);
  if (delErr) throw delErr;
}

/**
 * Upload logo to Supabase Storage and return public URL.
 * Also auto-deletes old logo.* files when extension changes.
 */
async function uploadLogoToStorage({ orgId, file }) {
  const supabase = getSupabase();
  const bucket = "org-logos";

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${orgId}/logo.${safeExt}`;

  // ✅ Clean up any other logo.* first (e.g. old logo.png when uploading logo.webp)
  await deleteOtherOrgLogos({ orgId, keepObjectPath: objectPath });

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(objectPath, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || undefined,
    });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) throw new Error("Could not get public URL.");
  return data.publicUrl;
}

saveBtn.addEventListener("click", async () => {
  try {
    saveBtn.disabled = true;

    const newName = nameEl.value.trim();
    if (!newName) throw new Error("Company name is required.");

    const theme = buildThemeFromBrandHex(brandEl.value);
    if (!theme) throw new Error("Invalid brand color.");

    let nextLogoUrl = org.company_logo_url || null;

    if (removeLogo) {
      // ✅ Delete all logo.* files in this org folder
      logoStatusEl.textContent = "Removing logo…";
      await deleteOtherOrgLogos({ orgId: org.id, keepObjectPath: null });
      nextLogoUrl = null;
      logoStatusEl.textContent = "Logo removed.";
    } else if (selectedLogoFile) {
      logoStatusEl.textContent = "Uploading logo…";
      const publicUrl = await uploadLogoToStorage({
        orgId: org.id,
        file: selectedLogoFile,
      });

      // ✅ cache-bust so everyone sees the newest upload
      nextLogoUrl = `${publicUrl}?v=${Date.now()}`;
      logoStatusEl.textContent = "Logo uploaded.";
    }

    await updateOrganization(org.id, {
      name: newName,
      company_logo_url: nextLogoUrl,
      theme,
    });

    const fresh = await refreshOrgContext();

    // keep local org in sync
    org.company_logo_url = fresh.company_logo_url;
    org.name = fresh.name;
    org.theme = fresh.theme;

    updateHeaderOrg(fresh);

    selectedLogoFile = null;
    removeLogo = false;
    logoFileEl.value = "";

    showSuccess("Saved successfully.");
  } catch (e) {
    console.error(e);
    showError(e?.message || "Failed to save settings.");
  } finally {
    saveBtn.disabled = false;
  }
});
