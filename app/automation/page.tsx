import { AutomationPanel } from "../../components/AutomationPanel";

export const dynamic = "force-dynamic";

export default function AutomationPage() {
  return (
    <main style={{ padding: 24, background: "#f3f4f6", minHeight: "100vh" }}>
      <AutomationPanel />
    </main>
  );
}
