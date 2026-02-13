// js/core/config.js
export const CONFIG = {
  SUPABASE_URL: "https://ljnpugeuyosecggnbapa.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbnB1Z2V1eW9zZWNnZ25iYXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjgzNTYsImV4cCI6MjA4NTc0NDM1Nn0.Cv4XnbR3O21H4lfqRWyx6ph2qjyqlU7DHGFWLrrNTLo",

  APP_NAME: "WorkLynx",

  DEFAULT_CURRENCY: "AUD",
  DEFAULT_LANG: "en",

  // GitHub Pages repo base
  BASE_PATH: "/Worklynx",
};

export function path(p = "") {
  const base = CONFIG.BASE_PATH || "";

  // Allow full URLs untouched
  if (/^https?:\/\//i.test(p)) return p;

  // Normalize input path to start with "/"
  let pathname = String(p || "");
  if (pathname && !pathname.startsWith("/")) pathname = `/${pathname}`;

  // If already prefixed with base, return as-is
  if (base && pathname.startsWith(base + "/")) return pathname;
  if (base && pathname === base) return pathname;

  // Join safely (avoid double slashes)
  return `${base}${pathname}`;
}
