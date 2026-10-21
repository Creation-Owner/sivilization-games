import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

function formatCurrency(cents, currency = "USD") {
  const amount = Number(cents);

  if (!Number.isFinite(amount)) return "Unavailable";

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value) {
  if (!value) return "Unknown date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTransactionTitle(payment) {
  const metadata = payment.metadata || {};

  return (
    metadata.film_title ||
    metadata.game_title ||
    metadata.product_title ||
    "Wallet payment"
  );
}

function getTransactionType(paymentType) {
  const labels = {
    film_buy: "Film purchase",
    film_rent: "Film rental",
    game: "Game purchase",
    product: "Product purchase",
  };

  return labels[paymentType] || "Wallet payment";
}

function getStatusLabel(status) {
  const value = String(status || "unknown");

  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = {
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  balanceCard: {
    padding: "24px",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: "20px",
    background:
      "linear-gradient(135deg, rgba(37,99,235,.2), rgba(124,58,237,.15))",
    marginBottom: "28px",
  },
  balance: {
    margin: "12px 0",
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 700,
  },
  muted: {
    color: "#94a3b8",
    lineHeight: 1.6,
  },
  historyHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "16px",
  },
  tableContainer: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "16px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "680px",
    textAlign: "left",
  },
  cell: {
    padding: "16px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
    verticalAlign: "top",
  },
  status: {
    display: "inline-block",
    padding: "4px 9px",
    borderRadius: "999px",
    background: "rgba(148, 163, 184, 0.15)",
    fontSize: "0.85rem",
  },
  empty: {
    padding: "32px 20px",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "16px",
    textAlign: "center",
  },
};

export default function WalletSection() {
  const [balanceCents, setBalanceCents] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balanceError, setBalanceError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const requestVersion = useRef(0);
  const reloadRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadWallet() {
      const version = ++requestVersion.current;

      setLoading(true);
      setBalanceError("");
      setHistoryError("");

      function isCurrent() {
        return active && version === requestVersion.current;
      }

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error(
            "Please sign in to view your wallet.",
          );
        }

        const [profileResult, paymentsResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("wallet_balance_cents")
              .eq("id", user.id)
              .single(),

            supabase
              .from("payments")
              .select(
                "id,payment_type,amount_cents,currency,status,metadata,created_at",
              )
              .eq("user_id", user.id)
              .contains("metadata", {
                payment_method: "wallet",
              })
              .order("created_at", { ascending: false })
              .limit(100),
          ]);

        if (!isCurrent()) return;

        if (profileResult.error) {
          setBalanceCents(null);
          setBalanceError(profileResult.error.message);
        } else {
          const value =
            profileResult.data?.wallet_balance_cents;

          if (
            value == null ||
            !Number.isFinite(Number(value))
          ) {
            setBalanceCents(null);
            setBalanceError(
              "Your wallet balance is unavailable.",
            );
          } else {
            setBalanceCents(Number(value));
          }
        }

        if (paymentsResult.error) {
          setPayments([]);
          setHistoryError(paymentsResult.error.message);
        } else {
          setPayments(paymentsResult.data || []);
        }

        setLastUpdated(new Date());
      } catch (error) {
        if (!isCurrent()) return;

        setBalanceCents(null);
        setPayments([]);

        const message =
          error?.message || "Could not load your wallet.";

        setBalanceError(message);
        setHistoryError(message);
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    }

    reloadRef.current = loadWallet;

    function handleAuthChange() {
      // Clear data immediately when the account changes.
      requestVersion.current += 1;
      setBalanceCents(null);
      setPayments([]);
      setLastUpdated(null);
      void loadWallet();
    }

    loadWallet();

    window.addEventListener("wallet-updated", loadWallet);
    window.addEventListener("focus", loadWallet);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Schedule database reads outside the auth callback.
      window.setTimeout(() => {
        if (active) handleAuthChange();
      }, 0);
    });

    return () => {
      active = false;
      requestVersion.current += 1;
      reloadRef.current = null;

      window.removeEventListener(
        "wallet-updated",
        loadWallet,
      );
      window.removeEventListener("focus", loadWallet);

      subscription.unsubscribe();
    };
  }, []);

  function handleRefresh() {
    // Refresh both this page and the App.jsx header balance.
    window.dispatchEvent(new Event("wallet-updated"));
  }

  return (
    <section className="section-page wallet-page">
      <header style={styles.heading}>
        <div>
          <p className="eyebrow">YOUR ACCOUNT CREDIT</p>
          <h1>Your wallet</h1>
          <p style={styles.muted}>
            View your available balance and recent wallet
            payments.
          </p>
        </div>

        <button
          className="media-watch-button"
          type="button"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh wallet"}
        </button>
      </header>

      <section
        style={styles.balanceCard}
        aria-labelledby="wallet-balance-heading"
      >
        <p
          id="wallet-balance-heading"
          className="eyebrow"
        >
          AVAILABLE BALANCE
        </p>

        <div style={styles.balance} role="status">
          {loading && balanceCents === null
            ? "Loading…"
            : balanceError
              ? "Unavailable"
              : balanceCents === null
                ? "Unavailable"
                : formatCurrency(balanceCents)}
        </div>

        {balanceError ? (
          <p
            className="media-status media-error"
            role="alert"
          >
            {balanceError}
          </p>
        ) : (
          <p style={styles.muted}>
            Use your wallet credit for eligible films,
            rentals, games, and products.
          </p>
        )}

        {lastUpdated && (
          <p style={styles.muted}>
            Last checked: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </section>

      <section aria-labelledby="wallet-history-heading">
        <div style={styles.historyHeading}>
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h2 id="wallet-history-heading">
              Wallet payment history
            </h2>
          </div>

          {!historyError && !loading && (
            <span style={styles.muted}>
              {payments.length} payment
              {payments.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <p style={styles.muted}>
          Shows up to your 100 most recent wallet payments.
          This list does not include Paddle payments or a
          complete credit/top-up ledger.
        </p>

        {loading && (
          <p className="media-status" role="status">
            Loading wallet activity…
          </p>
        )}

        {historyError && (
          <p
            className="media-status media-error"
            role="alert"
          >
            Could not load wallet history: {historyError}
          </p>
        )}

        {!loading &&
          !historyError &&
          payments.length === 0 && (
            <div style={styles.empty}>
              <h3>No wallet payments yet</h3>
              <p style={styles.muted}>
                Payments made using your wallet will appear
                here.
              </p>
            </div>
          )}

        {!historyError && payments.length > 0 && (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <caption className="visually-hidden">
                Recent wallet payments
              </caption>

              <thead>
                <tr>
                  <th scope="col" style={styles.cell}>
                    Item
                  </th>
                  <th scope="col" style={styles.cell}>
                    Date
                  </th>
                  <th scope="col" style={styles.cell}>
                    Amount
                  </th>
                  <th scope="col" style={styles.cell}>
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td style={styles.cell}>
                      <div>
                        {getTransactionTitle(payment)}
                      </div>

                      <small style={styles.muted}>
                        {getTransactionType(
                          payment.payment_type,
                        )}
                      </small>

                      <div
                        style={{
                          ...styles.muted,
                          fontSize: "0.75rem",
                          marginTop: "6px",
                          overflowWrap: "anywhere",
                        }}
                      >
                        ID: {payment.id}
                      </div>
                    </td>

                    <td style={styles.cell}>
                      {formatDate(payment.created_at)}
                    </td>

                    <td
                      style={{
                        ...styles.cell,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatCurrency(
                        payment.amount_cents,
                        payment.currency,
                      )}
                    </td>

                    <td style={styles.cell}>
                      <span style={styles.status}>
                        {getStatusLabel(payment.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}