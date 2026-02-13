// js/data/organizations.api.js
import { getSupabase } from "../core/supabaseClient.js";

export async function updateOrganization(orgId, patch) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", orgId)
    .select("id, name, company_logo_url, currency_code, theme")
    .single();

  if (error) throw error;
  return data;
}
