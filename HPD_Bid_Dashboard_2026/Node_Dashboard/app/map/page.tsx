import { JobsMapBoard } from "../../components/JobsMapBoard";
import { getJobs } from "../../lib/jobs";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const jobs = getJobs();

  return <JobsMapBoard jobs={jobs} />;
}
