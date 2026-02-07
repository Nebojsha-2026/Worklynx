// js/pages/login.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { signInWithEmail } from "../core/auth.js";
import { getSession } from "../core/session.js";
import { path } from "../core/config.js";

function getResumeInvite() {
  const hash = window.location.hash;
  if (!hash.startsWith("#resumeInvite=")) return null;
  return decodeURIComponent(hash.replace("#resumeInvite=", ""));
}

async function main() {
  // If there is a resume token AND user already has a session, skip login UI and resume invite.
  const resumeToken = getResumeInvite();
  if (resumeToken) {
    const session = await getSession();
    if (session?.user) {
      window.location.replace(
        path(`/accept-invite.html#token=${encodeURIComponent(resumeToken)}`)
      );
      return;
    }
  }

  // Normal behavior: if already logged in, send to dashboard/pricing
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

      const resumeToken2 = getResumeInvite();
      if (resumeToken2) {
        window.location.replace(
          path(`/accept-invite.html#token=${encodeURIComponent(resumeToken2)}`)
        );
        return;
      }

      await redirectIfLoggedIn();
    } catch (err) {
      alert(err.message || "Login failed");
    }
  });
}

main();
