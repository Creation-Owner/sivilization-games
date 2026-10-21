export default function AdminDashboard({
  onOpenFilmStudio,
  onOpenGameStudio,
  onOpenProductStudio,
  onOpenSubscriptionStudio,
}) {
  return (
    <section className="content-section admin-dashboard-section">
      <div className="section-heading">
        <p className="eyebrow">Admin</p>
        <h1>Admin dashboard</h1>
        <p>
          Manage Sivilization content. Use the studios below to create and
          edit films, games, shop products and membership plans.
        </p>
      </div>

      <div className="admin-dashboard-grid">
        <button
          className="admin-dashboard-card"
          type="button"
          onClick={onOpenFilmStudio}
        >
          <div className="admin-dashboard-card-icon">🎬</div>
          <div>
            <h2>Film Studio</h2>
            <p>
              Create and manage films, cartoons and dramas for the Media
              section.
            </p>
          </div>
        </button>

        <button
          className="admin-dashboard-card"
          type="button"
          onClick={onOpenGameStudio}
        >
          <div className="admin-dashboard-card-icon">🎮</div>
          <div>
            <h2>Game Studio</h2>
            <p>
              Publish and manage games that appear in the Games section.
            </p>
          </div>
        </button>

        <button
          className="admin-dashboard-card"
          type="button"
          onClick={onOpenProductStudio}
        >
          <div className="admin-dashboard-card-icon">🛍️</div>
          <div>
            <h2>Product Studio</h2>
            <p>
              Manage shop products: add, edit and publish items for the Store.
            </p>
          </div>
        </button>

        <button
          className="admin-dashboard-card"
          type="button"
          onClick={onOpenSubscriptionStudio}
        >
          <div className="admin-dashboard-card-icon">♛</div>
          <div>
            <h2>Subscription Studio</h2>
            <p>
              Create and manage membership plans for the Subscriptions section.
            </p>
          </div>
        </button>
      </div>
    </section>
  );
}