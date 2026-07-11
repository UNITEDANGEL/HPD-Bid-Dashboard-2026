"use client";

import dynamic from "next/dynamic";

const MapResponsiveWorkspace = dynamic(() => import("./MapResponsiveWorkspace"), {
  ssr: false,
  loading: () => null,
});

export default function MapResponsiveWorkspaceClient() {
  return <MapResponsiveWorkspace />;
}
