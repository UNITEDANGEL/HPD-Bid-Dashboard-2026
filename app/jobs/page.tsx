import { MobileJobsBoard } from "../../components/MobileJobsBoard";
import { getJobs } from "../../lib/jobs";

export default function JobsPage() {
  const jobs = getJobs();

  return <MobileJobsBoard jobs={jobs} />;
}

