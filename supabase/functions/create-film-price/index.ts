import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing ${name} configuration.`);
  }

  return value;
}

async function paddleRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok) {
    const detail =
      result?.error?.detail || "Paddle rejected the request.";

    const validationErrors = Array.isArray(result?.error?.errors)
      ? result.error.errors
          .map(
            (entry: { field?: string; message?: string }) =>
              `${entry.field || "request"}: ${
                entry.message || "Invalid value"
              }`,
          )
          .join("; ")
      : "";

    throw new Error(
      `Paddle ${path} failed (${response.status}): ${detail}${
        validationErrors ? ` ${validationErrors}` : ""
      }`,
    );
  }

  if (!result?.data?.id) {
    throw new Error(`Paddle ${path} returned no ID.`);
  }

  return result.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Sign in first." }, 401);
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_ANON_KEY"),
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse(
        { error: "Your session is invalid. Sign in again." },
        401,
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin, is_owner")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        `Could not verify permissions: ${profileError.message}`,
      );
    }

    if (
      profile?.is_admin !== true &&
      profile?.is_owner !== true
    ) {
      return jsonResponse(
        { error: "Only admins or owners can create film prices." },
        403,
      );
    }

    let body;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request." }, 400);
    }

    const filmId =
      typeof body?.film_id === "string"
        ? body.film_id.trim()
        : "";

    if (!filmId) {
      return jsonResponse({ error: "film_id is required." }, 400);
    }

    const { data: film, error: filmError } = await supabase
      .from("films")
      .select(
        "id,title,description,price_cents,access_type,paddle_price_id",
      )
      .eq("id", filmId)
      .maybeSingle();

    if (filmError) {
      throw new Error(`Could not read film: ${filmError.message}`);
    }

    if (!film) {
      return jsonResponse({ error: "Film not found." }, 404);
    }

    if (!["paid", "rent"].includes(film.access_type)) {
      return jsonResponse(
        {
          error:
            "Only paid or rental films need a one-time Paddle price.",
        },
        400,
      );
    }

    if (film.paddle_price_id) {
      return jsonResponse({
        priceId: film.paddle_price_id,
        message: "This film already has a Paddle price.",
      });
    }

    const amountCents = Number(film.price_cents);

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      return jsonResponse(
        {
          error:
            "Set a positive price_cents value before creating checkout.",
        },
        400,
      );
    }

    const environment =
      Deno.env.get("PADDLE_ENVIRONMENT")?.trim() || "sandbox";

    if (!["sandbox", "production"].includes(environment)) {
      throw new Error(
        "PADDLE_ENVIRONMENT must be sandbox or production.",
      );
    }

    const baseUrl =
      environment === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";

    const apiKey = requiredEnv("PADDLE_API_KEY");

    // Must match an appropriate category enabled on your Paddle account.
    const taxCategory = requiredEnv("PADDLE_TAX_CATEGORY");

    const product = await paddleRequest(
      baseUrl,
      apiKey,
      "/products",
      {
        name: film.title || "Sivilization film",
        tax_category: taxCategory,
        ...(film.description
          ? { description: film.description }
          : {}),
        custom_data: {
          film_id: film.id,
          product_type: "film",
        },
      },
    );

    const price = await paddleRequest(
      baseUrl,
      apiKey,
      "/prices",
      {
        product_id: product.id,
        description:
          film.access_type === "rent"
            ? `${film.title} - rental`
            : `${film.title} - one-time purchase`,
        unit_price: {
          amount: String(amountCents),
          currency_code: "USD",
        },
        billing_cycle: null,
        custom_data: {
          film_id: film.id,
          access_type: film.access_type,
        },
      },
    );

    const { data: updatedFilm, error: updateError } = await supabase
      .from("films")
      .update({
        paddle_price_id: price.id,
      })
      .eq("id", film.id)
      .select("id,paddle_price_id")
      .single();

    if (updateError) {
      throw new Error(
        `Paddle created price ${price.id}, but saving it to the film failed: ${
          updateError.message
        }. Check film update permissions before retrying.`,
      );
    }

    if (updatedFilm?.paddle_price_id !== price.id) {
      throw new Error(
        `Paddle created price ${price.id}, but the saved film could not be verified.`,
      );
    }

    return jsonResponse({
      filmId: film.id,
      productId: product.id,
      priceId: updatedFilm.paddle_price_id,
      environment,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not create Paddle price.";

    console.error("create-film-price:", message);

    return jsonResponse({ error: message }, 500);
  }
});