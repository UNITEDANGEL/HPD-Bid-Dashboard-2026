"use client";

import dynamic from "next/dynamic";

const MapGoogleStyleRouteOverlay = dynamic(() => import("./MapGoogleStyleRouteOverlay"), { ssr: false });

export default function MapGoogleStyleRouteOverlayClient() {
  return <MapGoogleStyleRouteOverlay />;
}
