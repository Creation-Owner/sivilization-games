import { useState } from "react";
import { supabase } from "../supabaseClient";

const FUNCTION_URL =
  "https://lpwzqifopxyzkdjtskiv.supabase.co/functions/v1/create-paddle-product";

export default function ProductStudioPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const priceCents = Math.round(Number(price) * 100);

      if (!title.trim()) {
        throw new Error("Enter a product title.");
      }

      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error("Enter a price greater than zero.");
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        throw new Error("Please log in before creating a product.");
      }

      let imageUrl = "";
      let imagePath = "";

      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
          throw new Error("Please choose a valid image file.");
        }

        const extension = imageFile.name.split(".").pop() || "jpg";
        const filePath = `products/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imagePath = filePath;
        imageUrl = publicUrlData?.publicUrl || "";
      }

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          imageUrl,
          imagePath,
          priceCents,
        }),
      });

      const responseText = await response.text();

      let result = {};

      try {
        result = JSON.parse(responseText);
      } catch {
        result = { error: responseText };
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            responseText ||
            "Could not create the product."
        );
      }

      setMessage(
        `${result.product?.title || title} was created and is ready to sell.`
      );

      setTitle("");
      setDescription("");
      setCategory("");
      setPrice("");
      setImageFile(null);
      event.currentTarget.reset();
    } catch (actionError) {
      setError(actionError?.message || "Could not create the product.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-page">
      <div className="admin-upload-panel">
        <header className="admin-upload-header">
          <div>
            <p className="eyebrow">OWNER TOOLS</p>
            <h2>Create a shop product</h2>
            <p>
              Create a product in Paddle Sandbox and add it to the Sivilization
              Shop automatically.
            </p>
          </div>

          <span className="admin-badge">Owner only</span>
        </header>

        <form className="admin-upload-form" onSubmit={handleSubmit}>
          <div className="admin-form-section">
            <div className="admin-section-title">
              <span>01</span>

              <div>
                <h3>Product information</h3>
                <p>Set the information customers will see in the Shop.</p>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field admin-field-wide">
                <span>
                  Product title <b>*</b>
                </span>

                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Sivilization Premium Pack"
                  disabled={loading}
                  required
                />
              </label>

              <label className="admin-field">
                <span>Category</span>

                <input
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Digital, Clothing, Gaming..."
                  disabled={loading}
                />
              </label>

              <label className="admin-field">
                <span>
                  Price in USD <b>*</b>
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="9.99"
                  disabled={loading}
                  required
                />
              </label>

              <label className="admin-field admin-field-wide">
                <span>Description</span>

                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what the customer receives..."
                  rows="5"
                  disabled={loading}
                />
              </label>
            </div>
          </div>

          <div className="admin-form-section">
            <div className="admin-section-title">
              <span>02</span>

              <div>
                <h3>Product image</h3>
                <p>Add an optional image for the Shop product card.</p>
              </div>
            </div>

            <label className="admin-file-card">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] || null)
                }
                disabled={loading}
              />

              <span className="admin-file-icon">▧</span>

              <strong>Choose product image</strong>

              <small>
                PNG, JPG, or WebP
                <br />
                Optional
              </small>

              {imageFile && (
                <span className="selected-file">{imageFile.name}</span>
              )}
            </label>
          </div>

          <div className="admin-upload-footer">
            <p className="admin-required-note">
              <b>*</b> Required fields
            </p>

            <button
              className="admin-upload-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating product…" : "Create product"}
            </button>
          </div>

          {message && (
            <p
              className="admin-upload-message success"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          )}

          {error && (
            <p
              className="admin-upload-message error"
              role="alert"
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}