"use client";

import { useEffect } from "react";

export default function MapPage() {
  useEffect(() => {
    window.location.replace(`/field-command/${window.location.search || ""}`);
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#05070c",
        color: "#f5f5f7",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <p>
        Redirecting to <a href="/field-command/" style={{ color: "#0a84ff" }}>Field Command</a>...
      </p>
    </main>
  );
}
