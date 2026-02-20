// js/pages/verify-mfa.page.js
// Shown after password login when the user has 2FA enrolled.
// Verifies the TOTP code and then redirects to the correct dashboard.
import { getSupabase } from "../core/supabaseClient.js";
import { mfaVerify } from "../core/auth.js";
import { redirectIfLoggedIn } from "../core/guards.js";
import { path } from "../core/config.js";

const form    = document.querySelector("#mfaForm");
const codeEl  = document.querySelector("#totpCode");
const btnEl   = document.querySelector("#mfaBtn");
const msgEl   = document.querySelector("#mfaMsg");

// Auto-submit when 6 digits are entered
codeEl.addEventListener("input", () => {
  codeEl.value = codeEl.value.replace(/\D/g, "").slice(0, 6);
  if (codeEl.value.length === 6) form.requestSubmit();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const code = codeEl.value.trim();
  if (code.length !== 6) return showMsg("Please enter the 6-digit code.", "error");

  try {
    setBusy(true);
    clearMsg();

    // Get the enrolled factor id
    const supabase = getSupabase();
    const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
    if (factorsErr) throw factorsErr;

    const factor = factorsData?.totp?.[0];
    if (!factor) {
      // No factor found — user shouldn't be on this page; send to dashboard
      await redirectIfLoggedIn();
      return;
    }

    await mfaVerify(factor.id, code);

    // Check if we need to resume an invite flow
    const pendingInvite = sessionStorage.getItem("wl_mfa_resume_invite");
    if (pendingInvite) {
      sessionStorage.removeItem("wl_mfa_resume_invite");
      window.location.replace(
        path(`/accept-invite.html#token=${encodeURIComponent(pendingInvite)}`)
      );
      return;
    }

    // Normal post-login redirect
    await redirectIfLoggedIn();

  } catch (err) {
    console.error(err);
    const msg = err.message ?? "";
    if (msg.includes("Invalid TOTP code") || msg.includes("invalid")) {
      showMsg("Incorrect code. Try again — make sure your device clock is accurate.", "error");
    } else {
      showMsg(msg || "Verification failed. Please try again.", "error");
    }
    codeEl.value = "";
    codeEl.focus();
  } finally {
    setBusy(false);
  }
});

function setBusy(busy) {
  btnEl.disabled    = busy;
  btnEl.textContent = busy ? "Verifying…" : "Verify";
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
