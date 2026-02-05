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
  const res = await signUpWithEmail(email, password, fullName);

  // If confirmation is required, Supabase returns no session
  const hasSession = !!res?.data?.session;

  if (hasSession) {
    alert("Registered! You are now logged in.");
    // Send to pricing or dashboard routing:
    window.location.assign(path("/pricing.html"));
  } else {
    alert("Registered! Please check your email to confirm your account, then log in.");
    window.location.assign(path("/login.html"));
  }
} catch (err) {
  alert(err.message || "Register failed");
}

