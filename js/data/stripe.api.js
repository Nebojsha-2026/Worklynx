// js/data/stripe.api.js - USING PAYMENT LINKS (MODERN APPROACH)
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

// ✅ YOUR STRIPE PAYMENT LINKS
// REPLACE these with your actual links from Stripe Dashboard
const STRIPE_CONFIG = {
  paymentLinks: {
    tier_1: "https://buy.stripe.com/test_dRmeVe4u3gHL65Pg796Zy00", // $20/month
    tier_2: "https://buy.stripe.com/test_4gMcN6d0zdvz79T9IL6Zy01", // $40/month
    tier_3: "https://buy.stripe.com/test_9B63cw6Cb4Z3dyhbQT6Zy02", // $80/month
  }
};

export async function createCheckoutSession({ tier, orgId, orgName }) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const paymentLink = STRIPE_CONFIG.paymentLinks[tier];
  
  if (!paymentLink || paymentLink.includes("REPLACE")) {
    throw new Error(`Payment link not configured for ${tier}. Please create Payment Links in Stripe Dashboard.`);
  }

  // Store org info for after payment
  try {
    localStorage.setItem("pending_payment", JSON.stringify({ orgId, orgName, tier, timestamp: Date.now() }));
  } catch (e) {
    console.warn("Could not store payment info:", e);
  }

  const origin = window.location.origin;
  const successUrl = `${origin}/app/bo/dashboard.html?payment=success&org_id=${orgId}`;
  const cancelUrl = `${origin}/pricing.html?canceled=true`;

  const fullLink = `${paymentLink}?success_url=${encodeURIComponent(successUrl)}&cancel_url=${encodeURIComponent(cancelUrl)}&client_reference_id=${orgId}&prefilled_email=${encodeURIComponent(session.user.email)}`;

  console.log("🚀 Redirecting to Stripe Payment Link...");
  window.location.href = fullLink;
}

export async function getOrgSubscription({ orgId }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return data;
}

export function getTierDetails(tier) {
  const tiers = {
    tier_1: {
      name: "Starter", price: 20, maxBM: 1, maxManagers: 2, maxEmployees: 20,
      features: ["Up to 20 employees", "1 Business Manager", "2 Managers", "Basic timesheet management", "Shift scheduling", "Email support"],
    },
    tier_2: {
      name: "Professional", price: 40, maxBM: 1, maxManagers: 4, maxEmployees: 40,
      features: ["Up to 40 employees", "1 Business Manager", "4 Managers", "Everything in Starter", "Advanced reporting", "Mobile app", "Priority support"],
    },
    tier_3: {
      name: "Business", price: 80, maxBM: 1, maxManagers: 8, maxEmployees: 80,
      features: ["Up to 80 employees", "1 Business Manager", "8 Managers", "Everything in Professional", "Custom branding", "API access", "Dedicated support"],
    },
    tier_4_custom: {
      name: "Enterprise", price: null, maxBM: 1, maxManagers: 999, maxEmployees: 9999,
      features: ["Unlimited employees", "Custom limits", "White-label", "SLA", "Phone support", "Custom integrations"],
    },
  };
  return tiers[tier] || null;
}

export async function checkTierLimits({ orgId }) {
  const supabase = getSupabase();

  // Get org's subscription tier (used as fallback if no subscriptions row yet)
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("subscription_tier")
    .eq("id", orgId)
    .single();
  if (orgErr) throw orgErr;

  // Try to get limits from subscriptions → plans join
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plans ( max_bo, max_bm, max_managers, max_employees )")
    .eq("organization_id", orgId)
    .maybeSingle();

  // Fall back: look up the plan directly by tier name
  let planLimits = sub?.plans ?? null;
  if (!planLimits) {
    const tierId = org.subscription_tier || "tier_1";
    const { data: plan } = await supabase
      .from("plans")
      .select("max_bo, max_bm, max_managers, max_employees")
      .eq("id", tierId)
      .maybeSingle();
    planLimits = plan;
  }

  // Hard-coded tier_1 defaults if plans table is empty
  const limits = {
    max_bo: planLimits?.max_bo ?? 1,
    max_bm: planLimits?.max_bm ?? 1,
    max_managers: planLimits?.max_managers ?? 2,
    max_employees: planLimits?.max_employees ?? 20,
  };

  const { data: members, error: membersErr } = await supabase
    .from("org_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (membersErr) throw membersErr;

  const counts = { BO: 0, BM: 0, MANAGER: 0, EMPLOYEE: 0 };
  members.forEach((m) => { if (counts[m.role] !== undefined) counts[m.role]++; });

  const usage = {
    businessManagers: { current: counts.BM, max: limits.max_bm, available: limits.max_bm - counts.BM },
    managers: { current: counts.MANAGER, max: limits.max_managers, available: limits.max_managers - counts.MANAGER },
    employees: { current: counts.EMPLOYEE, max: limits.max_employees, available: limits.max_employees - counts.EMPLOYEE },
  };

  return {
    canInviteBM: counts.BM < limits.max_bm,
    canInviteManager: counts.MANAGER < limits.max_managers,
    canInviteEmployee: counts.EMPLOYEE < limits.max_employees,
    usage,
    tier: org.subscription_tier,
  };
}

export async function validateInviteAgainstLimits({ orgId, roleToInvite }) {
  const limits = await checkTierLimits({ orgId });
  const role = roleToInvite.toUpperCase();
  
  if (role === "BM" && !limits.canInviteBM) {
    return { allowed: false, reason: `Business Manager limit reached (${limits.usage.businessManagers.max}). Upgrade to invite more.` };
  }
  if (role === "MANAGER" && !limits.canInviteManager) {
    return { allowed: false, reason: `Manager limit reached (${limits.usage.managers.max}). Upgrade to invite more.` };
  }
  if (role === "EMPLOYEE" && !limits.canInviteEmployee) {
    return { allowed: false, reason: `Employee limit reached (${limits.usage.employees.max}). Upgrade to invite more.` };
  }
  return { allowed: true };
}
