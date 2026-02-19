// js/data/members.api.js
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

export async function getMyMemberships() {
  const supabase = getSupabase();
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("org_members")
    .select("organization_id, role, is_active")
    .eq("user_id", uid)
    .eq("is_active", true);

  if (error) throw error;
  return data || [];
}

export async function listOrgMembers({ organizationId, roles = null }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("list_org_members", {
    p_org_id: organizationId,
    p_roles: roles,
  });
  if (error) throw error;
  return data || [];
}

export async function deactivateOrgMember({ organizationId, userId }) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("deactivate_org_member", {
    p_org_id: organizationId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export function normalizePaymentFrequency(value) {
  const raw = String(value || "FORTNIGHTLY").trim().toUpperCase();
  if (["WEEKLY", "FORTNIGHTLY", "MONTHLY"].includes(raw)) return raw;
  return "FORTNIGHTLY";
}

export async function getOrgMember({ organizationId, userId }) {
  const supabase = getSupabase();
  if (!organizationId) throw new Error("Missing organizationId.");
  if (!userId) throw new Error("Missing userId.");

  const { data, error } = await supabase
    .from("org_members")
    .select("organization_id, user_id, role, payment_frequency")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateOrgMemberPaymentFrequency({
  organizationId,
  userId,
  paymentFrequency,
}) {
  const supabase = getSupabase();
  const normalized = normalizePaymentFrequency(paymentFrequency);

  // First verify the row exists and is readable (so we can distinguish
  // "RLS blocked update" from "row not found")
  const { data: existing, error: readErr } = await supabase
    .from("org_members")
    .select("user_id, payment_frequency")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (readErr) throw readErr;

  if (!existing) {
    throw new Error("Employee membership not found.");
  }

  // Perform the update — don't use count:"exact" as it can return 0 under
  // some RLS configurations even when the update succeeded
  const { error: updateErr } = await supabase
    .from("org_members")
    .update({ payment_frequency: normalized })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (updateErr) throw updateErr;

  // Verify the update actually took effect by re-reading
  const { data: updated, error: verifyErr } = await supabase
    .from("org_members")
    .select("user_id, payment_frequency")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (verifyErr) throw verifyErr;

  if (!updated || updated.payment_frequency !== normalized) {
    throw new Error(
      "Update was blocked by database permissions. Please ask your Business Owner to grant managers permission to update employee pay frequency in Supabase RLS policies."
    );
  }

  return {
    organization_id: organizationId,
    user_id: userId,
    payment_frequency: normalized,
  };
}
