import { useState, useEffect } from "react";
import TestKPIsTable from "./components/TestKPIsTable";
import { fetchTestKPIs, type TestKPIsRecord } from "@/services/testKPIs";
import AppShell from "@/components/AppShell";

export default function TestKPIsPage() {
  const [records, setRecords] = useState<TestKPIsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTestKPIs();
        setRecords(data);
      } catch {
        setError("Failed to load KPIs data from API.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const totalRequired = records.reduce((s, r) => s + r.requiredPR, 0);
  const totalCompleted = records.reduce((s, r) => s + r.completedPR, 0);
  const totalUnschedOverdue = records.reduce((s, r) => s + r.unscheduledOverduePR, 0);
  const completionRate = totalRequired > 0 ? ((totalCompleted / totalRequired) * 100).toFixed(1) : "0.0";
  const completionRateNum = parseFloat(completionRate);

  return (
    <>
      {loading && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(247,248,250,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 50,
        }}>
          <div style={{
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)", padding: "var(--space-8)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)",
            boxShadow: "var(--shadow-raised)",
          }}>
            <i className="ri-loader-4-line" style={{ fontSize: 36, color: "var(--color-accent)", animation: "spin 1s linear infinite" }} aria-hidden="true" />
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Loading KPIs data…</span>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{
          position: "fixed", top: "var(--space-4)", right: "var(--space-4)",
          background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)",
          color: "var(--color-danger)", padding: "var(--space-3) var(--space-4)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-raised)",
          zIndex: 50, display: "flex", alignItems: "center", gap: "var(--space-2)",
        }}>
          <i className="ri-error-warning-line" style={{ fontSize: 18 }} aria-hidden="true" />
          <span style={{ fontSize: "var(--text-sm)" }}>{error}</span>
        </div>
      )}

      <AppShell
        topbarLeft={
          <h1 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)" }}>
            KPIs
          </h1>
        }
        topbarRight={
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            PR &amp; MCM tracking per case owner
          </span>
        }
      >
        <div className="page-layout">
          {/* Page heading */}
          <div className="page-heading-row">
            <div>
              <h2 style={{ margin: 0 }}>Progress Review KPIs</h2>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                Progress review and monthly coaching meeting KPIs broken down by case owner
              </p>
            </div>
          </div>

          {/* KPI hero row */}
          <div className="kpi-grid">
            {[
              { label: "Case Owners", value: records.length, icon: "ri-user-line", status: null as string | null },
              { label: "Total Required PRs", value: totalRequired, icon: "ri-file-list-3-line", status: null },
              { label: "Total Completed PRs", value: totalCompleted, icon: "ri-check-double-line", status: null },
              { label: "PR Completion Rate", value: `${completionRate}%`, icon: "ri-percent-line",
                status: completionRateNum >= 90 ? "kpi-status--success" : completionRateNum >= 70 ? "kpi-status--warning" : "kpi-status--danger" },
              { label: "Unscheduled Overdue PRs", value: totalUnschedOverdue, icon: "ri-alarm-warning-line",
                status: totalUnschedOverdue === 0 ? "kpi-status--success" : totalUnschedOverdue <= 5 ? "kpi-status--warning" : "kpi-status--danger" },
            ].map((s) => {
              const statusLabel = s.status === "kpi-status--danger" ? "⚠ Needs Attention"
                : s.status === "kpi-status--warning" ? "△ Need Attention"
                : s.status === "kpi-status--success" ? "✓ On Track" : null;
              return (
                <div key={s.label} className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">{s.label}</span>
                    <i className={`${s.icon} kpi-info`} aria-hidden="true" />
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-value stat-value">{s.value}</span>
                  </div>
                  {statusLabel && (
                    <div className="kpi-footer">
                      <span className={`kpi-status ${s.status}`}>{statusLabel}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Table */}
          <TestKPIsTable records={records} />
        </div>
      </AppShell>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
