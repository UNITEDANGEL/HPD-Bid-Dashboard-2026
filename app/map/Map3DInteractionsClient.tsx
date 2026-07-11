"use client";

import dynamic from "next/dynamic";

const Map3DInteractions = dynamic(() => import("./Map3DInteractions"), {
  ssr: false,
  loading: () => null,
});

export default function Map3DInteractionsClient() {
  return <Map3DInteractions />;
}
