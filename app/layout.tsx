import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./dashboard-table-upgrade.css";
import DriveSessionKeeper from "../components/DriveSessionKeeper";
import DriveAutoBackup from "../components/DriveAutoBackup";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "HPD Bid Dashboard 2026",
  description: "Premium HPD bid analytics, field map, paperwork, and award tracking dashboard.",
  // Installable on the iPhone: Share > Add to Home Screen opens it full screen as "HPD Field".
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HPD Field", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // Older iPhones only go full screen with this tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app itself never zooms (owner, 20 Oct: "the whole app zooms in, I just want to zoom in the job pages"); the job
  // pages zoom by themselves (pinch / double-tap in the full-screen page view).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

// iPhone Safari zooms the page on a pinch even with user-scalable=no: stop it everywhere except the job pages
// (elements marked data-zoomable, which zoom themselves).
const NO_PAGE_ZOOM = `(function(){function inZoom(e){var t=e.target;return !!(t&&t.closest&&t.closest("[data-zoomable]"))}
["gesturestart","gesturechange","gestureend"].forEach(function(n){document.addEventListener(n,function(e){e.preventDefault()},{passive:false})});
document.addEventListener("touchmove",function(e){if(e.touches&&e.touches.length>1&&!inZoom(e))e.preventDefault()},{passive:false})})();`;
const UPDATE_RECOVERY = `(function(){var K="hpd-update-reload",once=false;function again(){if(once)return;once=true;var n=0,t=0;try{var v=JSON.parse(sessionStorage.getItem(K)||"{}");n=v.n||0;t=v.t||0;if(Date.now()-t>300000)n=0;if(n>=2)return;sessionStorage.setItem(K,JSON.stringify({n:n+1,t:Date.now()}))}catch(e){}setTimeout(function(){location.reload()},1500)}
addEventListener("error",function(e){var el=e.target,u=el&&(el.src||el.href)||"";if(typeof u==="string"&&u.indexOf("/_next/static/")>=0)again()},true);
addEventListener("unhandledrejection",function(e){var r=e.reason,m=String(r&&((r.name||"")+" "+(r.message||""))||r);if(/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i.test(m))again()})})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Right after a deploy a page can ask for an app file that isn't published yet (or is gone):
            the map then sat on "Loading jobs..." until reloaded. Reload by itself, at most twice in 5 minutes. */}
        <script dangerouslySetInnerHTML={{ __html: UPDATE_RECOVERY }} />
        <script dangerouslySetInnerHTML={{ __html: NO_PAGE_ZOOM }} />
      </head>
      <body><DriveSessionKeeper /><DriveAutoBackup /><ServiceWorkerRegister />{children}</body>
    </html>
  );
}





