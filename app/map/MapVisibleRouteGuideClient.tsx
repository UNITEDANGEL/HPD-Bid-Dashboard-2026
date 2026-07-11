"use client";

import dynamic from "next/dynamic";

const MapVisibleRouteGuide = dynamic(() => import("./MapVisibleRouteGuide"), { ssr: false });

export default MapVisibleRouteGuide;
