// js/ui/header.js
import { path, CONFIG } from "../core/config.js";
import { signOut } from "../core/auth.js";

const PLACEHOLDER_ORG_LOGO = path("/assets/images/placeholder-company-logo.png");

/**
 * Update ONLY the org area in the header (center).
 * Does NOT touch WorkLynx brand (left).
 */
export function updateHeaderOrg({ name, company_logo_url } = {}) {
  const orgNameEl = document.querySelector('[data-wl="org-name"]');
  const orgLogoEl = document.querySelector('[data-wl="org-logo"]');

  if (orgNameEl) orgNameEl.textContent = name || "Your Company";

  if (orgLogoEl) {
    const next = company_logo_url || PLACEHOLDER_ORG_LOGO;
    orgLogoEl.src = next;
  }
}

export function renderHeader({ companyName, companyLogoUrl } = {}) {
  const header = document.createElement("header");
  header.className = "wl-header";

  const logoMark = path("/assets/images/logo-mark.png");

  const globeIcon = path("/assets/icons/globe.svg");
  const bellIcon = path("/assets/icons/bell.svg");

  header.innerHTML = `
    <div class="wl-header__inner">
      <div class="wl-brand">
        <img src="${logoMark}" alt="${CONFIG.APP_NAME}" onerror="this.style.display='none'">
        <strong>${CONFIG.APP_NAME}</strong>
      </div>

      <div class="wl-org">
        <img
          data-wl="org-logo"
          src="${companyLogoUrl || PLACEHOLDER_ORG_LOGO}"
          alt="Company"
          onerror="this.src='${PLACEHOLDER_ORG_LOGO}'"
        >
        <div>
          <div data-wl="org-name" style="font-weight:700; line-height:1.2;">
            ${escapeHtml(companyName || "Your Company")}
          </div>
          <div style="font-size:12px; opacity:.85; line-height:1.2;">
            Timesheets & shift management
          </div>
        </div>
      </div>

      <div class="wl-actions">
        <div class="wl-menu" style="position:relative;">
          <button id="wlLangBtn" class="wl-btn" type="button" title="Language" style="padding:8px 10px;">
            <img src="${globeIcon}" alt="Language" style="width:18px; height:18px; vertical-align:middle;">
          </button>

          <div id="wlLangMenu" class="wl-card" style="
              display:none; position:absolute; right:0; top:42px; width:180px;
              padding:8px; background: rgba(0,0,0,0.35);">
            ${langItem("English", "en")}
            ${langItem("Macedonian", "mk")}
            ${langItem("Indian", "hi")}
            ${langItem("Chinese", "zh")}
            ${langItem("Philippines", "fil")}
            ${langItem("Indonesian", "id")}
          </div>
        </div>

        <button id="wlBell" class="wl-btn" type="button" title="Notifications" style="padding:8px 10px;">
          <img src="${bellIcon}" alt="Notifications" style="width:18px; height:18px; vertical-align:middle;">
        </button>

        <div class="wl-menu" style="position:relative;">
          <button id="wlAccountBtn" class="wl-btn" type="button" style="padding:8px 10px;">
            Account ▾
          </button>
          <div id="wlAccountMenu" class="wl-card" style="
              display:none; position:absolute; right:0; top:42px; width:180px;
              padding:10px; background: rgba(0,0,0,0.35);">
            <a href="${path("/app/employee/profile.html")}" style="display:block; padding:6px 8px;">Profile</a>
            <a href="${path("/pricing.html")}" style="display:block; padding:6px 8px;">Billing</a>
            <button id="wlLogout" class="wl-btn" type="button" style="width:100%; margin-top:8px;">
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Account dropdown
  const accBtn = header.querySelector("#wlAccountBtn");
  const accMenu = header.querySelector("#wlAccountMenu");
  accBtn.addEventListener("click", () => {
    accMenu.style.display = accMenu.style.display === "none" ? "block" : "none";
  });

  // Language menu
  const langBtn = header.querySelector("#wlLangBtn");
  const langMenu = header.querySelector("#wlLangMenu");
  langBtn.addEventListener("click", () => {
    langMenu.style.display = langMenu.style.display === "none" ? "block" : "none";
  });

  header.querySelectorAll("[data-lang]").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.getAttribute("data-lang");
      console.log("Language set:", code);
      langMenu.style.display = "none";
    });
  });

  // Close menus on outside click
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) {
      accMenu.style.display = "none";
      langMenu.style.display = "none";
    }
  });

  // Logout
  header.querySelector("#wlLogout").addEventListener("click", async () => {
    await signOut();
    window.location.replace(path("/login.html"));
  });

  // Notifications placeholder
  header.querySelector("#wlBell").addEventListener("click", () => {
    alert("Notifications (coming soon)");
  });

  return header;
}

function langItem(label, code) {
  return `<button type="button" data-lang="${code}" class="wl-btn" style="width:100%; text-align:left; margin:4px 0; padding:8px 10px;">${label}</button>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
