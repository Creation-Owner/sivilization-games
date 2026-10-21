export default function HomeSection({
  email = "",
  cartItemCount = 0,
  onNavigate,
}) {
  const username = email ? email.split("@")[0] : "Creator";

  return (
    <section className="content-section home-section">
      <div className="home-hero">
        <div className="home-hero-content">
          <p className="eyebrow">Welcome to Sivilization</p>
          <h1>
            Stories, games and worlds
            <span>made for you.</span>
          </h1>
          <p>
            Welcome back, {username}. Explore films, discover games, and find
            new additions to the Sivilization collection.
          </p>

          <div className="home-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => onNavigate?.("Media")}
            >
              Explore media
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onNavigate?.("Shop")}
            >
              Visit shop
            </button>
          </div>
        </div>

        <div className="home-art" aria-hidden="true">
          <div className="home-orbit orbit-one" />
          <div className="home-orbit orbit-two" />
          <div className="home-planet">S</div>
          <span className="home-star star-one">✦</span>
          <span className="home-star star-two">✦</span>
          <span className="home-star star-three">✦</span>
        </div>
      </div>

      <div className="home-shortcuts">
        <button
          className="home-shortcut"
          type="button"
          onClick={() => onNavigate?.("Library")}
        >
          <span className="shortcut-icon" aria-hidden="true">▣</span>
          <span>
            <strong>My library</strong>
            <small>View films you’ve saved</small>
          </span>
          <span className="shortcut-arrow" aria-hidden="true">→</span>
        </button>

        <div className="home-shortcut home-shortcut-static">
          <span className="shortcut-icon" aria-hidden="true">🛒</span>
          <span>
            <strong>{cartItemCount} items in cart</strong>
            <small>Checkout is not configured</small>
          </span>
        </div>

        <button
          className="home-shortcut"
          type="button"
          onClick={() => onNavigate?.("Games")}
        >
          <span className="shortcut-icon" aria-hidden="true">🎮</span>
          <span>
            <strong>Explore games</strong>
            <small>Browse published titles</small>
          </span>
          <span className="shortcut-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <div className="home-quick-links">
        <article className="home-quick-card">
          <span aria-hidden="true">▶</span>
          <h2>Watch</h2>
          <p>Browse published films, cartoons, and dramas.</p>
          <button type="button" onClick={() => onNavigate?.("Media")}>
            Browse media <span aria-hidden="true">→</span>
          </button>
        </article>

        <article className="home-quick-card">
          <span aria-hidden="true">🎮</span>
          <h2>Play</h2>
          <p>Discover games from Sivilization studios.</p>
          <button type="button" onClick={() => onNavigate?.("Games")}>
            Explore games <span aria-hidden="true">→</span>
          </button>
        </article>

        <article className="home-quick-card">
          <span aria-hidden="true">🛍️</span>
          <h2>Shop</h2>
          <p>Explore products from the Sivilization collection.</p>
          <button type="button" onClick={() => onNavigate?.("Shop")}>
            Visit shop <span aria-hidden="true">→</span>
          </button>
        </article>
      </div>
    </section>
  );
}