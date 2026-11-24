import { useState } from "react";
import { conflictsLabel, type CoachRecord } from "@/mocks/dashboard";
import CoachConflictsModal from "./CoachConflictsModal";
import type { CoachMetric } from "./CoachMetricModal";

interface CoachCardsProps {
  records: CoachRecord[];
  onSelect: (record: CoachRecord) => void;
  onSelectMetric: (record: CoachRecord, metric: CoachMetric) => void;
  /** Section divider label (default "Coaches"). */
  title?: string;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function tone(value: number, good: number, warn: number, invert = false) {
  if (invert) {
    if (value >= warn) return "var(--color-danger)";
    if (value >= good) return "var(--color-warning)";
    return "var(--color-success)";
  }
  if (value < warn) return "var(--color-danger)";
  if (value < good) return "var(--color-warning)";
  return "var(--color-success)";
}

function Stat({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick: () => void }) {
  return (
    <button type="button" className="coach-card-stat" onClick={onClick} aria-label={`View ${label} breakdown: ${value}`} style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p className="tabular-nums" style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: color ?? "var(--color-text-primary)" }}>{value}</p>
    </button>
  );
}

export default function CoachCards({ records, onSelect, onSelectMetric, title = "Coaches" }: CoachCardsProps) {
  // Coach whose conflicts popup is open (opened from the card's badge).
  const [conflictsFor, setConflictsFor] = useState<CoachRecord | null>(null);

  if (records.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
        <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", padding: "0 var(--space-2)" }}>{title}</span>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {records.map((r) => {
          // `null` is meaningful here: the LMS shows no PR rate when there
          // were no reviews due in the window.  Undefined keeps compatibility
          // with older mock records that only carry the legacy field.
          const prRate = r.prLmsRate === undefined ? r.prOverallCompletionRate : r.prLmsRate;
          // OTJH counts use the variance-based bands (same as the Metric
          // Breakdown table & coach-page chart); fall back to the source bands.
          const otjhOnTrack = r.otjhVarOnTrack ?? r.otjhOnTrack;
          const otjhNeedAttention = r.otjhVarNeedAttention ?? r.otjhNeedAttention;
          const otjhAtRisk = r.otjhVarAtRisk ?? r.otjhAtRisk;
          return (
            <article
              key={r.id}
              className="coach-card"
              style={{
                textAlign: "left",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-4)",
                boxShadow: "var(--shadow-card)",
                transition: "border-color .15s, box-shadow .15s, transform .15s",
              }}
            >
              {/* Header */}
              <button type="button" className="coach-card-header" onClick={() => onSelect(r)} aria-label={`Open ${r.coach} details`} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: (r.coachConflicts?.length ?? 0) > 0 ? 4 : "var(--space-3)" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: "var(--color-accent)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)",
                }}>
                  {initials(r.coach)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.coach}</p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{r.totalLearners} learners</p>
                </div>
                <i className="ri-arrow-right-line" style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
              </button>
              {(r.coachConflicts?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setConflictsFor(r)} title="View coach or status conflicts" style={{
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                  margin: "0 0 var(--space-3) 52px", fontSize: 10, fontWeight: "var(--font-semibold)",
                  color: "var(--color-warning)", background: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning-border)", borderRadius: 999, padding: "1px 8px",
                }}>
                  <i className="ri-error-warning-line" aria-hidden="true" />
                  {conflictsLabel(r.coachConflicts!)}
                </button>
              )}

              {/* Metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2) var(--space-3)" }}>
                <Stat label="Total Learners" value={r.totalLearners} onClick={() => onSelectMetric(r, "TOTAL")} />
                <Stat label="Engagement" value={`${r.learnerEngagement}%`} color={tone(r.learnerEngagement, 85, 70)} onClick={() => onSelectMetric(r, "ENGAGED")} />
                <Stat
                  label="PR Rate"
                  value={prRate == null ? "—" : `${prRate}%`}
                  color={prRate == null ? "var(--color-text-muted)" : tone(prRate, 90, 70)}
                  onClick={() => onSelectMetric(r, "PR")}
                />
                <Stat label="OTJH Risk" value={otjhAtRisk} color={tone(otjhAtRisk, 4, 7, true)} onClick={() => onSelectMetric(r, "OTJH")} />
                <Stat label="Pending" value={r.pending} color={r.pending > 0 ? "var(--color-warning)" : "var(--color-success)"} onClick={() => onSelectMetric(r, "PENDING")} />
                <Stat
                  label="Attendance"
                  value={r.attendanceRate == null ? "—" : `${r.attendanceRate}%`}
                  color={r.attendanceRate == null ? "var(--color-text-muted)" : tone(r.attendanceRate, 85, 70)}
                  onClick={() => onSelectMetric(r, "ATTENDANCE")}
                />
              </div>

              {/* OTJH mini-bar */}
              <button type="button" className="coach-card-otjh" onClick={() => onSelectMetric(r, "OTJH")} aria-label={`View ${r.coach} OTJH breakdown`} style={{ marginTop: "var(--space-3)" }}>
                <p style={{ margin: "0 0 4px", fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>OTJH</p>
                <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: "var(--color-canvas)" }}>
                  {(() => {
                    const on = otjhOnTrack, att = otjhNeedAttention, risk = otjhAtRisk;
                    const unavailable = Math.max(r.totalLearners - on - att - risk, 0);
                    const total = on + att + risk + unavailable || 1;
                    return (
                      <>
                        <div style={{ width: `${(on / total) * 100}%`, background: "var(--color-success)" }} title={`On Track: ${on}`} />
                        <div style={{ width: `${(att / total) * 100}%`, background: "var(--color-warning)" }} title={`Need Attention: ${att}`} />
                        <div style={{ width: `${(risk / total) * 100}%`, background: "var(--color-danger)" }} title={`At Risk: ${risk}`} />
                        <div style={{ width: `${(unavailable / total) * 100}%`, background: "#94A3B8" }} title={`Unavailable: ${unavailable}`} />
                      </>
                    );
                  })()}
                </div>
              </button>
            </article>
          );
        })}
      </div>

      {conflictsFor && (
        <CoachConflictsModal
          coachName={conflictsFor.coach}
          conflicts={conflictsFor.coachConflicts ?? []}
          onClose={() => setConflictsFor(null)}
        />
      )}
      <style>{`
        .coach-card:hover { border-color: var(--color-accent) !important; box-shadow: var(--shadow-raised) !important; transform: translateY(-2px); }
        .coach-card-header, .coach-card-stat, .coach-card-otjh { border: 0; background: transparent; text-align: left; color: inherit; cursor: pointer; font: inherit; }
        .coach-card-header { width: 100%; padding: 0; }
        .coach-card-stat { padding: 3px 4px; border-radius: var(--radius-md); }
        .coach-card-otjh { width: 100%; padding: 0; border-radius: var(--radius-md); }
        .coach-card-stat:hover, .coach-card-header:hover, .coach-card-otjh:hover { background: var(--color-canvas); }
        .coach-card-stat:focus-visible, .coach-card-header:focus-visible, .coach-card-otjh:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
