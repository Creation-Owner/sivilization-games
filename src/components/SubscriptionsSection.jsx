import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { buyItem } from "../paddle";

function formatPrice(priceCents, currency = "USD") {
  const amount = Number(priceCents || 0) / 100;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatInterval(interval) {
  const normalized = String(interval || "month").toLowerCase();

  if (normalized === "year" || normalized === "yearly") {
    return "year";
  }

  if (normalized === "week" || normalized === "weekly") {
    return "week";
  }

  return "month";
}

function normalizeFeatures(features) {
  if (Array.isArray(features)) {
    return features.filter(Boolean);
  }

  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      return features
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function isSubscriptionActive(subscription) {
  if (!subscription) {
    return false;
  }

  const activeStatuses = ["active", "trialing", "past_due"];

  if (!activeStatuses.includes(subscription.status)) {
    return false;
  }

  if (!subscription.ends_at) {
    return true;
  }

  return new Date(subscription.ends_at) > new Date();
}

export default function SubscriptionsSection() {
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPage() {
    setLoading(true);
    setError("");

    const [
      { data: userResult, error: userError },
      { data: plansResult, error: plansError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("subscription_plans")
        .select(`
          id,
          slug,
          name,
          price_cents,
          currency,
          billing_interval,
          features,
          is_active,
          paddle_price_id
        `)
        .eq("is_active", true)
        .order("price_cents", { ascending: true }),
    ]);

    if (userError) {
      setError(userError.message);
      setLoading(false);
      return;
    }

    const currentUser = userResult.user ?? null;

    setUser(currentUser);

    if (plansError) {
      setError((previous) => previous || plansError.message);
      setPlans([]);
    } else {
      setPlans(plansResult || []);
    }

    if (currentUser) {
      const {
        data: subscriptionResult,
        error: subscriptionError,
      } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          plan_id,
          plan_slug,
          paddle_subscription_id,
          status,
          ends_at,
          created_at,
          updated_at,
          subscription_plans (
            id,
            name,
            slug,
            billing_interval
          )
        `)
        .eq("user_id", currentUser.id)
        .in("status", ["active", "trialing", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) {
        setError(
          (previous) => previous || subscriptionError.message
        );
      } else {
        setSubscription(
          isSubscriptionActive(subscriptionResult)
            ? subscriptionResult
            : null
        );
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPage();
  }, []);

  const hasActiveSubscription = isSubscriptionActive(subscription);

  function getCurrentPlanName() {
    if (!subscription) {
      return "Membership";
    }

    if (subscription.subscription_plans?.name) {
      return subscription.subscription_plans.name;
    }

    const matchingPlan = plans.find(
      (plan) =>
        plan.id === subscription.plan_id ||
        plan.slug === subscription.plan_slug
    );

    return (
      matchingPlan?.name ||
      subscription.plan_slug ||
      "Membership"
    );
  }

  async function handleSubscribe(plan) {
    setError("");
    setNotice("");

    if (!user) {
      setError("Log in before starting a membership.");
      return;
    }

    if (hasActiveSubscription) {
      setError(
        "You already have an active membership. Manage it through your Paddle customer portal."
      );
      return;
    }

    if (!plan.paddle_price_id) {
      setError(
        `${plan.name} does not have a Paddle recurring price connected yet.`
      );
      return;
    }

    setCheckoutPlanId(plan.id);

    try {
      await buyItem({
        priceId: plan.paddle_price_id,
        customData: {
          user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          payment_type: "subscription",
        },
      });

      setNotice(
        "Checkout opened. Your membership will appear after Paddle confirms the subscription."
      );
    } catch (checkoutError) {
      console.error(
        "Paddle subscription checkout error:",
        checkoutError
      );

      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open Paddle Checkout."
      );
    } finally {
      setCheckoutPlanId(null);
    }
  }

  if (loading) {
    return (
      <section className="subscriptions-page section-page">
        <header className="subscriptions-page-header">
          <p className="eyebrow">SUBSCRIPTIONS</p>
          <h1>Memberships</h1>
        </header>

        <p className="media-status">
          Loading membership plans…
        </p>
      </section>
    );
  }

  return (
    <section className="subscriptions-page section-page">
      <header className="subscriptions-page-header">
        <p className="eyebrow">SUBSCRIPTIONS</p>

        <h1>Choose your membership</h1>

        <p>
          Subscribe to unlock all free films and every film marked
          as subscription-only while your plan remains active.
        </p>
      </header>

      {error && (
        <p className="media-status media-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="media-status" role="status">
          {notice}
        </p>
      )}

      {hasActiveSubscription ? (
        <section className="subscription-status-card">
          <p className="eyebrow">ACTIVE MEMBERSHIP</p>

          <h2>{getCurrentPlanName()}</h2>

          <p>
            Status: <strong>{subscription.status}</strong>
          </p>

          {subscription.ends_at && (
            <p>
              Access until:{" "}
              <strong>
                {new Date(
                  subscription.ends_at
                ).toLocaleDateString()}
              </strong>
            </p>
          )}

          <p className="subscription-status-copy">
            Your membership is active. You can watch free films and
            all subscription-only films included in your plan.
          </p>

          <button
            className="outline-action"
            type="button"
            onClick={loadPage}
          >
            Refresh membership status
          </button>
        </section>
      ) : plans.length === 0 ? (
        <section className="subscription-status-card">
          <p className="eyebrow">MEMBERSHIPS</p>

          <h2>No memberships available</h2>

          <p>
            An administrator has not published any active
            subscription plans yet. Please check again later.
          </p>
        </section>
      ) : (
        <div className="subscription-plans-grid">
          {plans.map((plan) => {
            const features = normalizeFeatures(plan.features);
            const isOpeningCheckout = checkoutPlanId === plan.id;
            const hasPaddlePrice = Boolean(plan.paddle_price_id);

            return (
              <article
                className="subscription-plan-card"
                key={plan.id}
              >
                <p className="eyebrow">MEMBERSHIP PLAN</p>

                <h2>{plan.name}</h2>

                <p className="subscription-price">
                  {formatPrice(
                    plan.price_cents,
                    plan.currency || "USD"
                  )}

                  <span>
                    {" "}
                    / {formatInterval(plan.billing_interval)}
                  </span>
                </p>

                {features.length > 0 ? (
                  <ul className="subscription-features">
                    {features.map((feature, index) => (
                      <li key={`${plan.id}-${index}`}>
                        {feature}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subscription-empty-features">
                    Includes access to all films marked as
                    subscription-only.
                  </p>
                )}

                <button
                  className="media-watch-button"
                  type="button"
                  onClick={() => handleSubscribe(plan)}
                  disabled={isOpeningCheckout || !hasPaddlePrice}
                >
                  {!hasPaddlePrice
                    ? "Paddle price needed"
                    : isOpeningCheckout
                      ? "Opening checkout…"
                      : `Subscribe to ${plan.name}`}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}