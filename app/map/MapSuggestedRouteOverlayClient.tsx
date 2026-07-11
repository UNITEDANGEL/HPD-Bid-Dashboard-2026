"use client";

import dynamic from "next/dynamic";

const MapSuggestedRouteOverlay = dynamic(() => import("./MapSuggestedRouteOverlay"), {
  ssr: false,
  loading: () => null,
});

export default function MapSuggestedRouteOverlayClient() {
  return <MapSuggestedRouteOverlay />;
}
