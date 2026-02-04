// js/pages/admin.dashboard.page.js
import { enforceRoleRouting } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";

await enforceRoleRouting();

document.body.prepend(renderHeader({ companyName: "Platform Admin" }));
document.body.append(renderFooter({ version: "v0.1.0" }));

// Page content
const main = document.querySelector("main");
main.innerHTML = `
  <h1>Admin Dashboard</h1>
  <p>Welcome. From here you will manage discount codes and do platform testing.</p>

  <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
    <a class="wl-card" href="/app/admin/discount-codes.html">Discount Codes</a>
    <a class="wl-card" href="/app/admin/orgs.html">Organizations</a>
  </div>
`;
