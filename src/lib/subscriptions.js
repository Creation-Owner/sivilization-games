import { supabase } from "../supabaseClient";

export async function fetchPublishedPlans() {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_published", true)
      .order("price_cents", { ascending: true });

    if (error) {
      console.error("Error fetching subscription plans:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching subscription plans:", err);
    return [];
  }
}

export async function fetchAllPlansForAdmin() {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching plans for admin:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching plans for admin:", err);
    return [];
  }
}

export async function fetchUserSubscription(userId) {
  if (!userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        plan:subscription_plans (
          id,
          name,
          description,
          price_cents,
          duration_days
        )
      `)
      .eq("user_id", userId)
      .in("status", ["active"])
      .order("started_at", { ascending: false })
      .maybeSingle();

    if (error) {
      console.error("Error fetching user subscription:", error);
      return null;
    }

    return data || null;
  } catch {
    return null;
  }
}

export async function createSubscription(userId, planId, endsAt) {
  if (!userId || !planId) {
    return { ok: false, error: new Error("Missing userId or planId") };
  }

  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        plan_id: planId,
        status: "active",
        started_at: new Date().toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating subscription:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Error creating subscription:", err);
    return { ok: false, error: err };
  }
}

export async function cancelSubscription(userId, subscriptionId) {
  if (!userId || !subscriptionId) {
    return { ok: false, error: new Error("Missing userId or subscriptionId") };
  }

  try {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error cancelling subscription:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error cancelling subscription:", err);
    return { ok: false, error: err };
  }
}

export async function createPlan(payload) {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error creating plan:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Error creating plan:", err);
    return { ok: false, error: err };
  }
}

export async function updatePlan(id, payload) {
  if (!id) {
    return { ok: false, error: new Error("Missing plan id") };
  }

  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating plan:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Error updating plan:", err);
    return { ok: false, error: err };
  }
}

export async function deletePlan(id) {
  if (!id) {
    return { ok: false, error: new Error("Missing plan id") };
  }

  try {
    const { error } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting plan:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Error deleting plan:", err);
    return { ok: false, error: err };
  }
}