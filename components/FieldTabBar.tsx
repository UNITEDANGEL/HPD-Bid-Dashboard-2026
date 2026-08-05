"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export default function FieldTabBar() {
  const rawPathname = usePathname();
  const pathname = rawPathname && rawPathname.length > 1 ? rawPathname.replace(/\/$/, "") : rawPathname;

  return (
    <nav className="fc-tabbar" aria-label="Field command navigation">
      <Link href="/field-command" className={`fc-tab ${pathname === "/field-command" ? "is-active" : ""}`}>
        <MapIcon />
        <span>Map</span>
      </Link>
      <Link href="/jobs" className={`fc-tab ${pathname === "/jobs" ? "is-active" : ""}`}>
        <ListIcon />
        <span>Jobs</span>
      </Link>
      <div className="fc-tab-fab">
        <button type="button" className="fc-tab-fab-circle" aria-label="Quick add">
          <PlusIcon />
        </button>
      </div>
      <button type="button" className="fc-tab" aria-label="Alerts">
        <AlertIcon />
        <span>Alerts</span>
      </button>
      <Link href="/more" className={`fc-tab ${pathname === "/more" ? "is-active" : ""}`}>
        <MoreIcon />
        <span>More</span>
      </Link>
    </nav>
  );
}
