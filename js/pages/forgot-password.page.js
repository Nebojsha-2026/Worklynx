// js/pages/forgot-password.page.js
import { sendPasswordReset } from "../core/auth.js";

const form  = document.querySelector("#forgotForm");
const btnEl = document.querySelector("#forgotBtn");
const msgEl = document.querySelector("#forgotMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.querySelector("#email").value.trim();

  try {
    btnEl.disabled    = true;
    btnEl.textContent = "Sending…";
    msgEl.style.display = "none";

    await sendPasswordReset(email);

    // Always show the same "check inbox" state regardless of whether
    // the email exists — avoids account enumeration.
    form.style.display = "none";
    document.querySelector("#sentState").style.display = "block";

  } catch (err) {
    console.error(err);
    msgEl.innerHTML     = err.message || "Something went wrong. Please try again.";
    msgEl.className     = "wl-alert wl-alert--error";
    msgEl.style.display = "block";
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = "Send reset link";
  }
});
