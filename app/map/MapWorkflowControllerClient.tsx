"use client";

import dynamic from "next/dynamic";

const MapWorkflowController = dynamic(() => import("./MapWorkflowController"), {
  ssr: false,
  loading: () => null,
});

export default function MapWorkflowControllerClient() {
  return <MapWorkflowController />;
}
