import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const timestampToleranceSeconds = 5;

function respond(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseSignature(header: string) {
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key === "ts") {
      if (timestamp !== undefined) return null;
      timestamp = value;
    }

    if (key === "h1" && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(
        Uint8Array.from(
          value.match(/.{2}/g)!,
          (pair) => Number.parseInt(pair, 16),
        ),
      );
    }
  }

  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    signatures.length === 0
  ) {
    return null;
  }

  return { timestamp, signatures };
}

async function verifySignature(
  raw: Uint8Array,
  header: string,
  secret: string,
): Promise<boolean> {
  const parsed = parseSignature(header);
  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp);

  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) >
      timestampToleranceSeconds
  ) {
    return false;
  }

  const prefix = encoder.encode(`${parsed.timestamp}:`);
  const payload = new Uint8Array(prefix.length + raw.length);

  payload.set(prefix);
  payload.set(raw, prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  for (const signature of parsed.signatures) {
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        payload,
      )
    ) {
      return true;
    }
  }

  return false;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const signingSecret = Deno.env.get(
    "PADDLE_LIVE_WEBHOOK_SECRET",
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!signingSecret || !supabaseUrl || !serviceRoleKey) {
    return respond(503, {
      error: "Live webhook configuration is incomplete.",
    });
  }

  const signature = request.headers.get("Paddle-Signature");

  if (!signature) {
    return respond(401, { error: "Missing signature." });
  }

  try {
    const raw = new Uint8Array(await request.arrayBuffer());

    if (!(await verifySignature(raw, signature, signingSecret))) {
      return respond(401, { error: "Invalid signature." });
    }

    let event: Record<string, unknown>;

    try {
      const parsed = JSON.parse(new TextDecoder().decode(raw));

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return respond(400, { error: "Malformed event." });
      }

      event = parsed;
    } catch {
      return respond(400, { error: "Invalid JSON." });
    }

    if (
      typeof event.event_id !== "string" ||
      !event.event_id.startsWith("evt_") ||
      typeof event.event_type !== "string" ||
      typeof event.occurred_at !== "string" ||
      !Number.isFinite(Date.parse(event.occurred_at)) ||
      !event.data ||
      typeof event.data !== "object" ||
      Array.isArray(event.data)
    ) {
      return respond(400, { error: "Malformed event." });
    }

    if (event.event_type !== "transaction.completed") {
      // Do not silently claim to handle refunds or subscriptions.
      return respond(422, {
        error: "This endpoint supports transaction.completed only.",
      });
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await admin.rpc(
      "process_live_paddle_payment",
      { p_event: event },
    );

    if (error) {
      console.error("Live fulfillment failed", {
        event_id: event.event_id,
        database_code: error.code,
      });

      return respond(503, {
        error: "Payment fulfillment failed; retry required.",
      });
    }

    return respond(200, {
      received: true,
      result: data,
    });
  } catch {
    console.error("Live webhook request failed.");

    return respond(503, {
      error: "Temporary webhook processing failure.",
    });
  }
});