import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";


import PublicSite from "./components/PublicSite";
import HomeSection from "./components/HomeSection";
import GamesSection from "./components/GamesSection";
import ShopSection from "./components/ShopSection";
import CartSection from "./components/CartSection";
import LibrarySection from "./components/LibrarySection";
import ProfileSection from "./components/ProfileSection";
import WalletSection from "./components/WalletSection";
import SettingsSection from "./components/SettingsSection";
import AdminContentPage from "./components/AdminContentPage";
import OwnerUsersPage from "./components/OwnerUsersPage";
import ProductStudioPage from "./components/ProductStudioPage";
import SubscriptionsSection from "./components/SubscriptionsSection";
import SubscriptionStudioPage from "./components/SubscriptionStudioPage";


// Films & media are temporarily hidden while the payment provider
// reviews the site. Do not delete MediaSection or FilmDetailsPage;
// they can be restored later.
// import MediaSection from "./components/MediaSection";
// import FilmDetailsPage from "./components/FilmDetailsPage";


const NAV_ITEMS = [
  { id: "Home", label: "Home" },
  { id: "Games", label: "Games" },
  { id: "Shop", label: "Shop" },
  { id: "Subscriptions", label: "Subscriptions" },
  { id: "Wallet", label: "Wallet" },
  { id: "Cart", label: "Cart" },
  { id: "Library", label: "Library" },
];


const OWNER_NAV_ITEMS = [
  { id: "Owner", label: "Owner" },
  { id: "ProductStudio", label: "Product Studio" },
  { id: "SubscriptionStudio", label: "Subscription Studio" },
];


function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}


function AccessRequired({ title, children }) {
  return (
    <section className="content-section">
      <div className="empty-state">
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </section>
  );
}


function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");


  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }


  async function handleSubmit(event) {
    event.preventDefault();


    if (busy) return;


    setBusy(true);
    showMessage("");


    const normalizedEmail = email.trim().toLowerCase();


    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });


        if (error) throw error;


        setPassword("");
        setMode("login");


        showMessage(
          "Account created. Check your email to confirm your address before logging in.",
          "success",
        );
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });


        if (error) throw error;
      }
    } catch (error) {
      showMessage(
        error?.message || "Authentication failed.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }


  async function handlePasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();


    if (!normalizedEmail) {
      showMessage("Enter your email address first.", "error");
      return;
    }


    setBusy(true);
    showMessage("");


    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo: window.location.origin },
        );


      if (error) throw error;


      showMessage(
        "If an account exists for that address, a password-reset email has been sent.",
        "success",
      );
    } catch (error) {
      showMessage(
        error?.message || "Could not send the reset email.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">
          S
        </div>


        <p className="eyebrow">Sivilization</p>


        <h1 id="auth-title">
          {mode === "signup"
            ? "Create your account"
            : "Welcome back"}
        </h1>


        <p className="auth-subtitle">
          Sign in to explore games, products, and your saved library.
        </p>


        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email address</label>


          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
          />


          <label htmlFor="auth-password">Password</label>


          <input
            id="auth-password"
            type="password"
            autoComplete={
              mode === "signup"
                ? "new-password"
                : "current-password"
            }
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />


          <button
            className="button button-primary auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Log in"}
          </button>
        </form>


        {mode === "login" && (
          <button
            className="text-button reset-link"
            type="button"
            onClick={handlePasswordReset}
            disabled={busy}
          >
            Forgot password?
          </button>
        )}


        <p className="auth-switch">
          {mode === "signup"
            ? "Already have an account?"
            : "New to Sivilization?"}{" "}
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode((current) =>
                current === "signup" ? "login" : "signup",
              );
              showMessage("");
            }}
          >
            {mode === "signup" ? "Log in" : "Create account"}
          </button>
        </p>


        {message && (
          <p
            className={`notice ${messageType}`}
            role={messageType === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}


function AppShell({ user }) {
  const [activeSection, setActiveSection] = useState("Home");
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);


  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState("");
  const [sessionError, setSessionError] = useState("");


  const [cartCount, setCartCount] = useState(0);
  const [cartVersion, setCartVersion] = useState(0);


  const [walletBalance, setWalletBalance] = useState(null);
  const [walletError, setWalletError] = useState("");


  const email = user.email || "";
  const username = email
    ? email.split("@")[0]
    : "Sivilization user";


  useEffect(() => {
    let alive = true;


    async function loadRole() {
      setRoleLoading(true);
      setRoleError("");


      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin,is_owner")
          .eq("id", user.id)
          .maybeSingle();


        if (error) throw error;
        if (!alive) return;


        setIsAdmin(data?.is_admin === true);
        setIsOwner(data?.is_owner === true);
      } catch (error) {
        if (!alive) return;


        setIsAdmin(false);
        setIsOwner(false);
        setRoleError(
          error?.message || "Could not load account role.",
        );
      } finally {
        if (alive) setRoleLoading(false);
      }
    }


    loadRole();


    return () => {
      alive = false;
    };
  }, [user.id]);


  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;


    async function loadWalletBalance() {
      const currentRequest = ++requestVersion;


      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("wallet_balance_cents")
          .eq("id", user.id)
          .single();


        if (error) throw error;


        if (
          data?.wallet_balance_cents == null ||
          !Number.isFinite(Number(data.wallet_balance_cents))
        ) {
          throw new Error("Wallet balance is unavailable.");
        }


        if (
          !cancelled &&
          currentRequest === requestVersion
        ) {
          setWalletBalance(Number(data.wallet_balance_cents));
          setWalletError("");
        }
      } catch (error) {
        if (
          !cancelled &&
          currentRequest === requestVersion
        ) {
          setWalletBalance(null);
          setWalletError(
            error?.message || "Could not load wallet balance.",
          );
        }
      }
    }


    loadWalletBalance();


    window.addEventListener("wallet-updated", loadWalletBalance);
    window.addEventListener("focus", loadWalletBalance);


    return () => {
      cancelled = true;
      window.removeEventListener(
        "wallet-updated",
        loadWalletBalance,
      );
      window.removeEventListener("focus", loadWalletBalance);
    };
  }, [user.id]);


  useEffect(() => {
    let alive = true;


    async function loadCartCount() {
      try {
        const { data, error } = await supabase
          .from("cart_items")
          .select("quantity")
          .eq("user_id", user.id);


        if (error) throw error;
        if (!alive) return;


        setCartCount(
          (data || []).reduce(
            (total, item) =>
              total + (Number(item.quantity) || 0),
            0,
          ),
        );
      } catch (error) {
        console.error("Could not load cart count:", error);
      }
    }


    loadCartCount();


    return () => {
      alive = false;
    };
  }, [user.id, cartVersion]);


  async function handleLogout() {
    setSessionError("");


    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setSessionError(error?.message || "Could not log out.");
    }
  }


  function refreshWallet() {
    window.dispatchEvent(new Event("wallet-updated"));
  }


  function navigate(section) {
    setActiveSection(section);
    setProfileOpen(false);


    if (!["Games", "Shop", "Library"].includes(section)) {
      setSearch("");
    }


    refreshWallet();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  function refreshCartCount() {
    setCartVersion((current) => current + 1);
  }


  const walletLabel = walletError
    ? "Wallet unavailable"
    : walletBalance === null
      ? "Loading wallet…"
      : `Wallet: ${formatCurrency(walletBalance)}`;


  const showSearch =
    ["Games", "Shop", "Library"].includes(activeSection);


  return (
    <main className="site-page">
      <header className="topbar">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => navigate("Home")}
          aria-label="Sivilization home"
        >
          <span className="brand-mark small" aria-hidden="true">
            S
          </span>
          <span>Sivilization</span>
        </button>


        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? "active" : ""}
              type="button"
              aria-current={
                activeSection === item.id ? "page" : undefined
              }
              onClick={() => navigate(item.id)}
            >
              {item.label}


              {item.id === "Cart" && cartCount > 0 && (
                <span className="cart-count">{cartCount}</span>
              )}
            </button>
          ))}


          {!roleLoading && isAdmin && (
            <button
              className={
                activeSection === "Admin"
                  ? "active admin-nav-button"
                  : "admin-nav-button"
              }
              type="button"
              aria-current={
                activeSection === "Admin" ? "page" : undefined
              }
              onClick={() => navigate("Admin")}
            >
              Admin
            </button>
          )}


          {!roleLoading &&
            isOwner &&
            OWNER_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={
                  activeSection === item.id
                    ? "active owner-nav-button"
                    : "owner-nav-button"
                }
                type="button"
                aria-current={
                  activeSection === item.id ? "page" : undefined
                }
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
        </nav>


        <div className="top-actions">
          {showSearch && (
            <>
              <label
                className="visually-hidden"
                htmlFor="site-search"
              >
                Search catalog
              </label>


              <input
                id="site-search"
                className="search-input"
                type="search"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </>
          )}


          <button
            className="wallet-balance"
            type="button"
            onClick={() => navigate("Wallet")}
            title="Open your wallet and payment history"
            aria-label={`${walletLabel}. Open wallet`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 13px",
              border: "1px solid rgba(148,163,184,.3)",
              borderRadius: "999px",
              background: "rgba(15,23,42,.85)",
              color: "#e2e8f0",
              fontSize: ".9rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">👛</span>
            <span role="status">{walletLabel}</span>
          </button>


          <div className="profile-menu">
            <button
              className="profile-button"
              type="button"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
            >
              <span>{username}</span>
              <span aria-hidden="true">
                {profileOpen ? "▲" : "▼"}
              </span>
            </button>


            {profileOpen && (
              <div className="profile-dropdown">
                <button
                  type="button"
                  onClick={() => navigate("Profile")}
                >
                  Profile
                </button>


                <button
                  type="button"
                  onClick={() => navigate("Wallet")}
                >
                  Wallet
                </button>


                <button
                  type="button"
                  onClick={() => navigate("Settings")}
                >
                  Settings
                </button>


                <button
                  className="dropdown-logout"
                  type="button"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>


      {roleError && (
        <div className="content-section">
          <p className="notice error" role="alert">
            Could not read your account role: {roleError}
          </p>
        </div>
      )}


      {sessionError && (
        <div className="content-section">
          <p className="notice error" role="alert">
            {sessionError}
          </p>
        </div>
      )}


      {activeSection === "Home" && (
        <HomeSection
          email={email}
          cartItemCount={cartCount}
          onNavigate={navigate}
        />
      )}


      {activeSection === "Media" && (
        <section className="content-section">
          <div className="empty-state">
            <h2>Unavailable</h2>
            <p>This section is temporarily unavailable.</p>
          </div>
        </section>
      )}


      {activeSection === "Games" && (
        <GamesSection search={search} />
      )}


      {activeSection === "Shop" && (
        <ShopSection
          search={search}
          onOpenCart={() => navigate("Cart")}
          onCartChange={refreshCartCount}
        />
      )}


      {activeSection === "Subscriptions" && (
        <SubscriptionsSection />
      )}


      {activeSection === "Wallet" && <WalletSection />}


      {activeSection === "Settings" && (
        <SettingsSection
          email={email}
          isAdmin={isAdmin}
          isOwner={isOwner}
          onOpenWallet={() => navigate("Wallet")}
          onOpenSubscriptions={() => navigate("Subscriptions")}
          handleLogout={handleLogout}
        />
      )}


      {activeSection === "Cart" && (
        <CartSection onCartChange={refreshCartCount} />
      )}


      {activeSection === "Library" && (
        <LibrarySection search={search} />
      )}


      {activeSection === "Profile" && (
        <ProfileSection
          email={email}
          isAdmin={isAdmin}
          isOwner={isOwner}
          handleLogout={handleLogout}
          onOpenSubscriptions={() => navigate("Subscriptions")}
          onOpenSettings={() => navigate("Settings")}
          onOpenWallet={() => navigate("Wallet")}
        />
      )}


      {activeSection === "Admin" && isAdmin && (
        <AdminContentPage onBack={() => navigate("Home")} />
      )}


      {activeSection === "Admin" && !roleLoading && !isAdmin && (
        <AccessRequired title="Administrator access required">
          Your account is not authorized to open the admin area.
        </AccessRequired>
      )}


      {activeSection === "Owner" && isOwner && <OwnerUsersPage />}


      {activeSection === "Owner" && !roleLoading && !isOwner && (
        <AccessRequired title="Owner access required">
          Only the website owner can manage users and permissions.
        </AccessRequired>
      )}


      {activeSection === "ProductStudio" && isOwner && (
        <ProductStudioPage />
      )}


      {activeSection === "ProductStudio" &&
        !roleLoading &&
        !isOwner && (
          <AccessRequired title="Owner access required">
            Only the website owner can create paid products.
          </AccessRequired>
        )}


      {activeSection === "SubscriptionStudio" && isOwner && (
        <SubscriptionStudioPage />
      )}


      {activeSection === "SubscriptionStudio" &&
        !roleLoading &&
        !isOwner && (
          <AccessRequired title="Owner access required">
            Only the website owner can manage subscription plans.
          </AccessRequired>
        )}


      <footer className="app-footer">
        <span>© {new Date().getFullYear()} Sivilization</span>
        <span>
          Games, products, and memberships in one place.
        </span>
      </footer>
    </main>
  );
}


export default function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");


  useEffect(() => {
    let alive = true;


    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;


        if (error) setStartupError(error.message);
        setSession(data?.session ?? null);
      })
      .catch((error) => {
        if (alive) {
          setStartupError(
            error?.message || "Could not read the login session.",
          );
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });


    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) setSession(nextSession);
    });


    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);


  if (loading) {
    return (
      <main className="app-loading" role="status">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <p>Connecting to Supabase…</p>
      </main>
    );
  }


  if (startupError && !session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark" aria-hidden="true">
            !
          </div>


          <p className="eyebrow">Supabase connection</p>
          <h1>Could not start your session</h1>
          <p className="auth-subtitle">{startupError}</p>


          <p className="setup-hint">
            Check the Supabase URL and publishable/anon key in
            .env.local, then restart Vite.
          </p>


          <button
            className="button button-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </section>
      </main>
    );
  }


  if (session) {
    return (
      <AppShell
        key={session.user.id}
        user={session.user}
      />
    );
  }


  if (showLogin) {
    return (
      <>
        <button
          type="button"
          className="back-button"
          onClick={() => setShowLogin(false)}
          style={{ margin: "20px" }}
        >
          ← Back to website
        </button>


        <AuthPage />
      </>
    );
  }


  return (
    <PublicSite
      onLogin={() => setShowLogin(true)}
      businessName="Sivilization"
      supportEmail="sivilization.support@gmail.com"
      termsUrl="/terms.html"
      privacyUrl="/privacy.html"
      refundsUrl="/refunds.html"
    />
  );
}