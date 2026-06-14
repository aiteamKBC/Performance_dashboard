import { useState } from "react";
import type { TestKPIsRecord } from "@/services/testKPIs";

interface Props {
  records: TestKPIsRecord[];
}

type SortKey = keyof TestKPIsRecord;

const columns: { key: SortKey; label: string; group?: string }[] = [
  { key: "caseOwner", label: "Case Owner" },
  { key: "requiredPR", label: "Required PR", group: "PR" },
  { key: "completedPR", label: "Completed PR", group: "PR" },
  { key: "stillInprogressPR", label: "In Progress", group: "PR" },
  { key: "scheduledOverduePR", label: "Sched. Overdue", group: "PR" },
  { key: "unscheduledOverduePR", label: "Unsched. Overdue", group: "PR" },
  { key: "scheduledForNextPRPct", label: "Sched. Next %", group: "PR" },
  { key: "requiredMCM", label: "Required MCM", group: "MCM" },
  { key: "completedMCM", label: "Completed MCM", group: "MCM" },
  { key: "stillInprogressMCM", label: "In Progress", group: "MCM" },
  { key: "scheduledOverdueMCM", label: "Sched. Overdue", group: "MCM" },
  { key: "unscheduledOverdueMCM", label: "Unsched. Overdue", group: "MCM" },
  { key: "scheduledForNextMCMPct", label: "Sched. Next %", group: "MCM" },
  { key: "learnerEmailsMCM", label: "Learner Emails", group: "MCM" },
];

const groupColors: Record<string, string> = {
  PR: "var(--color-accent)",
  MCM: "var(--color-warning)",
};

function StatusBadge({ value, warnAt, riskAt }: { value: number; warnAt: number; riskAt: number }) {
  if (value === 0) return <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>—</span>;
  const cls = value >= riskAt ? "badge--danger" : value >= warnAt ? "badge--warning" : "badge--success";
  return <span className={`badge ${cls}`}>{value}</span>;
}

export default function TestKPIsTable({ records }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("caseOwner");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortAsc ? cmp : -cmp;
  });

  const groups: { label: string; span: number; color: string }[] = [];
  let i = 0;
  while (i < columns.length) {
    const g = columns[i].group;
    if (!g) { groups.push({ label: "", span: 1, color: "transparent" }); i++; }
    else {
      let span = 0;
      while (i + span < columns.length && columns[i + span].group === g) span++;
      groups.push({ label: g, span, color: groupColors[g] ?? "var(--color-text-muted)" });
      i += span;
    }
  }

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>KPI Breakdown</div>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)" }}>PR &amp; MCM by Case Owner</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span className="badge badge--success">Good</span>
          <span className="badge badge--warning">Warning</span>
          <span className="badge badge--danger">At Risk</span>
          <span className="tabular-nums" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{records.length} rows</span>
        </div>
      </div>

      {sorted.length === 0 && (
        <table className="data-table">
          <tbody>
            <tr className="table-empty">
              <td colSpan={columns.length}>
                <div className="empty-state">
                  <span className="empty-state-icon">📋</span>
                  <p className="empty-state-title">No KPI data available</p>
                  <p className="empty-state-body">Data will appear once the API returns records.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {sorted.length > 0 && (
        <div className="table-scroll themed-scrollbar">
          <table className="data-table">
            <thead>
              <tr>
                {groups.map((g, idx) => (
                  <th
                    key={idx}
                    scope="col"
                    colSpan={g.span}
                    style={{
                      textAlign: "center",
                      color: g.label ? g.color : "transparent",
                      borderTop: g.label ? `2px solid ${g.color}` : undefined,
                      position: idx === 0 ? "sticky" : undefined,
                      left: idx === 0 ? 0 : undefined,
                      zIndex: idx === 0 ? 20 : undefined,
                      background: "var(--color-canvas)",
                      padding: "var(--space-2) var(--space-4)",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={col.key}
                    scope="col"
                    onClick={() => handleSort(col.key)}
                    aria-sort={sortKey === col.key ? (sortAsc ? "ascending" : "descending") : undefined}
                    style={{
                      position: idx === 0 ? "sticky" : undefined,
                      left: idx === 0 ? 0 : undefined,
                      zIndex: idx === 0 ? 20 : undefined,
                      background: "var(--color-canvas)",
                      color: sortKey === col.key ? "var(--color-accent)" : "var(--color-text-muted)",
                      textAlign: idx === 0 ? "left" : "center",
                    }}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span style={{ marginLeft: 2, fontSize: 9 }}>{sortAsc ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, ri) => (
                <tr key={row.caseOwner} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <th scope="row" style={{
                    position: "sticky", left: 0, zIndex: 10,
                    background: ri % 2 === 0 ? "var(--color-surface)" : "var(--color-canvas)",
                    padding: "var(--space-3) var(--space-4)",
                    fontWeight: "var(--font-medium)", color: "var(--color-text-primary)",
                    fontSize: "var(--text-xs)", whiteSpace: "nowrap", textAlign: "left",
                  }}>
                    {row.caseOwner}
                  </th>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.requiredPR}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <span className={`badge ${row.completedPR > 0 ? "badge--success" : ""}`}>{row.completedPR || "—"}</span>
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <StatusBadge value={row.stillInprogressPR} warnAt={3} riskAt={6} />
                  </td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.scheduledOverduePR || "—"}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <StatusBadge value={row.unscheduledOverduePR} warnAt={2} riskAt={5} />
                  </td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.scheduledForNextPRPct || "—"}</td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.requiredMCM}</td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.completedMCM || "—"}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <StatusBadge value={row.stillInprogressMCM} warnAt={3} riskAt={6} />
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <StatusBadge value={row.scheduledOverdueMCM} warnAt={2} riskAt={5} />
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                    <StatusBadge value={row.unscheduledOverdueMCM} warnAt={2} riskAt={5} />
                  </td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.scheduledForNextMCMPct || "—"}</td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.learnerEmailsMCM}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span>{records.length} case owners</span>
      </div>
    </div>
  );
}
