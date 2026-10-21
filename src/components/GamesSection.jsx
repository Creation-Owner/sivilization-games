import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";


const CATEGORIES = [
  "All games",
  "Action",
  "Adventure",
  "Arcade",
  "Casual",
  "Puzzle",
  "Racing",
  "RPG",
  "Simulation",
  "Sports",
  "Strategy",
];


const PLATFORMS = [
  "All platforms",
  "Windows",
  "Android",
  "Web",
  "macOS",
  "Linux",
];


const ACCESS_TYPES = [
  "All access",
  "Free",
  "Paid",
];


function formatPrice(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}


function getCoverUrl(path) {
  if (!path) return null;


  return (
    supabase.storage
      .from("games")
      .getPublicUrl(path)
      .data?.publicUrl || null
  );
}


export default function GamesSection() {
  const [games, setGames] = useState([]);
  const [category, setCategory] = useState("All games");
  const [platform, setPlatform] = useState("All platforms");
  const [accessType, setAccessType] = useState("All access");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [user, setUser] = useState(null);
  const [ownedGameIds, setOwnedGameIds] = useState(new Set());
  const [selectedGame, setSelectedGame] = useState(null);


  async function loadGames() {
    setLoading(true);
    setMessage("");


    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();


      if (userError) throw userError;


      setUser(currentUser);


      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("is_published", true)
        .order("created_at", {
          ascending: false,
        });


      if (error) throw error;


      setGames(data || []);


      if (currentUser) {
        await loadOwnedGames(currentUser.id);
      } else {
        setOwnedGameIds(new Set());
      }
    } catch (error) {
      setMessage(
        error.message || "Could not load games.",
      );
    } finally {
      setLoading(false);
    }
  }


  async function loadOwnedGames(userId) {
    try {
      const { data, error } = await supabase
        .from("sandbox_game_purchases")
        .select("game_id")
        .eq("user_id", userId)
        .eq("status", "active");


      if (error) throw error;


      setOwnedGameIds(
        new Set((data || []).map((item) => item.game_id)),
      );
    } catch (error) {
      console.error(
        "Could not load owned games:",
        error,
      );


      setOwnedGameIds(new Set());
    }
  }


  useEffect(() => {
    loadGames();
  }, []);


  const filteredGames = useMemo(() => {
    const term = search.trim().toLowerCase();


    return games.filter((game) => {
      const paid =
        game.access_type === "paid" ||
        game.is_paid === true;


      const matchesCategory =
        category === "All games" ||
        game.genre === category;


      const matchesPlatform =
        platform === "All platforms" ||
        game.platform === platform;


      const matchesAccess =
        accessType === "All access" ||
        (accessType === "Free" && !paid) ||
        (accessType === "Paid" && paid);


      const searchableText = [
        game.title,
        game.description,
        game.genre,
        game.platform,
        game.version,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


      const matchesSearch =
        !term || searchableText.includes(term);


      return (
        matchesCategory &&
        matchesPlatform &&
        matchesAccess &&
        matchesSearch
      );
    });
  }, [
    games,
    category,
    platform,
    accessType,
    search,
  ]);


  function isOwned(game) {
    return ownedGameIds.has(game.id);
  }


  function openGame(game) {
    setSelectedGame(game);
    setMessage("");
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }


  function closeGame() {
    setSelectedGame(null);
  }


  async function handleDownload(game) {
    if (busyId) return;


    if (!user) {
      setMessage(
        "Sign in to download free games or access purchased games.",
      );
      return;
    }


    const paid =
      game.access_type === "paid" ||
      game.is_paid === true;


    if (paid && !isOwned(game)) {
      setMessage(
        "This paid game is not yet available for public purchase. Payment approval is pending.",
      );
      return;
    }


    if (game.delivery_type === "url") {
      try {
        const url = new URL(game.external_url);


        if (
          !["http:", "https:"].includes(url.protocol)
        ) {
          throw new Error("Unsupported URL");
        }


        window.open(
          url.href,
          "_blank",
          "noopener,noreferrer",
        );
      } catch {
        setMessage(
          "This game has an invalid external URL.",
        );
      }


      return;
    }


    setBusyId(game.id);
    setMessage("");


    try {
      const { data, error } =
        await supabase.functions.invoke(
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


      window.location.assign(data.url);
    } catch (error) {
      setMessage(
        error.message || "Could not prepare download.",
      );
    } finally {
      setBusyId(null);
    }
  }


  function GameDetails({ game }) {
    const cover = getCoverUrl(game.cover_path);
    const paid =
      game.access_type === "paid" ||
      game.is_paid === true;
    const owned = isOwned(game);


    return (
      <section className="section-page game-details-page">
        <button
          type="button"
          className="game-refresh-button"
          onClick={closeGame}
        >
          ← Back to games
        </button>


        <div className="game-details-layout">
          <div
            className="game-cover game-details-cover"
            style={
              cover
                ? {
                    backgroundImage: `url("${cover}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div className="game-cover-overlay">
              <span>{game.genre || "Game"}</span>
              <span>{game.platform}</span>
            </div>
          </div>


          <div className="game-details-body">
            <p className="eyebrow">
              {game.genre || "GAME"}
            </p>


            <h1>{game.title}</h1>


            <p>
              {game.platform} · Version {game.version}
            </p>


            <p className="game-description">
              {game.description ||
                "More information about this game will be added soon."}
            </p>


            <div className="game-details-meta">
              <div>
                <strong>Access</strong>
                <p>
                  {paid ? "Paid game" : "Free game"}
                </p>
              </div>


              <div>
                <strong>Price</strong>
                <p>
                  {paid
                    ? formatPrice(game.price_cents)
                    : "Free"}
                </p>
              </div>


              <div>
                <strong>Delivery</strong>
                <p>
                  {game.delivery_type === "url"
                    ? "External link"
                    : "Digital download"}
                </p>
              </div>


              <div>
                <strong>Status</strong>
                <p>
                  {paid
                    ? owned
                      ? "Owned"
                      : "Purchase unavailable"
                    : "Free access"}
                </p>
              </div>
            </div>


            <button
              type="button"
              className="public-button"
              disabled={Boolean(busyId)}
              onClick={() => handleDownload(game)}
            >
              {busyId === game.id
                ? "Preparing download..."
                : paid
                  ? owned
                    ? game.delivery_type === "url"
                      ? "Play now"
                      : "Download game"
                    : "Purchase unavailable"
                  : game.delivery_type === "url"
                    ? "Play now"
                    : user
                      ? "Download game"
                      : "Sign in to download"}
            </button>


            {paid && !owned && (
              <p className="game-details-note">
                Public checkout is temporarily unavailable while
                payment approval is pending.
              </p>
            )}


            {message && (
              <p
                className="media-status media-error"
                role="alert"
              >
                {message}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }


  if (selectedGame) {
    return <GameDetails game={selectedGame} />;
  }


  return (
    <section className="section-page games-page">
      <div className="games-hero">
        <div>
          <p className="eyebrow">
            DOWNLOADABLE GAMES
          </p>


          <h1>Explore the games collection</h1>


          <p>
            Browse downloadable Windows and Android games.
          </p>
        </div>
      </div>


      <div className="section-title-row">
        <h2>All games</h2>


        <span>
          {filteredGames.length} games
        </span>
      </div>


      <div className="games-filter-panel">
        <label className="games-filter-field">
          <span>Search</span>


          <input
            type="search"
            value={search}
            placeholder="Search by title, genre, or description"
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </label>


        <label className="games-filter-field">
          <span>Platform</span>


          <select
            value={platform}
            onChange={(event) =>
              setPlatform(event.target.value)
            }
          >
            {PLATFORMS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>


        <label className="games-filter-field">
          <span>Access</span>


          <select
            value={accessType}
            onChange={(event) =>
              setAccessType(event.target.value)
            }
          >
            {ACCESS_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>


      <div className="category-tabs">
        {CATEGORIES.map((item) => (
          <button
            type="button"
            key={item}
            className={
              item === category ? "selected" : ""
            }
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>


      <p>
        Paid-game checkout is temporarily unavailable while
        payment approval is pending. Free-game downloads
        require sign-in.
      </p>


      {loading && <p>Loading games...</p>}


      {message && !selectedGame && (
        <p
          className="media-status media-error"
          role="alert"
        >
          {message}
        </p>
      )}


      {!loading && !filteredGames.length && (
        <p>No games match your filters.</p>
      )}


      <div className="game-grid">
        {filteredGames.map((game) => {
          const cover = getCoverUrl(game.cover_path);
          const paid =
            game.access_type === "paid" ||
            game.is_paid === true;
          const owned = isOwned(game);


          return (
            <article
              className="game-card database-game-card"
              key={game.id}
              style={{
                "--game-color": "#0f766e",
              }}
            >
              <div
                className="game-cover"
                style={
                  cover
                    ? {
                        backgroundImage: `url("${cover}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div className="game-cover-overlay">
                  <span>
                    {game.genre || "Game"}
                  </span>


                  <span>
                    {game.platform}
                  </span>
                </div>
              </div>


              <div className="game-card-body">
                <h3>{game.title}</h3>


                <p>
                  {game.platform} - Version{" "}
                  {game.version}
                </p>


                <p className="game-description">
                  {game.description}
                </p>


                <div className="game-card-footer">
                  <strong>
                    {paid
                      ? formatPrice(game.price_cents)
                      : "Free"}
                  </strong>


                  <button
                    type="button"
                    onClick={() => openGame(game)}
                  >
                    {paid
                      ? owned
                        ? "View game"
                        : "View details"
                      : "View game"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>


      <button
        type="button"
        className="game-refresh-button"
        disabled={loading || Boolean(busyId)}
        onClick={loadGames}
      >
        Refresh games
      </button>
    </section>
  );
}