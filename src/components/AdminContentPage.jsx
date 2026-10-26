import { useState } from "react";

import AdminDashboard from "./AdminDashboard";
import AdminFilmUpload from "./AdminFilmUpload";
import GameStudioPage from "./GameStudioPage";
import ProductStudioPage from "./ProductStudioPage";
import SubscriptionStudioPage from "./SubscriptionStudioPage";

export default function AdminContentPage({ onBack }) {
  const [activeStudio, setActiveStudio] = useState("dashboard");

  function goToDashboard() {
    setActiveStudio("dashboard");
  }

  if (activeStudio === "films") {
    return (
      <div>
        <div className="content-section" style={{ paddingBottom: 0 }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={goToDashboard}
          >
            ← Back to admin
          </button>
        </div>
        <AdminFilmUpload onUploaded={goToDashboard} />
      </div>
    );
  }

  if (activeStudio === "games") {
    return <GameStudioPage onBack={goToDashboard} />;
  }

  if (activeStudio === "products") {
    return (
      <div>
        <div className="content-section" style={{ paddingBottom: 0 }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={goToDashboard}
          >
            ← Back to admin
          </button>
        </div>
        <ProductStudioPage />
      </div>
    );
  }

  if (activeStudio === "subscriptions") {
    return (
      <div>
        <div className="content-section" style={{ paddingBottom: 0 }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={goToDashboard}
          >
            ← Back to admin
          </button>
        </div>
        <SubscriptionStudioPage />
      </div>
    );
  }

  return (
    <AdminDashboard
      onOpenFilmStudio={() => setActiveStudio("films")}
      onOpenGameStudio={() => setActiveStudio("games")}
      onOpenProductStudio={() => setActiveStudio("products")}
      onOpenSubscriptionStudio={() => setActiveStudio("subscriptions")}
      onBack={onBack}
    />
  );
}