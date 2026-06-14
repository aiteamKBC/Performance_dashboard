import { CoachRecord } from "@/mocks/dashboard";

interface EvidencePanelProps {
  records: CoachRecord[];
}

export default function EvidencePanel({ records }: EvidencePanelProps) {
  const totalAccepted = records.reduce((s, r) => s + r.evidenceAccepted, 0);
  const totalReferred = records.reduce((s, r) => s + r.evidenceReferred, 0);
  const totalClosure = records.reduce((s, r) => s + r.referredClosure, 0);
  const totalEvidence = records.reduce((s, r) => s + r.totalEvidence, 0);
  const avgClosurePct =
    records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.referredClosurePct, 0) / records.length)
      : 0;

  const acceptedPct = totalEvidence ? Math.round((totalAccepted / totalEvidence) * 100) : 0;
  const referredPct = totalEvidence ? Math.round((totalReferred / totalEvidence) * 100) : 0;

  const stats = [
    { label: "Evidence Accepted", value: totalAccepted, pct: acceptedPct, color: "var(--color-success)", bgColor: "var(--color-success-bg)", icon: "ri-check-line", statusClass: "kpi-status--success" },
    { label: "Evidence Referred", value: totalReferred, pct: referredPct, color: "var(--color-warning)", bgColor: "var(--color-warning-bg)", icon: "ri-send-plane-line", statusClass: "kpi-status--warning" },
    { label: "Referred Closure", value: totalClosure, pct: avgClosurePct, color: "var(--color-info)", bgColor: "var(--color-info-bg)", icon: "ri-lock-2-line", statusClass: "kpi-status--info" },
    { label: "Total Evidence", value: totalEvidence, pct: 100, color: "var(--color-accent)", bgColor: "var(--color-accent-tint)", icon: "ri-file-list-3-line", statusClass: "" },
  ];

  return (
    <div className="kpi-card" style={{ gap: "var(--space-4)" }}>
      <div className="kpi-header">
        <span className="kpi-label">Evidence Pipeline</span>
        <span className="kpi-info" title="Evidence submission and closure tracking">ⓘ</span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: s.bgColor,
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            display: "flex", flexDirection: "column", gap: "var(--space-2)",
            border: "1px solid var(--color-border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <i className={s.icon} style={{ color: s.color, fontSize: 16 }} aria-hidden="true" />
              <span className="tabular-nums" style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: s.color }}>{s.pct}%</span>
            </div>
            <div className="kpi-value" style={{ fontSize: "var(--text-xl)" }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", lineHeight: "var(--leading-snug)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Evidence bar breakdown per record */}
      {records.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {records.slice(0, 8).map((r) => {
            const accPct = r.totalEvidence ? Math.round((r.evidenceAccepted / r.totalEvidence) * 100) : 0;
            const refPct = r.totalEvidence ? Math.round((r.evidenceReferred / r.totalEvidence) * 100) : 0;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ width: 112, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {r.associate}
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--color-border)", borderRadius: 999, overflow: "hidden", display: "flex", gap: 1 }}>
                  <div style={{ width: `${accPct}%`, background: "var(--color-success)", borderRadius: "999px 0 0 999px" }} />
                  <div style={{ width: `${refPct}%`, background: "var(--color-warning)" }} />
                </div>
                <div className="tabular-nums" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", width: 32, textAlign: "right" }}>{r.totalEvidence}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
