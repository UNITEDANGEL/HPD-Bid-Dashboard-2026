import { JobsMapBoard } from "../components/JobsMapBoard";
import { getJobs } from "../lib/jobs";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const jobs = getJobs();
  return <JobsMapBoard jobs={jobs} />;
}
