"use client";

import dynamic from "next/dynamic";

const MapHybridViewMode = dynamic(() => import("./MapHybridViewMode"), {
  ssr: false,
  loading: () => null,
});

export default function MapHybridViewModeClient() {
  return <MapHybridViewMode />;
}
