import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

function formatDate(value) {
  if (!value) return "None";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString();
}

function formatMoney(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

function parseAmountCents(value) {
  const text = String(value ?? "").trim();

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter an amount such as 5 or 5.50.");
  }

  const [whole, fraction = ""] = text.split(".");
  const cents =
    Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (
    !Number.isSafeInteger(cents) ||
    cents < 1 ||
    cents > 100000
  ) {
    throw new Error("Enter an amount between $0.01 and $1,000.00.");
  }

  return cents;
}

function parseDays(value) {
  const text = String(value ?? "").trim();

  if (!/^\d+$/.test(text)) {
    throw new Error("Enter a whole number of days.");
  }

  const days = Number(text);

  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new Error("Enter between 1 and 365 days.");
  }

  return days;
}

function validateReason(value) {
  const reason = String(value ?? "").trim();

  if (reason.length < 3 || reason.length > 500) {
    throw new Error("Enter a reason containing 3 to 500 characters.");
  }

  return reason;
}

export default function OwnerUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");

  const [pendingRequest, setPendingRequest] = useState(null);
  const pendingRequestRef = useRef(null);
  const requestInFlight = useRef(false);

  const loadUsers = useCallback(async () => {
    const { data: userRows, error: userError } = await supabase.rpc(
      "get_all_users",
    );

    if (userError) throw userError;

    const { data: accessRows, error: accessError } = await supabase
      .from("owner_complimentary_access")
      .select("user_id,expires_at");

    if (accessError) throw accessError;

    const expiryByUser = new Map(
      (accessRows || []).map((row) => [
        row.user_id,
        row.expires_at,
      ]),
    );

    return (userRows || []).map((user) => ({
      ...user,
      complimentary_expires_at: expiryByUser.get(user.id) ?? null,
    }));
  }, []);

  useEffect(() => {
    let alive = true;

    async function initialize() {
      try {
        const loadedUsers = await loadUsers();

        if (alive) setUsers(loadedUsers);
      } catch (loadError) {
        if (alive) {
          setUsers([]);
          setError(loadError?.message || "Could not load users.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    initialize();

    return () => {
      alive = false;
    };
  }, [loadUsers]);

  function rememberRequest(request) {
    pendingRequestRef.current = request;
    setPendingRequest(request);
  }

  async function executeRequest(request) {
    if (requestInFlight.current) return false;

    requestInFlight.current = true;
    setBusyId(request.targetUserId);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        request.rpc,
        request.arguments,
      );

      if (rpcError) throw rpcError;

      if (data?.user_id !== request.targetUserId) {
        throw new Error("The server returned an unexpected user.");
      }

      if (request.kind === "wallet") {
        if (!Number.isSafeInteger(data.wallet_balance_cents)) {
          throw new Error("The server returned an invalid wallet balance.");
        }

        setUsers((current) =>
          current.map((user) =>
            user.id === request.targetUserId
              ? {
                  ...user,
                  wallet_balance_cents: data.wallet_balance_cents,
                }
              : user,
          ),
        );

        setMessage(
          data.duplicate
            ? "The credit was already processed. Balance confirmed."
            : "Store credit added successfully.",
        );
      } else {
        if (
          typeof data.complimentary_expires_at !== "string" ||
          Number.isNaN(Date.parse(data.complimentary_expires_at))
        ) {
          throw new Error("The server returned an invalid access expiry.");
        }

        setUsers((current) =>
          current.map((user) =>
            user.id === request.targetUserId
              ? {
                  ...user,
                  complimentary_expires_at:
                    data.complimentary_expires_at,
                }
              : user,
          ),
        );

        setMessage(
          data.duplicate
            ? "The access grant was already processed. Expiration confirmed."
            : "Complimentary access extended successfully.",
        );
      }

      rememberRequest(null);
      return true;
    } catch (actionError) {
      setError(
        `${actionError?.message || "The operation failed."} ` +
          'Use "Retry pending request" to retry the exact same operation.',
      );

      return false;
    } finally {
      requestInFlight.current = false;
      setBusyId(null);
    }
  }

  async function startRequest(kind, user, value, reasonValue) {
    if (requestInFlight.current) return false;

    if (pendingRequestRef.current) {
      setError(
        "Resolve the pending request before starting another operation.",
      );
      return false;
    }

    setError("");
    setMessage("");

    try {
      const reason = validateReason(reasonValue);
      const requestId = crypto.randomUUID();

      let request;

      if (kind === "wallet") {
        const amountCents = parseAmountCents(value);

        request = {
          kind,
          rpc: "owner_add_wallet_credit",
          targetUserId: user.id,
          label: `${formatMoney(amountCents)} credit for ${
            user.email || user.id
          }`,
          arguments: {
            p_target_user_id: user.id,
            p_amount_cents: amountCents,
            p_request_id: requestId,
            p_reason: reason,
          },
        };
      } else {
        const days = parseDays(value);

        request = {
          kind,
          rpc: "owner_extend_access",
          targetUserId: user.id,
          label: `${days} complimentary days for ${
            user.email || user.id
          }`,
          arguments: {
            p_target_user_id: user.id,
            p_days: days,
            p_request_id: requestId,
            p_reason: reason,
          },
        };
      }

      rememberRequest(request);
      return await executeRequest(request);
    } catch (validationError) {
      setError(validationError?.message || "Check the entered values.");
      return false;
    }
  }

  async function toggleAdmin(user) {
    if (requestInFlight.current) return;

    setBusyId(user.id);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "owner_set_admin_role",
        {
          p_target_user_id: user.id,
          p_make_admin: !user.is_admin,
        },
      );

      if (error) throw error;

      setUsers((current) =>
        current.map((existingUser) =>
          existingUser.id === user.id
            ? {
                ...existingUser,
                is_admin: data.is_admin,
              }
            : existingUser,
        ),
      );

      setMessage(
        data.unchanged
          ? "Admin role was already set as requested."
          : data.is_admin
            ? "User promoted to administrator."
            : "Administrator role removed.",
      );
    } catch (actionError) {
      setError(
        actionError?.message || "Could not change administrator role.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const term = search.trim().toLowerCase();

  const filteredUsers = users.filter(
    (user) =>
      !term ||
      String(user.email || "").toLowerCase().includes(term) ||
      String(user.full_name || "").toLowerCase().includes(term) ||
      String(user.id || "").toLowerCase().includes(term),
  );

  const actionsDisabled = busyId !== null || pendingRequest !== null;

  return (
    <section className="section-page owner-page">
      <header className="owner-header">
        <div>
          <p className="eyebrow">OWNER CONTROL</p>
          <h1>User management</h1>
          <p>
            Manage administrator roles, add internal store credit, and
            grant complimentary access. These actions do not charge a
            customer or change Paddle billing.
          </p>
        </div>
      </header>

      <input
        className="search-input owner-search"
        type="search"
        aria-label="Search users"
        placeholder="Search by email address or user ID"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {pendingRequest && (
        <section className="notice" aria-label="Pending owner action">
          <p>
            Pending request: {pendingRequest.label}
          </p>

          <p>
            Request ID: {pendingRequest.arguments.p_request_id}
          </p>

          <p>
            If a network error occurred, the operation may already have
            completed. Retrying this request will reuse its original ID.
          </p>

          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => {
              const request = pendingRequestRef.current;
              if (request) void executeRequest(request);
            }}
          >
            {busyId !== null ? "Processing…" : "Retry pending request"}
          </button>

          <p>
            Do not refresh or leave this page while the result is
            uncertain. This pending request is held in memory only.
          </p>
        </section>
      )}

      {loading && (
        <p className="media-status" role="status">
          Loading users…
        </p>
      )}

      {!loading && !error && filteredUsers.length === 0 && (
        <div className="empty-library">
          <h2>No users found</h2>
          <p>Try a different email address or user ID.</p>
        </div>
      )}

      <div className="owner-user-list">
        {filteredUsers.map((user) => (
          <OwnerUserCard
            key={user.id}
            user={user}
            disabled={actionsDisabled}
            processing={busyId === user.id}
            onToggleAdmin={() => toggleAdmin(user)}
            onAddMoney={(target, amount, reason) =>
              startRequest("wallet", target, amount, reason)
            }
            onAddAccess={(target, days, reason) =>
              startRequest("access", target, days, reason)
            }
          />
        ))}
      </div>
    </section>
  );
}

function OwnerUserCard({
  user,
  disabled,
  processing,
  onToggleAdmin,
  onAddMoney,
  onAddAccess,
}) {
  const [moneyAmount, setMoneyAmount] = useState("");
  const [subscriptionDays, setSubscriptionDays] = useState("");
  const [reason, setReason] = useState("");

  return (
    <article className="owner-user-card">
      <div className="owner-user-main">
        <h3>
          {user.full_name?.trim() || "No name set"}
        </h3>

        <p className="owner-user-email">
          {user.email || "No email available"}
        </p>

        <p className="owner-user-id">ID: {user.id}</p>

        <div className="owner-user-badges">
          {user.is_owner && <span className="owner-badge">Owner</span>}
          {user.is_admin && <span className="admin-badge">Admin</span>}

          {!user.is_admin && !user.is_owner && (
            <span className="customer-badge">Customer</span>
          )}
        </div>

        <p>
          Wallet: <strong>{formatMoney(user.wallet_balance_cents)}</strong>
        </p>

        <p>
          Profile subscription expiry:{" "}
          <strong>{formatDate(user.subscription_expires_at)}</strong>
        </p>

        <p>
          Complimentary access expiry:{" "}
          <strong>{formatDate(user.complimentary_expires_at)}</strong>
        </p>

        <p>
          Last sign-in:{" "}
          <strong>{formatDate(user.last_sign_in_at)}</strong>
        </p>

        <p>
          Email confirmed:{" "}
          <strong>{user.email_confirmed_at ? "Yes" : "No"}</strong>
        </p>

        <p>
          Joined: <strong>{formatDate(user.created_at)}</strong>
        </p>
      </div>

      <div className="owner-user-actions">
        <button
          type="button"
          onClick={() => onToggleAdmin(user)}
          disabled={disabled || user.is_owner}
        >
          {user.is_admin ? "Remove admin" : "Make admin"}
        </button>

        <label htmlFor={`owner-reason-${user.id}`}>
          Reason for credit or access grant
        </label>

        <input
          id={`owner-reason-${user.id}`}
          type="text"
          minLength={3}
          maxLength={500}
          placeholder="For example: customer support credit"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={disabled}
        />

        <div className="owner-inline-form">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Credit amount for ${user.email || user.id}`}
            placeholder="Amount in USD"
            value={moneyAmount}
            onChange={(event) => setMoneyAmount(event.target.value)}
            disabled={disabled}
          />

          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              const success = await onAddMoney(
                user,
                moneyAmount,
                reason,
              );

              if (success) {
                setMoneyAmount("");
                setReason("");
              }
            }}
          >
            {processing ? "Processing…" : "Add store credit"}
          </button>
        </div>

        <div className="owner-inline-form">
          <input
            type="number"
            min="1"
            max="365"
            step="1"
            aria-label={`Complimentary days for ${user.email || user.id}`}
            placeholder="Days"
            value={subscriptionDays}
            onChange={(event) => setSubscriptionDays(event.target.value)}
            disabled={disabled}
          />

          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              const success = await onAddAccess(
                user,
                subscriptionDays,
                reason,
              );

              if (success) {
                setSubscriptionDays("");
                setReason("");
              }
            }}
          >
            {processing ? "Processing…" : "Add complimentary access"}
          </button>
        </div>
      </div>
    </article>
  );
}