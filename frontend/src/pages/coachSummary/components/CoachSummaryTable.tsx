import { CoachSummaryRecord } from "@/mocks/coachSummary";

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function RatioBadge({ ratio, isOverall }: { ratio: number; isOverall?: boolean }) {
  const bg = ratio === 0 ? "var(--color-success-bg)"
    : ratio < 15 ? "var(--color-success-bg)"
    : ratio < 25 ? "var(--color-warning-bg)"
    : "var(--color-danger-bg)";
  const color = ratio === 0 ? "var(--color-success)"
    : ratio < 15 ? "var(--color-success)"
    : ratio < 25 ? (isOverall ? "var(--color-warning)" : "var(--color-warning)")
    : "var(--color-danger)";
  return (
    <span className="badge" style={{ background: bg, color, fontVariantNumeric: "tabular-nums" }}>
      {ratio.toFixed(ratio < 10 ? 2 : 1)}%
    </span>
  );
}

function VsCompany({ vs }: { vs: number }) {
  const color = vs === 100 ? "var(--color-text-muted)"
    : vs <= 5 ? "var(--color-success)"
    : vs <= 15 ? "var(--color-warning)"
    : "var(--color-danger)";
  return (
    <span className="tabular-nums" style={{ fontSize: "var(--text-xs)", color }}>
      {vs === 100 ? "—" : `${vs}%`}
    </span>
  );
}

export default function CoachSummaryTable({ records }: { records: CoachSummaryRecord[] }) {
  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");

  const formatDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>All Coaches</div>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)" }}>Absence Summary</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: "var(--text-xs)" }}>
            <span className="badge badge--success">Perfect / &lt;15%</span>
            <span className="badge badge--warning">Warning</span>
            <span className="badge badge--danger">Critical</span>
          </div>
          <span className="tabular-nums" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            {coaches.length} coaches
          </span>
        </div>
      </div>

      <div className="table-scroll themed-scrollbar">
        <table className="data-table" style={{ minWidth: 1400 }}>
          <thead>
            <tr>
              <th scope="col" style={{
                position: "sticky", left: 0, zIndex: 20,
                background: "var(--color-canvas)", minWidth: 160,
                textAlign: "left",
              }}>Coach</th>
              <th scope="col" className="num">Students</th>
              {WEEKS.map((w) => {
                const sample = overall?.weeks[w - 1];
                return (
                  <th key={w} scope="col" colSpan={2} style={{
                    textAlign: "center",
                    borderLeft: "2px solid var(--color-border)",
                    color: "var(--color-accent)",
                  }}>
                    <div>W{w}</div>
                    {sample && (
                      <div style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                        {formatDate(sample.weekStart)}–{formatDate(sample.weekEnd)}
                      </div>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="num" style={{ borderLeft: "2px solid var(--color-border)" }}>10W Avg</th>
            </tr>
            <tr>
              <th scope="col" style={{ position: "sticky", left: 0, zIndex: 20, background: "var(--color-canvas)" }} />
              <th scope="col" className="num" style={{ color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Count</th>
              {WEEKS.map((w) => (
                <>
                  <th key={`${w}-abs`} scope="col" style={{ textAlign: "center", borderLeft: "2px solid var(--color-border)", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Abs %</th>
                  <th key={`${w}-cmp`} scope="col" style={{ textAlign: "center", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>vs Co.</th>
                </>
              ))}
              <th scope="col" style={{ textAlign: "center", borderLeft: "2px solid var(--color-border)", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Abs %</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((row, idx) => (
              <>
                <tr key={row.coachName} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <th scope="row" style={{
                    position: "sticky", left: 0, zIndex: 10,
                    background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-canvas)",
                    padding: "var(--space-3) var(--space-4)",
                    fontWeight: "var(--font-medium)", color: "var(--color-text-primary)",
                    fontSize: "var(--text-xs)", whiteSpace: "nowrap", textAlign: "left",
                  }}>
                    {row.coachName}
                  </th>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}>{row.studentsCount}</td>
                  {row.weeks.map((w, wi) => (
                    <>
                      <td key={`${wi}-abs`} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>
                        <RatioBadge ratio={w.absenceRatio} />
                      </td>
                      <td key={`${wi}-vs`} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center" }}>
                        <VsCompany vs={w.vsCompany} />
                      </td>
                    </>
                  ))}
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>
                    <RatioBadge ratio={row.last10WeeksAbsenceRatio} />
                  </td>
                </tr>
              </>
            ))}

            {/* Overall Company row */}
            {overall && (
              <tr style={{ borderTop: `2px solid var(--color-accent)`, background: "var(--color-accent-tint)" }}>
                <th scope="row" style={{
                  position: "sticky", left: 0, zIndex: 10,
                  background: "var(--color-accent-tint)",
                  padding: "var(--space-3) var(--space-4)",
                  fontWeight: "var(--font-semibold)", color: "var(--color-accent)",
                  fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em",
                  whiteSpace: "nowrap", textAlign: "left",
                }}>
                  {overall.coachName}
                </th>
                <td className="num" style={{ padding: "var(--space-3) var(--space-4)", fontWeight: "var(--font-semibold)" }}>{overall.studentsCount}</td>
                {overall.weeks.map((w, wi) => (
                  <>
                    <td key={`overall-${wi}-abs`} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>
                      <RatioBadge ratio={w.absenceRatio} isOverall />
                    </td>
                    <td key={`overall-${wi}-vs`} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                      100%
                    </td>
                  </>
                ))}
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>
                  <RatioBadge ratio={overall.last10WeeksAbsenceRatio} isOverall />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>{coaches.length} coaches</span>
      </div>
    </div>
  );
}
