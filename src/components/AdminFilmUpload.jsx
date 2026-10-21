import { useState } from "react";
import { Upload } from "tus-js-client";
import { supabase } from "../supabaseClient";
import { uploadFilmToR2 } from "../r2FilmUpload";

const BUCKET = "films-free";
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const MAX_POSTER_SIZE = 10 * 1024 * 1024;

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const POSTER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

function safeFileName(fileName) {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "upload";
}

function formatFileSize(bytes) {
  if (!bytes) {
    return "0 KB";
  }

  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function getTusConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const apiKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !apiKey) {
    throw new Error(
      "Supabase URL or public API key is not configured.",
    );
  }

  const url = new URL(supabaseUrl);
  const projectRef = url.hostname.split(".")[0];

  const endpoint = url.hostname.endsWith(".supabase.co")
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : `${supabaseUrl}/storage/v1/upload/resumable`;

  return { endpoint, apiKey };
}

async function uploadResumable(file, path, onProgress) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error("Your session expired. Sign in again.");
  }

  const { endpoint, apiKey } = getTusConfig();

  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      removeFingerprintOnSuccess: true,
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onProgress(bytesUploaded, bytesTotal) {
        const percent =
          bytesTotal > 0
            ? Math.round((bytesUploaded / bytesTotal) * 100)
            : 0;

        onProgress?.(percent);
      },
      onError: reject,
      onSuccess: resolve,
    });

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        upload.start();
      })
      .catch(reject);
  });
}

export default function AdminFilmUpload({ onUploaded }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [releaseYear, setReleaseYear] = useState("");
  const [duration, setDuration] = useState("");

  const [accessType, setAccessType] = useState("free");
  const [priceUsd, setPriceUsd] = useState("");
  const [paddlePriceId, setPaddlePriceId] = useState("");

  const [videoFile, setVideoFile] = useState(null);
  const [posterFile, setPosterFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  function handleVideoChange(event) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setVideoFile(null);
      return;
    }

    if (!VIDEO_TYPES.has(file.type)) {
      event.target.value = "";
      setVideoFile(null);
      showMessage(
        "Choose an MP4, WebM, or MOV video file.",
        "error",
      );
      return;
    }

    setVideoFile(file);
    showMessage("");
  }

  function handlePosterChange(event) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setPosterFile(null);
      return;
    }

    if (!POSTER_TYPES.has(file.type)) {
      event.target.value = "";
      setPosterFile(null);
      showMessage(
        "Choose a JPG, PNG, or WebP poster image.",
        "error",
      );
      return;
    }

    if (file.size > MAX_POSTER_SIZE) {
      event.target.value = "";
      setPosterFile(null);
      showMessage(
        "Poster images must be 10 MB or smaller.",
        "error",
      );
      return;
    }

    setPosterFile(file);
    showMessage("");
  }

  function handleAccessTypeChange(event) {
    const nextAccessType = event.target.value;

    setAccessType(nextAccessType);

    if (nextAccessType === "free") {
      setPriceUsd("");
      setPaddlePriceId("");
    }
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
      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.priceId) {
      throw new Error(
        "Paddle price was created, but no price ID was returned.",
      );
    }

    return data.priceId;
  }
  const isPaidAccess =
     accessType === "paid" || accessType === "rent";

  async function handleUpload(event) {
    event.preventDefault();
  const form = event.currentTarget;

    if (!title.trim()) {
      showMessage("Enter a film title.", "error");
      return;
    }

    if (!videoFile) {
      showMessage("Choose a video file.", "error");
      return;
    }

    const priceInDollars = Number(priceUsd || 0);


    if (
      isPaidAccess &&
      (!Number.isFinite(priceInDollars) || priceInDollars <= 0)
    ) {
      showMessage(
        "Enter a price greater than $0.00 for a paid or rental film.",
        "error",
      );
      return;
    }

    if (
      accessType === "paid" &&
      !paddlePriceId.trim()
    ) {
      showMessage(
        "Enter the Paddle price ID for this paid film.",
        "error",
      );
      return;
    }

    setLoading(true);
    setProgress(0);
    showMessage("Checking administrator access…");

    let videoPath = null;
    let posterPath = null;
    let filmSaved = false;
    let r2Video = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Sign in with an administrator account.");
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .single();

      if (profileError) {
        throw profileError;
      }

      if (profile?.is_admin !== true) {
        throw new Error("Only administrators can upload films.");
      }

      const uploadId = crypto.randomUUID();

      videoPath = `videos/${uploadId}-${safeFileName(
        videoFile.name,
      )}`;

      showMessage("Uploading video… 0%");

      showMessage("Uploading video to R2… 0%");

      r2Video = await uploadFilmToR2(videoFile, (percent) => {
        setProgress(percent);
        showMessage(`Uploading video to R2… ${percent}%`);
      });

      videoPath = r2Video.video_path;

      if (posterFile) {
        posterPath = `posters/${uploadId}-${safeFileName(
          posterFile.name,
        )}`;

        showMessage("Uploading poster…");

        await uploadResumable(posterFile, posterPath);
      }

      showMessage("Saving film as an unpublished draft…");

      const priceCents = isPaidAccess
        ? Math.round(priceInDollars * 100)
        : 0;

      const { data: newFilm, error: filmError } = await supabase
        .from("films")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          genre,
          release_year: Number(releaseYear) || null,
          duration: duration.trim() || null,
          rating: 0,
          video_path: r2Video.video_path,
          video_bucket: r2Video.video_bucket,
          video_storage_provider: r2Video.video_storage_provider,
          poster_path: posterPath,
          created_by: user.id,

          access_type: accessType,
          is_paid: isPaidAccess,
          price_cents: priceCents,

          paddle_price_id:
            accessType === "paid"
              ? paddlePriceId.trim()
              : null,

          is_published: false,
        })
        .select("id")
        .single();

      if (filmError) {
        throw filmError;
      }

      filmSaved = true;

      if (accessType === "rent") {
        showMessage("Creating Paddle rental price…");

        await createFilmPrice(newFilm.id);

        showMessage("Paddle rental price created.");
      }

      setTitle("");
      setDescription("");
      setGenre("Drama");
      setReleaseYear("");
      setDuration("");

      setAccessType("free");
      setPriceUsd("");
      setPaddlePriceId("");

      setVideoFile(null);
      setPosterFile(null);

      eform.reset();

      showMessage(
        "Film uploaded and saved as an unpublished draft.",
        "success",
      );

      onUploaded?.();
    } catch (error) {
      console.error("Film upload failed:", error);

      if (!filmSaved) {
        const paths = [posterPath].filter(Boolean);

        if (paths.length > 0) {
          const { error: cleanupError } = await supabase.storage
            .from(BUCKET)
            .remove(paths);

          if (cleanupError) {
            console.error(
              "Could not remove incomplete upload:",
              cleanupError,
            );
          }
        }
      }

      showMessage(
        error instanceof Error
          ? error.message
          : "Upload failed.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-upload-panel">
      <div className="admin-upload-header">
        <div>
          <p className="eyebrow">ADMIN TOOLS</p>
          <h2>Upload a film</h2>

          <p>
            Upload films as unpublished drafts, then publish them
            from Film Studio when they are ready.
          </p>
        </div>

        <div className="admin-badge">Admin only</div>
      </div>

      <form
        className="admin-upload-form"
        onSubmit={handleUpload}
      >
        <div className="admin-form-section">
          <div className="admin-section-title">
            <span>01</span>

            <div>
              <h3>Film information</h3>
              <p>Enter the details viewers will see.</p>
            </div>
          </div>

          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide">
              <span>
                Film title <b>*</b>
              </span>

              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="Example: The Last Horizon"
                disabled={loading}
                required
              />
            </label>

            <label className="admin-field">
              <span>Genre</span>

              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                disabled={loading}
              >
                {GENRES.map((item) => (
                  <option key={item} value={item}>
                    {item}
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
                value={releaseYear}
                onChange={(event) =>
                  setReleaseYear(event.target.value)
                }
                placeholder="2026"
                disabled={loading}
              />
            </label>

            <label className="admin-field">
              <span>Duration</span>

              <input
                type="text"
                value={duration}
                onChange={(event) =>
                  setDuration(event.target.value)
                }
                maxLength={40}
                placeholder="2h 10m"
                disabled={loading}
              />
            </label>

            <label className="admin-field admin-field-wide">
              <span>Description</span>

              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                maxLength={5000}
                placeholder="Write a short description of the film..."
                rows={5}
                disabled={loading}
              />
            </label>
          </div>
        </div>

        <div className="admin-form-section">
          <div className="admin-section-title">
            <span>02</span>

            <div>
              <h3>Access and payment</h3>

              <p>
                Choose whether this film is free, rented, or
                permanently purchased.
              </p>
            </div>
          </div>

          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Viewer access</span>

              <select
                value={accessType}
                onChange={handleAccessTypeChange}
                disabled={loading}
              >
                <option value="free">Free for everyone</option>
                <option value="rent">
                  Rent — temporary rental payment
                </option>
                <option value="paid">
                  Paid — permanent purchase
                </option>
              </select>
            </label>

            {isPaidAccess && (
              <label className="admin-field">
                <span>
                  Price in USD <b>*</b>
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={priceUsd}
                  onChange={(event) =>
                    setPriceUsd(event.target.value)
                  }
                  placeholder="For example: 4.99"
                  disabled={loading}
                  required
                />

                <small>
                  Enter dollars, not cents. For example, 4.99 is
                  saved as 499 cents.
                </small>
              </label>
            )}

            {accessType === "rent" && (
              <div className="admin-field admin-field-wide">
                <small>
                  A Paddle rental price will be created automatically
                  after the film is saved.
                </small>
              </div>
            )}

            {accessType === "paid" && (
              <label className="admin-field admin-field-wide">
                <span>
                  Paddle price ID <b>*</b>
                </span>

                <input
                  type="text"
                  value={paddlePriceId}
                  onChange={(event) =>
                    setPaddlePriceId(event.target.value)
                  }
                  placeholder="pri_..."
                  disabled={loading}
                  required
                />

                <small>
                  Create a matching Sandbox price in Paddle, then
                  paste its `pri_...` ID here.
                </small>
              </label>
            )}
          </div>
        </div>

        <div className="admin-form-section">
          <div className="admin-section-title">
            <span>03</span>

            <div>
              <h3>Film files</h3>

              <p>
                Videos upload to Cloudflare R2 in chunks with automatic retries.
                Keep this page open until the upload finishes.
              </p>
            </div>
          </div>

          <div className="admin-file-grid">
            <label className="admin-file-card admin-video-file">
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleVideoChange}
                disabled={loading}
                required
              />

              <span className="admin-file-icon">▶</span>
              <strong>Choose video file</strong>

              <small>
                MP4, WebM or MOV
                <br />
                Required
              </small>

              {videoFile && (
                <span className="selected-file">
                  {videoFile.name}
                  <br />
                  {formatFileSize(videoFile.size)}
                </span>
              )}
            </label>

            <label className="admin-file-card">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePosterChange}
                disabled={loading}
              />

              <span className="admin-file-icon">▧</span>
              <strong>Choose poster image</strong>

              <small>
                PNG, JPG or WebP
                <br />
                Optional, max 10 MB
              </small>

              {posterFile && (
                <span className="selected-file">
                  {posterFile.name}
                  <br />
                  {formatFileSize(posterFile.size)}
                </span>
              )}
            </label>
          </div>
        </div>

        {loading && (
          <progress
            aria-label="Video upload progress"
            max="100"
            value={progress}
            style={{ width: "100%" }}
          />
        )}

        <div className="admin-upload-footer">
          <p className="admin-required-note">
            <b>*</b> Required fields
          </p>

          <button
            className="admin-upload-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Uploading…" : "Upload draft"}
          </button>
        </div>

        {message && (
          <p
            className={`admin-upload-message ${messageType}`}
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}