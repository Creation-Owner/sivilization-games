import { supabase } from "../supabaseClient";

export async function fetchUserCartItems(userId) {
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("cart_items")
      .select(`
        *,
        product:products (
          id,
          title,
          description,
          category,
          price_cents,
          image_url,
          image_path
        )
      `)
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching cart items:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      quantity: row.quantity,
      product: row.product,
    }));
  } catch (err) {
    console.error("Error fetching cart items:", err);
    return [];
  }
}

export async function upsertCartItem(userId, productId, quantity) {
  if (!userId || !productId) {
    return { ok: false, error: new Error("Missing userId or productId") };
  }

  try {
    const { error } = await supabase
      .from("cart_items")
      .upsert(
        {
          user_id: userId,
          product_id: productId,
          quantity: Number(quantity) || 1,
        },
        {
          onConflict: "user_id,product_id",
        }
      );

    if (error) {
      console.error("Error upserting cart item:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error upserting cart item:", err);
    return { ok: false, error: err };
  }
}

export async function removeCartItem(userId, productId) {
  if (!userId || !productId) {
    return { ok: false, error: new Error("Missing userId or productId") };
  }

  try {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productId);

    if (error) {
      console.error("Error removing cart item:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error removing cart item:", err);
    return { ok: false, error: err };
  }
}