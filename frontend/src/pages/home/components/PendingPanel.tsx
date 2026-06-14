import { CoachRecord } from "@/mocks/dashboard";

interface PendingPanelProps {
  records: CoachRecord[];
}

export default function PendingPanel({ records }: PendingPanelProps) {
  const totalPending = records.reduce((s, r) => s + r.pending, 0);
  const totalLastWeek = records.reduce((s, r) => s + r.lastWeekPending, 0);
  const totalMarking = records.reduce((s, r) => s + r.markingProgressWeekly, 0);

  const maxPending = Math.max(...records.map((r) => r.pending), 1);

  return (
    <div className="kpi-card" style={{ padding: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Workload</div>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)" }}>Pending &amp; Progress</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontSize: "var(--text-xs)" }}>
          {[
            { color: "var(--color-accent)", label: "Last Week" },
            { color: "var(--color-danger)", label: "Pending" },
            { color: "var(--color-success)", label: "Marking" },
          ].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, display: "inline-block" }} />
              <span style={{ color: "var(--color-text-muted)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 3 summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        {[
          { label: "Total Pending", value: totalPending, color: "var(--color-danger)", icon: "ri-hourglass-2-line" },
          { label: "Last Week Pending", value: totalLastWeek, color: "var(--color-accent)", icon: "ri-calendar-check-line" },
          { label: "Weekly Marking", value: totalMarking, color: "var(--color-success)", icon: "ri-pen-nib-line" },
        ].map((t) => (
          <div key={t.label} style={{
            background: "var(--color-surface)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)", padding: "var(--space-4)", textAlign: "center",
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-2)" }}>
              <i className={`${t.icon}`} style={{ color: t.color, fontSize: 20 }} />
            </div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{t.value}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart per associate */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {records.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div style={{ width: 112, flexShrink: 0 }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.associate}</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <div style={{ height: 6, borderRadius: 3, background: "var(--color-accent)", width: `${(r.lastWeekPending / maxPending) * 100}%`, minWidth: 4 }} />
                <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>{r.lastWeekPending}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <div style={{ height: 6, borderRadius: 3, background: "var(--color-danger)", width: `${(r.pending / maxPending) * 100}%`, minWidth: 4 }} />
                <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>{r.pending}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <div style={{ height: 6, borderRadius: 3, background: "var(--color-success)", width: `${(r.markingProgressWeekly / maxPending) * 100}%`, minWidth: 4 }} />
                <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>{r.markingProgressWeekly}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
