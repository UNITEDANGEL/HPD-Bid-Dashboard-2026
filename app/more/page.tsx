import Link from "next/link";
import "../ios-app.css";
import "../field-command/field-command.css";
import FieldTabBar from "../../components/FieldTabBar";

const LINKS = [
  { href: "/jobs", title: "Live Bids", detail: "Full job list and filters" },
  { href: "/fetcher", title: "ITB / COA", detail: "Invitation and confirmation files" },
  { href: "/automation", title: "Automation", detail: "Fetcher and sync jobs" },
  { href: "/outputs", title: "Reports", detail: "Generated files and exports" },
  { href: "/system-status", title: "System Status", detail: "Data health and sync state" },
];

export default function MorePage() {
  return (
    <main className="ios-app">
      <div className="ios-statusbar-spacer" />
      <header className="ios-navbar">
        <div className="ios-navbar-row">
          <span className="ios-navbar-eyebrow">HPD Bid Dashboard</span>
        </div>
        <h1 className="ios-large-title">More</h1>
      </header>

      <div className="ios-content">
        <div className="ios-list-group">
          {LINKS.map((link) => (
            <Link className="ios-settings-row" href={link.href} key={link.href}>
              <span className="ios-list-icon">{link.title.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{link.title}</strong>
                <small>{link.detail}</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </div>

      <FieldTabBar />
    </main>
  );
}
