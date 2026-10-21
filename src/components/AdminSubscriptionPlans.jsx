import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function AdminSubscriptionPlans({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyPlan = {
    plan_key: "",
    name: "",
    price_cents: 0,
    currency: "USD",
    interval: "month",
    features: ["Feature 1", "Feature 2"],
    is_active: true,
    sort_order: 0,
  };

  useEffect(() => {
    async function loadPlans() {
      setLoading(true);
      setError("");

      const { data, error: plansError } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });

      if (plansError) {
        setError(plansError.message);
        setPlans([]);
        setLoading(false);
        return;
      }

      setPlans(data || []);
      setLoading(false);
    }

    loadPlans();
  }, []);

  async function handleSavePlan(plan) {
    setSaving(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in.");
      setSaving(false);
      return;
    }

    // Upsert by plan_key
    const { data, error: upsertError } = await supabase
      .from("subscription_plans")
      .upsert(
        {
          plan_key: plan.plan_key,
          name: plan.name,
          price_cents: Number(plan.price_cents) || 0,
          currency: plan.currency || "USD",
          interval: plan.interval || "month",
          features: Array.isArray(plan.features) ? plan.features : [],
          is_active: Boolean(plan.is_active),
          sort_order: Number(plan.sort_order) || 0,
        },
        {
          onConflict: "plan_key",
        },
      )
      .select()
      .single();

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setPlans((prev) => {
      const others = prev.filter((p) => p.plan_key !== data.plan_key);
      const updated = [...others, data].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      return updated;
    });

    setEditingPlan(null);
    setSaving(false);
  }

  async function handleDeletePlan(planKey) {
    const confirmed = window.confirm(
      `Delete plan "${planKey}"? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("plan_key", planKey);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setPlans((prev) =>
      prev.filter((p) => p.plan_key !== planKey).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    );

    if (editingPlan?.plan_key === planKey) {
      setEditingPlan(null);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <section className="admin-subscription-plans-page section-page">
        <button className="back-button" type="button" onClick={onBack}>
          ← Back to Admin
        </button>
        <h1>Subscription Plans</h1>
        <p>Loading plans…</p>
      </section>
    );
  }

  return (
    <section className="admin-subscription-plans-page section-page">
      <button className="back-button" type="button" onClick={onBack}>
        ← Back to Admin
      </button>

      <h1>Subscription Plans</h1>

      {error && <p className="media-status media-error">{error}</p>}

      <div className="admin-plans-layout">
        <aside className="admin-plans-list">
          <h2>Existing plans</h2>

          {plans.length === 0 ? (
            <p>No subscription plans yet.</p>
          ) : (
            <ul className="admin-plan-items">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className={`admin-plan-item ${
                    editingPlan?.plan_key === plan.plan_key ? "selected" : ""
                  }`}
                  onClick={() => setEditingPlan({ ...plan, features: plan.features || [] })}
                >
                  <div>
                    <strong>{plan.name}</strong>
                    <div className="admin-plan-meta">
                      <span>{plan.plan_key}</span>
                      <span>
                        ${(plan.price_cents / 100).toFixed(2)} / {plan.interval}
                      </span>
                      <span>{plan.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            className="media-watch-button"
            type="button"
            onClick={() => setEditingPlan({ ...emptyPlan })}
            disabled={saving}
          >
            Add new plan
          </button>
        </aside>

        <div className="admin-plan-editor">
          {!editingPlan ? (
            <p>Select a plan to edit or create a new one.</p>
          ) : (
            <>
              <h2>
                {editingPlan.plan_key ? "Edit plan" : "New plan"}
              </h2>

              <form
                className="admin-plan-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSavePlan(editingPlan);
                }}
              >
                <label>Plan key (e.g. basic, premium)</label>
                <input
                  type="text"
                  value={editingPlan.plan_key}
                  onChange={(e) =>
                    setEditingPlan((p) => ({
                      ...p,
                      plan_key: e.target.value.trim().toLowerCase(),
                    }))
                  }
                  required
                  disabled={saving}
                />

                <label>Display name</label>
                <input
                  type="text"
                  value={editingPlan.name}
                  onChange={(e) =>
                    setEditingPlan((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                  disabled={saving}
                />

                <label>Price (cents)</label>
                <input
                  type="number"
                  value={editingPlan.price_cents}
                  onChange={(e) =>
                    setEditingPlan((p) => ({
                      ...p,
                      price_cents: Number(e.target.value),
                    }))
                  }
                  min={0}
                  required
                  disabled={saving}
                />

                <label>Currency</label>
                <input
                  type="text"
                  value={editingPlan.currency}
                  onChange={(e) =>
                    setEditingPlan((p) => ({
                      ...p,
                      currency: e.target.value.trim() || "USD",
                    }))
                  }
                  disabled={saving}
                />

                <label>Billing interval</label>
                <select
                  value={editingPlan.interval}
                  onChange={(e) =>
                    setEditingPlan((p) => ({ ...p, interval: e.target.value }))
                  }
                  disabled={saving}
                >
                  <option value="month">month</option>
                  <option value="year">year</option>
                  <option value="week">week</option>
                </select>

                <label>Sort order</label>
                <input
                  type="number"
                  value={editingPlan.sort_order}
                  onChange={(e) =>
                    setEditingPlan((p) => ({
                      ...p,
                      sort_order: Number(e.target.value),
                    }))
                  }
                  min={0}
                  disabled={saving}
                />

                <label>Active</label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_active}
                    onChange={(e) =>
                      setEditingPlan((p) => ({
                        ...p,
                        is_active: e.target.checked,
                      }))
                    }
                    disabled={saving}
                  />
                  <span>This plan is active</span>
                </label>

                <label>Features (one per line)</label>
                <textarea
                  rows={6}
                  value={(editingPlan.features || []).join("\n")}
                  onChange={(e) =>
                    setEditingPlan((p) => ({
                      ...p,
                      features: e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean),
                    }))
                  }
                  disabled={saving}
                />

                <div className="admin-plan-actions">
                  <button
                    className="media-watch-button"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save plan"}
                  </button>

                  {editingPlan.plan_key && (
                    <button
                      className="media-list-button"
                      type="button"
                      onClick={() => handleDeletePlan(editingPlan.plan_key)}
                      disabled={saving}
                    >
                      Delete plan
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default AdminSubscriptionPlans;