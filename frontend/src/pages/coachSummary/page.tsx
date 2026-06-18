import { useState, useEffect, useCallback } from "react";
import CoachSummaryTable from "./components/CoachSummaryTable";
import CoachSummaryCharts from "./components/CoachSummaryCharts";
import CoachWeekDrawer, { type CoachWeekSelection } from "./components/CoachWeekDrawer";
import type { CoachSummaryRecord } from "@/mocks/coachSummary";
import { fetchAttendanceWeeks } from "@/services/attendance";
import AppShell from "@/components/AppShell";

const WEEKS_PER_PAGE = 10;

export default function CoachSummaryPage() {
  const [records, setRecords] = useState<CoachSummaryRecord[]>([]);
  const [selection, setSelection] = useState<CoachWeekSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [oldestWeekKey, setOldestWeekKey] = useState<string | null>(null);
  const [newestWeekKey, setNewestWeekKey] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchAttendanceWeeks>>) => {
    setRecords(result.records);
    setOldestWeekKey(result.oldestWeekKey);
    setNewestWeekKey(result.newestWeekKey);
    setHasOlder(result.hasOlder);
    setHasNewer(result.hasNewer);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        applyResult(await fetchAttendanceWeeks(WEEKS_PER_PAGE));
      } catch (err) {
        console.error('Failed to load attendance data:', err);
        setError('Failed to load attendance data from API.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [applyResult]);

  const goPrev = useCallback(async () => {
    if (!oldestWeekKey || paging) return;
    try {
      setPaging(true);
      applyResult(await fetchAttendanceWeeks(WEEKS_PER_PAGE, { before: oldestWeekKey }));
    } catch (err) {
      console.error('Failed to load older weeks:', err);
      setError('Failed to load older weeks from API.');
    } finally {
      setPaging(false);
    }
  }, [oldestWeekKey, paging, applyResult]);

  const goNext = useCallback(async () => {
    if (!newestWeekKey || paging) return;
    try {
      setPaging(true);
      applyResult(await fetchAttendanceWeeks(WEEKS_PER_PAGE, { after: newestWeekKey }));
    } catch (err) {
      console.error('Failed to load newer weeks:', err);
      setError('Failed to load newer weeks from API.');
    } finally {
      setPaging(false);
    }
  }, [newestWeekKey, paging, applyResult]);

  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");
  const highRisk = coaches.filter(c => c.last10WeeksAbsenceRatio >= 20).length;
  const totalStudents = overall?.studentsCount ?? coaches.reduce((s, c) => s + c.studentsCount, 0);
  const avgAbsence = coaches.length > 0
    ? (coaches.reduce((s, c) => s + c.last10WeeksAbsenceRatio, 0) / coaches.length).toFixed(1)
    : "0.0";

  const handleWeekSelect = (coachName: string, weekIndex: number) => {
    const record = records.find((r) => r.coachName === coachName);
    const week = record?.weeks[weekIndex];
    setSelection({
      coachName,
      year: week?.year,
      weekNumber: week?.weekNumber,
      label: week?.label,
      weekStart: week?.weekStart,
      weekEnd: week?.weekEnd,
    });
  };

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
          <CoachSummaryTable
            records={records}
            onWeekSelect={handleWeekSelect}
            onPrev={goPrev}
            onNext={goNext}
            canPrev={hasOlder}
            canNext={hasNewer}
            paging={paging}
          />

          {/* Charts */}
          <CoachSummaryCharts records={records} />
        </div>
      </AppShell>

      <CoachWeekDrawer selection={selection} onClose={() => setSelection(null)} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
