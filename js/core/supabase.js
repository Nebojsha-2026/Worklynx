import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://kufuvxifxdnusnbbgdvw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1ZnV2eGlmeGRudXNuYmJnZHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTgwNzQsImV4cCI6MjA4NTY5NDA3NH0.Jo6uzx64ZgkgUBY7HfvAsge_7JDpZkD9MGUbcGoiUoU"
);
