import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";


function formatPrice(cents) {
  const value = Number(cents);


  if (!Number.isFinite(value) || value <= 0) {
    return "Price unavailable";
  }


  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}


function getPriceLabel(item) {
  if (item.access_type === "free") return "Free";


  if (item.access_type === "subscription") {
    return "Membership required";
  }


  return formatPrice(item.price_cents);
}


function CatalogSection({
  id,
  title,
  description,
  items,
  error,
  loading,
  onLogin,
}) {
  const safeItems = Array.isArray(items) ? items : [];


  return (
    <section id={id} className="public-section">
      <div className="public-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>


      {loading && <p role="status">Loading catalogue…</p>}


      {error && (
        <p className="notice error" role="alert">
          Could not load this catalogue. Please try again later.
        </p>
      )}


      {!loading && !error && safeItems.length === 0 && (
        <p>No published items are currently listed.</p>
      )}


      <div className="public-grid">
        {safeItems.map((item) => (
          <article className="public-card" key={item.id}>
            <p className="public-category">
              {item.category ||
                item.genre ||
                item.platform ||
                title}
            </p>


            <h3>{item.title}</h3>


            <p>
              {item.description ||
                "More information will be added to this listing."}
            </p>


            <p className="public-price">
              {getPriceLabel(item)}
            </p>


            <button
              className="public-button"
              type="button"
              onClick={onLogin}
            >
              Sign in to view or purchase
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}


export default function PublicSite({
  onLogin,
  businessName = "Sivilization",
  supportEmail = "",
  termsUrl = "",
  privacyUrl = "",
  refundsUrl = "",
}) {
  const [games, setGames] = useState([]);
  const [products, setProducts] = useState([]);


  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({
    games: false,
    products: false,
  });


  useEffect(() => {
    let active = true;


    async function loadCatalogue() {
      setLoading(true);


      try {
        const [gameResult, productResult] =
          await Promise.all([
            supabase
              .from("games")
              .select(
                "id,title,description,genre,platform,access_type,price_cents",
              )
              .eq("is_published", true)
              .order("created_at", { ascending: false })
              .limit(12),


            supabase
              .from("products")
              .select(
                "id,title,description,category,price_cents",
              )
              .eq("is_published", true)
              .order("created_at", { ascending: false })
              .limit(12),
          ]);


        if (!active) return;


        setGames(
          gameResult.error ? [] : gameResult.data || [],
        );


        setProducts(
          productResult.error ? [] : productResult.data || [],
        );


        setErrors({
          games: Boolean(gameResult.error),
          products: Boolean(productResult.error),
        });


        if (gameResult.error) {
          console.error("Public games:", gameResult.error);
        }


        if (productResult.error) {
          console.error("Public products:", productResult.error);
        }
      } catch (error) {
        console.error("Public catalogue failed:", error);


        if (active) {
          setErrors({
            games: true,
            products: true,
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }


    loadCatalogue();


    return () => {
      active = false;
    };
  }, []);


  const policyLinks = [
    { label: "Terms of Service", href: termsUrl },
    { label: "Privacy Policy", href: privacyUrl },
    { label: "Refund Policy", href: refundsUrl },
  ].filter((link) => link.href);


  return (
    <div className="public-site">
      <style>{`
        .public-site {
          min-height: 100vh;
          background: #081221;
          color: #e2e8f0;
          font-family: inherit;
        }


        .public-site * {
          box-sizing: border-box;
        }


        .public-site a {
          color: #93c5fd;
        }


        .public-header,
        .public-main,
        .public-footer {
          width: min(1180px, 100%);
          margin: 0 auto;
          padding: 24px;
        }


        .public-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          border-bottom: 1px solid #263449;
        }


        .public-brand {
          color: #f8fafc !important;
          font-size: 1.35rem;
          font-weight: 700;
          text-decoration: none;
        }


        .public-nav,
        .public-actions,
        .public-footer-links {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }


        .public-nav a {
          text-decoration: none;
        }


        .public-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 18px;
          border: 1px solid #5379ef;
          border-radius: 12px;
          background: #315ce0;
          color: white !important;
          font: inherit;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }


        .public-button-secondary {
          background: transparent;
          border-color: #53647c;
        }


        .public-hero {
          padding: 64px 0;
          max-width: 850px;
        }


        .public-hero h1 {
          margin: 12px 0 20px;
          font-size: clamp(2rem, 6vw, 3.8rem);
          line-height: 1.1;
        }


        .public-hero p,
        .public-section p,
        .public-footer p {
          line-height: 1.7;
          color: #bcc9dc;
        }


        .public-section {
          padding: 32px 0;
          scroll-margin-top: 20px;
        }


        .public-section-heading {
          margin-bottom: 24px;
        }


        .public-section h2 {
          color: #f8fafc;
          font-size: 1.8rem;
          margin-bottom: 10px;
        }


        .public-grid {
          display: grid;
          grid-template-columns:
            repeat(auto-fit, minmax(min(260px, 100%), 1fr));
          gap: 20px;
        }


        .public-card {
          display: flex;
          flex-direction: column;
          padding: 24px;
          border: 1px solid #293a52;
          border-radius: 18px;
          background: #101d30;
          overflow-wrap: anywhere;
        }


        .public-card h3 {
          color: #f8fafc;
          font-size: 1.25rem;
          margin: 8px 0;
        }


        .public-category {
          color: #93c5fd !important;
          margin: 0;
          font-size: .85rem;
        }


        .public-price {
          color: #f8fafc !important;
          font-weight: 700;
        }


        .public-detail {
          font-size: .875rem;
        }


        .public-card .public-button {
          margin-top: auto;
        }


        .public-info {
          padding: 24px;
          border: 1px solid #293a52;
          border-radius: 18px;
          background: #101d30;
        }


        .public-footer {
          border-top: 1px solid #263449;
          margin-top: 32px;
        }


        .public-site button:focus-visible,
        .public-site a:focus-visible {
          outline: 3px solid #93c5fd;
          outline-offset: 4px;
        }


        @media (max-width: 600px) {
          .public-header,
          .public-main,
          .public-footer {
            padding: 18px;
          }


          .public-hero {
            padding: 40px 0;
          }
        }
      `}</style>


      <header className="public-header">
        <a className="public-brand" href="#home">
          {businessName}
        </a>


        <nav className="public-nav" aria-label="Public navigation">
          <a href="#games">Games</a>
          <a href="#products">Products</a>
          <a href="#contact">Contact</a>


          <button
            className="public-button"
            type="button"
            onClick={onLogin}
          >
            Log in / Sign up
          </button>
        </nav>
      </header>


      <main className="public-main" id="home">
        <section className="public-hero">
          <p>WELCOME TO {businessName.toUpperCase()}</p>


          <h1>Download and play independent games.</h1>


          <p>
            Browse downloadable Windows and Android games and
            digital products. Sign in to purchase eligible items,
            manage your wallet, and access your library.
          </p>


          <div className="public-actions">
            <a className="public-button" href="#games">
              Explore games
            </a>


            <button
              className="public-button public-button-secondary"
              type="button"
              onClick={onLogin}
            >
              Access your account
            </button>
          </div>
        </section>


        <section className="public-section">
          <div className="public-info">
            <h2>How game purchases work</h2>


            <p>
              Each game listing shows its access type and price.
              Depending on the listing, a game may be delivered as
              a private download or through an external link.
            </p>


            <p>
              Review each product’s description and purchase
              details before paying. Sign-in is required for
              purchases and account-specific content.
            </p>
          </div>
        </section>


        <CatalogSection
          id="games"
          title="Games"
          description="Explore the published games catalogue."
          items={games}
          error={errors.games}
          loading={loading}
          onLogin={onLogin}
        />


        <CatalogSection
          id="products"
          title="Products"
          description="Review product descriptions and listed prices."
          items={products}
          error={errors.products}
          loading={loading}
          onLogin={onLogin}
        />


        <section id="contact" className="public-section">
          <div className="public-info">
            <h2>Contact and support</h2>


            {supportEmail ? (
              <p>
                For product questions or purchase assistance,
                contact{" "}
                <a href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </p>
            ) : (
              <p>
                Customer-support contact information has not
                been configured.
              </p>
            )}
          </div>
        </section>
      </main>


      <footer className="public-footer">
        <p>
          © {new Date().getFullYear()} {businessName}
        </p>


        <nav
          className="public-footer-links"
          aria-label="Legal policies"
        >
          {policyLinks.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}