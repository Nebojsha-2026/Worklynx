// js/pages/pricing.page.js
import { getSession } from "../core/session.js";
import { path } from "../core/config.js";

const session = await getSession();
if (!session?.user) {
  // Not logged in → send to login
  window.location.replace(path("/login.html"));
}

const form = document.querySelector("#createOrgForm");
const nameInput = document.querySelector("#companyName");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  if (!name) {
    alert("Company name is required");
    return;
  }

  // TEMP: next step will actually create the org
  alert(`Company "${name}" will be created next step.`);
});
