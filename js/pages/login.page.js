// js/pages/login.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { signInWithEmail, resendConfirmationEmail, needsMfaVerification } from "../core/auth.js";
import { getSession } from "../core/session.js";
import { path } from "../core/config.js";

function getResumeInvite() {
  const hash = window.location.hash;
  if (!hash.startsWith("#resumeInvite=")) return null;
  return decodeURIComponent(hash.replace("#resumeInvite=", ""));
}

async function main() {
  // If there is a resume token AND user already has a verified session,
  // skip login and go straight to the invite acceptance page.
  const resumeToken = getResumeInvite();
  if (resumeToken) {
    const session = await getSession();
    if (session?.user?.email_confirmed_at) {
      window.location.replace(
        path(`/accept-invite.html#token=${encodeURIComponent(resumeToken)}`)
      );
      return;
    }
  }

  await redirectIfLoggedIn();

  const form    = document.querySelector("#loginForm");
  const emailEl = document.querySelector("#email");
  const passEl  = document.querySelector("#password");
  const msgEl   = document.querySelector("#loginMsg");
  const btnEl   = document.querySelector("#loginBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email    = emailEl.value.trim();
    const password = passEl.value;

    try {
      setBusy(true);
      clearMsg();

      const { user } = await signInWithEmail(email, password);

      // ── Email verification gate ─────────────────────────────────────
      // Block the user immediately if they haven't clicked their
      // confirmation link yet. Sign them back out first so they can't
      // reach protected pages by navigating directly.
      if (!user?.email_confirmed_at) {
        const { getSupabase } = await import("../core/supabaseClient.js");
        await getSupabase().auth.signOut();

        showMsg(
          `Your email hasn't been verified yet.<br/>
           Check your inbox for a confirmation link from WorkLynx.<br/>
           <button id="resendVerify" class="wl-btn" style="margin-top:10px;" type="button">
             Resend confirmation email
           </button>`,
          "error"
        );

        document.querySelector("#resendVerify")?.addEventListener("click", async () => {
          const btn = document.querySelector("#resendVerify");
          try {
            btn.disabled    = true;
            btn.textContent = "Sending…";
            await resendConfirmationEmail(email);
            showMsg("Confirmation email resent ✅ Check your inbox.", "success");
          } catch (err) {
            showMsg(err.message || "Failed to resend. Try again.", "error");
          }
        });

        return;
      }

      // ── MFA gate ────────────────────────────────────────────────────
      // If the user has 2FA enrolled, redirect to the TOTP challenge page
      // before allowing access to any protected content.
      if (await needsMfaVerification()) {
        // If they were heading to an invite, preserve that intent
        const tok = getResumeInvite();
        if (tok) sessionStorage.setItem("wl_mfa_resume_invite", tok);
        window.location.replace(path("/verify-mfa.html"));
        return;
      }

      // ── All good ────────────────────────────────────────────────────
      const tok = getResumeInvite();
      if (tok) {
        window.location.replace(
          path(`/accept-invite.html#token=${encodeURIComponent(tok)}`)
        );
        return;
      }

      await redirectIfLoggedIn();

    } catch (err) {
      console.error(err);
      const msg = err.message ?? "";
      if (msg.includes("Invalid login credentials")) {
        showMsg("Incorrect email or password.", "error");
      } else if (msg.includes("Email not confirmed")) {
        showMsg("Please verify your email before logging in.", "error");
      } else {
        showMsg(msg || "Login failed. Please try again.", "error");
      }
    } finally {
      setBusy(false);
    }
  });

  function setBusy(busy) {
    btnEl.disabled    = busy;
    btnEl.textContent = busy ? "Signing in…" : "Sign in";
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
}

main();
