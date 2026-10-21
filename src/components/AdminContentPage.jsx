import { useState } from "react";

import AdminDashboard from "./AdminDashboard";
import GameStudioPage from "./GameStudioPage";
import ProductStudioPage from "./ProductStudioPage";
import SubscriptionStudioPage from "./SubscriptionStudioPage";

export default function AdminContentPage({ onBack }) {
  const [activeStudio, setActiveStudio] = useState("dashboard");

  function goToDashboard() {
    setActiveStudio("dashboard");
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
      onOpenGameStudio={() => setActiveStudio("games")}
      onOpenProductStudio={() => setActiveStudio("products")}
      onOpenSubscriptionStudio={() => setActiveStudio("subscriptions")}
      onBack={onBack}
    />
  );
}