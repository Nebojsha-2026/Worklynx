// js/pages/reset-password.page.js
// Supabase appends ?token_hash=...&type=recovery to this URL.
// We verify the token first, then let the user set a new password.
import { getSupabase } from "../core/supabaseClient.js";
import { updatePassword } from "../core/auth.js";

const stateLoading = document.querySelector("#stateLoading");
const stateForm    = document.querySelector("#stateForm");
const stateSuccess = document.querySelector("#stateSuccess");
const stateError   = document.querySelector("#stateError");

function show(state) {
  stateLoading.style.display = state === "loading" ? "block" : "none";
  stateForm.style.display    = state === "form"    ? "block" : "none";
  stateSuccess.style.display = state === "success" ? "block" : "none";
  stateError.style.display   = state === "error"   ? "block" : "none";
}

async function init() {
  const params    = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type      = params.get("type"); // "recovery"

  if (!tokenHash || type !== "recovery") {
    show("error");
    return;
  }

  try {
    const supabase = getSupabase();
    // Verify the recovery token — this establishes a short-lived session
    // so updatePassword() can work.
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (error) throw error;
    show("form");
  } catch (err) {
    console.error(err);
    show("error");
  }
}

document.querySelector("#resetForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password        = document.querySelector("#password").value;
  const confirmPassword = document.querySelector("#confirmPassword").value;
  const msgEl           = document.querySelector("#resetMsg");
  const btnEl           = document.querySelector("#resetBtn");

  if (password !== confirmPassword) {
    msgEl.textContent   = "Passwords don't match.";
    msgEl.className     = "wl-alert wl-alert--error";
    msgEl.style.display = "block";
    return;
  }
  if (password.length < 8) {
    msgEl.textContent   = "Password must be at least 8 characters.";
    msgEl.className     = "wl-alert wl-alert--error";
    msgEl.style.display = "block";
    return;
  }

  try {
    btnEl.disabled    = true;
    btnEl.textContent = "Updating…";
    msgEl.style.display = "none";

    await updatePassword(password);

    // Sign out so the user goes through normal login (including 2FA if enabled)
    const supabase = getSupabase();
    await supabase.auth.signOut();

    show("success");
  } catch (err) {
    console.error(err);
    msgEl.textContent   = err.message || "Failed to update password. Please try again.";
    msgEl.className     = "wl-alert wl-alert--error";
    msgEl.style.display = "block";
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = "Update password";
  }
});

init();
