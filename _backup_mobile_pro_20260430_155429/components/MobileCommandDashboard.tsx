"use client";

export default function MobileCommandDashboard() {
  return (
    <main style={{
      minHeight: "100vh",
      padding: 18,
      background: "linear-gradient(180deg,#06101f,#050914)",
      color: "#f8fbff",
      fontFamily: "system-ui"
    }}>
      <section style={{
        maxWidth: 900,
        margin: "0 auto",
        display: "grid",
        gap: 16
      }}>
        <div style={{
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 28,
          padding: 24,
          background: "rgba(16,28,48,.95)"
        }}>
          <p style={{ color: "#42e8f3", fontWeight: 900 }}>
            HPD BID MANAGEMENT
          </p>

          <h1 style={{
            fontSize: "clamp(42px,10vw,76px)",
            lineHeight: .9,
            letterSpacing: "-.08em",
            margin: "10px 0"
          }}>
            Mobile Command Center
          </h1>

          <p style={{ color: "#aebbd0", fontSize: 18 }}>
            One clean phone dashboard for jobs, map, fetcher, filler, invoices, outputs, and system status.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12
        }}>
          {[
            ["Jobs Board", "/jobs", "📋"],
            ["Map", "/map", "🗺️"],
            ["Fetcher / Filler", "/automation", "⚙️"],
            ["Invoice Generator", "/invoice-generator", "🧾"],
            ["Outputs", "/outputs", "📦"],
            ["System Status", "/system-status", "🩺"]
          ].map(([title, href, icon]) => (
            <a key={href} href={href} style={{
              minHeight: 132,
              border: "1px solid rgba(255,255,255,.15)",
              borderRadius: 24,
              padding: 18,
              background: "rgba(255,255,255,.08)",
              color: "#f8fbff",
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}>
              <span style={{ fontSize: 34 }}>{icon}</span>
              <strong style={{ fontSize: 22 }}>{title}</strong>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
