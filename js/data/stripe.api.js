// js/data/stripe.api.js - FIXED VERSION
import { getSupabase } from "../core/supabaseClient.js";
import { getSession } from "../core/session.js";

const STRIPE_CONFIG = {
  publishableKey: "pk_test_51T0emrJzqXVwu1nzS0q2wPJK41arrfy6fwmj9lsqa5OnQNpwYMXOATJCNjhzWRICHQsAeUrnb5CxpMkvLq9C9cTE000OJFltVw",
  prices: {
    tier_1: "price_1T1dKUJzqXVwu1nzXKbwW7wF",
    tier_2: "price_1T1dLRJzqXVwu1nzAjRYN8L2",
    tier_3: "price_1T1dM4JzqXVwu1nzrABlAZ2R",
  }
};

async function loadStripe() {
  if (window.Stripe) return window.Stripe(STRIPE_CONFIG.publishableKey);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve(window.Stripe(STRIPE_CONFIG.publishableKey));
    script.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.head.appendChild(script);
  });
}

export async function createCheckoutSession({ tier, orgId, orgName }) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const priceId = STRIPE_CONFIG.prices[tier];
  if (!priceId) throw new Error(`Invalid tier: ${tier}`);

  const stripe = await loadStripe();
  const origin = window.location.origin;
  
  const successUrl = `${origin}/app/bo/dashboard.html?session_id={CHECKOUT_SESSION_ID}&org_id=${orgId}`;
  const cancelUrl = `${origin}/pricing.html?canceled=true`;

  const { error } = await stripe.redirectToCheckout({
    lineItems: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    successUrl,
    cancelUrl,
    clientReferenceId: orgId,
    customerEmail: session.user.email,
  });

  if (error) throw error;
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
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("subscription_tier, max_business_managers, max_managers, max_employees")
    .eq("id", orgId)
    .single();
  if (orgErr) throw orgErr;

  const { data: members, error: membersErr } = await supabase
    .from("org_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (membersErr) throw membersErr;

  const counts = { BM: 0, MANAGER: 0, EMPLOYEE: 0 };
  members.forEach((m) => { if (counts[m.role] !== undefined) counts[m.role]++; });

  const usage = {
    businessManagers: { current: counts.BM, max: org.max_business_managers, available: org.max_business_managers - counts.BM },
    managers: { current: counts.MANAGER, max: org.max_managers, available: org.max_managers - counts.MANAGER },
    employees: { current: counts.EMPLOYEE, max: org.max_employees, available: org.max_employees - counts.EMPLOYEE },
  };

  return {
    canInviteBM: counts.BM < org.max_business_managers,
    canInviteManager: counts.MANAGER < org.max_managers,
    canInviteEmployee: counts.EMPLOYEE < org.max_employees,
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
