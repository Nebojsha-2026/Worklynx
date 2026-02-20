// js/pages/register.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { signUpWithEmail, resendConfirmationEmail } from "../core/auth.js";
import { path } from "../core/config.js";

function getResumeInvite() {
  const hash = window.location.hash;
  if (!hash.startsWith("#resumeInvite=")) return null;
  return decodeURIComponent(hash.replace("#resumeInvite=", ""));
}

await redirectIfLoggedIn();

const form       = document.querySelector("#registerForm");
const fullNameEl = document.querySelector("#fullName");
const emailEl    = document.querySelector("#email");
const passEl     = document.querySelector("#password");
const msgEl      = document.querySelector("#registerMsg");
const btnEl      = document.querySelector("#registerBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = fullNameEl.value.trim();
  const email    = emailEl.value.trim();
  const password = passEl.value;

  if (!fullName) return showMsg("Please enter your full name.", "error");
  if (password.length < 8) return showMsg("Password must be at least 8 characters.", "error");

  try {
    setBusy(true);
    clearMsg();

    await signUpWithEmail(email, password, fullName);

    // Hide the form and show the "check your inbox" state
    form.style.display = "none";
    document.querySelector("#pendingEmail").textContent = email;
    document.querySelector("#verifyPending").style.display = "block";

    // Store so the resend button can use it if the form is hidden
    sessionStorage.setItem("wl_pending_email", email);

  } catch (err) {
    console.error(err);
    showMsg(err.message || "Registration failed. Please try again.", "error");
  } finally {
    setBusy(false);
  }
});

// Resend button (shown in the "check your inbox" state)
document.querySelector("#resendBtn")?.addEventListener("click", async () => {
  const email = sessionStorage.getItem("wl_pending_email") || emailEl.value.trim();
  if (!email) return;

  const btn = document.querySelector("#resendBtn");
  try {
    btn.disabled    = true;
    btn.textContent = "Sending…";
    await resendConfirmationEmail(email);
    showMsg("Confirmation email resent ✅ Check your inbox (and spam folder).", "success");
  } catch (err) {
    showMsg(err.message || "Failed to resend. Try again.", "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Resend email";
  }
});

function setBusy(busy) {
  btnEl.disabled    = busy;
  btnEl.textContent = busy ? "Creating account…" : "Create account";
}
function showMsg(html, type = "info") {
  msgEl.innerHTML     = html;
  msgEl.className     = `wl-alert wl-alert--${type}`;
  msgEl.style.display = "block";
}
function clearMsg() {
  msgEl.innerHTML     = "";
  msgEl.style.display = "none";
}
