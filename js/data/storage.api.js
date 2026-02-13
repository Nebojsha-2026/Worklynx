// js/data/storage.api.js
import { getSupabase } from "../core/supabaseClient.js";

/**
 * Upload an organization logo to Supabase Storage and return a PUBLIC URL.
 * Bucket: org-logos
 * Path:   <orgId>/logo-<timestamp>.<ext>
 */
export async function uploadOrgLogo(orgId, file) {
  if (!orgId) throw new Error("Missing orgId.");
  if (!file) throw new Error("No file selected.");

  const supabase = getSupabase();

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const safeExt = ext.match(/^(png|jpg|jpeg|webp|svg)$/) ? ext : "png";

  const filePath = `${orgId}/logo-${Date.now()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from("org-logos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("org-logos").getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("Failed to create public URL.");

  return data.publicUrl;
}
