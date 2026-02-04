// js/pages/login.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { signInWithEmail } from "../core/auth.js";

await redirectIfLoggedIn();

const form = document.querySelector("#loginForm");
const emailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailEl.value.trim();
  const password = passEl.value;

  try {
    await signInWithEmail(email, password);
    // After login, redirect based on roles/admin
    await redirectIfLoggedIn();
  } catch (err) {
    alert(err.message || "Login failed");
  }
});
