import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const EMPTY_FORM = {
  title: "",
  description: "",
  genre: "Drama",
  release_year: "",
  duration: "",
  access_type: "free",
  is_published: false,
};

export default function AdminContentPage({ onBack }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [films, setFilms] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        if (alive) {
          setError("Sign in with an administrator account.");
          setLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (profileError || profile?.is_admin !== true) {
        setError("You do not have permission to access content management.");
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      const { data, error: filmsError } = await supabase
        .from("films")
        .select("id,title,genre,release_year,access_type,is_published,created_at")
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (filmsError) setError(filmsError.message);
      else setFilms(data || []);

      setLoading(false);
    }

    load().catch((loadError) => {
      if (alive) {
        setError(loadError?.message || "Could not load content.");
        setLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  function updateField(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isAdmin) {
      setError("Administrator access is required.");
      return;
    }

    const title = form.title.trim();

    if (!title) {
      setError("Enter a film title.");
      return;
    }

    const year = form.release_year.trim()
      ? Number(form.release_year)
      : null;

    if (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2100)) {
      setError("Enter a valid release year.");
      return;
    }

    setSaving(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setError("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("films")
      .insert({
        title,
        description: form.description.trim() || null,
        genre: form.genre.trim() || null,
        release_year: year,
        duration: form.duration.trim() || null,
        access_type: form.access_type,
        is_published: form.is_published,
        created_by: authData.user.id,
      })
      .select("id,title,genre,release_year,access_type,is_published,created_at")
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setFilms((current) => [data, ...current]);
      setForm(EMPTY_FORM);
      setNotice("Film metadata created.");
    }

    setSaving(false);
  }

  async function setPublished(film, isPublished) {
    setError("");
    setNotice("");

    const { data, error: updateError } = await supabase
      .from("films")
      .update({ is_published: isPublished })
      .eq("id", film.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (!data) {
      setError("No row was updated. Check the admin RLS policy.");
      return;
    }

    setFilms((current) =>
      current.map((item) =>
        item.id === film.id ? { ...item, is_published: isPublished } : item
      )
    );

    setNotice(isPublished ? "Film published." : "Film unpublished.");
  }

  if (loading) {
    return (
      <section className="content-section">
        <p className="eyebrow">Admin</p>
        <h1>Content Studio</h1>
        <p className="status-line" role="status">Checking access…</p>
      </section>
    );
  }

  return (
    <section className="content-section">
      <button
        className="button button-secondary"
        type="button"
        onClick={onBack}
      >
        ← Back
      </button>

      <header className="section-heading">
        <p className="eyebrow">Admin</p>
        <h1>Content Studio</h1>
        <p>Create film metadata. Video upload and paid playback are not enabled here.</p>
      </header>

      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}

      {!isAdmin ? (
        <div className="empty-state">
          <h2>Admin access required</h2>
          <p>Ask a project owner to grant your account administrator access.</p>
        </div>
      ) : (
        <>
          <form className="studio-form" onSubmit={handleSubmit}>
            <label>
              Film title
              <input
                name="title"
                value={form.title}
                onChange={updateField}
                maxLength={180}
                required
                disabled={saving}
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={updateField}
                rows={5}
                maxLength={5000}
                disabled={saving}
              />
            </label>

            <div className="studio-form-row">
              <label>
                Genre
                <input
                  name="genre"
                  value={form.genre}
                  onChange={updateField}
                  maxLength={80}
                  disabled={saving}
                />
              </label>

              <label>
                Release year
                <input
                  name="release_year"
                  type="number"
                  min="1888"
                  max="2100"
                  value={form.release_year}
                  onChange={updateField}
                  disabled={saving}
                />
              </label>

              <label>
                Duration
                <input
                  name="duration"
                  value={form.duration}
                  onChange={updateField}
                  maxLength={40}
                  placeholder="1h 45m"
                  disabled={saving}
                />
              </label>
            </div>

            <label>
              Access type
              <select
                name="access_type"
                value={form.access_type}
                onChange={updateField}
                disabled={saving}
              >
                <option value="free">Free</option>
                <option value="purchase">Purchase (not enabled)</option>
                <option value="rental">Rental (not enabled)</option>
                <option value="subscription">Subscription (not enabled)</option>
              </select>
            </label>

            <label className="checkbox-row">
              <input
                name="is_published"
                type="checkbox"
                checked={form.is_published}
                onChange={updateField}
                disabled={saving}
              />
              Publish metadata
            </label>

            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create film"}
            </button>
          </form>

          <section className="studio-list">
            <h2>Film metadata</h2>

            {films.length === 0 ? (
              <p className="status-line">No films in the database yet.</p>
            ) : (
              <div className="studio-items">
                {films.map((film) => (
                  <article className="studio-item" key={film.id}>
                    <div>
                      <h3>{film.title}</h3>
                      <p>
                        {film.genre || "No genre"} · {film.release_year || "Year unknown"} ·{" "}
                        {film.access_type} · {film.is_published ? "Published" : "Draft"}
                      </p>
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setPublished(film, !film.is_published)}
                    >
                      {film.is_published ? "Unpublish" : "Publish"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}