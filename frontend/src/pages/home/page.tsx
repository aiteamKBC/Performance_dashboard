import { useMemo, useState, useEffect } from "react";
import type { CoachRecord } from "@/mocks/dashboard";
import { fetchCoachesLateness } from "@/services/coachesLateness";
import DashboardHeader from "./components/DashboardHeader";
import ChartsSection from "./components/ChartsSection";
import MasterTable from "./components/MasterTable";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCoach, setActiveCoach] = useState("All");
  const [coachRecords, setCoachRecords] = useState<CoachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real data from API on mount
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

  // Quick summary numbers from filtered set
  const totalLearners = filtered.reduce((s, r) => s + r.totalLearners, 0);
  const avgEngagement = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + r.learnerEngagement, 0) / filtered.length)
    : 0;
  const totalPending = filtered.reduce((s, r) => s + r.pending, 0);
  const atRisk = filtered.reduce((s, r) => s + r.otjhAtRisk, 0);
  const coachesShown = new Set(filtered.map((r) => r.coach)).size;

  const headerTotalLearners = coachRecords.reduce((s, r) => s + r.totalLearners, 0);
  const headerAvgEngagement = coachRecords.length
    ? Math.round(coachRecords.reduce((s, r) => s + r.learnerEngagement, 0) / coachRecords.length)
    : 0;
  const headerTotalPending = coachRecords.reduce((s, r) => s + r.pending, 0);

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
    <div className="min-h-screen bg-[#0a0a0a] font-sans">
      {/* Loading indicator */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-8 flex flex-col items-center gap-4">
            <i className="ri-loader-4-line text-4xl text-[#7c4daa] animate-spin" />
            <span className="text-white text-sm">Loading coaches data...</span>
          </div>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <i className="ri-error-warning-line text-xl" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <DashboardHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCoach={activeCoach}
        onCoachChange={setActiveCoach}
        coaches={coaches}
        liveSnapshotDate={liveSnapshotDate}
        headlineStats={{
          totalLearners: headerTotalLearners,
          avgEngagement: headerAvgEngagement,
          totalPending: headerTotalPending,
        }}
      />

      {/* Quick stat strip */}
      <div className="border-b border-white/5 bg-[#0f0f0f]">
        <div className="max-w-[1600px] mx-auto px-8 py-3 flex items-center gap-8 overflow-x-auto">
          {[
            { label: "Associates shown", value: filtered.length, icon: "ri-user-3-line", colorClass: "text-[#c4b5fd]" },
            { label: "Total Learners", value: totalLearners, icon: "ri-group-line", colorClass: "text-[#a8f0c6]" },
            { label: "Avg Engagement", value: `${avgEngagement}%`, icon: "ri-pulse-line", colorClass: "text-[#a8f0c6]" },
            { label: "Total Pending", value: totalPending, icon: "ri-hourglass-2-line", colorClass: "text-[#7c4daa]" },
            { label: "OTJH At Risk", value: atRisk, icon: "ri-alarm-warning-line", colorClass: "text-[#ff7a7a]" },
            { label: "Coaches", value: coachesShown, icon: "ri-shield-user-line", colorClass: "text-[#c4b5fd]" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 shrink-0">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className={`${s.icon} text-sm ${s.colorClass}`} />
              </div>
              <span className={`font-bold text-sm font-mono ${s.colorClass}`}>{s.value}</span>
              <span className="text-white/30 text-xs whitespace-nowrap">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="px-8 py-6 max-w-[1600px] mx-auto space-y-6">
        <MasterTable records={filtered} />
        <ChartsSection records={filtered} />


      </main>
    </div>
  );
}
