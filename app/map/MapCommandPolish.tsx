"use client";
export default function MapCommandPolish() {
  return (
    <style jsx global>{`
      body {
        background: #020617 !important;
      }
      .map-shell {
        min-height: 100dvh !important;
        background:
          radial-gradient(circle at 18% 8%, rgba(37, 99, 235, 0.28), transparent 30%),
          radial-gradient(circle at 82% 14%, rgba(14, 165, 233, 0.20), transparent 32%),
          linear-gradient(135deg, #020617 0%, #06111f 48%, #030712 100%) !important;
      }
      .map-stage {
        padding: 14px !important;
        min-height: 100dvh !important;
      }
      .map-node,
      .leaflet-container {
        border-radius: 28px !important;
        overflow: hidden !important;
        min-height: calc(100dvh - 32px) !important;
        background: #07111f !important;
      }
      .map-node {
        border: 1px solid rgba(148, 163, 184, 0.24) !important;
        box-shadow: 0 30px 110px rgba(0, 0, 0, 0.52) !important;
      }
      .leaflet-container {
        filter: saturate(1.08) contrast(1.05) brightness(0.92) !important;
      }
      .leaflet-popup-content-wrapper {
        border-radius: 22px !important;
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(3, 7, 18, 0.96)) !important;
        color: #f8fafc !important;
        border: 1px solid rgba(148, 163, 184, 0.22) !important;
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.52) !important;
      }
      .leaflet-popup-tip {
        background: rgba(15, 23, 42, 0.98) !important;
      }
      .leaflet-control-zoom a,
      .leaflet-bar a {
        background: rgba(15, 23, 42, 0.94) !important;
        color: #dbeafe !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
      }
      [class*="card"],
      [class*="panel"],
      [class*="drawer"],
      [class*="command"],
      [class*="dispatch"],
      [class*="health"],
      [class*="agent"] {
        border-radius: 20px !important;
      }
      @media (max-width: 800px) {
        .map-stage {
          padding: 8px !important;
        }
        .map-node,
        .leaflet-container {
          border-radius: 20px !important;
          min-height: calc(100dvh - 16px) !important;
        }
      }
    `}</style>
  );
}
