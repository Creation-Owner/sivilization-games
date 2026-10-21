import { useState } from "react";
import { supabase } from "../supabaseClient";

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

function TestCheckoutPage({ checkout, onCancel, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!checkout?.plan || !checkout?.subscriptionId || !checkout?.sessionId) {
    return (
      <section className="section-page">
        <div className="membership-empty">
          <h1>Checkout not available</h1>
          <p>Please choose a subscription plan again.</p>

          <button type="button" onClick={onCancel}>
            Return to subscriptions
          </button>
        </div>
      </section>
    );
  }

  async function handleCompletePayment() {
    setLoading(true);
    setMessage("");

    try {
      const now = new Date();
      const endsAt = new Date(
        now.getTime() +
          (Number(checkout.plan.duration_days) || 30) *
            24 *
            60 *
            60 *
            1000,
      );

      const { error: subscriptionError } = await supabase
        .from("user_subscriptions")
        .update({
          payment_status: "paid",
          is_active: true,
          started_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          purchased_at: now.toISOString(),
          cancel_at_period_end: false,
          cancelled_at: null,
        })
        .eq("id", checkout.subscriptionId);

      if (subscriptionError) {
        throw subscriptionError;
      }

      const { error: sessionError } = await supabase
        .from("checkout_sessions")
        .update({
          status: "paid",
          completed_at: now.toISOString(),
        })
        .eq("id", checkout.sessionId);

      if (sessionError) {
        throw sessionError;
      }

      onComplete();
    } catch (error) {
      console.error("Test payment failed:", error);
      setMessage(error.message || "Could not complete test payment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-page checkout-page">
      <div className="checkout-card">
        <p className="eyebrow">TEST CHECKOUT</p>

        <h1>Confirm your subscription</h1>

        <div className="checkout-summary">
          <div>
            <span>Plan</span>
            <strong>{checkout.plan.name}</strong>
          </div>

          <div>
            <span>Duration</span>
            <strong>{checkout.plan.duration_days} days</strong>
          </div>

          <div>
            <span>Total</span>
            <strong>{formatCurrency(checkout.plan.price_cents)}</strong>
          </div>
        </div>

        <p className="checkout-note">
          This is a test payment page. No real money will be charged.
        </p>

        <div className="checkout-actions">
          <button
            className="checkout-cancel-button"
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className="checkout-complete-button"
            type="button"
            onClick={handleCompletePayment}
            disabled={loading}
          >
            {loading ? "Completing payment..." : "Complete test payment"}
          </button>
        </div>

        {message && (
          <p className="membership-message" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

export default TestCheckoutPage;