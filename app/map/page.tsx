import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-workflow-controller.css";
import "./map-hybrid-b.css";
import "./map-road-route.css";
import MapClient from "./MapClient";
import MapHybridViewModeClient from "./MapHybridViewModeClient";
import MapRoadRouteOverlayClient from "./MapRoadRouteOverlayClient";
import MapWorkflowControllerClient from "./MapWorkflowControllerClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapWorkflowControllerClient />
      <MapHybridViewModeClient />
      <MapRoadRouteOverlayClient />
    </>
  );
}
