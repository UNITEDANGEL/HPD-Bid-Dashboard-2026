import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-ai-operations.css";
import MapAiOperationsDashboard from "./MapAiOperationsDashboard";
import MapClient from "./MapClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapAiOperationsDashboard />
    </>
  );
}
