import { initializePaddle } from "@paddle/paddle-js";

let paddleInstancePromise;

async function getPaddle() {
  if (!paddleInstancePromise) {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();

    if (!token) {
      throw new Error("Missing VITE_PADDLE_CLIENT_TOKEN configuration.");
    }

    paddleInstancePromise = initializePaddle({
      environment:
        import.meta.env.VITE_PADDLE_ENVIRONMENT === "production"
          ? "production"
          : "sandbox",
      token,
    })
      .then((paddle) => {
        if (!paddle) {
          throw new Error(
            "Paddle could not initialize. Check the client token.",
          );
        }

        return paddle;
      })
      .catch((error) => {
        paddleInstancePromise = undefined;
        throw error;
      });
  }

  return paddleInstancePromise;
}

function getCheckoutSettings() {
  return {
    successUrl: `${window.location.origin}/?payment=success`,
  };
}

function normalizeCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one item is required to start checkout.");
  }

  return items.map((item, index) => {
    if (!item?.priceId) {
      throw new Error(
        `Checkout item ${index + 1} is missing a Paddle price ID.`,
      );
    }

    const quantity = Number(item.quantity) || 1;

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(
        `Checkout item ${index + 1} has an invalid quantity.`,
      );
    }

    return {
      priceId: item.priceId,
      quantity,
    };
  });
}

export async function buyItem({ priceId, quantity = 1, customData }) {
  if (!priceId) {
    throw new Error("A Paddle price ID is required to start checkout.");
  }

  const paddle = await getPaddle();

  paddle.Checkout.open({
    items: [
      {
        priceId,
        quantity,
      },
    ],
    ...(customData ? { customData } : {}),
    settings: getCheckoutSettings(),
  });
}

export async function openMultiItemCheckout({ items, customData }) {
  const checkoutItems = normalizeCheckoutItems(items);
  const paddle = await getPaddle();

  paddle.Checkout.open({
    items: checkoutItems,
    ...(customData ? { customData } : {}),
    settings: getCheckoutSettings(),
  });
}

export async function openPaddleCheckout({
  priceId,
  paymentType,
  itemId,
  title,
  userId,
  email,
}) {
  return buyItem({
    priceId,
    customData: {
      user_id: userId,
      product_id: itemId,
      product_type: paymentType,
      title,
      email,
    },
  });
}