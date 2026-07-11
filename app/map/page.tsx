import "./v6-map-upgrade.css";
import "./v6-map-stability.css";
import "./map-ai-operations.css";
import "./map-directions-enhancer.css";
import "./map-field-visit-flow.css";
import "./map-smart-dispatch.css";
import "./map-smart-conversation.css";
import "./map-agent-lifecycle.css";
import "./map-results-board.css";
import MapAgentLifecycleClient from "./MapAgentLifecycleClient";
import MapAiOperationsDashboard from "./MapAiOperationsDashboard";
import MapClient from "./MapClient";
import MapDirectionsEnhancer from "./MapDirectionsEnhancer";
import MapFieldVisitFlow from "./MapFieldVisitFlow";
import MapResultsBoardEnhancer from "./MapResultsBoardEnhancer";
import MapSmartConversationEnhancer from "./MapSmartConversationEnhancer";
import MapSmartDispatchEnhancer from "./MapSmartDispatchEnhancer";

export default function MapPage() {
  return (
    <>
      <MapClient />
      <MapAiOperationsDashboard />
      <MapDirectionsEnhancer />
      <MapFieldVisitFlow />
      <MapSmartDispatchEnhancer />
      <MapSmartConversationEnhancer />
      <MapResultsBoardEnhancer />
      <MapAgentLifecycleClient />
    </>
  );
}
