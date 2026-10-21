import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return respond({ error: "Sign in first." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return respond({ error: "Download service is not configured." }, 500);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return respond({ error: "Session invalid. Sign in again." }, 401);
    }

    const body = await request.json();
    const gameId = typeof body.game_id === "string" ? body.game_id : "";
    if (!gameId) return respond({ error: "game_id is required." }, 400);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, is_published, access_type, delivery_type, game_path, external_url")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      console.error("Game lookup failed", gameError);
      return respond({ error: "Could not check game availability." }, 503);
    }
    if (!game || !game.is_published) {
      return respond({ error: "Game is unavailable." }, 404);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("is_owner, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    let allowed = profile?.is_owner === true || profile?.is_admin === true;

    if (!allowed && game.access_type === "free") {
      allowed = true;
    }

    if (!allowed && game.access_type === "paid") {
      const { data: purchase, error: purchaseError } = await admin
        .from("product_purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", game.id)
        .limit(1)
        .maybeSingle();

      if (purchaseError) {
        console.error("Purchase lookup failed", purchaseError);
        return respond({ error: "Could not check game purchase." }, 503);
      }
      allowed = Boolean(purchase);
    }

    if (!allowed) {
      return respond({ error: "Buy this game before downloading it." }, 403);
    }

    if (game.delivery_type === "url") {
      if (!game.external_url) {
        return respond({ error: "Game URL is missing." }, 404);
      }
      return respond({ url: game.external_url, expires_in: null });
    }

    if (!game.game_path) {
      return respond({ error: "Game package is not available." }, 404);
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("games")
      .createSignedUrl(game.game_path, 300, { download: true });

    if (signedError || !signed?.signedUrl) {
      console.error("Signed game URL failed", signedError);
      return respond({ error: "Could not prepare game download." }, 503);
    }

    return respond({ url: signed.signedUrl, expires_in: 300 });
  } catch (error) {
    console.error("get-game-download failed", error);
    return respond(
      { error: error instanceof Error ? error.message : "Download failed." },
      500,
    );
  }
});
