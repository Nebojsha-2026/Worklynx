// js/pages/setup-mfa.page.js
import { requireAuth } from "../core/guards.js";
import { mfaEnroll, mfaVerify, getMfaFactors } from "../core/auth.js";
import { path } from "../core/config.js";

const stepLoading = document.querySelector("#stepLoading");
const stepQr      = document.querySelector("#stepQr");
const stepSuccess = document.querySelector("#stepSuccess");
const msgEl       = document.querySelector("#mfaMsg");

function show(step) {
  stepLoading.style.display = step === "loading" ? "block" : "none";
  stepQr.style.display      = step === "qr"      ? "block" : "none";
  stepSuccess.style.display = step === "success"  ? "block" : "none";
}

let enrolledFactorId = null;

async function init() {
  show("loading");

  const user = await requireAuth();
  if (!user) return;

  // If user already has 2FA, redirect back — no point enrolling twice
  const factors = await getMfaFactors();
  if (factors.length > 0) {
    window.location.replace(path("/app/employee/profile.html"));
    return;
  }

  // Start enrolment — get QR code from Supabase
  try {
    const { id, qrCode, secret } = await mfaEnroll();
    enrolledFactorId = id;

    document.querySelector("#qrImage").src     = qrCode;
    document.querySelector("#secretCode").textContent = secret;

    show("qr");
  } catch (err) {
    console.error(err);
    showMsg("Failed to start 2FA setup. Please try again.", "error");
    show("qr"); // still show the form area so the message is visible
  }

  // Auto-submit when 6 digits are entered
  const codeEl = document.querySelector("#totpCode");
  codeEl.addEventListener("input", () => {
    codeEl.value = codeEl.value.replace(/\D/g, "").slice(0, 6);
    if (codeEl.value.length === 6) {
      document.querySelector("#verifyForm").requestSubmit();
    }
  });
}

document.querySelector("#verifyForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const code  = document.querySelector("#totpCode").value.trim();
  const btnEl = document.querySelector("#verifyBtn");

  if (code.length !== 6) return showMsg("Please enter the 6-digit code.", "error");
  if (!enrolledFactorId)  return showMsg("Setup error. Please refresh and try again.", "error");

  try {
    btnEl.disabled    = true;
    btnEl.textContent = "Verifying…";
    clearMsg();

    await mfaVerify(enrolledFactorId, code);

    // Figure out where "Done" should go — back to the profile page
    const backLink = document.querySelector("#backLink");
    backLink.href  = path("/app/employee/profile.html");

    show("success");
  } catch (err) {
    console.error(err);
    showMsg(
      err.message?.includes("invalid") || err.message?.includes("Invalid")
        ? "Incorrect code. Make sure your device clock is set to the correct time."
        : err.message || "Verification failed. Try again.",
      "error"
    );
    document.querySelector("#totpCode").value = "";
    document.querySelector("#totpCode").focus();
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = "Confirm and enable 2FA";
  }
});

document.querySelector("#cancelBtn")?.addEventListener("click", () => {
  window.location.replace(path("/app/employee/profile.html"));
});

function showMsg(html, type = "info") {
  msgEl.innerHTML     = html;
  msgEl.className     = `wl-alert wl-alert--${type}`;
  msgEl.style.display = "block";
}
function clearMsg() {
  msgEl.innerHTML     = "";
  msgEl.style.display = "none";
}

init();
