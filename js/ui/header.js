// js/ui/header.js
import { path } from "../core/config.js";
import { signOut } from "../core/auth.js";

export function renderHeader({ companyName, companyLogoUrl }) {
  const header = document.createElement("header");
  header.className = "wl-header";

  const logoMark = path("/assets/images/logo-mark.png");
  const orgLogo = companyLogoUrl || path("/assets/images/placeholder-company-logo.png");

  const globeIcon = path("/assets/icons/globe.svg");
  const bellIcon = path("/assets/icons/bell.svg");

  header.innerHTML = `
    <div class="wl-header__inner">
      <div class="wl-brand">
        <img src="${logoMark}" alt="WorkLynx" onerror="this.style.display='none'">
        <strong>WorkLynx</strong>
      </div>

      <div class="wl-org">
        <img id="wlHeaderOrgLogo" src="${orgLogo}" alt="Company"
             onerror="this.src='${path("/assets/images/placeholder-company-logo.png")}'">
        <div>
          <div id="wlHeaderOrgName" style="font-weight:700; line-height:1.2;">
            ${escapeHtml(companyName || "Your Company")}
          </div>
          <div style="font-size:12px; opacity:.85; line-height:1.2;">Timesheets & shift management</div>
        </div>
      </div>

      <div class="wl-actions">
        <!-- Language (globe button + menu) -->
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

        <!-- Notifications -->
        <button id="wlBell" class="wl-btn" type="button" title="Notifications" style="padding:8px 10px;">
          <img src="${bellIcon}" alt="Notifications" style="width:18px; height:18px; vertical-align:middle;">
        </button>

        <!-- Account -->
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

  // Language click (placeholder for now – we’ll hook i18n later)
  header.querySelectorAll("[data-lang]").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.getAttribute("data-lang");
      // TODO: hook to your i18n.js later
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

  // Notifications (placeholder)
  header.querySelector("#wlBell").addEventListener("click", () => {
    alert("Notifications (coming soon)");
  });

  // ✅ Live header updates when org context changes (name/logo/theme save)
  function onOrgUpdated(e) {
    const org = e.detail;

    const nameEl = header.querySelector("#wlHeaderOrgName");
    const logoEl = header.querySelector("#wlHeaderOrgLogo");

    if (nameEl && org?.name) nameEl.textContent = org.name;

    if (logoEl) {
      logoEl.src =
        org?.company_logo_url || path("/assets/images/placeholder-company-logo.png");
    }
  }

  window.addEventListener("wl:org-updated", onOrgUpdated);

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
