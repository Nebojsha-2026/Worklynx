// js/pages/bm.dashboard.page.js
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";

await requireRole(["BM", "BO"]);

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);

document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.classList.add("wl-page");

main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;

main.querySelector("#wlSidebar").append(renderSidebar("BM"));

main.querySelector("#wlContent").innerHTML = `
  <h1>Business Manager Dashboard</h1>
  <p>Welcome to <strong>${org.name}</strong>.</p>

  <div class="wl-cards">
    <div class="wl-card" style="padding:14px;">Pending approvals</div>
    <div class="wl-card" style="padding:14px;">Today’s shifts</div>
    <div class="wl-card" style="padding:14px;">Team overview</div>
  </div>

  <div style="margin-top:16px;">
    <div class="wl-card" style="padding:16px;">
      <h2 style="margin-top:0;">Next</h2>
      <p style="margin-bottom:0;">We’ll connect these cards to real data after shifts and timesheets are implemented.</p>
    </div>
  </div>
`;
