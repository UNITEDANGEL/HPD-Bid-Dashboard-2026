import { DashboardClient } from "../../components/DashboardClient";
import { getJobs } from "../../lib/jobs";

export default function JobsPage() {
  const jobs = getJobs();

  return (
    <DashboardClient
      jobs={jobs}
      title="Mobile jobs board"
      subtitle="Use this page as the day-to-day board on Render. It keeps the full jobs feed, selected job preview, and phone-friendly actions in one place."
    />
  );
}

