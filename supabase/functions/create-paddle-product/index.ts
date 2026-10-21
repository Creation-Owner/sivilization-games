import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header." }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Please log in." }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_owner")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_owner) {
      return new Response(
        JSON.stringify({ error: "Owner access required." }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const {
      title,
      description,
      category,
      imageUrl,
      imagePath,
      priceCents,
    } = await req.json();

    if (!title || !priceCents || priceCents <= 0) {
      return new Response(
        JSON.stringify({
          error: "Product title and a price above zero are required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const paddleApiKey = Deno.env.get("PADDLE_API_KEY");

    if (!paddleApiKey) {
      return new Response(
        JSON.stringify({ error: "Paddle API key is missing." }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const paddleHeaders = {
      Authorization: `Bearer ${paddleApiKey}`,
      "Content-Type": "application/json",
    };

    const productResponse = await fetch(
      "https://sandbox-api.paddle.com/products",
      {
        method: "POST",
        headers: paddleHeaders,
        body: JSON.stringify({
          name: title,
          description: description || "",
          tax_category: "standard",
        }),
      }
    );

    const productResult = await productResponse.json();

    if (!productResponse.ok) {
      throw new Error(
        `Paddle product error: ${JSON.stringify(productResult)}`
      );
    }

    const paddleProductId = productResult.data.id;

    const priceResponse = await fetch(
      "https://sandbox-api.paddle.com/prices",
      {
        method: "POST",
        headers: paddleHeaders,
        body: JSON.stringify({
          product_id: paddleProductId,
          name: `${title} - USD price`,
          description:
            description ||
            `Access to ${title}. One-time payment.`,
          tax_mode: "account_setting",
          unit_price: {
            amount: String(priceCents),
            currency_code: "USD",
          },
        }),
      }
    );

    const priceResult = await priceResponse.json();

    if (!priceResponse.ok) {
      throw new Error(
        `Paddle price error: ${JSON.stringify(priceResult)}`
      );
    }

    const paddlePriceId = priceResult.data.id;

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .insert({
        title,
        description: description || "",
        category: category || "",
        price_cents: priceCents,
        image_url: imageUrl || "",
        image_path: imagePath || "",
        is_published: true,
        paddle_price_id: paddlePriceId,
      })
      .select()
      .single();

    if (productError) {
      throw new Error(productError.message);
    }

    return new Response(
      JSON.stringify({
        product,
        paddle_product_id: paddleProductId,
        paddle_price_id: paddlePriceId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Could not create product.",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});