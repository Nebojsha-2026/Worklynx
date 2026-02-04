// js/pages/bo.dashboard.page.js
import { enforceRoleRouting } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";

await enforceRoleRouting();

document.body.prepend(renderHeader({ companyName: "Your Company" }));
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <h1>Business Owner Dashboard</h1>
  <p>Next: connect to real data (labour cost, hours, approvals).</p>

  <div class="wl-cards">
    <div class="wl-card">Labour Cost (YTD)</div>
    <div class="wl-card">Hours Worked (YTD)</div>
    <div class="wl-card">Pending Approvals</div>
  </div>
`;
