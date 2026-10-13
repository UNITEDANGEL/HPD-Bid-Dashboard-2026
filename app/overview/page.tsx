import "../dashboard-table-upgrade.css";
import DarkAnalyticsDashboard from "../../components/DarkAnalyticsDashboard";
import DashboardVisualPolish from "../../components/DashboardVisualPolish";

// The old full dashboard (charts, tables, every page), kept one tap away from the simple home screen.
export default function OverviewPage() {
  return (
    <>
      <DarkAnalyticsDashboard />
      <DashboardVisualPolish />
    </>
  );
}
