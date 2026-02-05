// js/pages/register.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { signUpWithEmail } from "../core/auth.js";
import { path } from "../core/config.js";

await redirectIfLoggedIn();

const form = document.querySelector("#registerForm");
const nameEl = document.querySelector("#fullName");
const emailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = nameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passEl.value;

  try {
    await signUpWithEmail(email, password, fullName);
    alert("Registered! Check your email if confirmation is enabled, then log in.");
    window.location.assign(path("/login.html"));
  } catch (err) {
    alert(err.message || "Register failed");
  }
});
