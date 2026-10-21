import { useState } from "react";

import AdminDashboard from "./AdminDashboard";
import GameStudioPage from "./GameStudioPage";

export default function AdminContentPage({ onBack }) {
  const [activeStudio, setActiveStudio] = useState("dashboard");

  function goToDashboard() {
    setActiveStudio("dashboard");
  }

  if (activeStudio === "games") {
    return <GameStudioPage onBack={goToDashboard} />;
  }

  return (
    <AdminDashboard
      onOpenGameStudio={() => setActiveStudio("games")}
      onBack={onBack}
    />
  );
}