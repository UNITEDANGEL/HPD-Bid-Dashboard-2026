import jobsData from "../../../data/COA_Fetcher_2026.json";
export async function generateStaticParams() {
  const rows = Array.isArray(jobsData) ? jobsData : [];
  return rows
    .map((job: any) => String(job.OMO || job.id || "").trim())
    .filter(Boolean)
    .map((id: string) => ({ id }));
}
import Link from "next/link";
import { MobileJobDetail } from "../../../components/MobileJobDetail";
import { getJobById } from "../../../lib/jobs";

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

  return <MobileJobDetail job={job} />;
}


