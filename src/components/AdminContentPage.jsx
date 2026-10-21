import { useState } from "react";

import AdminDashboard from "./AdminDashboard";
import FilmStudioPage from "./FilmStudioPage";
import GameStudioPage from "./GameStudioPage";
import ProductStudioPage from "./ProductStudioPage";
import SubscriptionStudioPage from "./SubscriptionStudioPage";

export default function AdminContentPage({ onBack }) {
  const [activeStudio, setActiveStudio] = useState("dashboard");

  function goToDashboard() {
    setActiveStudio("dashboard");
  }

  if (activeStudio === "films") {
    return <FilmStudioPage onBack={goToDashboard} />;
  }

  if (activeStudio === "games") {
    return <GameStudioPage onBack={goToDashboard} />;
  }

  if (activeStudio === "products") {
    return <ProductStudioPage onBack={goToDashboard} />;
  }

  if (activeStudio === "subscriptions") {
    return <SubscriptionStudioPage onBack={goToDashboard} />;
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