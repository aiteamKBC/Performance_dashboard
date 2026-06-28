import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { CoachRecord } from "@/mocks/dashboard";
import { fetchCoachesLateness } from "@/services/coachesLateness";
import { TopbarLeft, TopbarRight } from "./components/DashboardHeader";
import ChartsSection from "./components/ChartsSection";
import CoachCards from "./components/CoachCards";
import AppShell from "@/components/AppShell";

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCoach, setActiveCoach] = useState("All");
  const [coachRecords, setCoachRecords] = useState<CoachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCoachesLateness();
        setCoachRecords(data);
      } catch (err) {
        console.error('Failed to load coaches lateness data:', err);
        setError('Failed to load data from API.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const coaches = useMemo(() => {
    const set = new Set(coachRecords.map((r) => r.coach));
    return Array.from(set).sort();
  }, [coachRecords]);

  const filtered = useMemo(() => {
    return coachRecords.filter((r) => {
      const matchesCoach = activeCoach === "All" || r.coach === activeCoach;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        r.associate.toLowerCase().includes(q) ||
        r.coach.toLowerCase().includes(q) ||
        r.caseOwner.toLowerCase().includes(q);
      return matchesCoach && matchesSearch;
    });
  }, [searchQuery, activeCoach, coachRecords]);

  const getLatestSnapshotDate = (rows: CoachRecord[]) => {
    const normalizedDates = rows
      .map((r) => r.lastSnapshotDate)
      .map((value) => {
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return isoMatch[0];
        const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
        return "";
      })
      .filter(Boolean);
    if (normalizedDates.length === 0) return "";
    return normalizedDates.reduce((latest, current) => (current > latest ? current : latest));
  };

  const liveSnapshotDate = useMemo(() => {
    return getLatestSnapshotDate(filtered) || getLatestSnapshotDate(coachRecords) || "N/A";
  }, [filtered, coachRecords]);

  return (
    <>
      {/* Loading overlay */}
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
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Loading coaches data…</span>
          </div>
        </div>
      )}

      {/* Error notification */}
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
        topbarLeft={<TopbarLeft liveSnapshotDate={liveSnapshotDate} />}
        topbarRight={
          <TopbarRight
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeCoach={activeCoach}
            onCoachChange={setActiveCoach}
            coaches={coaches}
          />
        }
      >
        <div className="page-layout">
          {/* Page heading row */}
          <div className="page-heading-row">
            <div>
              <h2 style={{ margin: 0, color: "var(--color-text-primary)" }}>Coaches Performance</h2>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                Coaching cohort metrics, evidence pipeline, and learner risk signals
              </p>
            </div>
          </div>

          {/* Coach cards — click to open the coach detail page */}
          <CoachCards records={filtered} onSelect={(r) => navigate(`/coach/${r.id}`)} />

          {/* Chart row */}
          <ChartsSection records={filtered} />
        </div>
      </AppShell>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
