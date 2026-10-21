import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function PasswordRecoveryPage({ onComplete, onCancel }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setMessageType("");

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      setMessageType("error");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPassword("");
      setConfirmPassword("");
      setMessage("Your password has been updated.");
      setMessageType("success");

      window.setTimeout(() => onComplete?.(), 900);
    } catch (error) {
      setMessage(error?.message || "Could not update your password.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Account recovery</p>
        <h1>Set a new password</h1>
        <p className="auth-subtitle">
          Choose a new password for your Sivilization account.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="recovery-password">New password</label>
          <input
            id="recovery-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={loading}
          />

          <label htmlFor="recovery-confirm">Confirm new password</label>
          <input
            id="recovery-confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            disabled={loading}
          />

          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        {message && (
          <p className={`notice ${messageType}`} role={messageType === "error" ? "alert" : "status"}>
            {message}
          </p>
        )}

        {onCancel && (
          <button
            className="text-button reset-link"
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            Back to sign in
          </button>
        )}
      </section>
    </main>
  );
}