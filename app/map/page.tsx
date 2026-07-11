import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-workflow-controller.css";
import MapClient from "./MapClient";
import MapWorkflowControllerClient from "./MapWorkflowControllerClient";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapWorkflowControllerClient />
    </>
  );
}
