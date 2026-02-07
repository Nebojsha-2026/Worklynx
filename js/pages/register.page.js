// js/pages/register.page.js
import { redirectIfLoggedIn } from "../core/guards.js";
import { getSupabase } from "../core/supabaseClient.js";

function getResumeInvite() {
  const hash = window.location.hash;
  if (!hash.startsWith("#resumeInvite=")) return null;
  return decodeURIComponent(hash.replace("#resumeInvite=", ""));
}

await redirectIfLoggedIn();

const form = document.querySelector("#registerForm");
const fullNameEl = document.querySelector("#fullName");
const emailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = fullNameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passEl.value;

  try {
    const supabase = getSupabase();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw error;

   const resumeToken = getResumeInvite();
if (resumeToken) {
  window.location.replace(
    `login.html#resumeInvite=${encodeURIComponent(resumeToken)}`
  );
  return;
}

alert("Registered! You can now log in.");
window.location.href = "login.html";

  } catch (err) {
    console.error(err);
    alert(err.message || "Registration failed");
  }
});
