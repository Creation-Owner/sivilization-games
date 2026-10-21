import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();

type PaddleItem = {
  price?: {
    id?: string;
  };

  quantity?: number;
};

type PaddleTransaction = {
  id?: string;
  status?: string;

  custom_data?: Record<string, unknown> | null;

  items?: PaddleItem[];

  currency_code?: string;

  details?: {
    totals?: {
      total?: string;
    };
  };
};

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: PaddleTransaction;
};

function json(
  status: number,
  body: Record<string, unknown>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

function signatureParts(header: string) {
  const values = new Map<string, string[]>();

  for (const segment of header.split(";")) {
    const position = segment.indexOf("=");

    if (position <= 0) continue;

    const key = segment
      .slice(0, position)
      .trim();

    const value = segment
      .slice(position + 1)
      .trim();

    values.set(
      key,
      [...(values.get(key) ?? []), value],
    );
  }

  return {
    timestamp: values.get("ts")?.[0],
    signatures: values.get("h1") ?? [],
  };
}

function constantTimeHexEqual(
  supplied: string,
  expected: string,
): boolean {
  if (
    !/^[0-9a-f]+$/i.test(supplied) ||
    supplied.length !== expected.length
  ) {
    return false;
  }

  const normalized = supplied.toLowerCase();

  let mismatch = 0;

  for (
    let index = 0;
    index < normalized.length;
    index += 1
  ) {
    mismatch |=
      normalized.charCodeAt(index) ^
      expected.charCodeAt(index);
  }

  return mismatch === 0;
}

async function verifyPaddleSignature(
  rawBody: Uint8Array,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const {
    timestamp,
    signatures,
  } = signatureParts(signatureHeader);

  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    signatures.length === 0
  ) {
    return false;
  }

  const seconds = Number(timestamp);

  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Date.now() / 1000 - seconds) > 300
  ) {
    return false;
  }

  const prefix = encoder.encode(
    `${timestamp}:`,
  );

  const signedPayload = new Uint8Array(
    prefix.length + rawBody.length,
  );

  signedPayload.set(prefix);
  signedPayload.set(rawBody, prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      signedPayload,
    ),
  );

  const expectedSignature = Array.from(
    digest,
    (byte) =>
      byte.toString(16).padStart(2, "0"),
  ).join("");

  return signatures.some((signature) =>
    constantTimeHexEqual(
      signature,
      expectedSignature,
    ),
  );
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json(405, {
      error: "Use POST.",
    });
  }

  try {
    const webhookSecret =
      Deno.env.get("PADDLE_WEBHOOK_SECRET");

    const signature =
      request.headers.get("Paddle-Signature");

    if (!webhookSecret) {
      return json(503, {
        error:
          "Webhook signing secret is not configured.",
      });
    }

    if (!signature) {
      return json(401, {
        error: "Paddle signature is missing.",
      });
    }

    // Verify the original bytes before parsing JSON.
    const rawBody = new Uint8Array(
      await request.arrayBuffer(),
    );

    const validSignature =
      await verifyPaddleSignature(
        rawBody,
        signature,
        webhookSecret,
      );

    if (!validSignature) {
      return json(401, {
        error: "Invalid Paddle signature.",
      });
    }

    let event: PaddleEvent;

    try {
      event = JSON.parse(
        new TextDecoder().decode(rawBody),
      );
    } catch {
      return json(400, {
        error: "Invalid JSON.",
      });
    }

    if (
      !event ||
      !event.event_id ||
      !event.event_type
    ) {
      return json(400, {
        error: "Malformed Paddle event.",
      });
    }

    // Preserve the existing completed-transaction scope.
    // Refunds/subscription lifecycle need separate handlers.
    if (
      event.event_type !== "transaction.completed"
    ) {
      return json(200, {
        received: true,
        ignored: true,
      });
    }

    const transaction = event.data;

    if (
      !transaction?.id ||
      transaction.status !== "completed"
    ) {
      return json(400, {
        error:
          "Transaction is not completed.",
      });
    }

    const custom =
      transaction.custom_data ?? {};

    const productType =
      typeof custom.product_type === "string"
        ? custom.product_type
        : "";

    const paymentType =
      typeof custom.payment_type === "string"
        ? custom.payment_type
        : "";

    const userId =
      typeof custom.user_id === "string"
        ? custom.user_id
        : "";

    const total = Number(
      transaction.details?.totals?.total ??
        NaN,
    );

    const amountCents =
      Number.isFinite(total)
        ? Math.round(total)
        : 0;

    const currency =
      transaction.currency_code
        ?.toLowerCase() || "usd";

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return json(503, {
        error:
          "Supabase webhook configuration is missing.",
      });
    }

    const admin = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // -------------------------------------------
    // SANDBOX GAME PURCHASES
    // -------------------------------------------

    if (productType === "game") {
      if (
        Deno.env.get("PADDLE_ENVIRONMENT") !==
          "sandbox" ||
        custom.environment !== "sandbox"
      ) {
        return json(400, {
          error:
            "This game handler accepts sandbox checkouts only.",
        });
      }

      const checkoutReference =
        typeof custom.checkout_reference === "string"
          ? custom.checkout_reference
          : "";

      if (!isUuid(checkoutReference)) {
        return json(400, {
          error:
            "Missing or invalid game checkout reference. Use create-sandbox-game-checkout.",
        });
      }

      const {
        data: checkout,
        error: checkoutError,
      } = await admin
        .from("sandbox_game_checkouts")
        .select(
          "id,user_id,game_id,paddle_price_id,paddle_transaction_id",
        )
        .eq("id", checkoutReference)
        .maybeSingle();

      if (checkoutError) {
        console.error(
          "Sandbox checkout lookup failed:",
          checkoutError.code,
        );

        return json(503, {
          error:
            "Could not validate sandbox game checkout.",
        });
      }

      if (
        !checkout ||
        checkout.paddle_transaction_id !==
          transaction.id
      ) {
        return json(400, {
          error:
            "Transaction does not match the stored checkout.",
        });
      }

      const items = transaction.items ?? [];

      if (
        items.length !== 1 ||
        items[0].price?.id !==
          checkout.paddle_price_id ||
        items[0].quantity !== 1
      ) {
        return json(400, {
          error:
            "Purchased items do not match the game checkout.",
        });
      }

      if (
        transaction.currency_code
          ?.toUpperCase() !== "USD"
      ) {
        return json(400, {
          error:
            "Unexpected currency for this sandbox game checkout.",
        });
      }

      if (
        !Number.isSafeInteger(total) ||
        total <= 0
      ) {
        return json(400, {
          error:
            "Completed transaction total is invalid.",
        });
      }

      // The trusted user/game/price come from the
      // server-created checkout, not browser metadata.
      const { error: purchaseError } =
        await admin
          .from("sandbox_game_purchases")
          .upsert(
            {
              checkout_id: checkout.id,
              user_id: checkout.user_id,
              game_id: checkout.game_id,
              paddle_transaction_id:
                transaction.id,
              paddle_event_id: event.event_id,
              paddle_price_id:
                checkout.paddle_price_id,
              status: "active",
            },
            {
              onConflict:
                "paddle_transaction_id",
              ignoreDuplicates: true,
            },
          );

      if (purchaseError) {
        console.error(
          "Sandbox game purchase write failed:",
          purchaseError.code,
        );

        return json(503, {
          error:
            "Could not record sandbox game ownership.",
        });
      }

      // Verify that a duplicate refers to the same
      // checkout/user/game instead of assuming success.
      const {
        data: recorded,
        error: recordedError,
      } = await admin
        .from("sandbox_game_purchases")
        .select(
          "checkout_id,user_id,game_id,paddle_price_id,status",
        )
        .eq(
          "paddle_transaction_id",
          transaction.id,
        )
        .maybeSingle();

      if (recordedError || !recorded) {
        return json(503, {
          error:
            "Could not confirm recorded game ownership.",
        });
      }

      if (
        recorded.checkout_id !== checkout.id ||
        recorded.user_id !== checkout.user_id ||
        recorded.game_id !== checkout.game_id ||
        recorded.paddle_price_id !==
          checkout.paddle_price_id
      ) {
        console.error(
          "Sandbox game transaction binding conflict:",
          transaction.id,
        );

        return json(409, {
          error:
            "Transaction is already associated with a different purchase.",
        });
      }

      // Duplicate completed events do not reactivate
      // a purchase previously marked revoked.
      return json(200, {
        received: true,
        environment: "sandbox",
        provisioned:
          recorded.status === "active",
      });
    }

    // Existing film/cart flows use this metadata.
    if (!userId) {
      return json(400, {
        error: "Missing user reference.",
      });
    }

    // -------------------------------------------
    // EXISTING FILM PURCHASE HANDLER
    // -------------------------------------------

    if (productType === "film") {
      const filmId =
        typeof custom.product_id === "string"
          ? custom.product_id
          : "";

      if (!filmId) {
        return json(400, {
          error:
            "Film purchase metadata is missing.",
        });
      }

      const {
        data: film,
        error: filmError,
      } = await admin
        .from("films")
        .select(
          "id,access_type,price_cents,paddle_price_id",
        )
        .eq("id", filmId)
        .maybeSingle();

      if (filmError) {
        return json(503, {
          error:
            "Could not validate film purchase.",
        });
      }

      if (
        !film ||
        film.access_type !== "paid" ||
        !film.paddle_price_id
      ) {
        return json(400, {
          error:
            "Film is not configured for paid checkout.",
        });
      }

      const priceIds = (
        transaction.items ?? []
      )
        .map((item) => item.price?.id)
        .filter(Boolean);

      if (
        !priceIds.includes(
          film.paddle_price_id,
        )
      ) {
        return json(400, {
          error:
            "Transaction price does not match the film catalog price.",
        });
      }

      if (
        !Number.isFinite(total) ||
        total <= 0
      ) {
        return json(400, {
          error:
            "Completed transaction total is invalid.",
        });
      }

      const { error: purchaseError } =
        await admin
          .from("purchases")
          .upsert(
            {
              user_id: userId,
              film_id: filmId,
              purchase_type: "buy",
              price_cents: amountCents,
              purchased_at:
                new Date().toISOString(),
              expires_at: null,
              paddle_transaction_id:
                transaction.id,
            },
            {
              onConflict:
                "paddle_transaction_id",
            },
          );

      if (purchaseError) {
        return json(503, {
          error:
            "Could not record film purchase.",
        });
      }

      const { error: accessError } =
        await admin
          .from("film_access")
          .upsert(
            {
              user_id: userId,
              film_id: filmId,
              access_type: "purchased",
              expires_at: null,
            },
            {
              onConflict:
                "user_id,film_id",
            },
          );

      if (accessError) {
        return json(503, {
          error:
            "Could not provision film access.",
        });
      }

      return json(200, {
        received: true,
        provisioned: true,
      });
    }

    // -------------------------------------------
    // EXISTING SHOP-CART PURCHASE HANDLER
    // -------------------------------------------

    const isCartPurchase =
      paymentType === "cart";

    // Game purchases have already been handled above.
    if (!isCartPurchase) {
      return json(200, {
        received: true,
        ignored: true,
      });
    }

    const listedIds =
      typeof custom.product_ids === "string"
        ? custom.product_ids
            .split(",")
            .filter(Boolean)
        : [];

    if (!listedIds.length) {
      return json(400, {
        error:
          "Cart purchase metadata is missing product IDs.",
      });
    }

    const {
      data: products,
      error: productsError,
    } = await admin
      .from("products")
      .select(
        "id,paddle_price_id,is_published",
      )
      .in("id", listedIds);

    if (productsError) {
      return json(503, {
        error:
          "Could not validate purchased products.",
      });
    }

    if (
      !products ||
      products.length !== listedIds.length ||
      products.some(
        (product) =>
          !product.is_published ||
          !product.paddle_price_id,
      )
    ) {
      return json(400, {
        error:
          "One or more products are unavailable or missing a Paddle price.",
      });
    }

    const transactionPriceIds = new Set(
      (transaction.items ?? [])
        .map((item) => item.price?.id)
        .filter(Boolean),
    );

    if (
      products.some(
        (product) =>
          !transactionPriceIds.has(
            product.paddle_price_id,
          ),
      )
    ) {
      return json(400, {
        error:
          "Transaction prices do not match the product catalog.",
      });
    }

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return json(400, {
        error:
          "Completed transaction total is invalid.",
      });
    }

    const {
      data: priorPayment,
      error: priorError,
    } = await admin
      .from("payments")
      .select("id")
      .eq(
        "metadata->>paddle_transaction_id",
        transaction.id,
      )
      .maybeSingle();

    if (priorError) {
      return json(503, {
        error:
          "Could not check transaction history.",
      });
    }

    let paymentId = priorPayment?.id;

    if (!paymentId) {
      const {
        data: payment,
        error: paymentError,
      } = await admin
        .from("payments")
        .insert({
          user_id: userId,
          payment_type: "product",
          item_id:
            products.length === 1
              ? products[0].id
              : null,
          amount_cents: amountCents,
          currency,
          status: "paid",
          metadata: {
            paddle_transaction_id:
              transaction.id,
            product_ids: listedIds,
            transaction,
          },
        })
        .select("id")
        .single();

      if (paymentError) {
        return json(503, {
          error:
            "Could not record product payment.",
        });
      }

      paymentId = payment.id;
    }

    const purchases = listedIds.map(
      (productId) => ({
        user_id: userId,
        product_id: productId,
        payment_id: paymentId,
      }),
    );

    const { error: purchaseError } =
      await admin
        .from("product_purchases")
        .upsert(
          purchases,
          {
            onConflict:
              "user_id,product_id",
          },
        );

    if (purchaseError) {
      return json(503, {
        error:
          "Could not add purchased products to the Library.",
      });
    }

    const { error: clearError } =
      await admin
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .in("product_id", listedIds);

    if (clearError) {
      return json(503, {
        error:
          "Purchase recorded; paid cart items were not cleared.",
      });
    }

    return json(200, {
      received: true,
      provisioned: true,
    });
  } catch (error) {
    console.error(
      "Paddle webhook processing failed:",
      error instanceof Error
        ? error.name
        : "UnknownError",
    );

    return json(503, {
      error:
        "Webhook processing failed. Retry delivery after checking function logs.",
    });
  }
});