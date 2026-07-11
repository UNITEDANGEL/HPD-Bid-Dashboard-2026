"use client";

import dynamic from "next/dynamic";

const MapViewModeControl = dynamic(() => import("./MapViewModeControl"), {
  ssr: false,
  loading: () => null,
});

export default function MapViewModeControlClient() {
  return <MapViewModeControl />;
}
