"use client";

import dynamic from "next/dynamic";

const MapRouteSequenceOverlay = dynamic(() => import("./MapRouteSequenceOverlay"), {
  ssr: false,
  loading: () => null,
});

export default function MapRouteSequenceOverlayClient() {
  return <MapRouteSequenceOverlay />;
}
