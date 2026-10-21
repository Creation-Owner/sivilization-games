import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function SettingsSection({
  email = "",
  isAdmin = false,
  isOwner = false,
  onOpenWallet,
  onOpenSubscriptions,
  handleLogout,
}) {
  const [sendingReset, setSendingReset] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handlePasswordReset() {
    if (sendingReset) return;

    setMessage("");
    setError("");

    if (!email) {
      setError("Your account email is unavailable.");
      return;
    }

    setSendingReset(true);

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });

      if (resetError) throw resetError;

      setMessage(
        "Password-reset email requested. Check your inbox and spam folder.",
      );
    } catch (resetError) {
      setError(
        resetError?.message ||
          "Could not send the password-reset email.",
      );
    } finally {
      setSendingReset(false);
    }
  }

  const cardStyle = {
    padding: "24px",
    border: "1px solid rgba(148,163,184,.25)",
    borderRadius: "18px",
    background: "rgba(15,23,42,.6)",
  };

  const actionsStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "16px",
  };

  return (
    <section className="section-page settings-page">
      <header style={{ marginBottom: "24px" }}>
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Settings</h1>
        <p>Manage your account, wallet, and membership.</p>
      </header>

      <div style={{ display: "grid", gap: "20px" }}>
        <section style={cardStyle}>
          <h2>Account information</h2>

          <p>
            Email: <span>{email || "Unavailable"}</span>
          </p>

          <p>
            Account type:{" "}
            {isOwner
              ? "Owner"
              : isAdmin
                ? "Administrator"
                : "Customer"}
          </p>
        </section>

        <section style={cardStyle}>
          <h2>Security</h2>

          <p>
            Request an email to start resetting your password.
          </p>

          <button
            className="media-watch-button"
            type="button"
            onClick={handlePasswordReset}
            disabled={sendingReset || !email}
          >
            {sendingReset
              ? "Sending…"
              : "Send password-reset email"}
          </button>

          <p style={{ color: "#94a3b8", marginTop: "12px" }}>
            Completing a password reset also requires a password
            recovery screen on your website.
          </p>

          {message && <p role="status">{message}</p>}

          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section style={cardStyle}>
          <h2>Wallet and membership</h2>

          <p>
            View your balance, wallet payments, and subscription
            options.
          </p>

          <div style={actionsStyle}>
            <button
              className="media-watch-button"
              type="button"
              onClick={onOpenWallet}
            >
              Open wallet
            </button>

            <button
              className="media-watch-button"
              type="button"
              onClick={onOpenSubscriptions}
            >
              View memberships
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2>Session</h2>
          <p>Sign out of this browser.</p>

          <button
            className="danger-button"
            type="button"
            onClick={handleLogout}
          >
            Log out
          </button>
        </section>
      </div>
    </section>
  );
}