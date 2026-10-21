import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your local environment and in Vercel."
  );
}

try {
  const parsedUrl = new URL(supabaseUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("The Supabase URL must use HTTP or HTTPS.");
  }
} catch {
  throw new Error(
    "Invalid VITE_SUPABASE_URL. Use your project's full Supabase URL, ending in .supabase.co."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});