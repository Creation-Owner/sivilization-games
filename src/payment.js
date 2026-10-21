import { supabase } from "./supabaseClient";

const FUNCTION_URL =
  "https://YOUR-PROJECT-REF.supabase.co/functions/v1/create-checkout";

export async function startCheckout({
  paymentType,
  itemId,
  title,
  amountCents,
  stripePriceId,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Please log in before purchasing.");
  }

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      paymentType,
      itemId,
      title,
      amountCents,
      stripePriceId,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not start checkout.");
  }

  window.location.href = result.url;
}