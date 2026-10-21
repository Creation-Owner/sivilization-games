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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Sign in first." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return respond({ error: "Supabase function secrets are not configured." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Your session is invalid. Sign in again." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_owner, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError);
      return respond({ error: "Could not verify administrator access." }, 500);
    }

    if (!profile?.is_owner && !profile?.is_admin) {
      return respond({ error: "Owner or administrator access required." }, 403);
    }

    const body = await request.json();

    const filmId = optionalString(body.id);
    const title = optionalString(body.title);
    const description = optionalString(body.description);
    const genre = optionalString(body.genre);
    const duration = optionalString(body.duration);
    const posterUrl = optionalString(body.poster_url);
    const posterPath = optionalString(body.poster_path);
    const accessType = body.access_type;
    const releaseYear = Number(body.release_year) || null;
    const priceCents = Number(body.price_cents);
    const isPublished = body.is_published !== false;

    if (!title) return respond({ error: "Film title is required." }, 400);

    if (!["free", "paid", "subscription"].includes(accessType)) {
      return respond({ error: "Invalid film access type." }, 400);
    }

    if (
      accessType === "paid" &&
      (!Number.isSafeInteger(priceCents) || priceCents <= 0)
    ) {
      return respond({ error: "Paid films need a price above zero cents." }, 400);
    }

    const filmPayload = {
      title,
      description,
      genre,
      release_year: releaseYear,
      duration,
      poster_url: posterUrl,
      poster_path: posterPath,
      access_type: accessType,
      is_paid: accessType === "paid",
      price_cents: accessType === "paid" ? priceCents : 0,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };

    // Load an existing film so we can avoid creating duplicate Paddle products.
    let existingFilm: {
      id: string;
      paddle_price_id: string | null;
      price_cents: number;
      access_type: string;
    } | null = null;

    if (filmId) {
      const { data, error } = await adminClient
        .from("films")
        .select("id, paddle_price_id, price_cents, access_type")
        .eq("id", filmId)
        .maybeSingle();

      if (error) {
        console.error("Film lookup failed:", error);
        return respond({ error: "Could not load film for editing." }, 500);
      }

      if (!data) return respond({ error: "Film not found." }, 404);
      existingFilm = data;
    }

    let paddlePriceId =
      accessType === "paid" ? existingFilm?.paddle_price_id ?? null : null;

    // Reuse the existing Paddle price when only non-price film fields changed.
    // Create a new price if this is newly paid or its price amount changed.
    const needsPaddlePrice =
      accessType === "paid" &&
      (!paddlePriceId ||
        existingFilm?.access_type !== "paid" ||
        existingFilm?.price_cents !== priceCents);

    if (needsPaddlePrice) {
      const paddleApiKey = Deno.env.get("PADDLE_API_KEY");
      if (!paddleApiKey) {
        return respond({ error: "PADDLE_API_KEY is not configured in Supabase secrets." }, 500);
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
          description: description ?? `Film: ${title}`,
          tax_category: "standard",
        }),
      });

      const productResult = await productResponse.json();

      if (!productResponse.ok) {
        console.error("Paddle product creation failed:", productResult);
        return respond(
          {
            error:
              productResult?.error?.detail ??
              productResult?.error?.message ??
              "Paddle could not create the film product.",
          },
          502,
        );
      }

      const productId = productResult?.data?.id;
      if (!productId) {
        return respond({ error: "Paddle did not return a product ID." }, 502);
      }

      // Omitting billing_cycle creates a one-time price.
      const priceResponse = await fetch(`${paddleBase}/prices`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_id: productId,
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
        console.error("Paddle price creation failed:", priceResult);
        return respond(
          {
            error:
              priceResult?.error?.detail ??
              priceResult?.error?.message ??
              "Paddle could not create the one-time price.",
          },
          502,
        );
      }

      paddlePriceId = priceResult?.data?.id ?? null;
      if (!paddlePriceId) {
        return respond({ error: "Paddle did not return a price ID." }, 502);
      }
    }

    const finalPayload = {
      ...filmPayload,
      paddle_price_id: paddlePriceId,
    };

    let savedFilm;
    let saveError;

    if (filmId) {
      const result = await adminClient
        .from("films")
        .update(finalPayload)
        .eq("id", filmId)
        .select()
        .single();

      savedFilm = result.data;
      saveError = result.error;
    } else {
      const result = await adminClient
        .from("films")
        .insert({
          ...finalPayload,
          created_by: user.id,
        })
        .select()
        .single();

      savedFilm = result.data;
      saveError = result.error;
    }

    if (saveError) {
      console.error("Film database save failed:", saveError);
      return respond(
        {
          error:
            "Paddle product/price may have been created, but the film could not be saved. Check the film table and Paddle catalog before retrying to avoid duplicates.",
        },
        500,
      );
    }

    return respond({
      film: savedFilm,
      paddle_price_id: paddlePriceId,
    });
  } catch (error) {
    console.error("save-film failed:", error);
    return respond(
      { error: error instanceof Error ? error.message : "Could not save film." },
      500,
    );
  }
});