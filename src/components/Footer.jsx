export default function Footer({ demoMode = false, onNavigate }) {
  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const currentYear = new Date().getFullYear();

  function openTermsPrivacy() {
    onNavigate("TermsPrivacy");
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="site-footer-logo">S</div>

          <div>
            <h2>Sivilization Shop</h2>
            <p>
              Stories, games, collectibles and creative worlds made to explore.
            </p>
          </div>
        </div>

        <div className="site-footer-links">
          <div>
            <h3>Explore</h3>

            <button type="button" onClick={() => onNavigate("Home")}>
              Home
            </button>

            <button type="button" onClick={() => onNavigate("Media")}>
              Films
            </button>

            <button type="button" onClick={() => onNavigate("Games")}>
              Games
            </button>

            <button type="button" onClick={() => onNavigate("Shop")}>
              Shop
            </button>
          </div>

          <div>
            <h3>Account</h3>

            <button type="button" onClick={() => onNavigate("Library")}>
              Library
            </button>

            <button
              type="button"
              onClick={() => onNavigate("Subscriptions")}
            >
              Subscriptions
            </button>

            <button type="button" onClick={() => onNavigate("Profile")}>
              Profile
            </button>

            <button type="button" onClick={openTermsPrivacy}>
              Terms & Privacy
            </button>
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="site-footer-demo-note">
          Developer demo mode is active. Local sample data only—no real
          payment, membership, or Supabase content is being used.
        </div>
      )}

      <div className="site-footer-bottom">
        <p>© {currentYear} Sivilization Shop. All rights reserved.</p>

        <button type="button" onClick={scrollToTop}>
          Back to top ↑
        </button>
      </div>
    </footer>
  );
}