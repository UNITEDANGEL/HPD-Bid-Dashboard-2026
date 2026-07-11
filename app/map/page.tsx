import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-ai-dashboard.css";
import "./map-ai-dashboard-v2.css";
import "./map-ai-guided.css";
import MapAiGuidedDashboard from "./MapAiGuidedDashboard";
import MapClient from "./MapClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapAiGuidedDashboard />
    </>
  );
}
