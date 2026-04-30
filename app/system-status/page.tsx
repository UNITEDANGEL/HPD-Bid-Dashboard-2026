export default function SystemStatusPage() {
  const workerConfigured = Boolean(process.env.AUTOMATION_WORKER_URL);
  return (
    <main className="command-shell">
      <section className="command-hero">
        <div>
          <p className="eyebrow">System Status</p>
          <h1>Deployment health</h1>
          <p className="hero-copy">Render app is responsible for the dashboard UI. The Python worker must be hosted at a URL reachable from Render for automation runs.</p>
        </div>
      </section>
      <section className="command-grid">
        <div className="command-card"><p className="eyebrow">Map</p><h2>Leaflet / OSM</h2><p>No Mapbox token required.</p></div>
        <div className="command-card"><p className="eyebrow">Worker URL</p><h2>{workerConfigured ? "Configured" : "Not configured"}</h2><p>{workerConfigured ? process.env.AUTOMATION_WORKER_URL : "Set AUTOMATION_WORKER_URL in Render env vars."}</p></div>
        <div className="command-card"><p className="eyebrow">Automation</p><h2>Server API</h2><p>Routes are installed under /api/automation.</p></div>
      </section>
    </main>
  );
}
