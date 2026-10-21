import { supabase } from "../supabaseClient";

export async function fetchPublishedFilms() {
  try {
    const { data, error } = await supabase
      .from("films")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching films:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching films:", err);
    return [];
  }
}

export async function fetchFilmById(id) {
  if (!id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("films")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching film:", error);
      return null;
    }

    return data || null;
  } catch {
    return null;
  }
}