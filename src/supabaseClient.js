import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function hasValidSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const parsedUrl = new URL(supabaseUrl);
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

const STORAGE_KEY = "sivilization_mock_db_v1";
const SESSION_KEY = "sivilization_mock_session_v1";

const INITIAL_DB = {
  profiles: [
    {
      id: "owner-user-001",
      email: "owner@sivilization.shop",
      full_name: "Sivilization Owner",
      is_admin: true,
      is_owner: true,
      wallet_balance_cents: 15000,
      subscription_expires_at: "2027-12-31T23:59:59.000Z",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: "2026-10-26T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  games: [
    {
      id: "game-001",
      title: "Starfall Odyssey",
      description:
        "Command an orbital fleet across uncharted star systems in a tactical sci-fi adventure.",
      genre: "Strategy",
      platform: "Windows",
      version: "1.4.2",
      access_type: "free",
      is_paid: false,
      price_cents: 0,
      delivery_type: "url",
      external_url: "https://example.com/starfall-odyssey",
      game_path: null,
      cover_path: null,
      game_storage_provider: "supabase",
      game_bucket: "games",
      is_published: true,
      created_at: "2026-10-10T12:00:00.000Z",
    },
    {
      id: "game-002",
      title: "Neon Drift: Cyber Circuit",
      description:
        "High-speed synthwave arcade racer with precision drift physics and custom time trials.",
      genre: "Racing",
      platform: "Windows",
      version: "2.1.0",
      access_type: "paid",
      is_paid: true,
      price_cents: 1499,
      delivery_type: "upload",
      external_url: null,
      game_path: "packages/neon-drift.zip",
      cover_path: null,
      game_storage_provider: "r2",
      game_bucket: "games",
      is_published: true,
      created_at: "2026-10-12T15:30:00.000Z",
    },
    {
      id: "game-003",
      title: "Chronicles of Aethelgard",
      description:
        "Explore hand-crafted dungeons, forge relics, and uncover ancient lore in this action RPG.",
      genre: "RPG",
      platform: "Android",
      version: "1.0.8",
      access_type: "free",
      is_paid: false,
      price_cents: 0,
      delivery_type: "url",
      external_url: "https://example.com/aethelgard",
      game_path: null,
      cover_path: null,
      game_storage_provider: "supabase",
      game_bucket: "games",
      is_published: true,
      created_at: "2026-10-15T09:15:00.000Z",
    },
  ],
  products: [
    {
      id: "prod-001",
      title: "Sivilization Creator Soundtrack Pack",
      name: "Sivilization Creator Soundtrack Pack",
      description:
        "24 lossless ambient and synthwave tracks licensed for games, streams, and creative projects.",
      category: "Digital Audio",
      price: 19.99,
      price_cents: 1999,
      image_url: "",
      image_path: "",
      is_published: true,
      paddle_price_id: "pri_mock_soundtrack_001",
      created_at: "2026-10-08T10:00:00.000Z",
    },
    {
      id: "prod-002",
      title: "Pixel & Vector UI Asset Kit",
      name: "Pixel & Vector UI Asset Kit",
      description:
        "Over 400 HUD icons, dialog frames, and sci-fi interface components for indie developers.",
      category: "Game Assets",
      price: 12.0,
      price_cents: 1200,
      image_url: "",
      image_path: "",
      is_published: true,
      paddle_price_id: "pri_mock_uikit_002",
      created_at: "2026-10-11T14:20:00.000Z",
    },
    {
      id: "prod-003",
      title: "Worldbuilder Lore Companion Artbook",
      name: "Worldbuilder Lore Companion Artbook",
      description:
        "Digital 120-page illustrated concept artbook featuring the worlds and characters of Sivilization.",
      category: "Digital Book",
      price: 9.5,
      price_cents: 950,
      image_url: "",
      image_path: "",
      is_published: true,
      paddle_price_id: "pri_mock_artbook_003",
      created_at: "2026-10-14T18:00:00.000Z",
    },
  ],
  films: [
    {
      id: "film-001",
      title: "Beyond the Event Horizon",
      description:
        "A deep-space documentary drama following the first crewed mission to a binary pulsar.",
      genre: "Sci-Fi",
      release_year: 2026,
      duration: "1h 52m",
      rating: 8.9,
      access_type: "free",
      is_paid: false,
      price_cents: 0,
      is_published: true,
      created_at: "2026-10-05T11:00:00.000Z",
    },
  ],
  subscription_plans: [
    {
      id: "plan-001",
      slug: "creator-monthly",
      plan_key: "creator-monthly",
      name: "Sivilization Pass Monthly",
      description: "Full access to membership films, game betas, and monthly digital drops.",
      price_cents: 999,
      currency: "USD",
      billing_interval: "month",
      interval: "month",
      duration_days: 30,
      features: [
        "All subscription-only films and shorts",
        "Early access to new Sivilization game builds",
        "Member-only digital soundtrack & art drops",
      ],
      is_active: true,
      is_published: true,
      sort_order: 1,
      paddle_price_id: "pri_mock_sub_monthly",
      created_at: "2026-10-01T00:00:00.000Z",
    },
  ],
  subscriptions: [],
  user_subscriptions: [],
  sandbox_game_purchases: [],
  product_purchases: [],
  payments: [],
  owner_complimentary_access: [],
  product_favorites: [],
  cart_items: [],
  library_items: [],
  checkout_sessions: [],
};

function loadDb() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...INITIAL_DB, ...parsed };
    }
  } catch {
    // Ignore storage errors
  }
  return structuredClone(INITIAL_DB);
}

function saveDb(db) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage errors
  }
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function createMockSupabaseClient() {
  console.warn(
    "[AI Studio] Supabase env vars not configured — using local mock database."
  );

  let db = loadDb();
  let currentSession = loadSession();
  const authListeners = new Set();

  function notifyAuth(event, session) {
    for (const listener of authListeners) {
      try {
        listener(event, session);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function ensureUserProfile(user) {
    let profile = db.profiles.find((p) => p.id === user.id || p.email === user.email);
    if (!profile) {
      profile = {
        id: user.id,
        email: user.email,
        full_name: user.email ? user.email.split("@")[0] : "Creator",
        is_admin: true,
        is_owner: true,
        wallet_balance_cents: 5000,
        subscription_expires_at: null,
        email_confirmed_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      db.profiles.push(profile);
      saveDb(db);
    }
    return profile;
  }

  function hydrateRelations(table, rows, selectQuery = "") {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row) => {
      const copy = { ...row };
      if (table === "sandbox_game_purchases" || selectQuery.includes("games")) {
        copy.game = db.games.find((g) => g.id === row.game_id) || null;
      }
      if (
        table === "product_purchases" ||
        table === "cart_items" ||
        selectQuery.includes("products")
      ) {
        copy.product = db.products.find((p) => p.id === row.product_id) || null;
      }
      if (table === "library_items" || selectQuery.includes("films")) {
        copy.film = db.films.find((f) => f.id === row.film_id) || null;
      }
      if (
        table === "subscriptions" ||
        table === "user_subscriptions" ||
        selectQuery.includes("subscription_plans")
      ) {
        const plan =
          db.subscription_plans.find(
            (p) => p.id === row.plan_id || p.slug === row.plan_slug
          ) || null;
        copy.subscription_plans = plan;
        copy.plan = plan;
      }
      return copy;
    });
  }

  function createQueryBuilder(table) {
    let operation = "select";
    let selectQuery = "*";
    let payloadData = null;
    const filters = [];
    let orderBy = null;
    let limitCount = null;
    let returnMode = "many";

    const builder = {
      select(cols = "*") {
        selectQuery = cols;
        return builder;
      },
      insert(payload) {
        operation = "insert";
        payloadData = payload;
        return builder;
      },
      update(payload) {
        operation = "update";
        payloadData = payload;
        return builder;
      },
      upsert(payload) {
        operation = "upsert";
        payloadData = payload;
        return builder;
      },
      delete() {
        operation = "delete";
        return builder;
      },
      eq(col, val) {
        filters.push((row) => row?.[col] === val);
        return builder;
      },
      in(col, vals) {
        filters.push((row) => Array.isArray(vals) && vals.includes(row?.[col]));
        return builder;
      },
      contains(col, val) {
        filters.push((row) => {
          const target = row?.[col];
          if (!target || typeof target !== "object" || typeof val !== "object") {
            return false;
          }
          return Object.entries(val).every(([k, v]) => target[k] === v);
        });
        return builder;
      },
      order(col, opts = { ascending: true }) {
        orderBy = { col, ascending: opts?.ascending !== false };
        return builder;
      },
      limit(n) {
        limitCount = n;
        return builder;
      },
      single() {
        returnMode = "single";
        return builder;
      },
      maybeSingle() {
        returnMode = "maybeSingle";
        return builder;
      },
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    async function execute() {
      db = loadDb();
      if (!Array.isArray(db[table])) {
        db[table] = [];
      }
      const list = db[table];
      const matchesFilters = (row) => filters.every((fn) => fn(row));

      if (operation === "insert" || operation === "upsert") {
        const items = Array.isArray(payloadData) ? payloadData : [payloadData];
        const inserted = items.map((item) => {
          const newItem = {
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          };
          const existingIndex = list.findIndex((r) => r.id === newItem.id);
          if (existingIndex >= 0) {
            list[existingIndex] = { ...list[existingIndex], ...newItem };
            return list[existingIndex];
          }
          list.unshift(newItem);
          return newItem;
        });
        saveDb(db);
        const hydrated = hydrateRelations(table, inserted, selectQuery);
        if (returnMode === "single" || returnMode === "maybeSingle") {
          return { data: hydrated[0] ?? null, error: null };
        }
        return { data: hydrated, error: null };
      }

      if (operation === "update") {
        const updated = [];
        for (let i = 0; i < list.length; i += 1) {
          if (matchesFilters(list[i])) {
            list[i] = { ...list[i], ...payloadData };
            updated.push(list[i]);
          }
        }
        saveDb(db);
        const hydrated = hydrateRelations(table, updated, selectQuery);
        if (returnMode === "single" || returnMode === "maybeSingle") {
          return { data: hydrated[0] ?? null, error: null };
        }
        return { data: hydrated, error: null };
      }

      if (operation === "delete") {
        const remaining = [];
        const removed = [];
        for (const row of list) {
          if (matchesFilters(row)) {
            removed.push(row);
          } else {
            remaining.push(row);
          }
        }
        db[table] = remaining;
        saveDb(db);
        return { data: removed, error: null };
      }

      let result = list.filter(matchesFilters);
      if (orderBy) {
        const { col, ascending } = orderBy;
        result = [...result].sort((a, b) => {
          const va = a?.[col] ?? "";
          const vb = b?.[col] ?? "";
          if (va < vb) return ascending ? -1 : 1;
          if (va > vb) return ascending ? 1 : -1;
          return 0;
        });
      }
      if (typeof limitCount === "number") {
        result = result.slice(0, limitCount);
      }

      const hydrated = hydrateRelations(table, result, selectQuery);

      if (returnMode === "single") {
        if (hydrated.length === 0) {
          return { data: null, error: { message: "Row not found" } };
        }
        return { data: hydrated[0], error: null };
      }
      if (returnMode === "maybeSingle") {
        return { data: hydrated[0] ?? null, error: null };
      }
      return { data: hydrated, error: null };
    }

    return builder;
  }

  return {
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      async getUser() {
        return { data: { user: currentSession?.user ?? null }, error: null };
      },
      onAuthStateChange(callback) {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
      async signUp({ email }) {
        db = loadDb();
        const userId = `user-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
        const user = { id: userId, email };
        ensureUserProfile(user);
        currentSession = {
          access_token: "mock-access-token",
          user,
        };
        saveSession(currentSession);
        notifyAuth("SIGNED_IN", currentSession);
        return { data: { user, session: currentSession }, error: null };
      },
      async signInWithPassword({ email }) {
        db = loadDb();
        const existingProfile = db.profiles.find(
          (p) => p.email?.toLowerCase() === email.toLowerCase()
        );
        const userId =
          existingProfile?.id ||
          `user-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
        const user = { id: userId, email };
        ensureUserProfile(user);
        currentSession = {
          access_token: "mock-access-token",
          user,
        };
        saveSession(currentSession);
        notifyAuth("SIGNED_IN", currentSession);
        return { data: { user, session: currentSession }, error: null };
      },
      async signOut() {
        currentSession = null;
        saveSession(null);
        notifyAuth("SIGNED_OUT", null);
        return { error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async updateUser(updates) {
        if (!currentSession?.user) {
          return { data: { user: null }, error: { message: "Not signed in" } };
        }
        currentSession = {
          ...currentSession,
          user: { ...currentSession.user, ...updates },
        };
        saveSession(currentSession);
        return { data: { user: currentSession.user }, error: null };
      },
    },
    from(table) {
      return createQueryBuilder(table);
    },
    storage: {
      from() {
        return {
          getPublicUrl(path) {
            if (!path) return { data: { publicUrl: "" } };
            if (path.startsWith("http://") || path.startsWith("https://")) {
              return { data: { publicUrl: path } };
            }
            return { data: { publicUrl: "" } };
          },
          async upload(path) {
            return { data: { path }, error: null };
          },
          async remove() {
            return { data: [], error: null };
          },
        };
      },
    },
    functions: {
      async invoke(fnName, options = {}) {
        const body = options?.body || {};
        db = loadDb();

        if (fnName === "save-game") {
          const gameId = body.id || crypto.randomUUID();
          const savedGame = {
            id: gameId,
            created_at: new Date().toISOString(),
            ...body,
          };
          const idx = db.games.findIndex((g) => g.id === gameId);
          if (idx >= 0) {
            db.games[idx] = { ...db.games[idx], ...savedGame };
          } else {
            db.games.unshift(savedGame);
          }
          saveDb(db);
          return { data: { game: savedGame }, error: null };
        }

        if (fnName === "get-game-download") {
          const game = db.games.find((g) => g.id === body.game_id);
          return {
            data: {
              url: game?.external_url || `${window.location.origin}/?download=${body.game_id}`,
            },
            error: null,
          };
        }

        if (fnName === "r2-game-upload") {
          if (body.action === "start") {
            return {
              data: {
                session: "mock-r2-session",
                part_size: Math.max(1, body.size || 1024),
                part_count: 1,
              },
              error: null,
            };
          }
          if (body.action === "part") {
            return { data: { url: `${window.location.origin}/` }, error: null };
          }
          if (body.action === "complete") {
            return {
              data: {
                game_storage_provider: "r2",
                game_bucket: "games",
                game_path: `packages/${crypto.randomUUID()}.zip`,
                upload_receipt: "mock-receipt",
              },
              error: null,
            };
          }
          return { data: { ok: true }, error: null };
        }

        if (
          fnName === "create-film-price" ||
          fnName === "create-paddle-subscription-price"
        ) {
          return {
            data: { priceId: `pri_mock_${crypto.randomUUID().slice(0, 8)}` },
            error: null,
          };
        }

        if (fnName === "create-sandbox-game-checkout") {
          return {
            data: { transaction_id: `txn_mock_${crypto.randomUUID().slice(0, 8)}` },
            error: null,
          };
        }

        return { data: {}, error: null };
      },
    },
    async rpc(fnName, args = {}) {
      db = loadDb();

      if (fnName === "get_all_users") {
        return { data: db.profiles, error: null };
      }

      if (fnName === "owner_add_wallet_credit") {
        const target = db.profiles.find((p) => p.id === args.p_target_user_id);
        if (!target) {
          return { data: null, error: { message: "User not found" } };
        }
        target.wallet_balance_cents =
          (Number(target.wallet_balance_cents) || 0) +
          (Number(args.p_amount_cents) || 0);
        saveDb(db);
        return {
          data: {
            user_id: target.id,
            wallet_balance_cents: target.wallet_balance_cents,
            duplicate: false,
          },
          error: null,
        };
      }

      if (fnName === "owner_extend_access") {
        const expiresAt = new Date(
          Date.now() + (Number(args.p_days) || 30) * 86400000
        ).toISOString();
        const existing = db.owner_complimentary_access.find(
          (r) => r.user_id === args.p_target_user_id
        );
        if (existing) {
          existing.expires_at = expiresAt;
        } else {
          db.owner_complimentary_access.push({
            user_id: args.p_target_user_id,
            expires_at: expiresAt,
          });
        }
        saveDb(db);
        return {
          data: {
            user_id: args.p_target_user_id,
            complimentary_expires_at: expiresAt,
            duplicate: false,
          },
          error: null,
        };
      }

      if (fnName === "owner_set_admin_role") {
        const target = db.profiles.find((p) => p.id === args.p_target_user_id);
        if (!target) {
          return { data: null, error: { message: "User not found" } };
        }
        const unchanged = Boolean(target.is_admin) === Boolean(args.p_make_admin);
        target.is_admin = Boolean(args.p_make_admin);
        saveDb(db);
        return {
          data: { is_admin: target.is_admin, unchanged },
          error: null,
        };
      }

      if (fnName === "save_own_profile_name") {
        const userId = currentSession?.user?.id;
        const target = db.profiles.find((p) => p.id === userId);
        if (target) {
          target.full_name = args.p_full_name;
          saveDb(db);
        }
        return { data: args.p_full_name, error: null };
      }

      if (fnName === "purchase_with_wallet") {
        const userId = currentSession?.user?.id;
        const profile = db.profiles.find((p) => p.id === userId);
        if (!profile) {
          return { data: null, error: { message: "Please sign in first." } };
        }
        const product = db.products.find((p) => p.id === args.p_item_id);
        const priceCents = Number(product?.price_cents) || 0;
        if ((Number(profile.wallet_balance_cents) || 0) < priceCents) {
          return {
            data: null,
            error: { message: "Insufficient wallet balance." },
          };
        }
        profile.wallet_balance_cents -= priceCents;
        db.product_purchases.unshift({
          id: crypto.randomUUID(),
          user_id: userId,
          product_id: args.p_item_id,
          created_at: new Date().toISOString(),
        });
        db.payments.unshift({
          id: crypto.randomUUID(),
          user_id: userId,
          payment_type: args.p_item_type || "product",
          amount_cents: priceCents,
          currency: "USD",
          status: "completed",
          metadata: {
            payment_method: "wallet",
            product_title: product?.title || "Store item",
          },
          created_at: new Date().toISOString(),
        });
        saveDb(db);
        return {
          data: { wallet_balance_cents: profile.wallet_balance_cents },
          error: null,
        };
      }

      return { data: {}, error: null };
    },
  };
}

export const supabase = hasValidSupabaseConfig()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createMockSupabaseClient();