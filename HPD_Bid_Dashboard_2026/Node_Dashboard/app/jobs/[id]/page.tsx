import Link from "next/link";
import { StatusBadge } from "../../../components/StatusBadge";
import { getJobById } from "../../../lib/jobs";

export const dynamic = "force-dynamic";

function mapsHref(latitude: string, longitude: string, address: string) {
  const query = latitude && longitude ? `${latitude},${longitude}` : address;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = getJobById(id);

  if (!job) {
    return (
      <div className="page-stack">
        <div className="job-profile-card">
          <div className="breadcrumbs">
            <Link href="/">Dashboard</Link>
            <span>/</span>
            <Link href="/jobs">Jobs</Link>
          </div>
          <div className="job-profile-header" style={{ marginTop: 14 }}>
            <h2>Job not found</h2>
            <p className="job-profile-copy">No record matched {id} in the merged dashboard dataset.</p>
          </div>
        </div>
      </div>
    );
  }

  const openMapsLink = mapsHref(job.latitude, job.longitude, job.address || job.location);

  return (
    <div className="page-stack">
      <div className="breadcrumbs">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        <Link href="/jobs">Jobs</Link>
        <span>/</span>
        <span>{job.id}</span>
      </div>

      <section className="job-profile-card">
        <div className="profile-top">
          <div className="job-profile-header">
            <p className="eyebrow">Field Profile</p>
            <h2>{job.id}</h2>
            <p className="job-profile-copy">
              {job.address || "No address listed"}.
              {" "}
              Review the core award details, files, contact information, and raw source values from the merged dashboard feed.
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="job-profile-grid">
          <div>
            <strong>Borough</strong>
            <span>{job.borough || "Not listed"}</span>
          </div>
          <div>
            <strong>Trade</strong>
            <span>{job.trade || "Not listed"}</span>
          </div>
          <div>
            <strong>Award Date</strong>
            <span>{job.awardDate || "Not listed"}</span>
          </div>
          <div>
            <strong>Bid Amount</strong>
            <span>{job.bidAmount || "Not listed"}</span>
          </div>
          <div>
            <strong>Tenant</strong>
            <span>{job.tenantName || "Not listed"}</span>
          </div>
          <div>
            <strong>Phone</strong>
            <span>{job.tenantPhone || "Not listed"}</span>
          </div>
          <div>
            <strong>COA File</strong>
            <span>{job.coaFile || "Not matched"}</span>
          </div>
          <div>
            <strong>ITB File</strong>
            <span>{job.itbFile || "Not matched"}</span>
          </div>
          <div>
            <strong>Latitude</strong>
            <span>{job.latitude || "Not listed"}</span>
          </div>
          <div>
            <strong>Longitude</strong>
            <span>{job.longitude || "Not listed"}</span>
          </div>
        </div>

        <div className="description-card">
          <strong>Description</strong>
          <p>{job.description || "No description listed for this job."}</p>
        </div>

        <div className="detail-actions">
          <Link href="/jobs" className="secondary-link">
            Back to jobs board
          </Link>
          {openMapsLink ? (
            <a href={openMapsLink} target="_blank" rel="noreferrer" className="primary-link">
              Open in Maps
            </a>
          ) : null}
        </div>
      </section>

      <section className="raw-card">
        <h3>Raw source fields</h3>
        <div className="raw-table">
          {Object.entries(job.raw).map(([key, value]) => (
            <div key={key} className="raw-row">
              <strong>{key}</strong>
              <span>{value || "-"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
