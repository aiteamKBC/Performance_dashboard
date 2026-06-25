import { useEffect, useMemo, useState } from "react";
import type { DrillLearnerRow, ReviewRow } from "@/services/coachesLateness";

const STATUS_COLOR: Record<string, string> = {
  "On Track": "#16A34A",
  "Need Attention": "#D97706",
  "At Risk": "#DC2626",
  Completed: "#16A34A",
  Scheduled: "#0891B2",
  "In Progress": "#4F46E5",
  "Not Scheduled": "#DC2626",
};

function statusPill(value: string) {
  if (!value) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const color = STATUS_COLOR[value] ?? "var(--color-text-muted)";
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, color, background: `${color}1a`, whiteSpace: "nowrap",
    }}>{value}</span>
  );
}

// Metric keys. Status + time-period filters apply only to PR and MCM.
const METRICS = [
  { key: "ALL", label: "All Metrics" },
  { key: "PR", label: "PR" },
  { key: "MCM", label: "MCM" },
  { key: "OTJH", label: "OTJH" },
  { key: "ENGAGED", label: "Engaged" },
  { key: "PENDING", label: "Evidence Pending" },
  { key: "CLOSURE", label: "Referred Closure" },
  { key: "RECENT", label: "Recent Submitters" },
] as const;

const REVIEW_METRICS = new Set(["PR", "MCM"]);

// Status options per metric. PR/MCM share the review statuses; OTJH filters by
// its risk bands. Metrics not listed here have no status filter.
const STATUS_OPTIONS: Record<string, string[]> = {
  PR: ["Completed", "Scheduled", "Not Scheduled", "In Progress"],
  MCM: ["Completed", "Scheduled", "Not Scheduled", "In Progress"],
  OTJH: ["At Risk", "Need Attention", "On Track"],
};

const PERIODS = [
  { key: "ALL", label: "All dates", days: null },
  { key: "12W", label: "12 weeks", days: 84 },
  { key: "8W", label: "8 weeks", days: 56 },
  { key: "4W", label: "4 weeks", days: 28 },
] as const;

interface MetricRow {
  name: string;
  email: string;
  programme: string;
  metric: string;       // display label e.g. "PR"
  metricKey: string;    // PR / MCM / OTJH / ...
  status: string;
  date: string;         // ISO or ""
}

// Day-of-window tag for a date relative to today.
function windowTag(dateIso: string, today: Date): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff < 0) return "Upcoming";
  if (diff <= 27) return "4w";
  if (diff <= 55) return "8w";
  if (diff <= 83) return "12w";
  return "Older";
}

function withinDays(dateIso: string, today: Date, days: number | null): boolean {
  if (days == null) return true;
  if (!dateIso) return false;
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  return diff >= 0 && diff <= days - 1;
}

function otjhBand(raw: string): string {
  const t = raw.toLowerCase().replace(/-/g, " ").trim();
  if (t === "at risk" || t === "atrisk") return "At Risk";
  if (t === "need attention") return "Need Attention";
  if (t === "ontrack" || t === "on track") return "On Track";
  return raw || "—";
}

/**
 * Build table rows:
 *  - PR/MCM = one row per individual review slot (from `reviewRows`), so each
 *    Completed/Scheduled/etc. review is its own filterable row.
 *  - OTJH/Engaged/Pending/Closure/Recent = one row per learner (from `learners`).
 */
function buildRows(learners: DrillLearnerRow[], reviewRows: ReviewRow[]): MetricRow[] {
  const out: MetricRow[] = [];

  for (const r of reviewRows) {
    out.push({
      name: r.name, email: r.email, programme: r.programme,
      metric: r.metric, metricKey: r.metric, status: r.status, date: r.date,
    });
  }

  for (const l of learners) {
    const base = { name: l.name, email: l.email, programme: l.programme };
    if (l.otjh_status) out.push({ ...base, metric: "OTJH", metricKey: "OTJH", status: otjhBand(l.otjh_status), date: "" });
    if (l.submitted > 0) out.push({ ...base, metric: "Engaged", metricKey: "ENGAGED", status: "Engaged", date: l.last_sub });
    if (l.pending > 0) out.push({ ...base, metric: "Evidence Pending", metricKey: "PENDING", status: `${l.pending} pending`, date: l.last_sub });
    if (l.referred_closure > 0) out.push({ ...base, metric: "Referred Closure", metricKey: "CLOSURE", status: `${l.referred_closure} closure`, date: "" });
    if (l.last_sub) out.push({ ...base, metric: "Recent Submitter", metricKey: "RECENT", status: l.last_sub, date: l.last_sub });
  }
  return out;
}

const selectStyle = {
  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
  background: "var(--color-canvas)", padding: "var(--space-1) var(--space-2)",
  fontSize: "var(--text-xs)", color: "var(--color-text-primary)", outline: "none", cursor: "pointer",
} as const;

export default function MetricBreakdownTable({ learners, reviewRows, initialMetric = "ALL" }: { learners: DrillLearnerRow[]; reviewRows: ReviewRow[]; initialMetric?: string }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const allRows = useMemo(() => buildRows(learners, reviewRows), [learners, reviewRows]);

  const programmes = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.programme) set.add(r.programme);
    return Array.from(set).sort();
  }, [allRows]);

  const [metric, setMetric] = useState(initialMetric);
  const [programme, setProgramme] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [period, setPeriod] = useState("ALL");

  // Follow the metric chosen by a KPI card click on the parent page, clearing
  // any status/period that belonged to the previous metric.
  useEffect(() => { setMetric(initialMetric); setStatus("ALL"); setPeriod("ALL"); }, [initialMetric]);

  const changeMetric = (value: string) => {
    setMetric(value);
    setStatus("ALL");
    setPeriod("ALL");
  };

  const reviewMode = REVIEW_METRICS.has(metric);          // time-period filter (dated rows only)
  const statusOptions = STATUS_OPTIONS[metric] ?? [];     // status filter (PR/MCM/OTJH)
  const statusMode = statusOptions.length > 0;

  const rows = useMemo(() => {
    const periodDays = PERIODS.find((p) => p.key === period)?.days ?? null;
    return allRows.filter((r) => {
      if (metric !== "ALL" && r.metricKey !== metric) return false;
      if (programme !== "ALL" && r.programme !== programme) return false;
      // Status filter applies to the selected metric (PR/MCM/OTJH).
      if (statusMode && status !== "ALL" && r.status !== status) return false;
      // Time period only constrains dated PR/MCM rows.
      if (reviewMode && periodDays != null && !withinDays(r.date, today, periodDays)) return false;
      return true;
    });
  }, [allRows, metric, programme, status, period, statusMode, reviewMode, today]);

  return (
    <div className="table-card">
      <div className="table-toolbar" style={{ flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
            Metric Breakdown
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </p>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Metric
            <select value={metric} onChange={(e) => changeMetric(e.target.value)} style={selectStyle}>
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Programme
            <select value={programme} onChange={(e) => setProgramme(e.target.value)} style={selectStyle}>
              <option value="ALL">All programmes</option>
              {programmes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          {statusMode && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                <option value="ALL">All statuses</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          {reviewMode && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Time period
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selectStyle}>
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="table-scroll themed-scrollbar">
        <table className="data-table">
          <thead>
            <tr>
              {["Learner", "Programme", "Metric", "Status", "Window", "Date"].map((h) => (
                <th key={h} scope="col" style={{
                  textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)",
                  color: "var(--color-text-muted)", background: "var(--color-canvas)",
                  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No rows match these filters.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.email || r.name}-${r.metricKey}-${i}`} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <th scope="row" style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", fontWeight: "var(--font-medium)", color: "var(--color-text-primary)", fontSize: "var(--text-xs)", textAlign: "left" }}>
                    {r.name}
                    {r.email && <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 400 }}>{r.email}</div>}
                  </th>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{r.programme || "—"}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{r.metric}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusPill(r.status)}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {REVIEW_METRICS.has(r.metricKey) ? windowTag(r.date, today) : "—"}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
