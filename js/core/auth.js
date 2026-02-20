// js/core/auth.js
import { getSupabase } from "./supabaseClient.js";
import { path } from "./config.js";

export async function signUpWithEmail(email, password, fullName) {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || "" },
      // After clicking the confirmation link in their inbox, Supabase
      // redirects here. This page reads the token from the URL and shows
      // a "verified!" message before sending to login.
      emailRedirectTo: `${window.location.origin}${path("/confirm-email.html")}`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${path("/reset-password.html")}`,
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export async function resendConfirmationEmail(email) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${path("/confirm-email.html")}`,
    },
  });
  if (error) throw error;
}

// ── 2FA / MFA helpers ────────────────────────────────────────────────────────

/**
 * Enrol a new TOTP factor. Returns { id, qrCode, secret } to show the QR code.
 */
export async function mfaEnroll() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "WorkLynx" });
  if (error) throw error;
  // data.totp.qr_code  → SVG data URI you can put in an <img src="">
  // data.totp.secret   → Manual entry secret
  // data.id            → factor_id needed for verify + unenroll
  return { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Verify a TOTP code. Call this after mfaEnroll (to confirm setup) OR after
 * login when nextLevel === "aal2". Pass the factor_id from mfaEnroll.
 */
export async function mfaVerify(factorId, code) {
  const supabase = getSupabase();
  // Create a challenge first, then verify it
  const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeErr) throw challengeErr;

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });
  if (error) throw error;
  return data;
}

/**
 * Remove a TOTP factor. Requires an aal2 session (user must have just verified).
 */
export async function mfaUnenroll(factorId) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * Returns the user's enrolled MFA factors (empty array if none).
 */
export async function getMfaFactors() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data?.totp ?? [];
}

/**
 * Check whether the current session needs MFA verification to reach aal2.
 * Returns true if the user has 2FA enrolled but hasn't verified this session.
 */
export async function needsMfaVerification() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data?.currentLevel !== "aal2";
}
