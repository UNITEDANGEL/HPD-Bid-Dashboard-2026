"use client";
import { useEffect, useState } from "react";
type Row = Record<string, unknown>;
function asArray(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) return obj.jobs as Row[];
    if (Array.isArray(obj.data)) return obj.data as Row[];
    if (Array.isArray(obj.records)) return obj.records as Row[];
  }
  return [];
}
function parseMoney(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}
export default function AwardAuditPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRows(asArray(data)))
      .catch((err) => setError(String(err)));
  }, []);
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
  const possibleAwardKeys = keys.filter((key) =>
    /^(AwardAmount|awardAmount|Award Amount|award_amount)$/i.test(key)
  );
  const samples = possibleAwardKeys
    .map((key) => {
      const values = rows
        .map((row) => parseMoney(row[key]))
        .filter((value) => value > 0)
        .slice(0, 5);
      return {
        key,
        count: rows.filter((row) => parseMoney(row[key]) > 0).length,
        samples: values,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  return (
    <section style={{
      margin: "18px",
      padding: "18px",
      border: "1px solid rgba(251,191,36,.35)",
      borderRadius: 18,
      background: "rgba(15,23,42,.92)",
      color: "#f8fafc"
    }}>
      <h2 style={{ margin: "0 0 8px" }}>Award Amount Audit</h2>
      <p style={{ color: "#cbd5e1", marginTop: 0 }}>
        This shows which fields in the local 2026 data contain numeric values. Use this to pick the real COA award field.
      </p>
      {error && <p>{error}</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {samples.slice(0, 30).map((item) => (
          <div key={item.key} style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) 80px 1fr",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(2,6,23,.55)"
          }}>
            <strong>{item.key}</strong>
            <span>{item.count} rows</span>
            <span>{item.samples.map((value) => `$${value.toLocaleString()}`).join(", ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

