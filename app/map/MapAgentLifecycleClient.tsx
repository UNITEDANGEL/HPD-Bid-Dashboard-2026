"use client";

import dynamic from "next/dynamic";

const MapAgentLifecycle = dynamic(() => import("./MapAgentLifecycle"), {
  ssr: false,
  loading: () => null,
});

export default function MapAgentLifecycleClient() {
  return <MapAgentLifecycle />;
}
