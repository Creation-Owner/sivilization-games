import { useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import { uploadFilmToR2 } from "../r2FilmUpload";

const EMPTY_FORM = {
  id: null,
  title: "",
  description: "",
  genre: "Drama",
  releaseYear: "",
  duration: "",
  accessType: "free",
  price: "",
  isPublished: false,
  videoPath: null,
  posterPath: null,
  storedVideoBucket: null,
  videoStorageProvider: "supabase",
};

const BUCKETS = {
  freeVideos: "films-free",
  paidVideos: "films-paid",
  posters: "film-posters",
};

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MAX_VIDEO_BYTES = 100 * 1024 * 1024 * 1024;

const GENRES = [
  "Action",
  "Adventure",
  "Anime",
  "Cartoon",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

const isChargeable = (type) =>
  type === "paid" || type === "rent";

const currency = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);

const bucketForAccess = (type) =>
  type === "free"
    ? BUCKETS.freeVideos
    : BUCKETS.paidVideos;

const safeName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");

function posterUrl(path) {
  if (!path) return null;

  return (
    supabase.storage
      .from(BUCKETS.posters)
      .getPublicUrl(path)
      .data?.publicUrl || null
  );
}

async function createFilmPrice(filmId) {
  const { data, error } = await supabase.functions.invoke(
    "create-film-price",
    {
      body: {
        film_id: filmId,
      },
    },
  );

  if (error) {
    let message =
      error.message || "Could not create Paddle price.";

    if (error instanceof FunctionsHttpError) {
      try {
        const response = await error.context.json();
        message = response?.error || message;
      } catch {
        // Keep the original error.
      }
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.priceId) {
    throw new Error(
      "The function returned no Paddle price ID.",
    );
  }

  return data.priceId;
}

export default function FilmStudioPage({ onBack }) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [videoFile, setVideoFile] = useState(null);
  const [posterFile, setPosterFile] = useState(null);

  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [progress, setProgress] = useState(0);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const formRef = useRef(null);
  const saveLock = useRef(false);
  const originalFilm = useRef(null);



  function show(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setVideoFile(null);
    setPosterFile(null);
    setProgress(0);
    originalFilm.current = null;
    formRef.current?.reset();
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

  async function loadStudio() {
    setLoading(true);
    setCheckingAccess(true);

    try {
      await requireAdmin();
      setAllowed(true);

      const { data, error } = await supabase
        .from("films")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      setFilms(data || []);
    } catch (error) {
      setAllowed(false);
      show(error.message, "error");
    } finally {
      setLoading(false);
      setCheckingAccess(false);
    }
  }

  useEffect(() => {
    loadStudio();
  }, []);

  async function removeFile(bucket, path) {
    if (!bucket || !path) return true;

    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error("Supabase cleanup failed:", error);
      return false;
    }

    return true;
  }

  async function uploadPoster(path, file) {
    const { error } = await supabase.storage
      .from(BUCKETS.posters)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      throw new Error(
        `Poster upload failed: ${error.message}`,
      );
    }
  }

  function editFilm(film) {
    originalFilm.current = film;

    setForm({
      id: film.id,
      title: film.title || "",
      description: film.description || "",
      genre: film.genre || "Drama",
      releaseYear: film.release_year
        ? String(film.release_year)
        : "",
      duration: film.duration || "",
      accessType: film.access_type || "free",
      price: isChargeable(film.access_type)
        ? ((Number(film.price_cents) || 0) / 100).toFixed(2)
        : "",
      isPublished: film.is_published === true,
      videoPath: film.video_path || null,
      posterPath: film.poster_path || null,
      storedVideoBucket:
        film.video_bucket ||
        bucketForAccess(film.access_type),
      videoStorageProvider:
        film.video_storage_provider || "supabase",
    });

    setVideoFile(null);
    setPosterFile(null);
    setProgress(0);
    setMessage("");
    formRef.current?.reset();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function storeFilm(film) {
    setFilms((current) =>
      current.some((item) => item.id === film.id)
        ? current.map((item) =>
            item.id === film.id ? film : item,
          )
        : [film, ...current],
    );
  }

  async function handleSaveFilm(event) {
    event.preventDefault();

    if (saveLock.current) return;

    const chargeable = isChargeable(form.accessType);

    const priceCents = chargeable
      ? Math.round(Number(form.price) * 100)
      : 0;

    if (!form.title.trim()) {
      return show("Enter a film title.", "error");
    }

    if (!form.videoPath && !videoFile) {
      return show("Choose a video file.", "error");
    }

    if (
      videoFile &&
      (!VIDEO_TYPES.has(videoFile.type) ||
        videoFile.size < 1 ||
        videoFile.size > MAX_VIDEO_BYTES)
    ) {
      return show(
        "Choose an MP4, WebM or MOV video between 1 byte and 100 GiB.",
        "error",
      );
    }

    if (
      chargeable &&
      (!Number.isSafeInteger(priceCents) ||
        priceCents <= 0)
    ) {
      return show(
        "Enter a valid positive price.",
        "error",
      );
    }

    const old = originalFilm.current;

    if (
      old?.paddle_price_id &&
      chargeable &&
      (Number(old.price_cents) !== priceCents ||
        old.access_type !== form.accessType)
    ) {
      return show(
        "This film already has a Paddle price. Its amount or paid/rental type needs a server-side price replacement before it can change.",
        "error",
      );
    }

    if (
      form.videoStorageProvider !== "r2" &&
      form.videoPath &&
      !videoFile &&
      form.accessType !== "free" &&
      form.storedVideoBucket === BUCKETS.freeVideos
    ) {
      return show(
        "This video is in films-free. Select the video again to upload a private R2 copy before charging for it.",
        "error",
      );
    }

    saveLock.current = true;
    setSaving(true);
    setProgress(0);
    show("Checking permissions...");

    let r2Video = null;
    let uploadedPoster = null;
    let databaseSaved = false;
    let savedFilm = null;

    try {
      const user = await requireAdmin();

      let videoPath = form.videoPath;
      let posterPath = form.posterPath;

      let videoBucket =
        form.storedVideoBucket ||
        bucketForAccess(form.accessType);

      let provider =
        form.videoStorageProvider || "supabase";

      if (videoFile) {
        show("Uploading video to Cloudflare R2... 0%");

        r2Video = await uploadFilmToR2(
          videoFile,
          (value) => {
            setProgress(value);
            show(
              `Uploading video to Cloudflare R2... ${value}%`,
            );
          },
        );

        videoPath = r2Video.video_path;
        videoBucket = r2Video.video_bucket;
        provider = "r2";
      }

      if (posterFile) {
        uploadedPoster =
          `posters/${crypto.randomUUID()}-` +
          safeName(posterFile.name);

        show("Uploading poster to Supabase...");

        await uploadPoster(
          uploadedPoster,
          posterFile,
        );

        posterPath = uploadedPoster;
      }

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        genre: form.genre,
        release_year: Number(form.releaseYear) || null,
        duration: form.duration.trim() || null,
        access_type: form.accessType,
        is_paid: chargeable,
        price_cents: priceCents,
        video_path: videoPath,
        video_bucket: videoBucket,
        video_storage_provider: provider,
        poster_path: posterPath,

        // Keep R2 films as drafts until playback is connected.
        is_published: chargeable
          ? false
          : form.isPublished,

        updated_at: new Date().toISOString(),
      };

      const result = form.id
        ? await supabase
            .from("films")
            .update(payload)
            .eq("id", form.id)
            .select()
            .single()
        : await supabase
            .from("films")
            .insert({
              ...payload,
              created_by: user.id,
            })
            .select()
            .single();

      if (result.error) throw result.error;

      savedFilm = result.data;
      databaseSaved = true;
      storeFilm(savedFilm);

      // Keep previous videos and posters during integration.
      // Do not delete working originals automatically.

      if (
        chargeable &&
        !savedFilm.paddle_price_id
      ) {
        show(
          "Film saved as a draft. Creating Paddle checkout price...",
        );

        const priceId = await createFilmPrice(
          savedFilm.id,
        );

        savedFilm = {
          ...savedFilm,
          paddle_price_id: priceId,
        };

        storeFilm(savedFilm);
      }

      if (
        chargeable &&
        form.isPublished
      ) {
        const { data, error } = await supabase
          .from("films")
          .update({
            is_published: true,
          })
          .eq("id", savedFilm.id)
          .select()
          .single();

        if (error) throw error;

        savedFilm = data;
        storeFilm(data);
      }

      const retainedOriginal = Boolean(
        r2Video && form.videoPath,
      );

      resetForm();

      show(
        `${savedFilm.title} saved${
          savedFilm.is_published
            ? " and published"
            : " as a draft"
        }.` +
          (provider === "r2"
            ? " Video is in Cloudflare R2. Private R2 playback is enabled."
            : "") +
          (chargeable
            ? " Paddle checkout price is ready."
            : "") +
          (retainedOriginal
            ? " The previous video was kept as a backup."
            : ""),
        "success",
      );
    } catch (error) {
      console.error("Film save failed:", error);

      if (!databaseSaved) {
        if (uploadedPoster) {
          await removeFile(
            BUCKETS.posters,
            uploadedPoster,
          );
        }

        show(
          `Could not save film: ${error.message}` +
            (r2Video
              ? `\nThe completed R2 video was kept, but was not linked to a saved film.\nBucket: ${r2Video.video_bucket}\nObject: ${r2Video.video_path}\nCheck it before uploading again.`
              : ""),
          "error",
        );
      } else {
        if (savedFilm) {
          editFilm(savedFilm);
        }

        show(
          `Film saved, but checkout setup or publication failed: ${error.message}. Files were kept. Use Save changes to retry this film without selecting the video again.`,
          "error",
        );
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function togglePublished(film) {
    setBusyId(film.id);

    try {
      await requireAdmin();



      if (
        !film.is_published &&
        isChargeable(film.access_type) &&
        !film.paddle_price_id
      ) {
        throw new Error(
          "Edit and save this film first to create its Paddle price.",
        );
      }

      const { data, error } = await supabase
        .from("films")
        .update({
          is_published: !film.is_published,
        })
        .eq("id", film.id)
        .select()
        .single();

      if (error) throw error;

      storeFilm(data);

      show(
        `${data.title} ${
          data.is_published
            ? "published"
            : "unpublished"
        }.`,
        "success",
      );
    } catch (error) {
      show(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteFilm(film) {
    if (film.video_storage_provider === "r2") {
      return show(
        "R2 deletion is not connected yet. Unpublish this film instead; its record and file will be kept.",
        "error",
      );
    }

    if (
      !window.confirm(
        `Delete "${film.title}" and its Supabase files? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyId(film.id);

    try {
      await requireAdmin();

      const { error } = await supabase
        .from("films")
        .delete()
        .eq("id", film.id);

      if (error) throw error;

      const videoRemoved = await removeFile(
        film.video_bucket ||
          bucketForAccess(film.access_type),
        film.video_path,
      );

      const posterRemoved = await removeFile(
        BUCKETS.posters,
        film.poster_path,
      );

      setFilms((current) =>
        current.filter(
          (item) => item.id !== film.id,
        ),
      );

      if (form.id === film.id) {
        resetForm();
      }

      show(
        videoRemoved && posterRemoved
          ? "Film deleted."
          : "Film record deleted, but some Supabase files could not be removed. Check storage manually.",
        videoRemoved && posterRemoved
          ? "success"
          : "error",
      );
    } catch (error) {
      show(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  function chooseVideo(event) {
    const file =
      event.target.files?.[0] || null;

    if (
      file &&
      (!VIDEO_TYPES.has(file.type) ||
        file.size < 1 ||
        file.size > MAX_VIDEO_BYTES)
    ) {
      event.target.value = "";
      setVideoFile(null);

      return show(
        "Choose an MP4, WebM or MOV video between 1 byte and 100 GiB.",
        "error",
      );
    }

    setVideoFile(file);
    setProgress(0);
  }

  function choosePoster(event) {
    const file =
      event.target.files?.[0] || null;

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
      setPosterFile(null);

      return show(
        "Choose a JPG, PNG or WebP poster up to 10 MB.",
        "error",
      );
    }

    setPosterFile(file);
  }

  if (checkingAccess) {
    return (
      <section className="section-page">
        <p>
          Checking owner/admin permissions...
        </p>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="section-page">
        <h1>
          Owner or admin access required
        </h1>

        <p>{message}</p>

        <button
          type="button"
          onClick={onBack}
        >
          Back to admin
        </button>
      </section>
    );
  }

  return (
    <section className="section-page studio-page">
      <div className="studio-page-header">
        <div>
          <p className="eyebrow">
            ADMINISTRATION / FILM STUDIO
          </p>

          <h1>Film Studio</h1>

          <p>
            Upload, edit and manage films.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
        >
          Back to admin
        </button>
      </div>

      <section className="admin-upload-panel film-management-panel">
        <div className="admin-upload-header">
          <div>
            <p className="eyebrow">
              {form.id
                ? "EDIT FILM"
                : "ADD NEW FILM"}
            </p>

            <h2>
              {form.id
                ? `Editing: ${form.title}`
                : "Film information"}
            </h2>

            <p>
              New videos upload to private
              Cloudflare R2 storage. Posters
              stay in Supabase film-posters.
              R2 films remain drafts until
              playback is connected.
            </p>
          </div>
        </div>

        <form
          ref={formRef}
          className="admin-upload-form"
          onSubmit={handleSaveFilm}
        >
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide">
              <span>Film title *</span>

              <input
                value={form.title}
                onChange={(event) =>
                  update(
                    "title",
                    event.target.value,
                  )
                }
                required
                disabled={saving}
                maxLength={200}
              />
            </label>

            <label className="admin-field">
              <span>Genre</span>

              <select
                value={form.genre}
                onChange={(event) =>
                  update(
                    "genre",
                    event.target.value,
                  )
                }
                disabled={saving}
              >
                {GENRES.map((genre) => (
                  <option key={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Release year</span>

              <input
                type="number"
                min="1888"
                max="2100"
                value={form.releaseYear}
                onChange={(event) =>
                  update(
                    "releaseYear",
                    event.target.value,
                  )
                }
                disabled={saving}
              />
            </label>

            <label className="admin-field">
              <span>Duration</span>

              <input
                value={form.duration}
                onChange={(event) =>
                  update(
                    "duration",
                    event.target.value,
                  )
                }
                placeholder="2h 10m"
                disabled={saving}
              />
            </label>

            <label className="admin-field">
              <span>Access type</span>

              <select
                value={form.accessType}
                onChange={(event) =>
                  update(
                    "accessType",
                    event.target.value,
                  )
                }
                disabled={saving}
              >
                <option value="free">
                  Free
                </option>

                <option value="paid">
                  Paid - buy forever
                </option>

                <option value="rent">
                  Rental
                </option>

                <option value="subscription">
                  Subscription only
                </option>
              </select>
            </label>

            {isChargeable(form.accessType) && (
              <label className="admin-field">
                <span>
                  {form.accessType === "rent"
                    ? "Rental"
                    : "Purchase"}{" "}
                  price in USD *
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    update(
                      "price",
                      event.target.value,
                    )
                  }
                  required
                  disabled={saving}
                />

                <small>
                  No manual Paddle price ID
                  required.
                </small>
              </label>
            )}

            <label className="admin-field admin-field-wide">
              <span>Description</span>

              <textarea
                rows={5}
                value={form.description}
                onChange={(event) =>
                  update(
                    "description",
                    event.target.value,
                  )
                }
                disabled={saving}
              />
            </label>
          </div>

          <div className="admin-file-grid">
            <label className="admin-file-card">
              <span>
                Video{" "}
                {form.videoPath
                  ? "(optional replacement)"
                  : "*"}
              </span>

              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                required={!form.videoPath}
                disabled={saving}
                onChange={chooseVideo}
              />

              <small>
                {videoFile
                  ? `${videoFile.name} (${(
                      videoFile.size / 1048576
                    ).toFixed(1)} MB)`
                  : form.videoPath
                    ? "Current video saved"
                    : "Choose an MP4, WebM or MOV"}
              </small>

              <small>
                Keep this page open until
                the upload finishes.
              </small>
            </label>

            <label className="admin-file-card">
              <span>Poster image</span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={saving}
                onChange={choosePoster}
              />

              <small>
                {posterFile?.name ||
                  (form.posterPath
                    ? "Current poster saved"
                    : "Optional, max 10 MB")}
              </small>
            </label>
          </div>

          {saving && videoFile && (
            <div role="status">
              <p>
                Video upload: {progress}%
              </p>

              <progress
                max="100"
                value={progress}
                style={{
                  width: "100%",
                }}
                aria-label="R2 video upload progress"
              />
            </div>
          )}

          <label className="publish-toggle">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) =>
                update(
                  "isPublished",
                  event.target.checked,
                )
              }
              disabled={saving}
            />

            <span>
              Publish after saving and completing
              checkout setup
            </span>
          </label>

          <div className="admin-upload-footer">
            <div className="game-form-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  resetForm();
                  setMessage("");
                }}
              >
                Clear / cancel edit
              </button>

              <button
                className="admin-upload-button"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : form.id
                    ? "Save changes"
                    : "Save film"}
              </button>
            </div>
          </div>

          {message && (
            <p
              className={`admin-upload-message ${messageType}`}
              role="status"
              aria-live="polite"
              style={{
                whiteSpace: "pre-wrap",
              }}
            >
              {message}
            </p>
          )}
        </form>
      </section>

      <section className="game-manager-section film-manager-section">
        <div className="game-manager-heading">
          <div>
            <p className="eyebrow">
              FILM MANAGEMENT
            </p>

            <h2>My films</h2>
          </div>

          <button
            type="button"
            onClick={loadStudio}
            disabled={
              saving ||
              loading ||
              Boolean(busyId)
            }
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading films...</p>
        ) : !films.length ? (
          <p>No films uploaded yet.</p>
        ) : (
          <div className="game-manager-list">
            {films.map((film) => {
              const cover = posterUrl(
                film.poster_path,
              );

              const r2 =
                film.video_storage_provider ===
                "r2";

              return (
                <article
                  className="game-manager-card film-manager-card"
                  key={film.id}
                >
                  <div
                    className="game-manager-cover film-manager-cover"
                    style={
                      cover
                        ? {
                            backgroundImage:
                              `url("${cover}")`,
                            backgroundSize:
                              "cover",
                          }
                        : undefined
                    }
                  >
                    <span>
                      {film.is_published
                        ? "Published"
                        : "Draft"}
                    </span>
                  </div>

                  <div className="game-manager-info">
                    <h3>{film.title}</h3>

                    <p>
                      {film.genre} -{" "}
                      {film.release_year ||
                        "Unknown year"}{" "}
                      -{" "}
                      {film.duration ||
                        "Unknown duration"}
                    </p>

                    <p>
                      {film.description ||
                        "No description added."}
                    </p>

                    <p>
                      Access:{" "}
                      {film.access_type} -{" "}
                      {isChargeable(
                        film.access_type,
                      )
                        ? currency(
                            film.price_cents,
                          )
                        : film.access_type ===
                            "subscription"
                          ? "Subscription"
                          : "Free"}
                    </p>

                    <p>
                      Video storage:{" "}
                      {r2
                        ? "Cloudflare R2"
                        : "Supabase"}
                    </p>

                    {r2 && (
                      <p>
                        Private R2 playback enabled.
                        R2 deletion is not connected yet.
                      </p>
                    )}

                    {isChargeable(
                      film.access_type,
                    ) && (
                      <p>
                        Checkout:{" "}
                        {film.paddle_price_id
                          ? `Ready (${film.paddle_price_id})`
                          : "Not ready - edit and save to create price"}
                      </p>
                    )}

                    <div className="game-manager-actions">
                      <button
                        type="button"
                        disabled={
                          saving ||
                          Boolean(busyId)
                        }
                        onClick={() =>
                          editFilm(film)
                        }
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
                          saving || Boolean(busyId)
                        }
                        onClick={() =>
                          togglePublished(film)
                        }
                      >
                        {film.is_published
                          ? "Unpublish"
                          : "Publish"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          saving ||
                          Boolean(busyId) ||
                          r2
                        }
                        onClick={() =>
                          deleteFilm(film)
                        }
                      >
                        {r2
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