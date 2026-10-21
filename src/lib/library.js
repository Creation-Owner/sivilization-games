import { supabase } from "../supabaseClient";

export async function fetchUserLibraryItems(userId) {
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("library_items")
      .select(`
        *,
        film:films (
          id,
          title,
          description,
          genre,
          release_year,
          duration,
          poster_url,
          poster_path,
          access_type,
          price_cents
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching library items:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      item_type: row.item_type,
      started_at: row.started_at,
      expires_at: row.expires_at,
      film: row.film,
    }));
  } catch (err) {
    console.error("Error fetching library items:", err);
    return [];
  }
}

export async function addFilmToLibrary(userId, filmId, itemType = "saved") {
  if (!userId || !filmId) {
    return { ok: false, error: new Error("Missing userId or filmId") };
  }

  try {
    const { error } = await supabase
      .from("library_items")
      .upsert(
        {
          user_id: userId,
          film_id: filmId,
          item_type: itemType,
        },
        {
          onConflict: "user_id,film_id,item_type",
        }
      );

    if (error) {
      console.error("Error adding to library:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error adding to library:", err);
    return { ok: false, error: err };
  }
}

export async function removeFilmFromLibrary(userId, filmId, itemType = "saved") {
  if (!userId || !filmId) {
    return { ok: false, error: new Error("Missing userId or filmId") };
  }

  try {
    const { error } = await supabase
      .from("library_items")
      .delete()
      .eq("user_id", userId)
      .eq("film_id", filmId)
      .eq("item_type", itemType);

    if (error) {
      console.error("Error removing from library:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error removing from library:", err);
    return { ok: false, error: err };
  }
}