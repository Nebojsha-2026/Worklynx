// js/data/orgs.api.js
import { getSupabase } from "../core/supabaseClient.js";

export async function createOrganization({ name }) {
  const supabase = getSupabase();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const user = userRes?.user;
  if (!user) throw new Error("Not logged in.");

  // 1) Create org
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({
      name,
      owner_user_id: user.id,
      currency_code: "AUD",
      theme: {},
    })
    .select("id, name")
    .single();

  if (orgErr) throw orgErr;

  // 2) Add you as BO member
  const { error: memErr } = await supabase.from("org_members").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "BO",
    is_active: true,
  });

  if (memErr) throw memErr;

  return org;
}

