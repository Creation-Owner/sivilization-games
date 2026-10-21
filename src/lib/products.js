import { supabase } from "../supabaseClient";

export async function fetchPublishedProducts() {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching products:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching products:", err);
    return [];
  }
}

export async function fetchAllProductsForAdmin() {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching products for admin:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching products for admin:", err);
    return [];
  }
}

export async function fetchProductById(id) {
  if (!id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching product:", error);
      return null;
    }

    return data || null;
  } catch {
    return null;
  }
}

export async function createProduct(payload) {
  try {
    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error creating product:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Error creating product:", err);
    return { ok: false, error: err };
  }
}

export async function updateProduct(id, payload) {
  if (!id) {
    return { ok: false, error: new Error("Missing product id") };
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating product:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Error updating product:", err);
    return { ok: false, error: err };
  }
}

export async function deleteProduct(id) {
  if (!id) {
    return { ok: false, error: new Error("Missing product id") };
  }

  try {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting product:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error deleting product:", err);
    return { ok: false, error: err };
  }
}