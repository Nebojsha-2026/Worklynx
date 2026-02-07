// js/pages/bo.dashboard.page.js
import { enforceRoleRouting } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { loadOrgContext } from "../core/orgContext.js";
import { path } from "../core/config.js";

await enforceRoleRouting();

// Load org data
const org = await loadOrgContext();

// Render header/footer with REAL company name
document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);

document.body.append(renderFooter({ version: "v0.1.0" }));

// Page content
const main = document.querySelector("main");
main.innerHTML = `
  <h1>Business Owner Dashboard</h1>
  <p>Welcome to <strong>${org.name}</strong></p>
  <p><a href="${path("/app/bo/managers.html")}">Go to Managers (Invites)</a></p>

  <div class="wl-cards">
    <div class="wl-card">Labour Cost (YTD)</div>
    <div class="wl-card">Hours Worked (YTD)</div>
    <div class="wl-card">Pending Approvals</div>
  </div>
`;
