import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { buyItem } from "../paddle";

function getProductImageUrl(product) {
  if (product.image_url) {
    return product.image_url;
  }

  if (!product.image_path) {
    return "";
  }

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(product.image_path);

  return data?.publicUrl || "";
}

function formatPrice(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

export default function ShopSection({
  search = "",
  onOpenCart,
  onCartChange,
}) {
  const [products, setProducts] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionProductId, setActionProductId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [buyingWithWallet, setBuyingWithWallet] = useState(null);

  useEffect(() => {
    try {
      initializePaddle();
    } catch (paddleError) {
      console.error("Paddle could not initialize:", paddleError);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadShop() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select(
          "id,title,description,category,price_cents,image_url,image_path,is_published,paddle_price_id,created_at"
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (productError) {
        throw productError;
      }

      let favorites = [];
      let cartItems = [];

      if (user) {
        const [favoritesResult, cartResult] = await Promise.all([
          supabase
            .from("product_favorites")
            .select("product_id")
            .eq("user_id", user.id),

          supabase
            .from("cart_items")
            .select("id,quantity")
            .eq("user_id", user.id),
        ]);

        if (favoritesResult.error) {
          throw favoritesResult.error;
        }

        if (cartResult.error) {
          throw cartResult.error;
        }

        favorites = favoritesResult.data || [];
        cartItems = cartResult.data || [];
      }

      if (!alive) {
        return;
      }

      setProducts(productData || []);
      setFavoriteIds(
        new Set(favorites.map((favorite) => favorite.product_id))
      );

      setCartCount(
        cartItems.reduce(
          (total, item) => total + (Number(item.quantity) || 0),
          0
        )
      );

      setLoading(false);
    }

    loadShop().catch((loadError) => {
      if (!alive) {
        return;
      }

      setProducts([]);
      setFavoriteIds(new Set());
      setCartCount(0);
      setError(loadError?.message || "Could not load products.");
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = [
      ...new Set(
        products
          .map((product) => product.category?.trim())
          .filter(Boolean)
      ),
    ];

    return ["All", ...uniqueCategories];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesSearch =
        !term ||
        [product.title, product.description, product.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  async function getCurrentUser() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      throw new Error("Please log in to use your cart and liked products.");
    }

    return user;
  }

  async function handleFavorite(product) {
    setActionProductId(product.id);
    setError("");
    setMessage("");

    try {
      const user = await getCurrentUser();
      const isFavorite = favoriteIds.has(product.id);

      if (isFavorite) {
        const { error: deleteError } = await supabase
          .from("product_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", product.id);

        if (deleteError) {
          throw deleteError;
        }

        setFavoriteIds((current) => {
          const next = new Set(current);
          next.delete(product.id);
          return next;
        });

        setMessage(`${product.title} was removed from your liked products.`);
      } else {
        const { error: insertError } = await supabase
          .from("product_favorites")
          .insert({
            user_id: user.id,
            product_id: product.id,
          });

        if (insertError) {
          throw insertError;
        }

        setFavoriteIds((current) => new Set([...current, product.id]));
        setMessage(`${product.title} was saved to your liked products.`);
      }
    } catch (actionError) {
      setError(actionError?.message || "Could not update liked products.");
    } finally {
      setActionProductId(null);
    }
  }

  async function handleAddToCart(product) {
    setActionProductId(product.id);
    setError("");
    setMessage("");

    try {
      const user = await getCurrentUser();

      const { data: existingItem, error: existingError } = await supabase
        .from("cart_items")
        .select("id,quantity")
        .eq("user_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingItem) {
        const nextQuantity = (Number(existingItem.quantity) || 0) + 1;

        const { error: updateError } = await supabase
          .from("cart_items")
          .update({ quantity: nextQuantity })
          .eq("id", existingItem.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase
          .from("cart_items")
          .insert({
            user_id: user.id,
            product_id: product.id,
            quantity: 1,
          });

        if (insertError) {
          throw insertError;
        }
      }

      setCartCount((count) => count + 1);
      setMessage(`${product.title} was added to your cart.`);
      onCartChange?.();
    } catch (actionError) {
      setError(
        actionError?.message ||
          "Could not add the product to your cart."
      );
    } finally {
      setActionProductId(null);
    }
  }

  async function handleBuyNow(product) {
    setActionProductId(product.id);
    setError("");
    setMessage("");

    try {
      if (!product.paddle_price_id) {
        throw new Error(
          "This product does not have a Paddle price configured yet."
        );
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please log in before purchasing.");
      }

      await buyItem({
        priceId: product.paddle_price_id,
        customData: {
          user_id: user.id,
          product_id: product.id,
          payment_type: "product",
        },
      });
    } catch (paymentError) {
      setError(paymentError?.message || "Could not open checkout.");
    } finally {
      setActionProductId(null);
    }
  }

  async function handleBuyWithWallet(product) {
    if (buyingWithWallet) return;

    setBuyingWithWallet(product.id);
    setError("");
    setMessage("");

    try {
      const user = await getCurrentUser();

      const { data, error } = await supabase.rpc(
        "purchase_with_wallet",
        {
          p_item_type: "product",
          p_item_id: product.id,
        },
      );

      if (error) {
        throw error;
      }

      window.dispatchEvent(new Event("wallet-updated"));

      setMessage(
        `${product.title} was purchased with your wallet. New balance: ${formatPrice(
          data?.wallet_balance_cents || 0,
        )}.`,
      );
    } catch (walletError) {
      setError(
        walletError?.message ||
          "Could not complete the wallet purchase.",
      );
    } finally {
      setBuyingWithWallet(null);
    }
  }

  return (
    <section className="section-page shop-page">
      <header className="shop-hero">
        <div>
          <p className="eyebrow">SIVILIZATION MARKET</p>

          <h1>Everything you love, in one place.</h1>

          <p>
            Browse digital products, entertainment accessories, and exclusive
            Sivilization items.
          </p>
        </div>
      </header>

      <div className="shop-heading">
        <div>
          <p className="eyebrow">DISCOVER OUR COLLECTION</p>
          <h2>Featured products</h2>
        </div>

        <button
          className="cart-button"
          type="button"
          onClick={() => onOpenCart?.()}
        >
          🛒 Cart <span className="cart-count">{cartCount}</span>
        </button>
      </div>

      {!loading && !error && categories.length > 1 && (
        <div className="shop-filters" aria-label="Product categories">
          {categories.map((category) => (
            <button
              key={category}
              className={selectedCategory === category ? "selected" : ""}
              type="button"
              onClick={() => setSelectedCategory(category)}
            >
              {category === "All" ? "All products" : category}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}

      {loading && (
        <p className="media-status" role="status">
          Loading products…
        </p>
      )}

      {error && (
        <p className="media-status media-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filteredProducts.length === 0 && (
        <div className="empty-library">
          <h2>
            {search.trim() || selectedCategory !== "All"
              ? "No matching products"
              : "No published products yet"}
          </h2>

          <p>
            {search.trim() || selectedCategory !== "All"
              ? "Try a different search term or category."
              : "Published products from Product Studio will appear here."}
          </p>
        </div>
      )}

      <div className="shop-grid">
        {filteredProducts.map((product) => {
          const imageUrl = getProductImageUrl(product);
          const isFavorite = favoriteIds.has(product.id);
          const isBusy = actionProductId === product.id;
          const isWalletBusy = buyingWithWallet === product.id;

          return (
            <article className="shop-card" key={product.id}>
              <div className="shop-product-image">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={product.title}
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="shop-product-placeholder"
                    aria-hidden="true"
                  >
                    🛍️
                  </span>
                )}

                {product.category && (
                  <span className="product-category">
                    {product.category}
                  </span>
                )}

                <button
                  className={`favorite-button ${isFavorite ? "saved" : ""}`}
                  type="button"
                  aria-label={
                    isFavorite
                      ? `Remove ${product.title} from liked products`
                      : `Save ${product.title} to liked products`
                  }
                  aria-pressed={isFavorite}
                  onClick={() => handleFavorite(product)}
                  disabled={isBusy}
                >
                  {isFavorite ? "♥" : "♡"}
                </button>
              </div>

              <div className="shop-card-body">
                <h3>{product.title}</h3>

                <p>
                  {product.description ||
                    "Discover an item from the Sivilization store."}
                </p>

                <div className="shop-card-footer">
                  <strong>{formatPrice(product.price_cents)}</strong>

                  <button
                    type="button"
                    onClick={() => handleAddToCart(product)}
                    disabled={isBusy}
                  >
                    {isBusy ? "Please wait…" : "Add to cart"}
                  </button>
                </div>

                <button
                  className="buy-now-button"
                  type="button"
                  onClick={() => handleBuyNow(product)}
                  disabled={isBusy || !product.paddle_price_id}
                >
                  {isBusy
                    ? "Opening checkout…"
                    : product.paddle_price_id
                      ? "Buy now"
                      : "Payment not configured"}
                </button>

                <button
                  className="buy-now-button"
                  type="button"
                  onClick={() => handleBuyWithWallet(product)}
                  disabled={isWalletBusy}
                >
                  {isWalletBusy
                    ? "Processing wallet payment…"
                    : `Buy with wallet — ${formatPrice(product.price_cents)}`}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}