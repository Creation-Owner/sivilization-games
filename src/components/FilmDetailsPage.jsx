import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { buyItem } from "../paddle";

function formatCurrency(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

async function loadCommentAuthorNames(filmId) {
  const { data, error } = await supabase.rpc(
    "get_film_comment_authors",
    {
      p_film_id: filmId,
    },
  );

  if (error) {
    throw error;
  }

  return Object.fromEntries(
    (data || []).map((profile) => [
      profile.id,
      {
        name: profile.full_name?.trim() || "Sivilization member",
        role:
          profile.is_owner === true
            ? "Owner"
            : profile.is_admin === true
              ? "Admin"
              : null,
      },
    ]),
  );
}

export default function FilmDetailsPage({
  film,
  allFilms = [],
  email,
  onBack,
  onOpenFilm,
  onNavigateToSubscriptions,
}) {
  const videoRef = useRef(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [postingComment, setPostingComment] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [commentAuthorNames, setCommentAuthorNames] = useState({});

  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isPrivileged, setIsPrivileged] = useState(false);
  const [hasComplimentaryAccess, setHasComplimentaryAccess] = useState(false);
  const [buyingFilm, setBuyingFilm] = useState(false);
  const [buyingWithWallet, setBuyingWithWallet] = useState(false);

  const accessType = String(film.access_type || "free").toLowerCase();

  const isSample =
    film.is_sample === true ||
    String(film.id || "").startsWith("sample-");

  const isSubscriptionFilm = accessType === "subscription";

  const isPaidFilm =
    accessType === "paid" ||
    accessType === "rent" ||
    isSubscriptionFilm;

  const isRentalFilm = accessType === "rent";

  const relatedFilms = useMemo(
    () =>
      allFilms
        .filter(
          (item) =>
            item.id !== film.id &&
            item.genre?.toLowerCase() === film.genre?.toLowerCase(),
        )
        .slice(0, 4),
    [allFilms, film.id, film.genre],
  );

  function getCommentAuthorName(comment) {
    return (
      commentAuthorNames[comment.user_id]?.name ||
      "Sivilization member"
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) throw error;

        if (!cancelled) {
          setCurrentUserId(user?.id || "");
        }
      } catch (error) {
        console.error("Could not load current user:", error);

        if (!cancelled) {
          setCurrentUserId("");
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("payment") === "success") {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());

      window.location.reload();
    }
  }, [film.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      setLoadingComments(true);
      setMessage("");
      setComments([]);
      setCommentAuthorNames({});

      if (isSample) {
        setLoadingComments(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("film_comments")
          .select("id, film_id, user_id, comment_text, created_at")
          .eq("film_id", film.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) {
          setComments(data || []);
        }
      } catch (error) {
        console.error("Could not load film comments:", error);

        if (!cancelled) {
          setMessage(
            error?.message || "Comments could not be loaded.",
          );
          setComments([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingComments(false);
        }
      }
    }

    loadComments();

    return () => {
      cancelled = true;
    };
  }, [film.id, isSample]);

  useEffect(() => {
    let cancelled = false;

    async function loadNames() {
      if (isSample || !film.id || comments.length === 0) {
        setCommentAuthorNames({});
        return;
      }

      try {
        const authors = await loadCommentAuthorNames(film.id);

        if (!cancelled) {
          setCommentAuthorNames(authors);
        }
      } catch (error) {
        console.error(
          "Could not load comment author names:",
          error,
        );

        if (!cancelled) {
          setCommentAuthorNames({});
        }
      }
    }

    loadNames();

    return () => {
      cancelled = true;
    };
  }, [film.id, isSample, comments]);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      setCheckingAccess(true);
      setHasAccess(false);
      setIsPrivileged(false);
      setHasComplimentaryAccess(false);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("is_admin, is_owner")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const privileged =
          profile?.is_admin === true ||
          profile?.is_owner === true;

        let purchaseValid = false;
        let subscriptionValid = false;
        let complimentaryValid = false;

        if (!isSample) {
          const { data: purchases, error: purchasesError } =
            await supabase
              .from("purchases")
              .select("id, purchase_type, expires_at")
              .eq("user_id", user.id)
              .eq("film_id", film.id)
              .in("purchase_type", ["rent", "buy"])
              .order("created_at", { ascending: false })
              .limit(10);

          if (purchasesError) {
            console.error(
              "Could not check film purchases:",
              purchasesError,
            );
          } else {
            purchaseValid = (purchases || []).some((purchase) => {
              if (purchase.purchase_type === "buy") {
                return true;
              }

              return (
                purchase.purchase_type === "rent" &&
                (!purchase.expires_at ||
                  new Date(purchase.expires_at) > new Date())
              );
            });
          }

          const { data: sub, error: subscriptionError } =
            await supabase
              .from("subscriptions")
              .select("id")
              .eq("user_id", user.id)
              .eq("status", "active")
              .or("ends_at.is.null,ends_at.gt.now()")
              .limit(1)
              .maybeSingle();

          if (subscriptionError) {
            console.error(
              "Could not check membership:",
              subscriptionError,
            );
          } else {
            subscriptionValid = Boolean(sub);
          }

          const {
            data: complimentary,
            error: complimentaryError,
          } = await supabase
            .from("owner_complimentary_access")
            .select("expires_at")
            .eq("user_id", user.id)
            .gt("expires_at", new Date().toISOString())
            .limit(1)
            .maybeSingle();

          if (complimentaryError) {
            console.error(
              "Could not check complimentary access:",
              complimentaryError,
            );
          } else {
            complimentaryValid = Boolean(complimentary);
          }
        }

        if (cancelled) return;

        setIsPrivileged(privileged);
        setHasComplimentaryAccess(complimentaryValid);

        const allowed =
          !isPaidFilm ||
          privileged ||
          complimentaryValid ||
          (isSubscriptionFilm && subscriptionValid) ||
          ((accessType === "paid" || accessType === "rent") &&
            purchaseValid);

        setHasAccess(allowed);
      } catch (error) {
        console.error("Could not check watch access:", error);

        if (!cancelled) {
          setHasAccess(false);
          setMessage(
            error?.message || "Could not check your watch access.",
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingAccess(false);
        }
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [
    film.id,
    isSample,
    accessType,
    isPaidFilm,
    isSubscriptionFilm,
  ]);

  async function requestVideoUrl() {
    setVideoError("");
    setVideoUrl("");

    if (!film.id) {
      setVideoError("This film has no database ID.");
      return;
    }

    if (isSample) {
      if (film.video_url) {
        setVideoUrl(film.video_url);
      } else {
        setVideoError("This sample film has no video URL.");
      }

      return;
    }

    if (isPaidFilm && !hasAccess) {
      setVideoError(
        "You do not currently have access to this film.",
      );
      return;
    }

    setLoadingVideo(true);

    try {
      if (!film.video_path && film.video_url && !isPaidFilm) {
        setVideoUrl(film.video_url);
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "get-film-stream",
        {
          body: { film_id: film.id },
        },
      );

      if (error) throw error;

      if (!data?.url) {
        throw new Error(
          data?.error || "The function returned no video URL.",
        );
      }

      setVideoUrl(data.url);
    } catch (error) {
      console.error("Playback request failed:", error);

      setVideoError(
        error?.message || "Could not authorize playback.",
      );
    } finally {
      setLoadingVideo(false);
    }
  }

  async function handleBuyFilm() {
    if (buyingFilm) return;

    setMessage("");
    setBuyingFilm(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Please sign in before purchasing a film.",
        );
      }

      if (!film.paddle_price_id) {
        throw new Error(
          "This film does not have a Paddle price configured yet.",
        );
      }

      await buyItem({
        priceId: film.paddle_price_id,
        customData: {
          user_id: user.id,
          film_id: film.id,
          payment_type: "film",
          access_type: accessType,
        },
      });
    } catch (error) {
      console.error("Buy film failed:", error);

      setMessage(
        error?.message || "Could not open Paddle checkout.",
      );
    } finally {
      setBuyingFilm(false);
    }
  }

  async function handleBuyWithWallet() {
    if (buyingWithWallet) return;

    setMessage("");
    setBuyingWithWallet(true);

    try {
      const { data, error } = await supabase.rpc(
        "purchase_with_wallet",
        {
          p_item_type: "film",
          p_item_id: film.id,
        },
      );

      if (error) throw error;

      window.dispatchEvent(new Event("wallet-updated"));

      setHasAccess(true);
      setMessage(
        isRentalFilm
          ? "Rental successful. You can now watch this film."
          : "Purchase successful. You can now watch this film.",
      );
    } catch (error) {
      console.error("Wallet purchase failed:", error);

      setMessage(
        error?.message || "Could not complete the wallet purchase.",
      );
    } finally {
      setBuyingWithWallet(false);
    }
  }

  async function saveWatchProgress() {
    const video = videoRef.current;

    if (isSample || !film.id || !video?.duration) return;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) return;

      const durationSeconds = Math.floor(video.duration);
      const secondsWatched = Math.floor(video.currentTime);

      const { error } = await supabase
        .from("watch_progress")
        .upsert(
          {
            user_id: user.id,
            film_id: film.id,
            seconds_watched: secondsWatched,
            duration_seconds: durationSeconds,
            completed:
              durationSeconds > 0 &&
              secondsWatched >= durationSeconds * 0.95,
          },
          { onConflict: "user_id,film_id" },
        );

      if (error) throw error;
    } catch (error) {
      console.error("Could not save watch progress:", error);
    }
  }

  async function submitComment(event) {
    event.preventDefault();

    if (postingComment) return;

    const text = commentText.trim();

    if (!currentUserId) {
      setMessage("Sign in to post a comment.");
      return;
    }

    if (isSample) {
      setMessage("Comments are available on uploaded films.");
      return;
    }

    if (!text) {
      setMessage("Write a comment first.");
      return;
    }

    setPostingComment(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("film_comments")
        .insert({
          film_id: film.id,
          user_id: currentUserId,
          comment_text: text,
        })
        .select("id, film_id, user_id, comment_text, created_at")
        .single();

      if (error) throw error;

      setComments((current) => [data, ...current]);
      setCommentText("");
    } catch (error) {
      console.error("Could not post comment:", error);

      setMessage(
        error?.message || "Your comment could not be posted.",
      );
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteComment(commentId) {
    if (!window.confirm("Delete this comment? This cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("film_comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", currentUserId);

      if (error) throw error;

      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );
    } catch (error) {
      setMessage(
        error?.message || "Comment could not be deleted.",
      );
    }
  }

  function renderAccessMessage() {
    if (checkingAccess) {
      return (
        <p className="media-status">
          Checking watch access…
        </p>
      );
    }

    if (hasAccess) {
      return null;
    }

    if (isSubscriptionFilm) {
      return (
        <div className="film-paywall">
          <h2>Membership required</h2>

          <p>
            This film is included with a subscription. Choose a
            membership plan to watch it.
          </p>

          <button
            className="media-watch-button"
            type="button"
            onClick={onNavigateToSubscriptions}
          >
            View subscription plans
          </button>
        </div>
      );
    }

    const hasCheckoutPrice = Boolean(film.paddle_price_id);

    return (
      <div className="film-paywall">
        <h2>
          {isRentalFilm ? "Rental required" : "Purchase required"}
        </h2>

        <p>
          {isRentalFilm
            ? "Rent this film to unlock playback."
            : "Buy this film to unlock playback."}
        </p>

        <p>Price: {formatCurrency(film.price_cents)}</p>

        <button
          className="media-watch-button"
          type="button"
          onClick={handleBuyFilm}
          disabled={buyingFilm || !hasCheckoutPrice}
        >
          {buyingFilm
            ? "Opening checkout…"
            : hasCheckoutPrice
              ? `${
                  isRentalFilm ? "Rent film" : "Buy film"
                } — ${formatCurrency(film.price_cents)}`
              : "Payment temporarily unavailable"}
        </button>

        <button
          className="media-watch-button"
          type="button"
          onClick={handleBuyWithWallet}
          disabled={buyingWithWallet}
        >
          {buyingWithWallet
            ? "Processing wallet payment…"
            : isRentalFilm
              ? `Rent with wallet — ${formatCurrency(film.price_cents)}`
              : `Buy with wallet — ${formatCurrency(film.price_cents)}`}
        </button>

        {!hasCheckoutPrice && (
          <p className="media-access-message" role="status">
            Checkout is not ready for this film yet. Please try
            again later.
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="film-details-page section-page">
      <button
        className="back-button"
        type="button"
        onClick={onBack}
      >
        ← Back to films
      </button>

      <div className="film-details-layout">
        <div className="film-details-main">
          <div className="film-player-panel">
            {checkingAccess ? (
              <div className="film-video-empty">
                <h2>Checking access…</h2>
              </div>
            ) : isPaidFilm && !hasAccess ? (
              renderAccessMessage()
            ) : videoUrl ? (
              <video
                key={videoUrl}
                ref={videoRef}
                className="film-details-video"
                src={videoUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onPause={saveWatchProgress}
                onEnded={saveWatchProgress}
                onError={() =>
                  setVideoError(
                    "The video URL was returned, but the browser could not play it. Check that the file is in the selected bucket and encoded in a browser-supported format.",
                  )
                }
              />
            ) : (
              <div className="film-video-empty">
                <span aria-hidden="true">
                  {isPrivileged || hasAccess ? "▶" : "🔒"}
                </span>

                <h2>
                  {loadingVideo
                    ? "Preparing video…"
                    : videoError
                      ? "Video could not be opened"
                      : "Ready to watch?"}
                </h2>

                {videoError && (
                  <p
                    className="media-access-message"
                    role="alert"
                  >
                    {videoError}
                  </p>
                )}

                {!videoError && !loadingVideo && (
                  <p>Press play to request the film video.</p>
                )}

                {!loadingVideo && (
                  <button
                    className="media-watch-button"
                    type="button"
                    onClick={requestVideoUrl}
                    disabled={!hasAccess}
                  >
                    {videoError ? "Try again" : "Play film"}
                  </button>
                )}
              </div>
            )}
          </div>

          <section className="film-info-panel">
            <p className="eyebrow">FILM DETAILS</p>
            <h1>{film.title}</h1>

            <div className="film-details-meta">
              <span>{film.year || "Unknown year"}</span>
              <span>{film.duration || "Unknown duration"}</span>
              <span>{film.genre || "Film"}</span>
              <span>★ {film.rating || "0"}</span>
              <span>
                {accessType === "subscription"
                  ? "Subscription"
                  : accessType === "paid" || accessType === "rent"
                    ? "Paid"
                    : "Free"}
              </span>
            </div>

            <p className="film-description">
              {film.description ||
                "No description has been added yet."}
            </p>

            {message && (
              <p className="comment-message" role="status">
                {message}
              </p>
            )}
          </section>
        </div>

        <aside className="film-info-panel film-access-panel">
          <p className="eyebrow">WATCH ACCESS</p>

          {checkingAccess ? (
            <p>Checking access…</p>
          ) : hasAccess ? (
            <>
              <h2>Available to watch</h2>

              <p>
                {accessType === "free"
                  ? "This film is free to watch."
                  : isPrivileged
                    ? "You have owner or administrator access."
                    : hasComplimentaryAccess
                      ? "Complimentary access is active."
                      : "Your account has access to this film."}
              </p>

              {!videoUrl && (
                <button
                  className="media-watch-button"
                  type="button"
                  onClick={requestVideoUrl}
                  disabled={loadingVideo}
                >
                  {loadingVideo ? "Preparing…" : "Play film"}
                </button>
              )}
            </>
          ) : (
            renderAccessMessage()
          )}
        </aside>
      </div>

      <section className="related-films-section">
        <div className="details-section-heading">
          <div>
            <p className="eyebrow">KEEP EXPLORING</p>
            <h2>Related films</h2>
          </div>
        </div>

        {relatedFilms.length === 0 ? (
          <p className="media-status">No related films yet.</p>
        ) : (
          <div className="related-films-grid">
            {relatedFilms.map((item) => (
              <button
                className="related-film-card"
                type="button"
                key={item.id}
                onClick={() => onOpenFilm(item)}
              >
                <div
                  className="related-film-art"
                  style={
                    item.poster_url
                      ? {
                          backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.82)), url("${item.poster_url}")`,
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        }
                      : {
                          "--related-film-color":
                            item.color || "#172554",
                        }
                  }
                >
                  <span>{item.genre}</span>
                  <strong>★ {item.rating}</strong>
                </div>

                <div className="related-film-body">
                  <h3>{item.title}</h3>
                  <p>
                    {item.year} · {item.duration}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="comments-section">
        <div className="details-section-heading">
          <div>
            <p className="eyebrow">DISCUSSION</p>
            <h2>Comments</h2>
          </div>

          <span className="comments-count">
            {comments.length}{" "}
            {comments.length === 1 ? "comment" : "comments"}
          </span>
        </div>

        {isSample ? (
          <p className="media-status">
            Comments are available on uploaded films.
          </p>
        ) : (
          <>
            {currentUserId ? (
              <form
                className="comment-form"
                onSubmit={submitComment}
              >
                <textarea
                  value={commentText}
                  onChange={(event) =>
                    setCommentText(
                      event.target.value.slice(0, 1000),
                    )
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder={`Share your thoughts about ${film.title}...`}
                  disabled={postingComment}
                />

                <div className="comment-form-footer">
                  <span>{commentText.length}/1000</span>

                  <button
                    className="media-watch-button"
                    type="submit"
                    disabled={
                      postingComment || !commentText.trim()
                    }
                  >
                    {postingComment
                      ? "Posting…"
                      : "Post comment"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="media-status">
                Sign in to comment. Existing comments are visible
                below.
              </p>
            )}

            {loadingComments ? (
              <p className="media-status">
                Loading comments…
              </p>
            ) : comments.length === 0 ? (
              <div className="comments-empty">
                <h3>Be the first to comment</h3>
                <p>Start the discussion about this film.</p>
              </div>
            ) : (
              <div className="comments-list">
                {comments.map((comment) => {
                  const authorName =
                    getCommentAuthorName(comment);

                  const isOwnComment =
                    comment.user_id === currentUserId;

                  const avatarLetter =
                    authorName.charAt(0).toUpperCase() || "S";

                  const authorRole =
                    commentAuthorNames[comment.user_id]?.role || null;

                  return (
                    <article
                      className="comment-card"
                      key={comment.id}
                    >
                      <div
                        className="comment-avatar"
                        aria-hidden="true"
                      >
                        {avatarLetter}
                      </div>

                      <div className="comment-content">
                        <div className="comment-header">
                          <div className="comment-author-details">
                            <strong>{authorName}</strong>

                            {authorRole && (
                              <span
                                className={`comment-role-badge ${authorRole.toLowerCase()}`}
                              >
                                {authorRole}
                              </span>
                            )}

                            {isOwnComment && (
                              <span className="comment-you-label">(You)</span>
                            )}
                          </div>

                          <time dateTime={comment.created_at}>
                            {new Date(
                              comment.created_at,
                            ).toLocaleString()}
                          </time>
                        </div>

                        <p>{comment.comment_text}</p>
                      </div>

                      {isOwnComment && (
                        <button
                          className="comment-delete-button"
                          type="button"
                          onClick={() =>
                            deleteComment(comment.id)
                          }
                        >
                          Delete
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}