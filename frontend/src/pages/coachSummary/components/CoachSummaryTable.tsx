import type { KeyboardEvent } from "react";
import { CoachSummaryRecord } from "@/mocks/coachSummary";

interface CoachSummaryTableProps {
  records: CoachSummaryRecord[];
  /** Open the drill for a given coach + week column (index into weeks[]). */
  onWeekSelect?: (coachName: string, weekIndex: number) => void;
  /** Page to the previous (older) window of weeks. */
  onPrev?: () => void;
  /** Page to the next (newer) window of weeks. */
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  paging?: boolean;
}

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

export default function CoachSummaryTable({ records, onWeekSelect, onPrev, onNext, canPrev, canNext, paging }: CoachSummaryTableProps) {
  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");

  // Week columns come from the data itself (dynamic, newest first).
  const weekCount = overall?.weeks.length ?? coaches[0]?.weeks.length ?? 0;
  const WEEKS = Array.from({ length: weekCount }, (_, i) => i);

  const formatDate = (d: string) => {
    if (!d) return "";
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  // Weeks are newest-first: window spans the oldest week's start → newest week's end.
  const sampleWeeks = (overall ?? coaches[0])?.weeks ?? [];
  const newestWeek = sampleWeeks[0];
  const oldestWeek = sampleWeeks[sampleWeeks.length - 1];
  const rangeLabel = oldestWeek && newestWeek
    ? `${formatDate(oldestWeek.weekStart)} – ${formatDate(newestWeek.weekEnd)}`
    : "";

  const handleCellKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, coachName: string, weekIndex: number) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onWeekSelect?.(coachName, weekIndex);
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
            <span className="badge badge--success">Accepted / &lt;15%</span>
            <span className="badge badge--warning">Warning / 15–25%</span>
            <span className="badge badge--danger">Critical / ≥25%</span>
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
              {WEEKS.map((wi) => {
                const sample = (overall ?? coaches[0])?.weeks[wi];
                return (
                  <th key={wi} scope="col" colSpan={2} style={{
                    textAlign: "center",
                    borderLeft: "2px solid var(--color-border)",
                    color: "var(--color-accent)",
                  }}>
                    <div>{sample?.label ?? `W${wi + 1}`}</div>
                    {sample && (
                      <div style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                        {formatDate(sample.weekStart)}–{formatDate(sample.weekEnd)}
                      </div>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="num" style={{ borderLeft: "2px solid var(--color-border)" }}>{weekCount}W Avg</th>
            </tr>
            <tr>
              <th scope="col" style={{ position: "sticky", left: 0, zIndex: 20, background: "var(--color-canvas)" }} />
              <th scope="col" className="num" style={{ color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Count</th>
              {WEEKS.map((wi) => (
                <>
                  <th key={`${wi}-abs`} scope="col" style={{ textAlign: "center", borderLeft: "2px solid var(--color-border)", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Abs %</th>
                  <th key={`${wi}-cmp`} scope="col" style={{ textAlign: "center", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>vs Co.</th>
                </>
              ))}
              <th scope="col" style={{ textAlign: "center", borderLeft: "2px solid var(--color-border)", color: "var(--color-text-muted)", fontWeight: "var(--font-normal)" }}>Abs %</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((row, idx) => {
              const clickable = Boolean(onWeekSelect);

              return (
                <tr
                  key={row.coachName}
                  style={{ background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}
                >
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
                      <td
                        key={`${wi}-abs`}
                        onClick={clickable ? () => onWeekSelect?.(row.coachName, wi) : undefined}
                        onKeyDown={clickable ? (event) => handleCellKeyDown(event, row.coachName, wi) : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        role={clickable ? "button" : undefined}
                        title={clickable ? `View ${row.coachName} — ${w.label ?? `week ${wi + 1}`} attendance` : undefined}
                        style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center", borderLeft: "2px solid var(--color-border)", cursor: clickable ? "pointer" : "default" }}
                      >
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
              );
            })}

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

      <div className="table-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <span>{coaches.length} coaches · {weekCount} weeks{rangeLabel ? ` · ${rangeLabel}` : ""}</span>
        {(onPrev || onNext) && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext || paging}
              title="Newer weeks"
              style={pagingBtnStyle(!canNext || !!paging)}
            >
              <i className="ri-arrow-left-s-line" aria-hidden="true" />
              Next
            </button>
            {paging && (
              <i className="ri-loader-4-line" style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev || paging}
              title="Older weeks"
              style={pagingBtnStyle(!canPrev || !!paging)}
            >
              Previous
              <i className="ri-arrow-right-s-line" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function pagingBtnStyle(disabled: boolean) {
  return {
    display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
    border: "1px solid var(--color-border)", background: "var(--color-canvas)",
    borderRadius: "var(--radius-md)", padding: "var(--space-1) var(--space-3)",
    fontSize: "var(--text-xs)", color: "var(--color-text-secondary)",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  } as const;
}
