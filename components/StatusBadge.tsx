type Props = {
  status: string;
};

function toneForStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("completed")) return "is-completed";
  if (normalized.includes("awarded")) return "is-awarded";
  if (normalized.includes("progress")) return "is-progress";
  if (normalized.includes("access") || normalized.includes("refused")) return "is-access";
  return "is-pending";
}

export function StatusBadge({ status }: Props) {
  return <span className={`status-badge ${toneForStatus(status)}`}>{status || "Pending"}</span>;
}
