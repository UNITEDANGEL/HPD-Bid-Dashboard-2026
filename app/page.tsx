import Link from "next/link";

const modules = [
  {
    title: "Mobile Dashboard",
    href: "/jobs",
    eyebrow: "Review",
    description: "Phone-ready HPD job board with search, borough filters, status filters, award details, COA/ITB readiness, and job profile links.",
    action: "Open Dashboard",
  },
  {
    title: "Free Job Map",
    href: "/map",
    eyebrow: "Map",
    description: "Leaflet/OpenStreetMap route with no Mapbox token required. Runs on Render without paid map credentials.",
    action: "Open Map",
  },
  {
    title: "Filler / Fetcher",
    href: "/automation",
    eyebrow: "Automation",
    description: "Trigger the Gmail/PDF fetcher worker, review run status, inspect logs, and download generated filled PDFs.",
    action: "Run Automation",
  },
  {
    title: "Invoice Generator",
    href: "/invoice-generator",
    eyebrow: "Invoices",
    description: "Create invoice drafts from job records, contractor profile, selected line items, totals, tax, notes, and PDF-ready metadata.",
    action: "Generate Invoice",
  },
  {
    title: "Output Center",
    href: "/outputs",
    eyebrow: "Files",
    description: "Central place for filled packets, invoice PDFs, fetched attachments, generated JSON, CSV exports, and run artifacts.",
    action: "View Outputs",
  },
  {
    title: "System Status",
    href: "/system-status",
    eyebrow: "Health",
    description: "Check app health, worker URL, automation API availability, environment configuration, and deployment readiness.",
    action: "Check Status",
  },
];

export default function HomePage() {
  return (
    <main className="command-shell">
      <section className="command-hero">
        <div>
          <p className="eyebrow">HPD Bid Management</p>
          <h1>United Angel Command Center</h1>
          <p className="hero-copy">
            One Render link for the dashboard, free map, filler/fetcher automation, invoice generator,
            outputs, and system status.
          </p>
          <div className="hero-actions">
            <Link href="/automation" className="primary-link">Run Filler / Fetcher</Link>
            <Link href="/invoice-generator" className="secondary-link">Create Invoice</Link>
          </div>
        </div>
        <div className="hero-metrics">
          <div className="metric-panel rose"><span>1</span><small>App link</small></div>
          <div className="metric-panel gold"><span>6</span><small>Modules</small></div>
          <div className="metric-panel cyan"><span>Free</span><small>OSM map</small></div>
          <div className="metric-panel green"><span>PDF</span><small>Filler ready</small></div>
        </div>
      </section>

      <section className="command-grid">
        {modules.map((item) => (
          <Link href={item.href} className="command-card" key={item.title}>
            <p className="eyebrow">{item.eyebrow}</p>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <span>{item.action} â†’</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
