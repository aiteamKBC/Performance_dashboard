import type { CoachRecord } from "@/mocks/dashboard";

interface CoachCardsProps {
  records: CoachRecord[];
  onSelect: (record: CoachRecord) => void;
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

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p className="tabular-nums" style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: color ?? "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

export default function CoachCards({ records, onSelect }: CoachCardsProps) {
  if (records.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
        <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", padding: "0 var(--space-2)" }}>Coaches</span>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {records.map((r) => {
          const prRate = r.prOverallCompletionRate;
          // OTJH counts use the variance-based bands (same as the Metric
          // Breakdown table & coach-page chart); fall back to the source bands.
          const otjhOnTrack = r.otjhVarOnTrack ?? r.otjhOnTrack;
          const otjhNeedAttention = r.otjhVarNeedAttention ?? r.otjhNeedAttention;
          const otjhAtRisk = r.otjhVarAtRisk ?? r.otjhAtRisk;
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="coach-card"
              style={{
                textAlign: "left", cursor: "pointer",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-4)",
                boxShadow: "var(--shadow-card)",
                transition: "border-color .15s, box-shadow .15s, transform .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.boxShadow = "var(--shadow-raised)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "var(--shadow-card)";
                e.currentTarget.style.transform = "none";
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
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
              </div>

              {/* Metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2) var(--space-3)" }}>
                <Stat label="Learners" value={r.totalLearners} />
                <Stat label="Engagement" value={`${r.learnerEngagement}%`} color={tone(r.learnerEngagement, 85, 70)} />
                <Stat label="PR Rate" value={`${prRate}%`} color={tone(prRate, 90, 70)} />
                <Stat label="OTJH Risk" value={otjhAtRisk} color={tone(otjhAtRisk, 4, 7, true)} />
                <Stat label="Pending" value={r.pending} color={tone(r.pending, 12, 20, true)} />
                <Stat label="Ref Closure" value={r.referredClosure} />
              </div>

              {/* OTJH mini-bar */}
              <div style={{ marginTop: "var(--space-3)" }}>
                <p style={{ margin: "0 0 4px", fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>OTJH</p>
                <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: "var(--color-canvas)" }}>
                  {(() => {
                    const on = otjhOnTrack, att = otjhNeedAttention, risk = otjhAtRisk;
                    const total = on + att + risk || 1;
                    return (
                      <>
                        <div style={{ width: `${(on / total) * 100}%`, background: "var(--color-success)" }} title={`On Track: ${on}`} />
                        <div style={{ width: `${(att / total) * 100}%`, background: "var(--color-warning)" }} title={`Need Attention: ${att}`} />
                        <div style={{ width: `${(risk / total) * 100}%`, background: "var(--color-danger)" }} title={`At Risk: ${risk}`} />
                      </>
                    );
                  })()}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
