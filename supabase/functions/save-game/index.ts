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

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return respond({ error: "Supabase function secrets are not configured." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_admin, is_owner")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed", profileError);
      return respond({ error: "Could not verify administrator access." }, 500);
    }
    if (!profile?.is_admin && !profile?.is_owner) {
      return respond({ error: "Owner or admin access required." }, 403);
    }

    const body = await request.json();

    const id = textOrNull(body.id);
    const title = textOrNull(body.title);
    const description = textOrNull(body.description);
    const genre = textOrNull(body.genre);
    const platform = textOrNull(body.platform) ?? "Windows";
    const version = textOrNull(body.version) ?? "1.0.0";
    const accessType = body.access_type;
    const deliveryType = body.delivery_type;
    const externalUrl = textOrNull(body.external_url);
    const gamePath = textOrNull(body.game_path);
    const coverPath = textOrNull(body.cover_path);
    const isPublished = body.is_published === true;
    const priceCents = Number(body.price_cents ?? 0);

    if (!title) return respond({ error: "Game title is required." }, 400);
    if (!["free", "paid"].includes(accessType)) {
      return respond({ error: "Invalid game access type." }, 400);
    }
    if (!["upload", "url"].includes(deliveryType)) {
      return respond({ error: "Invalid game delivery type." }, 400);
    }
    if (
      accessType === "paid" &&
      (!Number.isSafeInteger(priceCents) || priceCents <= 0)
    ) {
      return respond({ error: "Paid games need a price above zero cents." }, 400);
    }
    if (deliveryType === "upload" && !gamePath) {
      return respond({ error: "Upload a game package first." }, 400);
    }
    if (deliveryType === "url" && !externalUrl) {
      return respond({ error: "Enter the external game URL." }, 400);
    }

    let existing: {
      id: string;
      paddle_price_id: string | null;
      price_cents: number;
      access_type: string;
    } | null = null;

    if (id) {
      const { data, error } = await admin
        .from("games")
        .select("id, paddle_price_id, price_cents, access_type")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("Game lookup failed", error);
        return respond({ error: "Could not load game for editing." }, 500);
      }
      if (!data) return respond({ error: "Game not found." }, 404);
      existing = data;
    }

    let paddlePriceId =
      accessType === "paid" ? existing?.paddle_price_id ?? null : null;

    const needsPrice =
      accessType === "paid" &&
      (!existing ||
        !paddlePriceId ||
        existing.access_type !== "paid" ||
        existing.price_cents !== priceCents);

    if (needsPrice) {
      const paddleApiKey = Deno.env.get("PADDLE_API_KEY");
      if (!paddleApiKey) {
        return respond({ error: "PADDLE_API_KEY is missing from Edge Function secrets." }, 500);
      }

      const environment = Deno.env.get("PADDLE_ENVIRONMENT") ?? "sandbox";
      const paddleBase =
        environment === "production"
          ? "https://api.paddle.com"
          : "https://sandbox-api.paddle.com";

      const headers = {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      };

      const productResponse = await fetch(`${paddleBase}/products`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: title,
          description: description ?? `Game: ${title}`,
          tax_category: "standard",
        }),
      });

      const productResult = await productResponse.json();
      if (!productResponse.ok) {
        console.error("Paddle product creation failed", productResult);
        return respond(
          {
            error:
              productResult?.error?.detail ??
              productResult?.error?.message ??
              "Paddle could not create the game product.",
          },
          502,
        );
      }

      const paddleProductId = productResult?.data?.id;
      if (!paddleProductId) {
        return respond({ error: "Paddle did not return a product ID." }, 502);
      }

      // Omitting billing_cycle creates a one-time price.
      const priceResponse = await fetch(`${paddleBase}/prices`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_id: paddleProductId,
          description: `One-time purchase: ${title}`,
          tax_mode: "account_setting",
          unit_price: {
            amount: String(priceCents),
            currency_code: "USD",
          },
        }),
      });

      const priceResult = await priceResponse.json();
      if (!priceResponse.ok) {
        console.error("Paddle price creation failed", priceResult);
        return respond(
          {
            error:
              priceResult?.error?.detail ??
              priceResult?.error?.message ??
              "Paddle could not create the one-time game price.",
          },
          502,
        );
      }

      paddlePriceId = priceResult?.data?.id ?? null;
      if (!paddlePriceId) {
        return respond({ error: "Paddle did not return a price ID." }, 502);
      }
    }

    const gamePayload = {
      title,
      description,
      genre,
      platform,
      version,
      access_type: accessType,
      is_paid: accessType === "paid",
      price_cents: accessType === "paid" ? priceCents : 0,
      paddle_price_id: accessType === "paid" ? paddlePriceId : null,
      delivery_type: deliveryType,
      game_path: deliveryType === "upload" ? gamePath : null,
      cover_path: coverPath,
      external_url: deliveryType === "url" ? externalUrl : null,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };

    const result = id
      ? await admin
          .from("games")
          .update(gamePayload)
          .eq("id", id)
          .select()
          .single()
      : await admin
          .from("games")
          .insert({ ...gamePayload, created_by: user.id })
          .select()
          .single();

    if (result.error) {
      console.error("Game database save failed", result.error);
      return respond(
        {
          error:
            "Paddle may have created a catalog product, but the game save failed. Check the game row before retrying to avoid duplicate Paddle products.",
        },
        500,
      );
    }

    return respond({
      game: result.data,
      paddle_price_id: paddlePriceId,
    });
  } catch (error) {
    console.error("save-game failed", error);
    return respond(
      { error: error instanceof Error ? error.message : "Could not save game." },
      500,
    );
  }
});