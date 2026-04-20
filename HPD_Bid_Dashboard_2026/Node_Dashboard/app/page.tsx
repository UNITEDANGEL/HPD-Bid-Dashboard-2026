import { DashboardClient } from "../components/DashboardClient";
import { getJobs } from "../lib/jobs";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const jobs = getJobs();

  return (
    <DashboardClient
      jobs={jobs}
      title="Rich award dashboard for HPD work orders"
      subtitle="This hosted view is designed for fast phone review on iPhone, with mobile filters, strong visual cards, document readiness counts, and field-friendly job previews powered by the merged project dataset."
    />
  );
}
