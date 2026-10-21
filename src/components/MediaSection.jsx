import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { buyItem } from "../paddle";

const categories = [
  "All films",
  "Trending",
  "New releases",
  "Action",
  "Adventure",
  "Anime",
  "Cartoon",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

const sampleFilms = [
  {
    id: "sample-last-horizon",
    title: "The Last Horizon",
    genre: "Sci-Fi",
    year: "2026",
    duration: "2h 18m",
    rating: "8.7",
    color: "#172554",
    progress: 72,
    video_url:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    access_type: "free",
    is_sample: true,
  },
  {
    id: "sample-midnight-streets",
    title: "Midnight Streets",
    genre: "Crime",
    year: "2025",
    duration: "1h 54m",
    rating: "8.2",
    color: "#3f1d2e",
    progress: 45,
    video_url:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    access_type: "free",
    is_sample: true,
  },
  {
    id: "sample-beyond-valley",
    title: "Beyond the Valley",
    genre: "Adventure",
    year: "2025",
    duration: "2h 06m",
    rating: "8.5",
    color: "#14532d",
    progress: 0,
    video_url:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    access_type: "free",
    is_sample: true,
  },
];

function currency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

function getPosterUrl(row) {
  if (row.poster_url) return row.poster_url;
  if (!row.poster_path) return null;

  const { data } = supabase.storage
    .from("film-posters")
    .getPublicUrl(row.poster_path);

  return data?.publicUrl || null;
}

function convertDatabaseFilm(row) {
  const storedAccessType = String(row.access_type || "")
    .trim()
    .toLowerCase();

  // Preserve explicit database access types.
  const accessType =
    storedAccessType || (row.is_paid === true ? "paid" : "free");

  return {
    ...row,
    title: row.title || "Untitled film",
    description: row.description || "",
    genre: row.genre || "Film",
    year: row.release_year ? String(row.release_year) : "Unknown",
    duration: row.duration || "Unknown",
    rating: String(row.rating ?? "0"),
    color: "#172554",
    progress: 0,
    video_path: row.video_path || null,
    video_bucket: row.video_bucket || null,
    video_url: row.video_url || null,
    poster_url: getPosterUrl(row),
    access_type: accessType,
    price_cents: Number(row.price_cents || 0),
    paddle_price_id: row.paddle_price_id || null,
    is_sample: false,
  };
}

function accessLabel(film) {
  if (film.access_type === "rent") {
    return `RENT ${currency(film.price_cents)}`;
  }

  if (film.access_type === "paid") {
    return currency(film.price_cents);
  }

  return film.access_type === "subscription" ? "SUB" : "FREE";
}

function posterStyle(film) {
  if (film.poster_url) {
    return {
      backgroundImage: `linear-gradient(rgba(15,23,42,.18),rgba(15,23,42,.82)),url("${film.poster_url}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return {
    "--film-color": film.color || "#172554",
  };
}

function FilmCard({
  film,
  busy,
  activePaymentMethod,
  onOpenFilm,
  onPurchase,
}) {
  const isRental = film.access_type === "rent";

  const canPurchase =
    !film.is_sample &&
    (film.access_type === "paid" || isRental);

  return (
    <article className="media-film-card">
      <button
        type="button"
        className="clickable-film-card"
        onClick={() => onOpenFilm(film)}
        aria-label={`Open ${film.title}`}
        disabled={busy}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: 0,
          background: "transparent",
          color: "inherit",
          textAlign: "left",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <div
          className="media-film-poster"
          style={posterStyle(film)}
        >
          <div className="media-film-top">
            <span>{film.genre}</span>

            <span className="media-access-badge">
              {accessLabel(film)}
            </span>
          </div>

          <span
            className="media-play-button media-play-icon"
            aria-hidden="true"
          >
            ▶
          </span>

          <div className="media-film-bottom">
            <span>★ {film.rating}</span>
            <span>{film.year}</span>
          </div>
        </div>

        <div className="media-film-body">
          <h3>{film.title}</h3>

          <p>
            {film.genre} · {film.duration}
          </p>
        </div>
      </button>

      {canPurchase && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            padding: "0 16px 16px",
          }}
        >
          <button
            type="button"
            className="media-watch-button"
            disabled={busy}
            onClick={() => onPurchase(film, "paddle")}
            style={{ width: "100%", margin: 0 }}
          >
            {activePaymentMethod === "paddle"
              ? "Opening checkout…"
              : `${isRental ? "Rent" : "Buy"} for ${currency(
                  film.price_cents,
                )}`}
          </button>

          <button
            type="button"
            className="media-watch-button"
            disabled={busy}
            onClick={() => onPurchase(film, "wallet")}
            style={{ width: "100%", margin: 0 }}
          >
            {activePaymentMethod === "wallet"
              ? "Processing wallet payment…"
              : `${isRental ? "Rent" : "Buy"} with wallet`}
          </button>
        </div>
      )}
    </article>
  );
}

function MediaRow({
  title,
  subtitle,
  films,
  onOpenFilm,
  onPurchase,
  busyFilmId,
  paymentMethod,
}) {
  if (!films.length) return null;

  return (
    <section className="media-row-section">
      <div className="media-row-heading">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="media-film-grid">
        {films.map((film) => (
          <FilmCard
            key={film.id}
            film={film}
            busy={busyFilmId !== null}
            activePaymentMethod={
              busyFilmId === film.id ? paymentMethod : null
            }
            onOpenFilm={onOpenFilm}
            onPurchase={onPurchase}
          />
        ))}
      </div>
    </section>
  );
}

export default function MediaSection({
  search = "",
  onOpenFilm,
}) {
  const [databaseFilms, setDatabaseFilms] = useState([]);
  const [selectedCategory, setSelectedCategory] =
    useState("All films");
  const [loadingFilms, setLoadingFilms] = useState(true);
  const [filmsError, setFilmsError] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [busyFilmId, setBusyFilmId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const checkoutLock = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadFilms() {
      setLoadingFilms(true);
      setFilmsError("");

      try {
        const { data, error } = await supabase
          .from("films")
          .select("*")
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) {
          setDatabaseFilms(
            (data || []).map(convertDatabaseFilm),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setFilmsError(
            error?.message || "Could not load films.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingFilms(false);
        }
      }
    }

    loadFilms();

    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  const allFilms = useMemo(
    () => [...databaseFilms, ...sampleFilms],
    [databaseFilms],
  );

  const visibleFilms = useMemo(() => {
    let result = allFilms;

    if (
      !["All films", "Trending", "New releases"].includes(
        selectedCategory,
      )
    ) {
      result = result.filter(
        (film) =>
          film.genre.toLowerCase() ===
          selectedCategory.toLowerCase(),
      );
    }

    if (selectedCategory === "Trending") {
      result = [...result].sort(
        (a, b) => Number(b.rating) - Number(a.rating),
      );
    }

    if (selectedCategory === "New releases") {
      const cutoff = Date.now() - 30 * 86400000;

      result = result.filter((film) =>
        film.created_at
          ? new Date(film.created_at).getTime() >= cutoff
          : film.year === String(new Date().getFullYear()),
      );
    }

    const query = String(search || "")
      .trim()
      .toLowerCase();

    return query
      ? result.filter((film) =>
          `${film.title} ${film.genre} ${film.description || ""}`
            .toLowerCase()
            .includes(query),
        )
      : result;
  }, [allFilms, selectedCategory, search]);

  function handleOpenFilm(film) {
    if (typeof onOpenFilm !== "function") {
      console.error(
        "MediaSection requires onOpenFilm from App.jsx.",
      );
      return;
    }

    onOpenFilm(film, allFilms);
  }

  async function handlePurchaseFilm(film, method) {
    if (checkoutLock.current) return;

    checkoutLock.current = true;

    setBusyFilmId(film.id);
    setPaymentMethod(method);
    setPurchaseError("");
    setPurchaseMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error(
          "Please sign in before buying or renting a film.",
        );
      }

      // Refresh the film before starting either payment method.
      const { data, error } = await supabase
        .from("films")
        .select("*")
        .eq("id", film.id)
        .eq("is_published", true)
        .single();

      if (error) throw error;

      const latestFilm = convertDatabaseFilm(data);

      setDatabaseFilms((current) =>
        current.map((item) =>
          item.id === film.id ? latestFilm : item,
        ),
      );

      if (
        latestFilm.access_type !== "paid" &&
        latestFilm.access_type !== "rent"
      ) {
        throw new Error(
          "This film is not currently available for purchase or rental.",
        );
      }

      const { data: purchases, error: purchaseCheckError } =
        await supabase
          .from("purchases")
          .select("purchase_type,expires_at")
          .eq("user_id", user.id)
          .eq("film_id", film.id)
          .in("purchase_type", ["rent", "buy"]);

      if (purchaseCheckError) throw purchaseCheckError;

      const alreadyOwned = (purchases || []).some(
        (purchase) => purchase.purchase_type === "buy",
      );

      const hasActiveRental = (purchases || []).some(
        (purchase) =>
          purchase.purchase_type === "rent" &&
          purchase.expires_at &&
          new Date(purchase.expires_at).getTime() >
            Date.now(),
      );

      if (
        alreadyOwned ||
        (latestFilm.access_type === "rent" && hasActiveRental)
      ) {
        setPurchaseMessage(
          "You already have access to this film.",
        );
        handleOpenFilm(latestFilm);
        return;
      }

      if (method === "wallet") {
        const {
          data: walletResult,
          error: walletError,
        } = await supabase.rpc("purchase_with_wallet", {
          p_item_type: "film",
          p_item_id: latestFilm.id,
        });

        if (walletError) throw walletError;

        window.dispatchEvent(new Event("wallet-updated"));

        const successText =
          latestFilm.access_type === "rent"
            ? "Rental successful."
            : "Purchase successful.";

        const balanceText =
          walletResult?.wallet_balance_cents != null
            ? ` Wallet balance: ${currency(
                walletResult.wallet_balance_cents,
              )}.`
            : "";

        setPurchaseMessage(
          `${successText}${balanceText}`,
        );

        handleOpenFilm(latestFilm);
        return;
      }

      if (!latestFilm.paddle_price_id) {
        throw new Error(
          "Paddle checkout is not configured for this film yet. Try the wallet option, or complete price creation in Film Studio.",
        );
      }

      await buyItem({
        priceId: latestFilm.paddle_price_id,
        customData: {
          user_id: user.id,
          film_id: latestFilm.id,
          payment_type: "film",
          access_type: latestFilm.access_type,
        },
      });
    } catch (error) {
      console.error("Film purchase failed:", error);

      const message =
        error?.message || "Could not complete the purchase.";

      setPurchaseError(message);
      window.alert(message);
    } finally {
      checkoutLock.current = false;
      setBusyFilmId(null);
      setPaymentMethod(null);
    }
  }

  const cutoff = Date.now() - 30 * 86400000;

  const rows = [
    {
      title: "Published uploads",
      subtitle: "Films from Film Studio",
      films: visibleFilms.filter((film) => !film.is_sample),
    },
    {
      title: "New releases",
      subtitle: "Recently published",
      films: visibleFilms.filter((film) =>
        film.created_at
          ? new Date(film.created_at).getTime() >= cutoff
          : film.year === String(new Date().getFullYear()),
      ),
    },
    {
      title: "Recommended",
      subtitle: "Popular with viewers",
      films: visibleFilms.filter(
        (film) => Number(film.rating) >= 8.1,
      ),
    },
    {
      title: "All films",
      subtitle: "Explore the catalogue",
      films: visibleFilms,
    },
  ];

  return (
    <section className="media-page section-page">
      <header className="media-hero">
        <div className="media-hero-content">
          <p className="eyebrow">SIVILIZATION CINEMA</p>

          <h1>Films, cartoons &amp; dramas</h1>

          <p className="media-hero-description">
            Open a film for details and authorized playback.
            Buy or rent paid films using Paddle checkout or
            your wallet balance.
          </p>
        </div>
      </header>

      <div className="media-categories">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={
              selectedCategory === category ? "selected" : ""
            }
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <button
        className="game-refresh-button"
        type="button"
        disabled={loadingFilms || busyFilmId !== null}
        onClick={() =>
          setRefreshVersion((value) => value + 1)
        }
      >
        {loadingFilms
          ? "Refreshing…"
          : "Refresh films and checkout prices"}
      </button>

      {purchaseMessage && (
        <p className="media-status" role="status">
          {purchaseMessage}
        </p>
      )}

      {purchaseError && (
        <p
          className="media-status media-error"
          role="alert"
        >
          {purchaseError}
        </p>
      )}

      {filmsError && (
        <p
          className="media-status media-error"
          role="alert"
        >
          Could not load films: {filmsError}
        </p>
      )}

      {!loadingFilms &&
        !filmsError &&
        !databaseFilms.length && (
          <p className="media-status">
            No published uploads yet.
          </p>
        )}

      {!loadingFilms &&
        !filmsError &&
        !visibleFilms.length && (
          <p className="media-status">
            No films match your search.
          </p>
        )}

      {rows.map((row) => (
        <MediaRow
          key={row.title}
          {...row}
          onOpenFilm={handleOpenFilm}
          onPurchase={handlePurchaseFilm}
          busyFilmId={busyFilmId}
          paymentMethod={paymentMethod}
        />
      ))}
    </section>
  );
}