"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { tenantContactInfo } from "../lib/tenantContact";
import type { JobRecord } from "../lib/types";
type Props = {
  jobs: JobRecord[];
  title: string;
  subtitle: string;
};
type DashboardTab = "overview" | "map" | "workorders" | "affidavits" | "invoices";
function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function formatCurrency(amountValue: number, fallback: string) {
  if (!amountValue) return fallback || "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountValue);
}
function buildMapsHref(job: JobRecord) {
  const coords = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : "";
  const query = coords || job.address || job.location;
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function buildStaticMap(job: JobRecord) {
  const lat = Number(job.latitude);
  const lng = Number(job.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const delta = 0.01;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}
export function DashboardClient({ jobs, title, subtitle }: Props) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(jobs[0]?.id || "");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const boroughs = unique(jobs.map((job) => job.borough));
  const statuses = unique(jobs.map((job) => job.status));
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (borough && job.borough !== borough) return false;
      if (status && job.status !== status) return false;
      if (!query.trim()) return true;
      const haystack = [
        job.id,
        job.address,
        job.trade,
        job.description,
        job.status,
        job.borough,
        job.tenantName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  }, [jobs, borough, status, query]);
  const selected =
    filteredJobs.find((job) => job.id === selectedId) ||
    filteredJobs[0] ||
    jobs[0] ||
    null;
  const totalJobs = filteredJobs.length;
  const awardedCount = filteredJobs.filter((job) => job.status.toLowerCase().includes("award")).length;
  const mappedCount = filteredJobs.filter((job) => job.hasMap).length;
  const jobs2026 = filteredJobs.filter((job) => {
    const combined = `${job.awardDate} ${job.description} ${job.id}`;
    return combined.includes("2026");
  }).length;
  const completedCount = filteredJobs.filter((job) => job.status.toLowerCase().includes("complete")).length;
  const openCount = filteredJobs.filter((job) => {
    const s = job.status.toLowerCase();
    return !s.includes("complete") && !s.includes("paid");
  }).length;
  const topTrades = unique(filteredJobs.map((job) => job.trade)).slice(0, 8);
  const boroughCards = boroughs
    .map((name) => ({
      name,
      count: filteredJobs.filter((job) => job.borough === name).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const coaCount = filteredJobs.filter((job) => Boolean(job.coaFile)).length;
  const itbCount = filteredJobs.filter((job) => Boolean(job.itbFile)).length;
  const phoneCount = filteredJobs.filter((job) => Boolean(job.tenantPhone)).length;
  const mapUrl = selected ? buildStaticMap(selected) : "";
  const selectedContact = tenantContactInfo(selected);
  return (
    <div style={shell}>
      <section style={topHero}>
        <div>
          <div style={eyebrow}>HPD OPERATIONS COMMAND CENTER</div>
          <h1 style={heroTitle}>{title}</h1>
          <p style={heroText}>{subtitle}</p>
          <div style={actionRow}>
            <button type="button" style={primaryButton} onClick={() => setActiveTab("overview")}>
              Overview
            </button>
            <button type="button" style={secondaryButton} onClick={() => setActiveTab("map")}>
              Live Map
            </button>
            <button type="button" style={secondaryButton} onClick={() => setActiveTab("workorders")}>
              Work Orders
            </button>
            <button type="button" style={secondaryButton} onClick={() => setActiveTab("affidavits")}>
              Affidavits
            </button>
            <button type="button" style={secondaryButton} onClick={() => setActiveTab("invoices")}>
              Invoices
            </button>
          </div>
        </div>
        <div style={metricsGrid}>
          <div style={metricCardBlue}>
            <div style={metricValue}>{totalJobs}</div>
            <div style={metricLabel}>Visible Jobs</div>
          </div>
          <div style={metricCardGold}>
            <div style={metricValue}>{mappedCount}</div>
            <div style={metricLabel}>Map Ready</div>
          </div>
          <div style={metricCardGreen}>
            <div style={metricValue}>{completedCount}</div>
            <div style={metricLabel}>Completed</div>
          </div>
          <div style={metricCardPurple}>
            <div style={metricValue}>{openCount}</div>
            <div style={metricLabel}>Open</div>
          </div>
          <div style={metricCardRose}>
            <div style={metricValue}>{awardedCount}</div>
            <div style={metricLabel}>Awarded</div>
          </div>
          <div style={metricCardCyan}>
            <div style={metricValue}>{jobs2026}</div>
            <div style={metricLabel}>2026 Tagged</div>
          </div>
        </div>
      </section>
      <section style={filterPanel}>
        <div style={panelTitleRow}>
          <div>
            <div style={eyebrow}>GLOBAL FILTERS</div>
            <h2 style={sectionTitle}>Everything in one dashboard</h2>
          </div>
          <button
            type="button"
            style={ghostButton}
            onClick={() => {
              setQuery("");
              setBorough("");
              setStatus("");
            }}
          >
            Reset
          </button>
        </div>
        <div style={filtersGrid}>
          <label style={labelStyle}>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OMO, address, trade, tenant, description"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Borough
            <select value={borough} onChange={(event) => setBorough(event.target.value)} style={inputStyle}>
              <option value="">All boroughs</option>
              {boroughs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
              <option value="">All statuses</option>
              {statuses.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section style={mainGrid}>
        <div style={leftRail}>
          <div style={glassCard}>
            <div style={eyebrow}>SYSTEM MODULES</div>
            <h3 style={miniTitle}>Workspace</h3>
            <div style={moduleStack}>
              <button type="button" style={moduleButton(activeTab === "overview")} onClick={() => setActiveTab("overview")}>Dashboard Overview</button>
              <button type="button" style={moduleButton(activeTab === "map")} onClick={() => setActiveTab("map")}>Map Command View</button>
              <button type="button" style={moduleButton(activeTab === "workorders")} onClick={() => setActiveTab("workorders")}>Work Orders</button>
              <button type="button" style={moduleButton(activeTab === "affidavits")} onClick={() => setActiveTab("affidavits")}>Affidavit Filler</button>
              <button type="button" style={moduleButton(activeTab === "invoices")} onClick={() => setActiveTab("invoices")}>Invoice Filler</button>
            </div>
          </div>
          <div style={glassCard}>
            <div style={eyebrow}>BOROUGH LOAD</div>
            <h3 style={miniTitle}>Coverage</h3>
            <div style={stackList}>
              {boroughCards.map((item) => (
                <div key={item.name} style={stackRow}>
                  <span>{item.name}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
          <div style={glassCard}>
            <div style={eyebrow}>DOCUMENT MATCHES</div>
            <h3 style={miniTitle}>Readiness</h3>
            <div style={stackList}>
              <div style={stackRow}><span>COA Files</span><strong>{coaCount}</strong></div>
              <div style={stackRow}><span>ITB Files</span><strong>{itbCount}</strong></div>
              <div style={stackRow}><span>Phone Records</span><strong>{phoneCount}</strong></div>
            </div>
          </div>
        </div>
        <div style={centerStage}>
          {activeTab === "overview" && (
            <div style={glassCard}>
              <div style={panelTitleRow}>
                <div>
                  <div style={eyebrow}>PRIMARY OVERVIEW</div>
                  <h2 style={sectionTitle}>Jobs, work, and action center</h2>
                </div>
                <span style={chip}>{filteredJobs.length} records</span>
              </div>
              <div style={overviewGrid}>
                <div style={largePanel}>
                  <div style={eyebrow}>TOP TRADES</div>
                  <h3 style={miniTitle}>Most visible work types</h3>
                  <div style={tagWrap}>
                    {topTrades.length ? topTrades.map((trade) => (
                      <span key={trade} style={tagPill}>{trade}</span>
                    )) : <span style={tagPill}>No trade data</span>}
                  </div>
                </div>
                <div style={largePanel}>
                  <div style={eyebrow}>QUICK ACTIONS</div>
                  <h3 style={miniTitle}>Operations shortcuts</h3>
                  <div style={quickActionGrid}>
                    <Link href="/map" style={bigLink}>Open Map</Link>
                    <Link href="/api/jobs" style={bigLink}>Jobs API</Link>
                    {selected ? <Link href={`/jobs/${encodeURIComponent(selected.id)}`} style={bigLink}>Open Job</Link> : <span style={bigLinkMuted}>Open Job</span>}
                    {selected && buildMapsHref(selected) ? (
                      <a href={buildMapsHref(selected)} target="_blank" rel="noreferrer" style={bigLink}>
                        Directions
                      </a>
                    ) : (
                      <span style={bigLinkMuted}>Directions</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ ...largePanel, marginTop: 18 }}>
                <div style={eyebrow}>LIVE JOB BOARD</div>
                <h3 style={miniTitle}>High-density work order cards</h3>
                <div style={jobsGrid}>
                  {filteredJobs.map((job) => (
                    <button
                      key={`${job.id}-${job.address}`}
                      type="button"
                      onClick={() => setSelectedId(job.id)}
                      style={jobCard(selected?.id === job.id)}
                    >
                      <div style={jobTop}>
                        <strong>{job.id}</strong>
                        <StatusBadge status={job.status} />
                      </div>
                      <div style={jobAddress}>{job.address || "No address listed"}</div>
                      <div style={jobMeta}>{job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}</div>
                      <div style={jobBottom}>
                        <span>{formatCurrency(job.amountValue, job.bidAmount)}</span>
                        <span>{job.awardDate || "No award date"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === "map" && (
            <div style={glassCard}>
              <div style={panelTitleRow}>
                <div>
                  <div style={eyebrow}>MAP COMMAND</div>
                  <h2 style={sectionTitle}>Map-first job control</h2>
                </div>
                <span style={chip}>{mappedCount} mapped jobs</span>
              </div>
              {selected && mapUrl ? (
                <>
                  <div style={mapShell}>
                    <iframe
                      title="Selected Job Map"
                      src={mapUrl}
                      style={{ width: "100%", height: "100%", border: 0 }}
                    />
                  </div>
                  <div style={{ ...largePanel, marginTop: 18 }}>
                    <div style={eyebrow}>ACTIVE MAP JOB</div>
                    <h3 style={miniTitle}>{selected.id}</h3>
                    <p style={{ marginTop: 8, color: "#d7e6ff" }}>{selected.address || "No address listed"}</p>
                    <div style={detailGrid}>
                      <div style={detailCell}><strong>Status</strong><span>{selected.status || "Not listed"}</span></div>
                      <div style={detailCell}><strong>Trade</strong><span>{selected.trade || "Not listed"}</span></div>
                      <div style={detailCell}><strong>Borough</strong><span>{selected.borough || "Not listed"}</span></div>
                      <div style={detailCell}><strong>Award</strong><span>{selected.awardDate || "Not listed"}</span></div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={largePanel}>No mapped job is selected.</div>
              )}
            </div>
          )}
          {activeTab === "workorders" && (
            <div style={glassCard}>
              <div style={eyebrow}>WORK ORDER CENTER</div>
              <h2 style={sectionTitle}>Work order drafting workspace</h2>
              <div style={formPanel}>
                <div style={formGrid}>
                  <label style={labelStyle}>Job ID<input style={inputStyle} defaultValue={selected?.id || ""} /></label>
                  <label style={labelStyle}>Address<input style={inputStyle} defaultValue={selected?.address || ""} /></label>
                  <label style={labelStyle}>Trade<input style={inputStyle} defaultValue={selected?.trade || ""} /></label>
                  <label style={labelStyle}>Borough<input style={inputStyle} defaultValue={selected?.borough || ""} /></label>
                  <label style={labelStyle}>Assigned Crew<input style={inputStyle} placeholder="Crew / vendor" /></label>
                  <label style={labelStyle}>Target Date<input style={inputStyle} placeholder="MM/DD/YYYY" /></label>
                </div>
                <label style={labelStyle}>Scope of Work<textarea style={textareaStyle} defaultValue={selected?.description || ""} /></label>
              </div>
            </div>
          )}
          {activeTab === "affidavits" && (
            <div style={glassCard}>
              <div style={eyebrow}>AFFIDAVIT FILLER</div>
              <h2 style={sectionTitle}>Affidavit preparation workspace</h2>
              <div style={formPanel}>
                <div style={formGrid}>
                  <label style={labelStyle}>Job ID<input style={inputStyle} defaultValue={selected?.id || ""} /></label>
                  <label style={labelStyle}>Building Address<input style={inputStyle} defaultValue={selected?.address || ""} /></label>
                  <label style={labelStyle}>Tenant / Contact<input style={inputStyle} defaultValue={selected?.tenantName || ""} /></label>
                  <label style={labelStyle}>Phone<input style={inputStyle} defaultValue={selected?.tenantPhone || ""} /></label>
                  <label style={labelStyle}>Status<input style={inputStyle} defaultValue={selected?.status || ""} /></label>
                  <label style={labelStyle}>Trade<input style={inputStyle} defaultValue={selected?.trade || ""} /></label>
                </div>
                <label style={labelStyle}>Affidavit Notes<textarea style={textareaStyle} placeholder="Service details, posting details, completion notes, signer notes..." /></label>
              </div>
            </div>
          )}
          {activeTab === "invoices" && (
            <div style={glassCard}>
              <div style={eyebrow}>INVOICE FILLER</div>
              <h2 style={sectionTitle}>Invoice drafting workspace</h2>
              <div style={formPanel}>
                <div style={formGrid}>
                  <label style={labelStyle}>Job ID<input style={inputStyle} defaultValue={selected?.id || ""} /></label>
                  <label style={labelStyle}>Bill To<input style={inputStyle} defaultValue={selected?.tenantName || ""} /></label>
                  <label style={labelStyle}>Address<input style={inputStyle} defaultValue={selected?.address || ""} /></label>
                  <label style={labelStyle}>Amount<input style={inputStyle} defaultValue={formatCurrency(selected?.amountValue || 0, selected?.bidAmount || "")} /></label>
                  <label style={labelStyle}>Invoice Date<input style={inputStyle} placeholder="MM/DD/YYYY" /></label>
                  <label style={labelStyle}>Terms<input style={inputStyle} placeholder="Net 15 / Net 30" /></label>
                </div>
                <label style={labelStyle}>Invoice Notes<textarea style={textareaStyle} placeholder="Line items, material costs, labor, terms, notes..." /></label>
              </div>
            </div>
          )}
        </div>
        <div style={rightRail}>
          <div style={glassCard}>
            <div style={eyebrow}>SELECTED JOB</div>
            <h3 style={miniTitle}>Command detail panel</h3>
            {selected ? (
              <>
                <div style={selectedHead}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.id}</h3>
                    <p style={{ margin: "8px 0 0", color: "#d7e6ff" }}>{selected.address || "No address listed"}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div style={detailGrid}>
                  <div style={detailCell}><strong>Trade</strong><span>{selected.trade || "Not listed"}</span></div>
                  <div style={detailCell}><strong>Borough</strong><span>{selected.borough || "Not listed"}</span></div>
                  <div style={detailCell}><strong>Award</strong><span>{selected.awardDate || "Not listed"}</span></div>
                  <div style={detailCell}><strong>Bid</strong><span>{formatCurrency(selected.amountValue, selected.bidAmount)}</span></div>
                  <div style={detailCell}><strong>Tenant</strong><span>{selectedContact.name || "Not listed"}</span></div>
                  <div style={detailCell}><strong>Phone</strong><span>{selectedContact.phone || "Not listed"}</span></div>
                  <div style={detailCell}><strong>COA</strong><span>{selected.coaFile || "Not matched"}</span></div>
                  <div style={detailCell}><strong>ITB</strong><span>{selected.itbFile || "Not matched"}</span></div>
                </div>
                <div style={tenantCard(selectedContact.appointmentNeeded)}>
                  <div style={tenantCardHead}>
                    <span>{selectedContact.label}</span>
                    <strong>{selectedContact.status}</strong>
                  </div>
                  {selectedContact.appointmentNeeded ? (
                    <>
                      <div style={tenantGrid}>
                        <div style={tenantCell}><span>Name</span><strong>{selectedContact.name || "Not listed"}</strong></div>
                        <div style={tenantCell}><span>Phone</span><strong>{selectedContact.phone || "Not listed"}</strong></div>
                        <div style={tenantCell}><span>Apt</span><strong>{selectedContact.apartment || selected.location || "Not listed"}</strong></div>
                      </div>
                      {selectedContact.actionHref || selectedContact.smsHref || selectedContact.emailHref ? (
                        <div style={tenantActions}>
                          {selectedContact.actionHref ? <a href={selectedContact.actionHref} style={secondaryButtonLink}>Call Tenant</a> : null}
                          {selectedContact.smsHref ? <a href={selectedContact.smsHref} style={secondaryButtonLink}>Text Tenant</a> : null}
                          {selectedContact.emailHref ? <a href={selectedContact.emailHref} style={primaryButtonLink}>Email HPD</a> : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div style={descriptionCard}>
                  <strong>Description</strong>
                  <p style={{ marginTop: 10, color: "#d7e6ff" }}>
                    {selected.description || "No description listed for this record."}
                  </p>
                </div>
                <div style={sideActions}>
                  <Link href={`/jobs/${encodeURIComponent(selected.id)}`} style={primaryButtonLink}>Open Job</Link>
                  {buildMapsHref(selected) ? (
                    <a href={buildMapsHref(selected)} target="_blank" rel="noreferrer" style={secondaryButtonLink}>
                      Directions
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <p>No jobs match the current filters.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
const shell: React.CSSProperties = {
  minHeight: "100vh",
  padding: 20,
  background:
    "radial-gradient(circle at top left, rgba(58,102,255,0.28), transparent 28%), radial-gradient(circle at top right, rgba(20,184,166,0.18), transparent 26%), linear-gradient(180deg, #07111f 0%, #0b1728 44%, #09131f 100%)",
  color: "#f5fbff",
};
const topHero: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 28,
  padding: 24,
  background: "rgba(10, 18, 33, 0.8)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  backdropFilter: "blur(14px)",
};
const heroTitle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 42,
  lineHeight: 1.05,
};
const heroText: React.CSSProperties = {
  marginTop: 14,
  fontSize: 16,
  lineHeight: 1.6,
  color: "#d5e6ff",
  maxWidth: 760,
};
const eyebrow: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.8,
  fontWeight: 700,
  color: "#7dc9ff",
};
const actionRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 20,
};
const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};
const metricCardBase: React.CSSProperties = {
  borderRadius: 22,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
};
const metricCardBlue = { ...metricCardBase, background: "linear-gradient(135deg, rgba(52,123,255,0.35), rgba(17,34,70,0.85))" };
const metricCardGold = { ...metricCardBase, background: "linear-gradient(135deg, rgba(245,176,65,0.34), rgba(60,36,5,0.88))" };
const metricCardGreen = { ...metricCardBase, background: "linear-gradient(135deg, rgba(34,197,94,0.30), rgba(7,48,28,0.88))" };
const metricCardPurple = { ...metricCardBase, background: "linear-gradient(135deg, rgba(139,92,246,0.30), rgba(35,17,65,0.88))" };
const metricCardRose = { ...metricCardBase, background: "linear-gradient(135deg, rgba(244,63,94,0.30), rgba(65,17,35,0.88))" };
const metricCardCyan = { ...metricCardBase, background: "linear-gradient(135deg, rgba(34,211,238,0.30), rgba(8,51,62,0.88))" };
const metricValue: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
};
const metricLabel: React.CSSProperties = {
  marginTop: 6,
  color: "#eaf4ff",
  opacity: 0.92,
};
const filterPanel: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 24,
  padding: 20,
  background: "rgba(11, 20, 34, 0.72)",
  backdropFilter: "blur(14px)",
};
const panelTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};
const sectionTitle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 26,
};
const filtersGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: 14,
  marginTop: 18,
};
const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  color: "#cfe3ff",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  outline: "none",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 150,
  resize: "vertical",
};
const primaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(125,201,255,0.35)",
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const ghostButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
};
const mainGrid: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr) 360px",
  gap: 18,
  alignItems: "start",
};
const leftRail: React.CSSProperties = {
  display: "grid",
  gap: 18,
};
const rightRail: React.CSSProperties = {
  display: "grid",
  gap: 18,
};
const centerStage: React.CSSProperties = {
  minWidth: 0,
};
const glassCard: React.CSSProperties = {
  borderRadius: 24,
  padding: 20,
  background: "rgba(11, 20, 34, 0.76)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.24)",
  backdropFilter: "blur(14px)",
};
const miniTitle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 20,
};
const moduleStack: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};
const moduleButton = (active: boolean): React.CSSProperties => ({
  padding: "14px 16px",
  borderRadius: 16,
  textAlign: "left",
  border: active ? "1px solid rgba(125,201,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
  background: active ? "linear-gradient(135deg, rgba(56,189,248,0.22), rgba(37,99,235,0.18))" : "rgba(255,255,255,0.04)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
});
const stackList: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};
const stackRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  color: "#dcecff",
};
const chip: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(125,201,255,0.14)",
  color: "#bce7ff",
  fontSize: 13,
  fontWeight: 700,
};
const overviewGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
};
const largePanel: React.CSSProperties = {
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};
const quickActionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  marginTop: 14,
};
const bigLink: React.CSSProperties = {
  display: "block",
  padding: "14px 16px",
  borderRadius: 14,
  textDecoration: "none",
  background: "rgba(59,130,246,0.18)",
  border: "1px solid rgba(96,165,250,0.26)",
  color: "#e9f4ff",
  fontWeight: 700,
};
const bigLinkMuted: React.CSSProperties = {
  ...bigLink,
  opacity: 0.5,
};
const jobsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 14,
  marginTop: 16,
};
const jobCard = (selected: boolean): React.CSSProperties => ({
  textAlign: "left",
  borderRadius: 18,
  padding: 16,
  border: selected ? "1px solid rgba(125,201,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
  background: selected
    ? "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(15,23,42,0.88))"
    : "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  boxShadow: selected ? "0 0 0 1px rgba(125,201,255,0.18), 0 10px 30px rgba(0,0,0,0.25)" : "none",
});
const jobTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};
const jobAddress: React.CSSProperties = {
  marginTop: 10,
  fontWeight: 600,
  color: "#eef6ff",
};
const jobMeta: React.CSSProperties = {
  marginTop: 8,
  color: "#bcd1eb",
  fontSize: 14,
};
const jobBottom: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 12,
  color: "#cfe3ff",
  fontSize: 13,
};
const selectedHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
};
const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 18,
};
const detailCell: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  color: "#dcecff",
};
const descriptionCard: React.CSSProperties = {
  marginTop: 18,
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.05)",
};
const tenantCard = (appointmentNeeded: boolean): React.CSSProperties => ({
  marginTop: 18,
  padding: 16,
  borderRadius: 16,
  border: appointmentNeeded ? "1px solid rgba(251,191,36,0.34)" : "1px solid rgba(34,197,94,0.28)",
  background: appointmentNeeded ? "rgba(251,191,36,0.10)" : "rgba(34,197,94,0.10)",
});
const tenantCardHead: React.CSSProperties = {
  display: "grid",
  gap: 6,
};
const tenantGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  marginTop: 14,
};
const tenantCell: React.CSSProperties = {
  display: "grid",
  gap: 5,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.06)",
  color: "#dcecff",
};
const tenantActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 14,
};
const sideActions: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 18,
};
const primaryButtonLink: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  color: "#fff",
  fontWeight: 700,
};
const secondaryButtonLink: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
  fontWeight: 700,
};
const mapShell: React.CSSProperties = {
  marginTop: 18,
  height: "65vh",
  minHeight: 460,
  borderRadius: 24,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
};
const tagWrap: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};
const tagPill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(125,201,255,0.12)",
  border: "1px solid rgba(125,201,255,0.18)",
  color: "#d9eeff",
  fontSize: 13,
  fontWeight: 700,
};
const formPanel: React.CSSProperties = {
  marginTop: 18,
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};
const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginBottom: 16,
};
