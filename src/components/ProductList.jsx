import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, description, price, image_url")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setProducts(data || []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load products");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p>Loading products…</p>;
  }

  if (error) {
    return <p style={{ color: "red" }}>Error: {error}</p>;
  }

  if (!products.length) {
    return <p>No products found. Add some in Supabase.</p>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "16px",
      }}
    >
      {products.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <img
            src={p.image_url || "https://via.placeholder.com/220"}
            alt={p.name}
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              objectFit: "cover",
              borderRadius: "6px",
            }}
          />
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
            }}
          >
            {p.name}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#555",
            }}
          >
            {p.description}
          </p>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>${Number(p.price || 0).toFixed(2)}</strong>
            <button
              type="button"
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                background: "#000",
                color: "#fff",
                cursor: "pointer",
              }}
              onClick={() => alert("Add to cart: " + p.name)}
            >
              Add to cart
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}