import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "YOUR_SUPABASE_URL",
  "YOUR_SUPABASE_ANON_KEY"
);

export async function debugFilms() {
  const { data: user } = await supabase.auth.getUser();
  console.log("Current user:", user);

  const { data: films, error } = await supabase
    .from("films")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  console.log("Films query result:", films);
  console.log("Error:", error);
}