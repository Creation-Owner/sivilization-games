import { useMemo } from "react";

function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPrice(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function OrdersSection({
  demoMode = false,
  orders = [],
  onNavigateToShop,
}) {
  const totalSpent = useMemo(() => {
    return orders.reduce((total, order) => {
      return total + Number(order.total || 0);
    }, 0);
  }, [orders]);

  return (
    <section className="content-section orders-section">
      <div className="section-heading">
        <p className="eyebrow">Sivilization Shop</p>
        <h1>Order history</h1>
        <p>
          Review your purchases, order status and digital items in one place.
        </p>
      </div>

      {demoMode && (
        <div className="demo-content-note">
          Demo orders only. No payment has been processed and no real purchase
          has been created.
        </div>
      )}

      {orders.length === 0 ? (
        <div className="empty-state orders-empty-state">
          <div className="empty-cart-icon">📦</div>
          <h2>No orders yet</h2>
          <p>Your completed orders will appear here.</p>

          <button
            className="continue-shopping-button"
            type="button"
            onClick={onNavigateToShop}
          >
            Browse the shop
          </button>
        </div>
      ) : (
        <>
          <div className="orders-summary">
            <div>
              <span>Total orders</span>
              <strong>{orders.length}</strong>
            </div>

            <div>
              <span>Total spent</span>
              <strong>{formatPrice(totalSpent)}</strong>
            </div>
          </div>

          <div className="orders-list">
            {orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card-header">
                  <div>
                    <span className="order-label">Order</span>
                    <h2>#{order.id.slice(-8).toUpperCase()}</h2>
                    <p>{formatDate(order.created_at)}</p>
                  </div>

                  <span className="order-status">{order.status || "Paid"}</span>
                </div>

                <div className="order-items">
                  {(order.items || []).map((item) => (
                    <div className="order-item" key={`${order.id}-${item.id}`}>
                      <img
                        src={item.image || "/favicon.svg"}
                        alt={item.title}
                      />

                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.quantity} × {formatPrice(item.price)}
                        </span>
                      </div>

                      <strong>
                        {formatPrice(
                          Number(item.price || 0) * Number(item.quantity || 0)
                        )}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="order-card-footer">
                  <span>
                    {order.items?.reduce(
                      (total, item) => total + Number(item.quantity || 0),
                      0
                    ) || 0}{" "}
                    items
                  </span>

                  <strong>Total {formatPrice(order.total)}</strong>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}