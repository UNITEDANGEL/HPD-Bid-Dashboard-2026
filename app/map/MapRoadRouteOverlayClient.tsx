"use client";

import dynamic from "next/dynamic";

const MapRoadRouteOverlay = dynamic(() => import("./MapRoadRouteOverlay"), { ssr: false });

export default function MapRoadRouteOverlayClient() {
  return <MapRoadRouteOverlay />;
}
