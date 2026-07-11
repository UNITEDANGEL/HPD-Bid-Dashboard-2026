"use client";

import dynamic from "next/dynamic";

const MapFlowDirector = dynamic(() => import("./MapFlowDirector"), {
  ssr: false,
  loading: () => null,
});

export default function MapFlowDirectorClient() {
  return <MapFlowDirector />;
}
