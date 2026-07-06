import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.includes(".supabase.co") &&
  !supabaseUrl.includes("/rest/v1")
);

export const supabase = createClient(
  supabaseUrl ?? "https://invalid.supabase.co",
  supabaseKey ?? "missing-key"
);
