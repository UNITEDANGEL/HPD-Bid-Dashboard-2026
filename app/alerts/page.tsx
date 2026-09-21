import { MobileAlertsBoard } from "../../components/MobileAlertsBoard";
import { getJobs } from "../../lib/jobs";

export default function AlertsPage() {
  const jobs = getJobs();

  return <MobileAlertsBoard jobs={jobs} />;
}
