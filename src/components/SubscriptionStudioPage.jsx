import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const emptyPlan = {
  name: "",
  slug: "",
  priceUsd: "",
  currency: "USD",
  billingInterval: "month",
  featuresText: "",
  isActive: true,
  createPaddlePrice: true,
  paddlePriceId: "",
};

function makeSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function featuresToText(features) {
  if (Array.isArray(features)) {
    return features.join("\n");
  }

  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);

      if (Array.isArray(parsed)) {
        return parsed.join("\n");
      }
    } catch {
      return features;
    }
  }

  return "";
}

function textToFeatures(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function SubscriptionStudioPage() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const isEditing = Boolean(editingId);

  const pricePreview = useMemo(() => {
    const value = Number(form.priceUsd || 0);

    if (!Number.isFinite(value) || value <= 0) {
      return "$0.00";
    }

    return `$${value.toFixed(2)}`;
  }, [form.priceUsd]);

  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  async function loadPlans() {
    setLoading(true);

    const { data, error } = await supabase
      .from("subscription_plans")
      .select(`
        id,
        name,
        slug,
        price_cents,
        currency,
        billing_interval,
        features,
        is_active,
        paddle_price_id,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      showMessage(error.message, "error");
      setPlans([]);
    } else {
      setPlans(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  function resetForm() {
    setForm(emptyPlan);
    setEditingId(null);
    showMessage("");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleNameChange(value) {
    setForm((current) => ({
      ...current,
      name: value,
      slug:
        current.slug === "" ||
        current.slug === makeSlug(current.name)
          ? makeSlug(value)
          : current.slug,
    }));
  }

  function startEdit(plan) {
    setEditingId(plan.id);

    setForm({
      name: plan.name || "",
      slug: plan.slug || "",
      priceUsd: (
        Number(plan.price_cents || 0) / 100
      ).toFixed(2),
      currency: plan.currency || "USD",
      billingInterval: plan.billing_interval || "month",
      featuresText: featuresToText(plan.features),
      isActive: plan.is_active === true,
      createPaddlePrice: false,
      paddlePriceId: plan.paddle_price_id || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function createPaddlePrice(planInput) {
    const { data, error } = await supabase.functions.invoke(
      "create-paddle-subscription-price",
      {
        body: {
          name: planInput.name,
          slug: planInput.slug,
          price_cents: planInput.price_cents,
          currency: planInput.currency,
          billing_interval: planInput.billing_interval,
        },
      }
    );

    if (error) {
      throw new Error(
        error.message ||
          "Could not create the Paddle recurring price."
      );
    }

    if (!data?.priceId) {
      throw new Error(
        data?.error ||
          "Paddle did not return a recurring price ID."
      );
    }

    return data.priceId;
  }

  async function handleSave(event) {
    event.preventDefault();
    showMessage("");

    const name = form.name.trim();
    const slug = makeSlug(form.slug);
    const priceUsd = Number(form.priceUsd || 0);
    const paddlePriceId = form.paddlePriceId.trim();

    if (!name) {
      showMessage("Enter a plan name.", "error");
      return;
    }

    if (!slug) {
      showMessage("Enter a valid plan key.", "error");
      return;
    }

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      showMessage(
        "Enter a subscription price greater than $0.00.",
        "error"
      );
      return;
    }

    if (!form.createPaddlePrice && !paddlePriceId) {
      showMessage(
        "Create a Paddle price automatically or paste an existing Paddle recurring price ID.",
        "error"
      );
      return;
    }

    setSaving(true);

    try {
      let finalPaddlePriceId = paddlePriceId;

      if (form.createPaddlePrice) {
        finalPaddlePriceId = await createPaddlePrice({
          name,
          slug,
          price_cents: Math.round(priceUsd * 100),
          currency: form.currency || "USD",
          billing_interval: form.billingInterval,
        });
      }

      const planData = {
        name,
        slug,
        price_cents: Math.round(priceUsd * 100),
        currency: form.currency || "USD",
        billing_interval: form.billingInterval,
        features: textToFeatures(form.featuresText),
        is_active: form.isActive,
        paddle_price_id: finalPaddlePriceId,
      };

      let error;

      if (editingId) {
        ({ error } = await supabase
          .from("subscription_plans")
          .update(planData)
          .eq("id", editingId));
      } else {
        ({ error } = await supabase
          .from("subscription_plans")
          .insert(planData));
      }

      if (error) {
        throw error;
      }

      showMessage(
        editingId
          ? "Subscription plan updated."
          : "Subscription plan created and connected to Paddle.",
        "success"
      );

      resetForm();
      loadPlans();
    } catch (error) {
      console.error("Save subscription plan failed:", error);

      showMessage(
        [
          error?.message,
          error?.details,
          error?.hint,
          error?.code ? `Code: ${error.code}` : "",
        ]
          .filter(Boolean)
          .join(" — ") || "Could not save the subscription plan.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan) {
    const confirmed = window.confirm(
      `Delete the "${plan.name}" subscription plan?`
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("id", plan.id);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    showMessage("Subscription plan deleted.", "success");

    if (editingId === plan.id) {
      resetForm();
    }

    loadPlans();
  }

  return (
    <section className="admin-tools-page">
      <header className="admin-dashboard-header">
        <div>
          <p className="eyebrow">OWNER AND ADMIN TOOLS</p>

          <h1>Subscription Studio</h1>

          <p>
            Create customer memberships that appear automatically
            on the public Subscriptions page.
          </p>
        </div>
      </header>

      <section className="admin-upload-panel">
        <div className="admin-upload-header">
          <div>
            <p className="eyebrow">
              {isEditing
                ? "EDIT MEMBERSHIP"
                : "CREATE MEMBERSHIP"}
            </p>

            <h2>
              {isEditing
                ? "Update subscription plan"
                : "New subscription plan"}
            </h2>

            <p>
              Enter prices in dollars. Sivilization stores the value
              safely as cents.
            </p>
          </div>

          <span className="admin-badge">
            {isEditing ? "Editing" : "New plan"}
          </span>
        </div>

        <form className="admin-upload-form" onSubmit={handleSave}>
          <div className="admin-form-section">
            <div className="admin-section-title">
              <span>01</span>

              <div>
                <h3>Plan information</h3>
                <p>
                  Name, price, renewal period, and included
                  benefits.
                </p>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>
                  Plan name <b>*</b>
                </span>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    handleNameChange(event.target.value)
                  }
                  placeholder="Premium Monthly"
                  disabled={saving}
                  required
                />
              </label>

              <label className="admin-field">
                <span>
                  Plan key <b>*</b>
                </span>

                <input
                  type="text"
                  value={form.slug}
                  onChange={(event) =>
                    updateField("slug", event.target.value)
                  }
                  placeholder="premium-monthly"
                  disabled={saving}
                  required
                />

                <small>
                  Used internally. Example: premium-monthly
                </small>
              </label>

              <label className="admin-field">
                <span>
                  Price in USD <b>*</b>
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.priceUsd}
                  onChange={(event) =>
                    updateField("priceUsd", event.target.value)
                  }
                  placeholder="9.99"
                  disabled={saving}
                  required
                />

                <small>
                  Customer sees {pricePreview}; database saves cents.
                </small>
              </label>

              <label className="admin-field">
                <span>Billing period</span>

                <select
                  value={form.billingInterval}
                  onChange={(event) =>
                    updateField(
                      "billingInterval",
                      event.target.value
                    )
                  }
                  disabled={saving}
                >
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </label>

              <label className="admin-field">
                <span>Currency</span>

                <select
                  value={form.currency}
                  onChange={(event) =>
                    updateField("currency", event.target.value)
                  }
                  disabled={saving}
                >
                  <option value="USD">USD — US Dollar</option>
                </select>
              </label>

              <label className="admin-field">
                <span>Public status</span>

                <select
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) =>
                    updateField(
                      "isActive",
                      event.target.value === "active"
                    )
                  }
                  disabled={saving}
                >
                  <option value="active">
                    Active — visible to customers
                  </option>
                  <option value="inactive">
                    Inactive — hidden from customers
                  </option>
                </select>
              </label>

              <label className="admin-field admin-field-wide">
                <span>Paddle price</span>

                <select
                  value={
                    form.createPaddlePrice
                      ? "automatic"
                      : "manual"
                  }
                  onChange={(event) =>
                    updateField(
                      "createPaddlePrice",
                      event.target.value === "automatic"
                    )
                  }
                  disabled={saving}
                >
                  <option value="automatic">
                    Create Paddle product and recurring price
                    automatically
                  </option>

                  <option value="manual">
                    I already have a Paddle recurring price ID
                  </option>
                </select>

                <small>
                  Automatic creation requires the secure Supabase
                  Edge Function `create-paddle-subscription-price`.
                </small>
              </label>

              {!form.createPaddlePrice && (
                <label className="admin-field admin-field-wide">
                  <span>
                    Paddle recurring price ID <b>*</b>
                  </span>

                  <input
                    type="text"
                    value={form.paddlePriceId}
                    onChange={(event) =>
                      updateField(
                        "paddlePriceId",
                        event.target.value
                      )
                    }
                    placeholder="pri_..."
                    disabled={saving}
                    required
                  />

                  <small>
                    Paste the Paddle price ID that starts with
                    `pri_`.
                  </small>
                </label>
              )}

              <label className="admin-field admin-field-wide">
                <span>Plan features</span>

                <textarea
                  value={form.featuresText}
                  onChange={(event) =>
                    updateField(
                      "featuresText",
                      event.target.value
                    )
                  }
                  placeholder={
                    "All subscription films\nNew releases\nWatch on any device"
                  }
                  rows={5}
                  disabled={saving}
                />

                <small>Enter one feature per line.</small>
              </label>
            </div>
          </div>

          <div className="admin-upload-footer">
            <p className="admin-required-note">
              <b>*</b> Required fields
            </p>

            <div className="admin-dashboard-actions">
              {isEditing && (
                <button
                  className="outline-action"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel editing
                </button>
              )}

              <button
                className="admin-upload-button"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : isEditing
                    ? "Save changes"
                    : "Create plan"}
              </button>
            </div>
          </div>

          {message && (
            <p
              className={`admin-upload-message ${messageType}`}
              role={messageType === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </form>
      </section>

      <section className="admin-dashboard-list">
        <div className="media-row-heading">
          <div>
            <p className="eyebrow">CREATED MEMBERSHIPS</p>
            <h2>Subscription plans</h2>
          </div>
        </div>

        {loading ? (
          <p className="media-status">
            Loading subscription plans…
          </p>
        ) : plans.length === 0 ? (
          <div className="empty-state">
            <h3>No subscription plans yet</h3>
            <p>
              Create a plan above. It will appear publicly when its
              status is Active.
            </p>
          </div>
        ) : (
          <div className="plans-list">
            {plans.map((plan) => (
              <article className="plan-card" key={plan.id}>
                <div className="plan-header">
                  <div>
                    <p className="eyebrow">
                      {plan.is_active
                        ? "PUBLIC PLAN"
                        : "HIDDEN PLAN"}
                    </p>

                    <h3>{plan.name}</h3>

                    <p>
                      {formatPrice(
                        plan.price_cents,
                        plan.currency || "USD"
                      )}
                      {" / "}
                      {plan.billing_interval}
                    </p>

                    <p>
                      Key:{" "}
                      <code>{plan.slug || "not set"}</code>
                    </p>

                    <p>
                      Paddle:{" "}
                      {plan.paddle_price_id ? (
                        <code>{plan.paddle_price_id}</code>
                      ) : (
                        "Not connected"
                      )}
                    </p>
                  </div>

                  <span className="admin-badge">
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="plan-actions">
                  <button
                    className="outline-action"
                    type="button"
                    onClick={() => startEdit(plan)}
                  >
                    Edit
                  </button>

                  <button
                    className="admin-delete-button"
                    type="button"
                    onClick={() => handleDelete(plan)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}