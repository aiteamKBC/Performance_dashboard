import { CoachRecord } from "@/mocks/dashboard";

interface OtjhRiskPanelProps {
  records: CoachRecord[];
}

export default function OtjhRiskPanel({ records }: OtjhRiskPanelProps) {
  const totalOnTrack = records.reduce((s, r) => s + r.otjhOnTrack, 0);
  const totalNeedAttention = records.reduce((s, r) => s + r.otjhNeedAttention, 0);
  const totalAtRisk = records.reduce((s, r) => s + r.otjhAtRisk, 0);
  const total = totalOnTrack + totalNeedAttention + totalAtRisk;

  const onTrackPct = total ? Math.round((totalOnTrack / total) * 100) : 0;
  const needPct = total ? Math.round((totalNeedAttention / total) * 100) : 0;
  const riskPct = total ? Math.round((totalAtRisk / total) * 100) : 0;

  const tiers = [
    {
      label: "On Track",
      sublabel: "OTJH < 10%",
      value: totalOnTrack,
      pct: onTrackPct,
      statusClass: "kpi-status--success",
      bgColor: "var(--color-success-bg)",
      fgColor: "var(--color-success)",
      borderColor: "var(--color-success)",
      icon: "ri-checkbox-circle-line",
      desc: "Learners progressing at expected pace.",
    },
    {
      label: "Need Attention",
      sublabel: "OTJH 11–25%",
      value: totalNeedAttention,
      pct: needPct,
      statusClass: "kpi-status--warning",
      bgColor: "var(--color-warning-bg)",
      fgColor: "var(--color-warning)",
      borderColor: "var(--color-warning)",
      icon: "ri-error-warning-line",
      desc: "Require coaching check-in this week.",
    },
    {
      label: "At Risk",
      sublabel: "OTJH > 25%",
      value: totalAtRisk,
      pct: riskPct,
      statusClass: "kpi-status--danger",
      bgColor: "var(--color-danger-bg)",
      fgColor: "var(--color-danger)",
      borderColor: "var(--color-danger)",
      icon: "ri-alarm-warning-line",
      desc: "Immediate intervention recommended.",
    },
  ];

  return (
    <div className="kpi-card" style={{ gap: "var(--space-4)" }}>
      <div className="kpi-header">
        <span className="kpi-label">OTJ Hours Risk Distribution</span>
        <span className="kpi-info" title="On-the-job hours risk breakdown">{total} learners</span>
      </div>

      {/* Stacked progress bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        <div style={{ width: `${onTrackPct}%`, background: "var(--color-success)", borderRadius: "999px 0 0 999px" }} />
        <div style={{ width: `${needPct}%`, background: "var(--color-warning)" }} />
        <div style={{ width: `${riskPct}%`, background: "var(--color-danger)", borderRadius: "0 999px 999px 0" }} />
      </div>

      {/* Tier cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {tiers.map((t) => (
          <div
            key={t.label}
            style={{
              background: t.bgColor,
              border: `1px solid var(--color-border)`,
              borderLeft: `3px solid ${t.fgColor}`,
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              display: "flex", flexDirection: "column", gap: "var(--space-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <i className={t.icon} style={{ color: t.fgColor, fontSize: 16 }} aria-hidden="true" />
              <span className={`kpi-status ${t.statusClass}`}>{t.pct}%</span>
            </div>
            <div className="kpi-value" style={{ fontSize: "var(--text-xl)" }}>{t.value}</div>
            <div>
              <div style={{ fontWeight: "var(--font-semibold)", color: t.fgColor, fontSize: "var(--text-sm)" }}>{t.label}</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{t.sublabel}</div>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", lineHeight: "var(--leading-snug)" }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
