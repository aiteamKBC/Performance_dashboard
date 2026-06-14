import { useState, useEffect } from "react";
import CoachSummaryTable from "./components/CoachSummaryTable";
import CoachSummaryCharts from "./components/CoachSummaryCharts";
import type { CoachSummaryRecord } from "@/mocks/coachSummary";
import { fetchCoachSummary } from "@/services/coachSummary";
import AppShell from "@/components/AppShell";

export default function CoachSummaryPage() {
  const [records, setRecords] = useState<CoachSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCoachSummary();
        setRecords(data);
      } catch (err) {
        console.error('Failed to load coach summary data:', err);
        setError('Failed to load coach summary data from API.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");
  const highRisk = coaches.filter(c => c.last10WeeksAbsenceRatio >= 20).length;
  const totalStudents = overall?.studentsCount ?? coaches.reduce((s, c) => s + c.studentsCount, 0);
  const avgAbsence = coaches.length > 0
    ? (coaches.reduce((s, c) => s + c.last10WeeksAbsenceRatio, 0) / coaches.length).toFixed(1)
    : "0.0";

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
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Loading coach summary…</span>
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
            Coach Summary
          </h1>
        }
        topbarRight={
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            10-week absence tracking
          </span>
        }
      >
        <div className="page-layout">
          {/* Page heading */}
          <div className="page-heading-row">
            <div>
              <h2 style={{ margin: 0 }}>Absence Ratio Overview</h2>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                Weekly absence ratios per coach across a 10-week rolling window
              </p>
            </div>
          </div>

          {/* KPI hero row */}
          <div className="kpi-grid">
            {[
              { label: "Total Coaches", value: coaches.length, icon: "ri-shield-user-line", status: null },
              { label: "Total Students", value: totalStudents, icon: "ri-group-line", status: null },
              { label: "Avg 10W Absence", value: `${avgAbsence}%`, icon: "ri-percent-line",
                status: parseFloat(avgAbsence) >= 20 ? "kpi-status--danger" : parseFloat(avgAbsence) >= 15 ? "kpi-status--warning" : "kpi-status--success" },
              { label: "Company W1 Absence", value: `${(overall?.weeks[0]?.absenceRatio || 0).toFixed(2)}%`, icon: "ri-building-line", status: null },
              { label: "High Risk Coaches (≥20%)", value: highRisk, icon: "ri-alarm-warning-line",
                status: highRisk > 3 ? "kpi-status--danger" : highRisk > 1 ? "kpi-status--warning" : "kpi-status--success" },
            ].map((s) => {
              const statusLabel = s.status === "kpi-status--danger" ? "⚠ High Risk"
                : s.status === "kpi-status--warning" ? "△ Monitor"
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
          <CoachSummaryTable records={records} />

          {/* Charts */}
          <CoachSummaryCharts records={records} />
        </div>
      </AppShell>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
