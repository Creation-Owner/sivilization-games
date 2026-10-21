import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2025-06-30.basil",
});

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  const body = await req.text();

  let event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const paymentType = session.metadata?.payment_type;
    const itemId = session.metadata?.item_id;

    if (!userId) {
      return new Response("Missing user reference", { status: 400 });
    }

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .update({ status: "paid" })
      .eq("stripe_session_id", session.id)
      .select()
      .single();

    if (paymentType === "product" && itemId) {
      await supabaseAdmin.from("product_purchases").upsert({
        user_id: userId,
        product_id: itemId,
        payment_id: payment?.id,
      });
    }

    if ((paymentType === "film_buy" || paymentType === "film_rent") && itemId) {
      await supabaseAdmin.from("film_access").upsert(
        {
          user_id: userId,
          film_id: itemId,
          access_type: paymentType === "film_buy" ? "purchased" : "rented",
          expires_at:
            paymentType === "film_rent"
              ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
              : null,
        },
        {
          onConflict: "user_id,film_id,access_type",
        }
      );
    }

    if (paymentType === "subscription") {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await supabaseAdmin
        .from("profiles")
        .update({
          subscription_expires_at: expiry.toISOString(),
        })
        .eq("id", userId);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});