import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { uploadGameToR2 } from "../r2GameUpload";
import { buySandboxGame } from "../sandboxGameCheckout";

const EMPTY_FORM = {
  id: null,
  title: "",
  description: "",
  genre: "Action",
  platform: "Windows",
  version: "1.0.0",
  accessType: "free",
  price: "",
  deliveryType: "upload",
  externalUrl: "",
  isPublished: false,
  gamePath: null,
  coverPath: null,
  gameStorageProvider: "supabase",
  gameBucket: null,
};

const GENRES = [
  "Action",
  "Adventure",
  "Arcade",
  "Casual",
  "Puzzle",
  "Racing",
  "RPG",
  "Simulation",
  "Sports",
  "Strategy",
];

const PLATFORMS = [
  "Windows",
  "Android",
  "Web",
  "macOS",
  "Linux",
];

const MAX_PACKAGE_BYTES = 100 * 1024 * 1024 * 1024;

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

function safeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .slice(-150);
}

function getCoverUrl(path) {
  if (!path) return null;

  return (
    supabase.storage
      .from("games")
      .getPublicUrl(path)
      .data?.publicUrl || null
  );
}

async function saveGameOnServer(payload) {
  const { data, error } = await supabase.functions.invoke(
    "save-game",
    { body: payload },
  );

  if (error) {
    let message = error.message;

    if (typeof error.context?.json === "function") {
      const detail = await error.context.json().catch(() => null);
      message = detail?.error || message;
    }

    throw new Error(message || "Could not save game.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.game) {
    throw new Error("save-game returned no game.");
  }

  return data.game;
}

export default function GameStudioPage({ onBack }) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [gameFile, setGameFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);

  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [progress, setProgress] = useState(0);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [uncertainSave, setUncertainSave] = useState(false);

  const formRef = useRef(null);
  const operationLock = useRef(false);
  const pendingPackage = useRef(null);
  const pendingCover = useRef(null);

  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }
  
  async function testSandboxPurchase(game) {
    if (operationLock.current) return;

    operationLock.current = true;
    setBusyId(game.id);

    try {
      await requireAdmin();

      await buySandboxGame(game.id);

      showMessage(
        "Sandbox Checkout opened. Complete the test payment, then check Paddle notifications and the purchase table.",
        "info",
      );
    } catch (error) {
      showMessage(
        error.message || "Could not open sandbox checkout.",
        "error",
      );
    } finally {
      operationLock.current = false;
      setBusyId(null);
    }
  }

  async function requireAdmin() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (!user) {
      throw new Error(
        "Sign in with an owner or administrator account.",
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("is_admin,is_owner")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile?.is_admin && !profile?.is_owner) {
      throw new Error(
        "Owner or administrator access required.",
      );
    }

    return user;
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setGameFile(null);
    setCoverFile(null);
    setProgress(0);
    setUncertainSave(false);

    pendingPackage.current = null;
    pendingCover.current = null;

    formRef.current?.reset();
  }

  function storeGame(game) {
    setGames((current) =>
      current.some((item) => item.id === game.id)
        ? current.map((item) =>
            item.id === game.id ? game : item,
          )
        : [game, ...current],
    );
  }

  function editGame(game) {
    resetForm();

    setForm({
      id: game.id,
      title: game.title || "",
      description: game.description || "",
      genre: game.genre || "Action",
      platform: game.platform || "Windows",
      version: game.version || "1.0.0",
      accessType: game.access_type || "free",
      price:
        game.access_type === "paid"
          ? ((Number(game.price_cents) || 0) / 100).toFixed(2)
          : "",
      deliveryType: game.delivery_type || "upload",
      externalUrl: game.external_url || "",
      isPublished: game.is_published === true,
      gamePath: game.game_path || null,
      coverPath: game.cover_path || null,
      gameStorageProvider:
        game.game_storage_provider || "supabase",
      gameBucket: game.game_bucket || null,
    });

    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function loadGames() {
    setLoadingGames(true);

    try {
      await requireAdmin();
      setAllowed(true);

      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      setGames(data || []);

      if (uncertainSave) {
        showMessage(
          "List refreshed. If the game was saved, click Edit on that row. Do not create another copy blindly.",
        );
      }
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoadingGames(false);
      setCheckingAccess(false);
    }
  }

  useEffect(() => {
    loadGames();
  }, []);

  function handlePackageChange(event) {
    const file = event.target.files?.[0] || null;

    if (
      file &&
      (!/\.(zip|apk)$/i.test(file.name) ||
        file.size < 1 ||
        file.size > MAX_PACKAGE_BYTES)
    ) {
      event.target.value = "";
      setGameFile(null);
      pendingPackage.current = null;

      return showMessage(
        "Choose a ZIP or APK between 1 byte and 100 GiB.",
        "error",
      );
    }

    pendingPackage.current = null;
    setGameFile(file);
    setProgress(0);
  }

  function handleCoverChange(event) {
    const file = event.target.files?.[0] || null;

    if (
      file &&
      (![
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(file.type) ||
        file.size > 10485760)
    ) {
      event.target.value = "";
      setCoverFile(null);
      pendingCover.current = null;

      return showMessage(
        "Choose a JPG, PNG or WebP cover up to 10 MB.",
        "error",
      );
    }

    pendingCover.current = null;
    setCoverFile(file);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (operationLock.current || uncertainSave) return;

    if (!form.title.trim()) {
      return showMessage("Enter a game title.", "error");
    }

    const priceCents =
      form.accessType === "paid"
        ? Math.round(Number(form.price) * 100)
        : 0;

    if (
      form.accessType === "paid" &&
      (!Number.isSafeInteger(priceCents) || priceCents <= 0)
    ) {
      return showMessage(
        "Enter a valid positive price.",
        "error",
      );
    }

    if (form.deliveryType === "url") {
      try {
        const url = new URL(form.externalUrl.trim());

        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("Unsupported URL");
        }
      } catch {
        return showMessage(
          "Enter a valid HTTP or HTTPS URL.",
          "error",
        );
      }
    }

    if (
      form.deliveryType === "upload" &&
      !form.gamePath &&
      !gameFile
    ) {
      return showMessage(
        "Choose a game package.",
        "error",
      );
    }

    if (form.deliveryType === "upload" && gameFile) {
      const extension =
        gameFile.name.split(".").pop()?.toLowerCase();

      if (
        (form.platform === "Windows" && extension !== "zip") ||
        (form.platform === "Android" && extension !== "apk")
      ) {
        return showMessage(
          "Windows packages must be ZIP; Android packages must be APK.",
          "error",
        );
      }
    }

    operationLock.current = true;
    setSaving(true);
    setProgress(0);

    let serverSaveRequested = false;

    try {
      await requireAdmin();

      let gamePath = form.gamePath;
      let gameBucket = form.gameBucket;
      let provider =
        form.gameStorageProvider || "supabase";
      let coverPath = form.coverPath;

      if (coverFile) {
        if (pendingCover.current?.file !== coverFile) {
          const uploadedPath =
            `covers/${crypto.randomUUID()}-` +
            safeFileName(coverFile.name);

          showMessage("Uploading cover to Supabase...");

          const { error } = await supabase.storage
            .from("games")
            .upload(uploadedPath, coverFile, {
              upsert: false,
              contentType: coverFile.type,
              cacheControl: "3600",
            });

          if (error) throw error;

          pendingCover.current = {
            file: coverFile,
            path: uploadedPath,
          };
        }

        coverPath = pendingCover.current.path;
      }

      let receipt;

      if (
        form.deliveryType === "upload" &&
        gameFile
      ) {
        if (pendingPackage.current?.file !== gameFile) {
          const result = await uploadGameToR2(
            gameFile,
            (percent) => {
              setProgress(percent);

              showMessage(
                `Uploading game to Cloudflare R2... ${percent}%`,
              );
            },
          );

          pendingPackage.current = {
            file: gameFile,
            result,
          };
        }

        const result = pendingPackage.current.result;

        gamePath = result.game_path;
        gameBucket = result.game_bucket;
        provider = "r2";
        receipt = result.upload_receipt;

        setProgress(100);
      }

      const isExternalUrl =
        form.deliveryType === "url";

      showMessage(
        "Verifying upload and saving game...",
      );

      serverSaveRequested = true;

      const savedGame = await saveGameOnServer({
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        description: form.description.trim() || null,
        genre: form.genre,
        platform: form.platform,
        version: form.version.trim() || "1.0.0",
        access_type: form.accessType,
        price_cents: priceCents,
        delivery_type: form.deliveryType,
        external_url: isExternalUrl
          ? form.externalUrl.trim()
          : null,
        game_path: isExternalUrl ? null : gamePath,
        game_storage_provider: isExternalUrl
          ? "supabase"
          : provider,
        game_bucket: isExternalUrl
          ? null
          : gameBucket || "games",
        cover_path: coverPath,

        // Paid games remain drafts during entitlement integration.
        is_published:
          form.accessType === "paid"
            ? false
            : form.isPublished,

        ...(receipt
          ? { upload_receipt: receipt }
          : {}),
      });

      storeGame(savedGame);
      resetForm();

      showMessage(
        `${savedGame.title} saved${
          savedGame.is_published
            ? " and published"
            : " as a draft"
        }.` +
          (savedGame.game_storage_provider === "r2"
            ? " Package stored in Cloudflare R2."
            : "") +
          (savedGame.access_type === "paid"
            ? " Paid customer downloads remain disabled pending purchase verification."
            : ""),
        "success",
      );
    } catch (error) {
      if (serverSaveRequested) {
        setUncertainSave(true);
      }

      showMessage(
        `Could not confirm game save: ${error.message}` +
          (pendingPackage.current
            ? `\nPackage kept in R2: ${pendingPackage.current.result.game_bucket}/${pendingPackage.current.result.game_path}`
            : "") +
          (serverSaveRequested
            ? "\nRefresh My games first. If the row exists, click Edit. Do not retry creating another game until you have checked the database/Paddle result."
            : "\nAny completed uploads were kept; do not re-upload blindly."),
        "error",
      );
    } finally {
      operationLock.current = false;
      setSaving(false);
    }
  }

  async function togglePublished(game) {
    if (operationLock.current) return;

    if (
      !game.is_published &&
      game.access_type === "paid"
    ) {
      return showMessage(
        "Paid-game publication is disabled until customer entitlement verification is fixed.",
        "error",
      );
    }

    operationLock.current = true;
    setBusyId(game.id);

    try {
      await requireAdmin();

      const { data, error } = await supabase
        .from("games")
        .update({
          is_published: !game.is_published,
          updated_at: new Date().toISOString(),
        })
        .eq("id", game.id)
        .select()
        .single();

      if (error) throw error;

      storeGame(data);

      showMessage(
        `${data.title} ${
          data.is_published ? "published" : "unpublished"
        }.`,
        "success",
      );
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      operationLock.current = false;
      setBusyId(null);
    }
  }

  async function deleteGame(game) {
    if (operationLock.current) return;

    if (game.game_storage_provider === "r2") {
      return showMessage(
        "R2 deletion is not connected. Unpublish instead; the package and record will be kept.",
        "error",
      );
    }

    if (
      !window.confirm(
        `Delete "${game.title}" and its Supabase files? This cannot be undone.`,
      )
    ) {
      return;
    }

    operationLock.current = true;
    setBusyId(game.id);

    try {
      await requireAdmin();

      const { error } = await supabase
        .from("games")
        .delete()
        .eq("id", game.id);

      if (error) throw error;

      let cleanupFailed = false;

      for (
        const path of [
          game.game_path,
          game.cover_path,
        ].filter(Boolean)
      ) {
        const { error: removeError } =
          await supabase.storage
            .from("games")
            .remove([path]);

        if (removeError) {
          cleanupFailed = true;
        }
      }

      setGames((current) =>
        current.filter((item) => item.id !== game.id),
      );

      if (form.id === game.id) {
        resetForm();
      }

      showMessage(
        cleanupFailed
          ? "Record deleted; some Supabase files remain. Check storage."
          : "Game deleted.",
        cleanupFailed ? "error" : "success",
      );
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      operationLock.current = false;
      setBusyId(null);
    }
  }

  async function testDownload(game) {
    if (operationLock.current) return;

    operationLock.current = true;
    setBusyId(game.id);

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "get-game-download",
          {
            body: {
              game_id: game.id,
            },
          },
        );

      if (error) {
        const detail =
          typeof error.context?.json === "function"
            ? await error.context.json().catch(() => null)
            : null;

        throw new Error(
          detail?.error || error.message,
        );
      }

      if (!data?.url || data.error) {
        throw new Error(
          data?.error || "No download URL returned.",
        );
      }

      window.location.assign(data.url);
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      operationLock.current = false;
      setBusyId(null);
    }
  }

  const disabled = saving || Boolean(busyId);

  if (checkingAccess) {
    return (
      <section className="section-page">
        <p>Checking owner/admin access...</p>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="section-page">
        <h1>Owner or admin access required</h1>
        <p>{message}</p>
        <button type="button" onClick={onBack}>
          Back to admin
        </button>
      </section>
    );
  }

  return (
    <section className="section-page studio-page">
      <header className="studio-page-header">
        <div>
          <p className="eyebrow">
            ADMINISTRATION / GAME STUDIO
          </p>

          <h1>Game Studio</h1>

          <p>
            New ZIP/APK packages upload to private Cloudflare R2.
            Covers stay in Supabase.
          </p>

          <p>
            Paid games can be saved as drafts, but customer
            checkout/downloads are temporarily disabled until
            purchase verification is fixed.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
        >
          Back to admin
        </button>
      </header>

      <section className="admin-upload-panel game-upload-panel">
        <h2>
          {form.id
            ? `Editing: ${form.title}`
            : "Add a new game"}
        </h2>

        <form
          ref={formRef}
          className="admin-upload-form"
          onSubmit={handleSave}
        >
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide">
              <span>Game title *</span>

              <input
                value={form.title}
                onChange={(event) =>
                  updateForm("title", event.target.value)
                }
                maxLength={200}
                required
                disabled={disabled}
              />
            </label>

            <label className="admin-field">
              <span>Genre</span>

              <select
                value={form.genre}
                onChange={(event) =>
                  updateForm("genre", event.target.value)
                }
                disabled={disabled}
              >
                {GENRES.map((genre) => (
                  <option key={genre}>{genre}</option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Platform</span>

              <select
                value={form.platform}
                onChange={(event) =>
                  updateForm("platform", event.target.value)
                }
                disabled={disabled}
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Version</span>

              <input
                value={form.version}
                onChange={(event) =>
                  updateForm("version", event.target.value)
                }
                maxLength={50}
                disabled={disabled}
              />
            </label>

            <label className="admin-field">
              <span>Access</span>

              <select
                value={form.accessType}
                onChange={(event) =>
                  updateForm("accessType", event.target.value)
                }
                disabled={disabled}
              >
                <option value="free">Free</option>
                <option value="paid">Paid - draft only</option>
              </select>
            </label>

            {form.accessType === "paid" && (
              <label className="admin-field">
                <span>Price in USD *</span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    updateForm("price", event.target.value)
                  }
                  required
                  disabled={disabled}
                />

                <small>
                  Saving can create a Paddle catalog product/price.
                  It does not enable customer checkout.
                </small>
              </label>
            )}

            <label className="admin-field admin-field-wide">
              <span>Description</span>

              <textarea
                rows={5}
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                disabled={disabled}
              />
            </label>

            <label className="admin-field">
              <span>Delivery</span>

              <select
                value={form.deliveryType}
                onChange={(event) =>
                  updateForm("deliveryType", event.target.value)
                }
                disabled={disabled}
              >
                <option value="upload">Upload ZIP/APK</option>
                <option value="url">External URL</option>
              </select>
            </label>

            {form.deliveryType === "url" && (
              <label className="admin-field admin-field-wide">
                <span>External URL *</span>

                <input
                  type="url"
                  value={form.externalUrl}
                  onChange={(event) =>
                    updateForm("externalUrl", event.target.value)
                  }
                  required
                  disabled={disabled}
                />

                <small>
                  External links are not private R2 downloads
                  and can be shared.
                </small>
              </label>
            )}
          </div>

          <div className="admin-file-grid">
            {form.deliveryType === "upload" && (
              <label className="admin-file-card">
                <span>
                  {form.gamePath
                    ? "Replace game package (optional)"
                    : "Game package *"}
                </span>

                <input
                  type="file"
                  accept=".zip,.apk"
                  onChange={handlePackageChange}
                  required={!form.gamePath}
                  disabled={disabled}
                />

                <small>
                  {gameFile
                    ? `${gameFile.name} (${(
                        gameFile.size / 1048576
                      ).toFixed(1)} MB)`
                    : form.gamePath
                      ? "Existing package kept unless replaced"
                      : "Windows ZIP / Android APK"}
                </small>

                <small>
                  Up to 100 GiB. Keep the page open.
                  Resume after refreshing or closing is not implemented.
                </small>
              </label>
            )}

            <label className="admin-file-card">
              <span>Cover image</span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCoverChange}
                disabled={disabled}
              />

              <small>
                {coverFile?.name ||
                  (form.coverPath
                    ? "Existing cover kept unless replaced"
                    : "Optional JPG/PNG/WebP, up to 10 MB")}
              </small>
            </label>
          </div>

          {saving &&
            gameFile &&
            form.deliveryType === "upload" && (
              <div>
                <p>Package upload: {progress}%</p>

                <progress
                  value={progress}
                  max="100"
                  style={{ width: "100%" }}
                  aria-label="Game package upload progress"
                />
              </div>
            )}

          <label className="publish-toggle">
            <input
              type="checkbox"
              checked={
                form.accessType !== "paid" &&
                form.isPublished
              }
              onChange={(event) =>
                updateForm("isPublished", event.target.checked)
              }
              disabled={
                disabled || form.accessType === "paid"
              }
            />

            <span>
              {form.accessType === "paid"
                ? "Paid games stay as drafts"
                : "Publish after saving"}
            </span>
          </label>

          {uncertainSave && (
            <p role="alert">
              Save result uncertain. Refresh My games and inspect
              the saved row before clearing this form or retrying.
            </p>
          )}

          <div className="admin-upload-footer">
            <div className="game-form-actions">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const canClear =
                    !uncertainSave ||
                    window.confirm(
                      "Have you checked the refreshed game list/database? Clearing does not delete uploaded files or Paddle products.",
                    );

                  if (canClear) {
                    resetForm();
                    setMessage("");
                  }
                }}
              >
                Clear / cancel edit
              </button>

              <button
                type="submit"
                className="admin-upload-button"
                disabled={disabled || uncertainSave}
              >
                {saving
                  ? "Saving..."
                  : form.id
                    ? "Save changes"
                    : "Save game"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {message && (
        <p
          className={`admin-upload-message ${messageType}`}
          role="status"
          aria-live="polite"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {message}
        </p>
      )}

      <section className="game-manager-section">
        <div className="game-manager-heading">
          <h2>My games</h2>

          <button
            type="button"
            onClick={loadGames}
            disabled={disabled || loadingGames}
          >
            Refresh
          </button>
        </div>

        {loadingGames ? (
          <p>Loading games...</p>
        ) : !games.length ? (
          <p>No games yet.</p>
        ) : (
          <div className="game-manager-list">
            {games.map((game) => {
              const cover = getCoverUrl(game.cover_path);
              const isR2 =
                game.game_storage_provider === "r2";

              return (
                <article
                  className="game-manager-card"
                  key={game.id}
                >
                  <div
                    className="game-manager-cover"
                    style={
                      cover
                        ? {
                            backgroundImage: `url("${cover}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    <span>
                      {game.is_published
                        ? "Published"
                        : "Draft"}
                    </span>
                  </div>

                  <div className="game-manager-info">
                    <h3>{game.title}</h3>

                    <p>
                      {game.platform} - {game.genre} -
                      Version {game.version}
                    </p>

                    <p>{game.description}</p>

                    <p>
                      {game.access_type === "paid"
                        ? formatCurrency(game.price_cents)
                        : "Free"}{" "}
                      -{" "}
                      {game.delivery_type === "url"
                        ? "External URL"
                        : isR2
                          ? "Cloudflare R2"
                          : "Supabase"}
                    </p>

                    {game.access_type === "paid" && (
                      <p>
                        Paid customer access pending.
                        Paddle price:{" "}
                        {game.paddle_price_id || "not created"}
                      </p>
                    )}

                    <div className="game-manager-actions">
                      {import.meta.env.VITE_PADDLE_ENVIRONMENT === "sandbox" &&
                      game.access_type === "paid" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => testSandboxPurchase(game)}
                        >
                          {busyId === game.id
                            ? "Preparing sandbox checkout..."
                            : "Test sandbox purchase"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => editGame(game)}
                      >
                        Edit
                      </button>

                      {import.meta.env.VITE_PADDLE_ENVIRONMENT === "sandbox" &&
                      game.access_type === "paid" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => testSandboxPurchase(game)}
                        >
                          Test sandbox purchase
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={
                          disabled ||
                          (!game.is_published &&
                            game.access_type === "paid")
                        }
                        onClick={() => togglePublished(game)}
                      >
                        {game.is_published
                          ? "Unpublish"
                          : "Publish"}
                      </button>

                      {game.delivery_type === "upload" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => testDownload(game)}
                        >
                          Test download (admin)
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={disabled || isR2}
                        onClick={() => deleteGame(game)}
                      >
                        {isR2
                          ? "R2 deletion pending"
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}