import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";


function getProductImageUrl(product) {
  if (product.image_url) return product.image_url;
  if (!product.image_path) return "";


  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(product.image_path);


  return data?.publicUrl || "";
}


function getGameCoverUrl(game) {
  if (!game.cover_path) return "";


  const { data } = supabase.storage
    .from("games")
    .getPublicUrl(game.cover_path);


  return data?.publicUrl || "";
}


function formatPrice(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}


export default function LibrarySection({ search = "" }) {
  const [activeTab, setActiveTab] = useState("games");
  const [ownedGames, setOwnedGames] = useState([]);
  const [purchasedProducts, setPurchasedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);


  useEffect(() => {
    let alive = true;


    async function loadLibrary() {
      setLoading(true);
      setError("");
      setNotice("");


      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();


      if (!alive) return;


      if (authError || !user) {
        setError("Please sign in to view your library.");
        setLoading(false);
        return;
      }


      try {
        const [gamesRes, productsRes] = await Promise.all([
          supabase
            .from("sandbox_game_purchases")
            .select(`
              id,
              purchased_at,
              status,
              game:games (
                id,
                title,
                description,
                genre,
                platform,
                version,
                access_type,
                price_cents,
                cover_path,
                delivery_type,
                external_url
              )
            `)
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("purchased_at", { ascending: false }),


          supabase
            .from("product_purchases")
            .select(`
              id,
              created_at,
              product:products (
                id,
                title,
                description,
                category,
                price_cents,
                image_url,
                image_path
              )
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);


        if (!alive) return;


        if (gamesRes.error) {
          console.error("Owned games error:", gamesRes.error);
        }


        if (productsRes.error) {
          console.error("Products error:", productsRes.error);
        }


        setOwnedGames(
          (gamesRes.data || [])
            .filter((row) => row.game)
            .map((row) => ({
              ...row.game,
              purchase_id: row.id,
              purchased_at: row.purchased_at,
            }))
        );


        setPurchasedProducts(
          (productsRes.data || [])
            .filter((row) => row.product)
            .map((row) => ({
              ...row.product,
              purchase_id: row.id,
              purchased_at: row.created_at,
            }))
        );
      } catch (err) {
        if (alive) {
          setError(err?.message || "Could not load library.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }


    loadLibrary();


    return () => {
      alive = false;
    };
  }, []);


  const filteredGames = useMemo(() => {
    const term = search.trim().toLowerCase();


    if (!term) return ownedGames;


    return ownedGames.filter((game) =>
      [
        game.title,
        game.description,
        game.genre,
        game.platform,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [ownedGames, search]);


  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();


    if (!term) return purchasedProducts;


    return purchasedProducts.filter((product) =>
      [product.title, product.description, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [purchasedProducts, search]);


  async function handleDownload(game) {
    if (busyId) return;


    setBusyId(game.id);
    setError("");
    setNotice("");


    try {
      if (game.delivery_type === "url") {
        const url = new URL(game.external_url);


        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("This game has an invalid external URL.");
        }


        window.open(
          url.href,
          "_blank",
          "noopener,noreferrer",
        );


        return;
      }


      const { data, error } = await supabase.functions.invoke(
        "get-game-download",
        {
          body: {
            game_id: game.id,
          },
        },
      );


      if (error) {
        const detail =
          typeof error.context?.json === "function"
            ? await error.context.json().catch(() => null)
            : null;


        throw new Error(
          detail?.error || error.message,
        );
      }


      if (!data?.url || data.error) {
        throw new Error(
          data?.error || "No download URL returned.",
        );
      }


      setNotice("Your download is starting.");
      window.location.assign(data.url);
    } catch (err) {
      setError(
        err?.message || "Could not prepare download.",
      );
    } finally {
      setBusyId(null);
    }
  }


  return (
    <section className="content-section">
      <header className="section-heading">
        <p className="eyebrow">Your collection</p>
        <h1>My library</h1>
        <p>
          Access your owned games and purchased products.
        </p>
      </header>


      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}


      {loading && (
        <p className="status-line" role="status">
          Loading your library…
        </p>
      )}


      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}


      <div
        className="media-categories"
        style={{ marginBottom: "24px" }}
      >
        <button
          type="button"
          className={activeTab === "games" ? "selected" : ""}
          onClick={() => setActiveTab("games")}
        >
          Owned Games ({ownedGames.length})
        </button>


        <button
          type="button"
          className={activeTab === "products" ? "selected" : ""}
          onClick={() => setActiveTab("products")}
        >
          Purchased Products ({purchasedProducts.length})
        </button>
      </div>


      {activeTab === "games" && (
        <>
          {filteredGames.length === 0 ? (
            <div className="empty-state">
              <h2>No owned games yet</h2>
              <p>
                Games you purchase will appear here after payment
                is confirmed.
              </p>
            </div>
          ) : (
            <div className="catalog-grid">
              {filteredGames.map((game) => {
                const cover = getGameCoverUrl(game);


                return (
                  <article
                    className="catalog-card"
                    key={game.purchase_id || game.id}
                  >
                    <div className="catalog-art">
                      {cover ? (
                        <img
                          src={cover}
                          alt={game.title}
                          loading="lazy"
                        />
                      ) : (
                        <span aria-hidden="true">🎮</span>
                      )}
                    </div>


                    <div className="catalog-card-body">
                      <div className="card-meta">
                        <span>
                          {game.genre || "Game"}
                        </span>


                        <span>
                          {game.access_type === "paid"
                            ? formatPrice(game.price_cents)
                            : "Free"}
                        </span>
                      </div>


                      <h2>{game.title}</h2>


                      <p>
                        {game.platform} · Version{" "}
                        {game.version}
                      </p>


                      <p>
                        {game.description ||
                          "Your purchased game is ready."}
                      </p>


                      <span className="access-label">
                        ✓ Owned
                      </span>


                      <button
                        type="button"
                        className="public-button"
                        disabled={Boolean(busyId)}
                        onClick={() => handleDownload(game)}
                      >
                        {busyId === game.id
                          ? "Preparing..."
                          : game.delivery_type === "url"
                            ? "Play now"
                            : "Download"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}


      {activeTab === "products" && (
        <>
          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <h2>No purchased products yet</h2>
              <p>
                Items you buy from the Shop will appear here after
                checkout.
              </p>
            </div>
          ) : (
            <div className="catalog-grid">
              {filteredProducts.map((product) => {
                const image = getProductImageUrl(product);


                return (
                  <article
                    className="catalog-card"
                    key={product.purchase_id || product.id}
                  >
                    <div className="catalog-art">
                      {image ? (
                        <img
                          src={image}
                          alt={product.title}
                          loading="lazy"
                        />
                      ) : (
                        <span aria-hidden="true">🛍️</span>
                      )}
                    </div>


                    <div className="catalog-card-body">
                      <div className="card-meta">
                        <span>
                          {product.category || "Product"}
                        </span>


                        <span>
                          {formatPrice(product.price_cents)}
                        </span>
                      </div>


                      <h2>{product.title}</h2>


                      <p>
                        {product.description ||
                          "An exclusive Sivilization item."}
                      </p>


                      <span className="access-label">
                        ✓ Purchased
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}