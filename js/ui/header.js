// js/ui/header.js
import { path } from "../core/config.js";
import { signOut } from "../core/auth.js";

export function renderHeader({ companyName, companyLogoUrl }) {
  const header = document.createElement("header");
  header.className = "wl-header";

  const logoMark = path("/assets/images/logo-mark.png");
  const orgLogo = companyLogoUrl || path("/assets/images/placeholder-company-logo.png");

  header.innerHTML = `
    <div class="wl-header__inner">
      <div class="wl-brand">
        <img src="${logoMark}" alt="WorkLynx" onerror="this.style.display='none'">
        <strong>WorkLynx</strong>
      </div>

      <div class="wl-org">
        <img src="${orgLogo}" alt="Company" onerror="this.src='${path("/assets/images/placeholder-company-logo.png")}'">
        <div>
          <div style="font-weight:700; line-height:1.2;">${escapeHtml(companyName || "Your Company")}</div>
          <div style="font-size:12px; opacity:.85; line-height:1.2;">Timesheets & shift management</div>
        </div>
      </div>

      <div class="wl-actions">
        <select id="wlLang" aria-label="Language">
          <option value="en">English</option>
          <option value="mk">Macedonian</option>
          <option value="hi">Indian</option>
          <option value="zh">Chinese</option>
          <option value="fil">Philippines</option>
          <option value="id">Indonesian</option>
        </select>

        <button id="wlBell" class="wl-btn" type="button" title="Notifications" style="padding:8px 10px;">
          🔔
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

  // Dropdown toggle
  const btn = header.querySelector("#wlAccountBtn");
  const menu = header.querySelector("#wlAccountMenu");
  btn.addEventListener("click", () => {
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) menu.style.display = "none";
  });

  // Logout
  header.querySelector("#wlLogout").addEventListener("click", async () => {
    await signOut();
    window.location.replace(path("/login.html"));
  });

  return header;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
