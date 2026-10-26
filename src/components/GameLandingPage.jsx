import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { getR2ObjectUrl, getR2DownloadUrl } from "../lib/r2Storage";

function formatPrice(cents) {
  const value = Number(cents) || 0;
  if (value <= 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

function getGenreGradient(genre = "") {
  const lower = genre.toLowerCase();
  if (lower.includes("racing") || lower.includes("speed")) {
    return "linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)";
  }
  if (lower.includes("rpg") || lower.includes("fantasy")) {
    return "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)";
  }
  if (lower.includes("strategy") || lower.includes("sci-fi")) {
    return "linear-gradient(135deg, #0ea5e9 0%, #10b981 100%)";
  }
  if (lower.includes("action") || lower.includes("arcade")) {
    return "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)";
  }
  return "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)";
}

function getGenreGlyph(genre = "") {
  const lower = genre.toLowerCase();
  if (lower.includes("racing")) return "🏁";
  if (lower.includes("rpg")) return "⚔️";
  if (lower.includes("strategy")) return "🛸";
  if (lower.includes("action")) return "⚡";
  if (lower.includes("puzzle")) return "🧩";
  return "🎮";
}

export default function GameLandingPage({
  onLogin,
  onNavigate,
  businessName = "Sivilization",
  supportEmail = "sivilization.support@gmail.com",
}) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [ownedGameIds, setOwnedGameIds] = useState(new Set());

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedPlatform, setSelectedPlatform] = useState("All");
  const [selectedAccess, setSelectedAccess] = useState("All");
  const [sortBy, setSortBy] = useState("newest");

  // Interaction Modals & States
  const [activeModalGame, setActiveModalGame] = useState(null);
  const [checkoutGame, setCheckoutGame] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [walletPaying, setWalletPaying] = useState(false);

  // Fetch games & auth state from Supabase
  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      // 1. Fetch current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user || null);

      if (user) {
        // Fetch user profile (wallet balance)
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, wallet_balance_cents, full_name, email")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) setUserProfile(profile);

        // Fetch owned games
        const { data: purchases } = await supabase
          .from("sandbox_game_purchases")
          .select("game_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (purchases) {
          setOwnedGameIds(new Set(purchases.map((p) => p.game_id)));
        }
      }

      // 2. Fetch published games from Supabase
      const { data: gamesData, error: gamesErr } = await supabase
        .from("games")
        .select(
          "id, title, description, genre, platform, version, access_type, is_paid, price_cents, cover_path, game_path, game_bucket, game_storage_provider, delivery_type, external_url, is_published, created_at"
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (gamesErr) throw gamesErr;
      setGames(gamesData || []);
    } catch (err) {
      console.error("Failed to load games from Supabase:", err);
      setError(err?.message || "Failed to load game library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const genres = useMemo(() => {
    const set = new Set();
    games.forEach((g) => {
      if (g.genre) set.add(g.genre);
    });
    return ["All", ...Array.from(set)];
  }, [games]);

  const filteredGames = useMemo(() => {
    return games
      .filter((game) => {
        // Genre filter
        if (selectedGenre !== "All" && game.genre !== selectedGenre) return false;

        // Platform filter
        if (selectedPlatform !== "All" && game.platform !== selectedPlatform)
          return false;

        // Access filter (Free / Paid)
        const isPaid = game.access_type === "paid" || game.is_paid;
        if (selectedAccess === "Free" && isPaid) return false;
        if (selectedAccess === "Paid" && !isPaid) return false;

        // Filter game listings by title
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          const title = (game.title || "").toLowerCase();
          if (!title.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price-low") return (a.price_cents || 0) - (b.price_cents || 0);
        if (sortBy === "price-high") return (b.price_cents || 0) - (a.price_cents || 0);
        if (sortBy === "title") return a.title.localeCompare(b.title);
        // Default newest
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [games, selectedGenre, selectedPlatform, selectedAccess, searchQuery, sortBy]);

  // Featured game for the hero banner
  const featuredGame = useMemo(() => {
    if (games.length === 0) return null;
    return games.find((g) => g.cover_path) || games[0];
  }, [games]);

  // Handle Download trigger
  const handleDownload = async (game) => {
    if (downloadingId) return;
    setDownloadingId(game.id);
    setActionNotice({
      type: "info",
      text: `Preparing download for "${game.title}"...`,
    });

    try {
      // 1. If external URL
      if (game.delivery_type === "url" && game.external_url) {
        window.open(game.external_url, "_blank", "noopener,noreferrer");
        setActionNotice({
          type: "success",
          text: `Opened "${game.title}" external link.`,
        });
        setDownloadingId(null);
        return;
      }

      // 2. Direct Cloudflare R2 download
      if (game.game_path) {
        const result = await getR2DownloadUrl({
          bucket: game.game_bucket || "games",
          path: game.game_path,
        });

        if (result?.url) {
          const tempLink = document.createElement("a");
          tempLink.href = result.url;
          tempLink.setAttribute("download", `${game.title.replace(/[^a-z0-9]/gi, "_")}.zip`);
          document.body.appendChild(tempLink);
          tempLink.click();
          tempLink.remove();

          setActionNotice({
            type: "success",
            text: `Download started for "${game.title}" from Cloudflare R2!`,
          });
          setDownloadingId(null);
          return;
        }
      }

      // 3. Fallback Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("get-game-download", {
        body: { game_id: game.id },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
        setActionNotice({
          type: "success",
          text: `Download initiated for "${game.title}".`,
        });
      } else {
        throw new Error(data?.error || "Download package is currently being processed.");
      }
    } catch (err) {
      console.error("Download error:", err);
      setActionNotice({
        type: "error",
        text: err?.message || "Could not complete download.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Buy trigger
  const handleBuyClick = (game) => {
    if (!currentUser) {
      if (onLogin) {
        onLogin();
      } else {
        setActionNotice({
          type: "info",
          text: `Please sign in or create an account to purchase "${game.title}".`,
        });
      }
      return;
    }
    setCheckoutGame(game);
  };

  // Complete purchase using wallet balance
  const handleWalletPurchase = async (game) => {
    if (!currentUser || walletPaying) return;
    setWalletPaying(true);

    try {
      const priceCents = game.price_cents || 0;
      const balance = userProfile?.wallet_balance_cents || 0;

      if (balance < priceCents) {
        throw new Error(
          `Insufficient wallet balance ($${(balance / 100).toFixed(2)} available, need $${(priceCents / 100).toFixed(2)}).`
        );
      }

      // Record purchase in Supabase
      const { error: pErr } = await supabase.from("sandbox_game_purchases").insert({
        id: crypto.randomUUID(),
        user_id: currentUser.id,
        game_id: game.id,
        amount_cents: priceCents,
        status: "active",
        purchased_at: new Date().toISOString(),
      });

      if (pErr) throw pErr;

      // Deduct wallet balance
      const newBalance = balance - priceCents;
      await supabase
        .from("profiles")
        .update({ wallet_balance_cents: newBalance })
        .eq("id", currentUser.id);

      setUserProfile((prev) => ({
        ...prev,
        wallet_balance_cents: newBalance,
      }));

      setOwnedGameIds((prev) => new Set([...prev, game.id]));
      setCheckoutGame(null);
      setActionNotice({
        type: "success",
        text: `Successfully unlocked "${game.title}"! You can now download it.`,
      });
    } catch (err) {
      setActionNotice({
        type: "error",
        text: err?.message || "Purchase could not be processed.",
      });
    } finally {
      setWalletPaying(false);
    }
  };

  return (
    <div className="game-landing-container">
      <style>{`
        .game-landing-container {
          min-height: 100vh;
          background-color: #07111f;
          color: #f8fafc;
          font-family: inherit;
        }

        /* Ambient subtle backdrop glows */
        .game-landing-glow-top {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 1200px;
          height: 480px;
          background: radial-gradient(ellipse at 50% 0%, rgba(37, 99, 235, 0.18) 0%, rgba(124, 58, 237, 0.08) 50%, transparent 80%);
          pointer-events: none;
          z-index: 0;
        }

        .game-landing-content {
          position: relative;
          z-index: 1;
          max-width: 1240px;
          margin: 0 auto;
          padding: 32px 24px 80px 24px;
        }

        /* Top Header Navigation */
        .landing-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 0 32px 0;
          border-bottom: 1px solid rgba(38, 56, 82, 0.5);
          margin-bottom: 40px;
        }

        .landing-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: #fff;
          font-weight: 800;
          font-size: 1.35rem;
          letter-spacing: -0.02em;
        }

        .landing-brand-badge {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: #fff;
          font-weight: 900;
          font-size: 1.1rem;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
        }

        .landing-nav-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .landing-user-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          background: rgba(16, 28, 46, 0.85);
          border: 1px solid #263852;
          border-radius: 999px;
          font-size: 0.88rem;
          color: #cbd5e1;
        }

        .landing-btn-auth {
          padding: 8px 18px;
          border-radius: 8px;
          background: #2563eb;
          color: #fff;
          border: none;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .landing-btn-auth:hover {
          background: #1d4ed8;
        }

        /* Hero Spotlight Banner */
        .landing-hero {
          position: relative;
          border-radius: 20px;
          border: 1px solid rgba(59, 130, 246, 0.25);
          background: linear-gradient(180deg, rgba(16, 28, 46, 0.9) 0%, rgba(11, 22, 40, 0.95) 100%);
          overflow: hidden;
          margin-bottom: 48px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
        }

        .landing-hero-inner {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 32px;
          padding: 44px 40px;
          align-items: center;
        }

        @media (max-width: 860px) {
          .landing-hero-inner {
            grid-template-columns: 1fr;
            padding: 32px 24px;
          }
        }

        .hero-tagline {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.18);
          border: 1px solid rgba(59, 130, 246, 0.35);
          color: #93c5fd;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 16px;
        }

        .hero-title {
          font-size: clamp(2rem, 4vw, 2.85rem);
          line-height: 1.15;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 16px 0;
          letter-spacing: -0.03em;
        }

        .hero-title span {
          background: linear-gradient(90deg, #60a5fa, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-desc {
          font-size: 1.05rem;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0 0 28px 0;
          max-width: 540px;
        }

        .hero-meta-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 28px;
        }

        .meta-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 6px;
          background: rgba(38, 56, 82, 0.45);
          border: 1px solid #263852;
          font-size: 0.82rem;
          color: #cbd5e1;
        }

        .hero-cta-group {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .hero-preview-box {
          position: relative;
          aspect-ratio: 16 / 10;
          border-radius: 14px;
          overflow: hidden;
          background: #0b1628;
          border: 1px solid #263852;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
        }

        .hero-preview-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .hero-preview-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          text-align: center;
        }

        .hero-preview-fallback .glyph {
          font-size: 3.5rem;
          margin-bottom: 12px;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.4));
        }

        .hero-preview-fallback .fallback-title {
          font-weight: 800;
          font-size: 1.3rem;
          color: #ffffff;
        }

        /* Filter & Controls Bar */
        .landing-controls-section {
          margin-bottom: 36px;
        }

        .landing-controls-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }

        .landing-search-box {
          position: relative;
          flex: 1;
          min-width: 260px;
          max-width: 420px;
        }

        .landing-search-input {
          width: 100%;
          padding: 11px 40px 11px 42px;
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 10px;
          color: #f8fafc;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .landing-search-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .landing-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          font-size: 1.05rem;
          pointer-events: none;
        }

        .landing-search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(38, 56, 82, 0.6);
          border: none;
          color: #94a3b8;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 0.85rem;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }

        .landing-search-clear:hover {
          background: rgba(239, 68, 68, 0.6);
          color: #fff;
        }

        .landing-search-count {
          font-size: 0.82rem;
          color: #38bdf8;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.3);
          padding: 3px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .landing-filter-selects {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .landing-select {
          padding: 9px 14px;
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.88rem;
          outline: none;
          cursor: pointer;
        }

        .landing-genre-pills {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .genre-pill-btn {
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(16, 28, 46, 0.7);
          border: 1px solid #263852;
          color: #94a3b8;
          font-size: 0.85rem;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .genre-pill-btn:hover {
          color: #f8fafc;
          border-color: #38bdf8;
        }

        .genre-pill-btn.active {
          background: rgba(37, 99, 235, 0.22);
          border-color: #3b82f6;
          color: #60a5fa;
          font-weight: 600;
        }

        /* Notification Banner */
        .landing-toast {
          padding: 12px 18px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.92rem;
          animation: fadeIn 0.2s ease-out;
        }

        .landing-toast.info {
          background: rgba(37, 99, 235, 0.15);
          border: 1px solid #2563eb;
          color: #93c5fd;
        }

        .landing-toast.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid #10b981;
          color: #6ee7b7;
        }

        .landing-toast.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid #ef4444;
          color: #fca5a5;
        }

        .landing-toast-close {
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 1.1rem;
          margin-left: 12px;
        }

        /* Games Grid */
        .games-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 26px;
        }

        .game-card {
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s, border-color 0.25s;
          position: relative;
        }

        .game-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
          border-color: rgba(59, 130, 246, 0.45);
        }

        /* Game Thumbnail Box */
        .game-thumb-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #0b1628;
          overflow: hidden;
          cursor: pointer;
        }

        .game-thumb-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }

        .game-card:hover .game-thumb-img {
          transform: scale(1.05);
        }

        .game-thumb-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          position: relative;
        }

        .thumb-fallback-glyph {
          font-size: 2.6rem;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
        }

        .thumb-overlay-badge-left {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          font-size: 0.75rem;
          font-weight: 700;
          color: #e2e8f0;
          text-transform: uppercase;
        }

        .thumb-overlay-badge-right {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .badge-free {
          background: rgba(16, 185, 129, 0.9);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
        }

        .badge-paid {
          background: rgba(37, 99, 235, 0.9);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
        }

        .badge-owned {
          background: rgba(147, 51, 234, 0.9);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(147, 51, 234, 0.35);
        }

        /* Game Card Body */
        .game-card-body {
          padding: 18px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .game-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
          color: #94a3b8;
          margin-bottom: 6px;
        }

        .game-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 8px 0;
          line-height: 1.3;
          cursor: pointer;
          transition: color 0.2s;
        }

        .game-card-title:hover {
          color: #60a5fa;
        }

        .game-card-desc {
          font-size: 0.88rem;
          color: #94a3b8;
          line-height: 1.48;
          margin: 0 0 16px 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
        }

        /* Card Action Footer */
        .game-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 14px;
          border-top: 1px solid rgba(38, 56, 82, 0.6);
        }

        .game-price-tag {
          font-weight: 800;
          font-size: 1.05rem;
          color: #f8fafc;
        }

        .game-price-tag.free {
          color: #4ade80;
        }

        /* Download & Buy Buttons */
        .btn-game-download {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          background: #10b981;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);
        }

        .btn-game-download:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-1px);
        }

        .btn-game-download:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .btn-game-buy {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
        }

        .btn-game-buy:hover:not(:disabled) {
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          transform: translateY(-1px);
        }

        .btn-game-buy:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        /* Skeleton Loading Cards */
        .skeleton-card {
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 16px;
          overflow: hidden;
          height: 310px;
        }

        .skeleton-thumb {
          width: 100%;
          aspect-ratio: 16 / 9;
          background: linear-gradient(90deg, #101c2e 25%, #18283e 50%, #101c2e 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite;
        }

        .skeleton-body {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .skeleton-line {
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, #101c2e 25%, #18283e 50%, #101c2e 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite;
        }

        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Details / Checkout Modals */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(7, 17, 31, 0.85);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 100;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-card {
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 20px;
          max-width: 620px;
          width: 100%;
          overflow: hidden;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6);
          position: relative;
        }

        .modal-close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #cbd5e1;
          display: grid;
          place-items: center;
          cursor: pointer;
          font-size: 1.1rem;
          z-index: 2;
        }

        .modal-close-btn:hover {
          color: #fff;
          background: rgba(239, 68, 68, 0.7);
        }

        .modal-banner {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #0b1628;
          overflow: hidden;
        }

        .modal-banner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .modal-content {
          padding: 24px 28px;
        }

        .modal-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          background: #0b1628;
          border: 1px solid #263852;
          border-radius: 12px;
          padding: 14px 18px;
          margin: 18px 0;
          text-align: center;
        }

        .modal-meta-grid .label {
          font-size: 0.75rem;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .modal-meta-grid .val {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          margin-top: 3px;
        }

        .modal-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          margin-top: 24px;
        }

        .empty-games-box {
          text-align: center;
          padding: 60px 24px;
          background: #101c2e;
          border: 1px solid #263852;
          border-radius: 16px;
        }

        .empty-games-box h3 {
          font-size: 1.3rem;
          margin: 0 0 8px 0;
        }
      `}</style>

      {/* Ambient top light */}
      <div className="game-landing-glow-top" aria-hidden="true" />

      <div className="game-landing-content">
        {/* Navigation Bar */}
        <header className="landing-topbar">
          <a
            href="#home"
            className="landing-brand"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.("Home");
            }}
          >
            <span className="landing-brand-badge" aria-hidden="true">
              S
            </span>
            <span>{businessName} Games</span>
          </a>

          <div className="landing-nav-actions">
            {currentUser ? (
              <div className="landing-user-badge">
                <span>👤</span>
                <span>
                  {currentUser.email?.split("@")[0] || "User"}
                </span>
                {userProfile && (
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>
                    • ${(userProfile.wallet_balance_cents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="landing-btn-auth"
                onClick={onLogin}
              >
                Sign in / Register
              </button>
            )}
          </div>
        </header>

        {/* Global Action Notification Toast */}
        {actionNotice && (
          <div className={`landing-toast ${actionNotice.type}`} role="status">
            <span>{actionNotice.text}</span>
            <button
              type="button"
              className="landing-toast-close"
              onClick={() => setActionNotice(null)}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {/* Hero Spotlight on Featured Game */}
        {featuredGame && (
          <section className="landing-hero">
            <div className="landing-hero-inner">
              <div>
                <span className="hero-tagline">
                  ✦ Featured Release
                </span>
                <h1 className="hero-title">
                  {featuredGame.title}
                </h1>
                <p className="hero-desc">
                  {featuredGame.description ||
                    "Immerse yourself in new worlds. Downloadable and ready to play."}
                </p>

                <div className="hero-meta-badges">
                  <span className="meta-pill">
                    {getGenreGlyph(featuredGame.genre)} {featuredGame.genre || "Action"}
                  </span>
                  <span className="meta-pill">
                    💻 {featuredGame.platform || "Windows"}
                  </span>
                  <span className="meta-pill">
                    v{featuredGame.version || "1.0"}
                  </span>
                  <span className="meta-pill" style={{ color: "#4ade80", fontWeight: 700 }}>
                    {featuredGame.access_type === "free" || !featuredGame.is_paid
                      ? "Free Access"
                      : formatPrice(featuredGame.price_cents)}
                  </span>
                </div>

                <div className="hero-cta-group">
                  {featuredGame.access_type === "free" ||
                  !featuredGame.is_paid ||
                  ownedGameIds.has(featuredGame.id) ? (
                    <button
                      type="button"
                      className="btn-game-download"
                      style={{ padding: "12px 24px", fontSize: "1rem" }}
                      disabled={downloadingId === featuredGame.id}
                      onClick={() => handleDownload(featuredGame)}
                    >
                      <span>⬇</span>
                      <span>
                        {downloadingId === featuredGame.id
                          ? "Starting Download..."
                          : "Download Now"}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-game-buy"
                      style={{ padding: "12px 24px", fontSize: "1rem" }}
                      onClick={() => handleBuyClick(featuredGame)}
                    >
                      <span>🛒</span>
                      <span>
                        Buy • {formatPrice(featuredGame.price_cents)}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    style={{
                      padding: "12px 20px",
                      borderRadius: "8px",
                      background: "rgba(38, 56, 82, 0.4)",
                      border: "1px solid #263852",
                      color: "#cbd5e1",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                    onClick={() => setActiveModalGame(featuredGame)}
                  >
                    View Game Details
                  </button>
                </div>
              </div>

              {/* Hero Game Preview Box */}
              <div
                className="hero-preview-box"
                onClick={() => setActiveModalGame(featuredGame)}
                style={{ cursor: "pointer" }}
              >
                {featuredGame.cover_path ? (
                  <img
                    src={getR2ObjectUrl(
                      featuredGame.game_bucket || "games",
                      featuredGame.cover_path
                    )}
                    alt={featuredGame.title}
                    className="hero-preview-img"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="hero-preview-fallback"
                    style={{ background: getGenreGradient(featuredGame.genre) }}
                  >
                    <span className="glyph">
                      {getGenreGlyph(featuredGame.genre)}
                    </span>
                    <span className="fallback-title">
                      {featuredGame.title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Controls, Filters & Search */}
        <section className="landing-controls-section">
          <div className="landing-controls-row">
            <div className="landing-search-box">
              <span className="landing-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                id="game-title-filter-input"
                type="search"
                className="landing-search-input"
                placeholder="Filter games by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter games by title"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="landing-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                  aria-label="Clear title search"
                >
                  ×
                </button>
              )}
            </div>

            {searchQuery && (
              <span className="landing-search-count">
                {filteredGames.length} title{filteredGames.length === 1 ? "" : "s"} found
              </span>
            )}

            <div className="landing-filter-selects">
              <select
                className="landing-select"
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                aria-label="Filter by platform"
              >
                <option value="All">All Platforms</option>
                <option value="Windows">Windows</option>
                <option value="Android">Android</option>
                <option value="Web">Web</option>
                <option value="macOS">macOS</option>
                <option value="Linux">Linux</option>
              </select>

              <select
                className="landing-select"
                value={selectedAccess}
                onChange={(e) => setSelectedAccess(e.target.value)}
                aria-label="Filter by price model"
              >
                <option value="All">All Access</option>
                <option value="Free">Free to Play</option>
                <option value="Paid">Premium / Paid</option>
              </select>

              <select
                className="landing-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort games"
              >
                <option value="newest">Newest Releases</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="title">Alphabetical (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Genre Category Pills */}
          <div className="landing-genre-pills" role="tablist" aria-label="Game Genres">
            {genres.map((genre) => (
              <button
                key={genre}
                type="button"
                className={`genre-pill-btn ${selectedGenre === genre ? "active" : ""}`}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre !== "All" && `${getGenreGlyph(genre)} `}
                {genre}
              </button>
            ))}
          </div>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="games-grid" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-thumb" />
                <div className="skeleton-body">
                  <div className="skeleton-line" style={{ width: "40%" }} />
                  <div className="skeleton-line" style={{ width: "80%", height: "20px" }} />
                  <div className="skeleton-line" style={{ width: "95%" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="empty-games-box" style={{ borderColor: "#ef4444" }}>
            <h3 style={{ color: "#ef4444" }}>Could not load games</h3>
            <p style={{ color: "#94a3b8", marginBottom: "16px" }}>{error}</p>
            <button
              type="button"
              className="landing-btn-auth"
              onClick={loadData}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty Search Results */}
        {!loading && !error && filteredGames.length === 0 && (
          <div className="empty-games-box">
            <h3>No games match your criteria</h3>
            <p style={{ color: "#94a3b8", marginBottom: "16px" }}>
              Try adjusting your search query, genre, or platform filter.
            </p>
            <button
              type="button"
              className="landing-btn-auth"
              onClick={() => {
                setSearchQuery("");
                setSelectedGenre("All");
                setSelectedPlatform("All");
                setSelectedAccess("All");
              }}
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Games Grid Showcase */}
        {!loading && !error && filteredGames.length > 0 && (
          <div className="games-grid">
            {filteredGames.map((game) => {
              const isPaid = game.access_type === "paid" || game.is_paid;
              const isOwned = ownedGameIds.has(game.id);
              const coverUrl = game.cover_path
                ? getR2ObjectUrl(game.game_bucket || "games", game.cover_path)
                : null;

              return (
                <article key={game.id} className="game-card">
                  {/* Thumbnail Container */}
                  <div
                    className="game-thumb-container"
                    onClick={() => setActiveModalGame(game)}
                  >
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={game.title}
                        className="game-thumb-img"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextElementSibling.style.display = "flex";
                        }}
                      />
                    ) : null}

                    <div
                      className="game-thumb-fallback"
                      style={{
                        display: coverUrl ? "none" : "flex",
                        background: getGenreGradient(game.genre),
                      }}
                    >
                      <span className="thumb-fallback-glyph">
                        {getGenreGlyph(game.genre)}
                      </span>
                    </div>

                    {/* Platform Badge */}
                    <span className="thumb-overlay-badge-left">
                      {game.platform || "Universal"}
                    </span>

                    {/* Price / Owned Badge */}
                    <span
                      className={`thumb-overlay-badge-right ${
                        isOwned
                          ? "badge-owned"
                          : isPaid
                          ? "badge-paid"
                          : "badge-free"
                      }`}
                    >
                      {isOwned ? "Owned" : isPaid ? "Premium" : "Free"}
                    </span>
                  </div>

                  {/* Card Content */}
                  <div className="game-card-body">
                    <div className="game-card-meta">
                      <span>{game.genre || "Indie Game"}</span>
                      <span>v{game.version || "1.0"}</span>
                    </div>

                    <h2
                      className="game-card-title"
                      onClick={() => setActiveModalGame(game)}
                    >
                      {game.title}
                    </h2>

                    <p className="game-card-desc">
                      {game.description ||
                        "Explore immersive gameplay and original indie mechanics."}
                    </p>

                    {/* Footer with Price and 'Download' / 'Buy' Button */}
                    <div className="game-card-footer">
                      <div
                        className={`game-price-tag ${!isPaid ? "free" : ""}`}
                      >
                        {formatPrice(game.price_cents)}
                      </div>

                      {/* Prominent Action Button: Download or Buy */}
                      {!isPaid || isOwned ? (
                        <button
                          type="button"
                          className="btn-game-download"
                          disabled={downloadingId === game.id}
                          onClick={() => handleDownload(game)}
                          title={`Download ${game.title}`}
                        >
                          <span>⬇</span>
                          <span>
                            {downloadingId === game.id
                              ? "Starting..."
                              : isOwned
                              ? "Download"
                              : "Download"}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-game-buy"
                          onClick={() => handleBuyClick(game)}
                          title={`Buy ${game.title}`}
                        >
                          <span>🛒</span>
                          <span>Buy • {formatPrice(game.price_cents)}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Game Details Modal */}
      {activeModalGame && (
        <div
          className="modal-overlay"
          onClick={() => setActiveModalGame(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setActiveModalGame(null)}
              aria-label="Close modal"
            >
              ×
            </button>

            <div className="modal-banner">
              {activeModalGame.cover_path ? (
                <img
                  src={getR2ObjectUrl(
                    activeModalGame.game_bucket || "games",
                    activeModalGame.cover_path
                  )}
                  alt={activeModalGame.title}
                />
              ) : (
                <div
                  className="hero-preview-fallback"
                  style={{
                    height: "100%",
                    background: getGenreGradient(activeModalGame.genre),
                  }}
                >
                  <span style={{ fontSize: "3rem" }}>
                    {getGenreGlyph(activeModalGame.genre)}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: "1.4rem" }}>
                    {activeModalGame.title}
                  </span>
                </div>
              )}
            </div>

            <div className="modal-content">
              <h2 style={{ margin: "0 0 8px 0", fontSize: "1.6rem" }}>
                {activeModalGame.title}
              </h2>
              <p style={{ color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                {activeModalGame.description ||
                  "No extended overview provided for this title yet."}
              </p>

              <div className="modal-meta-grid">
                <div>
                  <div className="label">Genre</div>
                  <div className="val">{activeModalGame.genre || "Action"}</div>
                </div>
                <div>
                  <div className="label">Platform</div>
                  <div className="val">{activeModalGame.platform || "Windows"}</div>
                </div>
                <div>
                  <div className="label">Version</div>
                  <div className="val">v{activeModalGame.version || "1.0"}</div>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    background: "transparent",
                    border: "1px solid #263852",
                    color: "#cbd5e1",
                    cursor: "pointer",
                  }}
                  onClick={() => setActiveModalGame(null)}
                >
                  Close
                </button>

                {activeModalGame.access_type === "free" ||
                !activeModalGame.is_paid ||
                ownedGameIds.has(activeModalGame.id) ? (
                  <button
                    type="button"
                    className="btn-game-download"
                    style={{ padding: "10px 22px", fontSize: "0.95rem" }}
                    disabled={downloadingId === activeModalGame.id}
                    onClick={() => {
                      handleDownload(activeModalGame);
                      setActiveModalGame(null);
                    }}
                  >
                    <span>⬇</span>
                    <span>Download Game</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-game-buy"
                    style={{ padding: "10px 22px", fontSize: "0.95rem" }}
                    onClick={() => {
                      const g = activeModalGame;
                      setActiveModalGame(null);
                      handleBuyClick(g);
                    }}
                  >
                    <span>🛒</span>
                    <span>Buy Now • {formatPrice(activeModalGame.price_cents)}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout / Purchase Modal */}
      {checkoutGame && (
        <div
          className="modal-overlay"
          onClick={() => setCheckoutGame(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setCheckoutGame(null)}
              aria-label="Close checkout"
            >
              ×
            </button>

            <div className="modal-content" style={{ padding: "32px 28px" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: "rgba(37,99,235,0.15)",
                  color: "#93c5fd",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  marginBottom: "12px",
                }}
              >
                INSTANT UNLOCK
              </div>

              <h2 style={{ margin: "0 0 6px 0", fontSize: "1.45rem" }}>
                Purchase {checkoutGame.title}
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 20px 0" }}>
                Add this game to your permanent library with instant Cloudflare R2 download access.
              </p>

              <div
                style={{
                  background: "#0b1628",
                  border: "1px solid #263852",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Game Price:</span>
                  <span style={{ fontWeight: 700, color: "#fff" }}>
                    {formatPrice(checkoutGame.price_cents)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "8px",
                    borderTop: "1px solid rgba(38,56,82,0.6)",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Your Wallet Balance:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        (userProfile?.wallet_balance_cents || 0) >=
                        (checkoutGame.price_cents || 0)
                          ? "#4ade80"
                          : "#f87171",
                    }}
                  >
                    ${((userProfile?.wallet_balance_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {(userProfile?.wallet_balance_cents || 0) >=
              (checkoutGame.price_cents || 0) ? (
                <button
                  type="button"
                  className="btn-game-buy"
                  style={{
                    width: "100%",
                    padding: "13px",
                    fontSize: "1rem",
                    justifyContent: "center",
                  }}
                  disabled={walletPaying}
                  onClick={() => handleWalletPurchase(checkoutGame)}
                >
                  {walletPaying
                    ? "Unlocking..."
                    : `Pay with Wallet (${formatPrice(checkoutGame.price_cents)})`}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    type="button"
                    className="btn-game-buy"
                    style={{
                      width: "100%",
                      padding: "13px",
                      fontSize: "1rem",
                      justifyContent: "center",
                    }}
                    onClick={() => {
                      setCheckoutGame(null);
                      if (onNavigate) {
                        onNavigate("Wallet");
                      } else {
                        setActionNotice({
                          type: "info",
                          text: "Please add funds to your wallet to complete purchase.",
                        });
                      }
                    }}
                  >
                    Top up Wallet
                  </button>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                      textAlign: "center",
                      margin: 0,
                    }}
                  >
                    Direct card checkout is currently being upgraded for live mode.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
