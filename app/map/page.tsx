import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-workflow-controller.css";
import "./map-hybrid-b.css";
import MapClient from "./MapClient";
import MapHybridViewModeClient from "./MapHybridViewModeClient";
import MapNativeRoadRoute from "./MapNativeRoadRoute";
import MapRouteClickFix from "./MapRouteClickFix";
import MapWorkflowControllerClient from "./MapWorkflowControllerClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapWorkflowControllerClient />
      <MapHybridViewModeClient />
      <MapNativeRoadRoute />
      <MapRouteClickFix />
    </>
  );
}
