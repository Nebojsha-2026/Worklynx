// js/ui/header.js
import { signOut } from "../core/auth.js";

export function renderHeader({ appName = "WorkLynx", companyName = "", companyLogoUrl = "" } = {}) {
  const el = document.createElement("header");
  el.className = "wl-header";

  el.innerHTML = `
    <div class="wl-header__left">
      <a class="wl-brand" href="/index.html">
        <img src="/assets/images/logo-mark.png" alt="${appName}" class="wl-brand__logo" />
        <span class="wl-brand__name">${appName}</span>
      </a>
    </div>

    <div class="wl-header__center">
      <div class="wl-company">
        <img src="${companyLogoUrl || "/assets/images/placeholder-company-logo.png"}"
             class="wl-company__logo" alt="Company" />
        <span class="wl-company__name">${companyName || "—"}</span>
      </div>
    </div>

    <div class="wl-header__right">
      <button class="wl-icon-btn" id="wlNotifBtn" title="Notifications">🔔</button>

      <select id="wlLang" class="wl-select" aria-label="Language">
        <option value="en">English</option>
        <option value="mk">Macedonian</option>
        <option value="hi">Indian</option>
        <option value="zh">Chinese</option>
        <option value="fil">Philippines</option>
        <option value="id">Indonesian</option>
      </select>

      <div class="wl-user-menu">
        <button class="wl-btn wl-btn--ghost" id="wlUserBtn">Account ▾</button>
        <div class="wl-user-menu__panel" id="wlUserPanel">
          <a href="/app/employee/profile.html" class="wl-menu-item">Profile</a>
          <button class="wl-menu-item" id="wlLogoutBtn">Log out</button>
        </div>
      </div>
    </div>
  `;

  // Dropdown logic
  const userBtn = el.querySelector("#wlUserBtn");
  const panel = el.querySelector("#wlUserPanel");
  userBtn.addEventListener("click", () => panel.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!el.contains(e.target)) panel.classList.remove("open");
  });

  // Logout
  el.querySelector("#wlLogoutBtn").addEventListener("click", async () => {
    try {
      await signOut();
      window.location.replace("/login.html");
    } catch (e) {
      alert(e.message || "Logout failed");
    }
  });

  return el;
}

