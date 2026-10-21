import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { openMultiItemCheckout } from "../paddle";

function formatPrice(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

export default function CartSection({ onCartChange }) {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadCart() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Please log in to view your cart.");
      }

      const { data, error: cartError } = await supabase
        .from("cart_items")
        .select(
          "id,quantity,product:products(id,title,description,category,price_cents,image_url,image_path,paddle_price_id)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cartError) {
        throw cartError;
      }

      if (!alive) {
        return;
      }

      setCartItems(data || []);
      setLoading(false);
    }

    loadCart().catch((loadError) => {
      if (!alive) {
        return;
      }

      setCartItems([]);
      setError(loadError?.message || "Could not load your cart.");
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const subtotal = cartItems.reduce(
    (total, item) =>
      total +
      (Number(item.product?.price_cents) || 0) *
        (Number(item.quantity) || 0),
    0
  );

  async function updateQuantity(item, nextQuantity) {
    setBusyId(item.id);
    setError("");
    setMessage("");

    if (nextQuantity <= 0) {
      await removeItem(item);
      return;
    }

    const { error: updateError } = await supabase
      .from("cart_items")
      .update({ quantity: nextQuantity })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setCartItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, quantity: nextQuantity }
            : currentItem
        )
      );

      setMessage(`${item.product?.title || "Product"} quantity updated.`);
      onCartChange?.();
    }

    setBusyId(null);
  }

  async function removeItem(item) {
    setBusyId(item.id);
    setError("");
    setMessage("");

    const { error: deleteError } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setCartItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id)
      );

      setMessage(
        `${item.product?.title || "Product"} was removed from your cart.`
      );
      onCartChange?.();
    }

    setBusyId(null);
  }

  async function handleCheckout() {
    setError("");
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Please sign in to complete your checkout.");
      return;
    }

    if (cartItems.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const missingPrice = cartItems.find(
      (item) => !item.product?.paddle_price_id
    );

    if (missingPrice) {
      setError(
        `"${missingPrice.product?.title || "A product"}" has no Paddle price configured yet.`
      );
      return;
    }

    setCheckingOut(true);

    try {
      const items = cartItems.map((item) => ({
        priceId: item.product.paddle_price_id,
        quantity: Number(item.quantity) || 1,
      }));

      const productIds = cartItems
        .map((item) => item.product?.id)
        .filter(Boolean);

      await openMultiItemCheckout({
        items,
        customData: {
          user_id: user.id,
          product_ids: productIds.join(","),
          payment_type: "cart",
        },
      });
    } catch (checkoutErr) {
      console.error("Cart checkout error:", checkoutErr);
      setError(checkoutErr?.message || "Could not open checkout.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <section className="section-page cart-page">
      <header className="cart-header">
        <div>
          <p className="eyebrow">YOUR SELECTION</p>
          <h1>Your cart</h1>
          <p>Review the products you added before checkout.</p>
        </div>
      </header>

      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}

      {loading && (
        <p className="media-status" role="status">
          Loading your cart…
        </p>
      )}

      {error && (
        <p className="media-status media-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && cartItems.length === 0 && (
        <div className="empty-library">
          <h2>Your cart is empty</h2>
          <p>Add products from the Shop section to see them here.</p>
        </div>
      )}

      {!loading && !error && cartItems.length > 0 && (
        <>
          <div className="cart-list">
            {cartItems.map((item) => {
              const product = item.product || {};
              const imageUrl = product.image_url || "";
              const quantity = Number(item.quantity) || 0;

              return (
                <article className="cart-item" key={item.id}>
                  <div className="cart-item-image">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.title}
                        loading="lazy"
                      />
                    ) : (
                      <span aria-hidden="true">🛍️</span>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <h3>{product.title || "Product"}</h3>
                    <p>{product.description || ""}</p>

                    <div className="cart-item-controls">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item, quantity - 1)}
                        disabled={busyId === item.id || checkingOut}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>

                      <span>{quantity}</span>

                      <button
                        type="button"
                        onClick={() => updateQuantity(item, quantity + 1)}
                        disabled={busyId === item.id || checkingOut}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="cart-item-summary">
                    <strong>
                      {formatPrice(
                        (Number(product.price_cents) || 0) * quantity
                      )}
                    </strong>

                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      disabled={busyId === item.id || checkingOut}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="cart-summary">
            <h2>Order summary</h2>

            <div className="cart-summary-row">
              <span>Items</span>
              <strong>
                {cartItems.reduce(
                  (total, item) => total + (Number(item.quantity) || 0),
                  0
                )}
              </strong>
            </div>

            <div className="cart-summary-row">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>

            <button
              className="button button-primary"
              type="button"
              onClick={handleCheckout}
              disabled={checkingOut}
            >
              {checkingOut ? "Opening checkout…" : "Pay with Card (Paddle)"}
            </button>
          </aside>
        </>
      )}
    </section>
  );
}