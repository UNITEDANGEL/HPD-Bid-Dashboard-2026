import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-ai-dashboard.css";
import "./map-ai-dashboard-v2.css";
import MapAiDashboard from "./MapAiDashboard";
import MapClient from "./MapClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapAiDashboard />
    </>
  );
}
