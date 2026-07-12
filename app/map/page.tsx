import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-workflow-controller.css";
import "./map-hybrid-b.css";
import MapHybridViewModeClient from "./MapHybridViewModeClient";
import MapWorkflowControllerClient from "./MapWorkflowControllerClient";

export default function MapPage() {
  return (
    <>
      <MapWorkflowControllerClient />
      <MapHybridViewModeClient />
    </>
  );
}
