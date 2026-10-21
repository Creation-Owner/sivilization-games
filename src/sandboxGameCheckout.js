import { initializePaddle } from "@paddle/paddle-js";
import { supabase } from "./supabaseClient";

let sandboxPaddlePromise;

async function getSandboxPaddle() {
  const token =
    import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();

  if (
    import.meta.env.VITE_PADDLE_ENVIRONMENT !== "sandbox" ||
    !token?.startsWith("test_")
  ) {
    throw new Error(
      "This test requires the sandbox environment and a test_ client token.",
    );
  }

  if (!sandboxPaddlePromise) {
    sandboxPaddlePromise = initializePaddle({
      environment: "sandbox",
      token,
    })
      .then((paddle) => {
        if (!paddle) {
          throw new Error("Could not initialize sandbox Paddle.");
        }

        return paddle;
      })
      .catch((error) => {
        sandboxPaddlePromise = undefined;
        throw error;
      });
  }

  return sandboxPaddlePromise;
}

export async function buySandboxGame(gameId) {
  const paddle = await getSandboxPaddle();

  const { data, error } =
    await supabase.functions.invoke(
      "create-sandbox-game-checkout",
      {
        body: {
          game_id: gameId,
        },
      },
    );

  if (error) {
    let message = error.message;

    if (typeof error.context?.json === "function") {
      const detail = await error.context.json().catch(() => null);
      message = detail?.error || message;
    }

    throw new Error(message);
  }

  if (data?.error || !data?.transaction_id) {
    throw new Error(
      data?.error || "No sandbox transaction was returned.",
    );
  }

  paddle.Checkout.open({
    transactionId: data.transaction_id,
    settings: {
      successUrl:
        `${window.location.origin}/?payment=success`,
    },
  });
}