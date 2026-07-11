"use client";

import dynamic from "next/dynamic";

const MapNativeRouteLineAuto = dynamic(() => import("./MapNativeRouteLineAuto"), { ssr: false });

export default function MapNativeRouteLineAutoClient() {
  return <MapNativeRouteLineAuto />;
}
