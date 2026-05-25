import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchCoachesLateness } from "@/services/coachesLateness";
import { fetchCoachSummary } from "@/services/coachSummary";
import { fetchTestKPIs } from "@/services/testKPIs";
import type { CoachRecord } from "@/mocks/dashboard";
import type { CoachSummaryRecord } from "@/mocks/coachSummary";
import type { TestKPIsRecord } from "@/services/testKPIs";
import CoachProfileDrawer from "./components/CoachProfileDrawer";
import ThemeToggle from "@/components/ThemeToggle";

interface CoachSummary {
  name: string;
  totalLearners: number;
  learnerEngagement: number;
  otjhAtRisk: number;
  pending: number;
  prOverallCompletionRate: number;
  absenceAvg: number;
  records: CoachRecord[];
  summaryRecord?: CoachSummaryRecord;
  kpiRecord?: TestKPIsRecord;
}

export default function LandingPage() {
  const [latenessData, setLatenessData] = useState<CoachRecord[]>([]);
  const [summaryData, setSummaryData] = useState<CoachSummaryRecord[]>([]);
  const [kpiData, setKpiData] = useState<TestKPIsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<CoachSummary | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);
        const [lateness, summary, kpis] = await Promise.all([
          fetchCoachesLateness(),
          fetchCoachSummary(),
          fetchTestKPIs(),
        ]);
        setLatenessData(lateness);
        setSummaryData(summary);
        setKpiData(kpis);
      } catch {
        setError("Failed to load data. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  const coaches = useMemo<CoachSummary[]>(() => {
    const grouped = new Map<string, CoachRecord[]>();
    for (const r of latenessData) {
      const key = r.coach;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }

    return Array.from(grouped.entries())
      .map(([name, records]) => {
        const totalLearners = records.reduce((s, r) => s + r.totalLearners, 0);
        const learnerEngagement = records.length
          ? Math.round(records.reduce((s, r) => s + r.learnerEngagement, 0) / records.length)
          : 0;
        const otjhAtRisk = records.reduce((s, r) => s + r.otjhAtRisk, 0);
        const pending = records.reduce((s, r) => s + r.pending, 0);
        const prOverallCompletionRate = records.length
          ? Math.round(records.reduce((s, r) => s + r.prOverallCompletionRate, 0) / records.length)
          : 0;

        const summaryRecord = summaryData.find(
          (s) => s.coachName.toLowerCase().trim() === name.toLowerCase().trim()
        );
        const absenceAvg = summaryRecord?.last10WeeksAbsenceRatio ?? 0;

        const kpiRecord = kpiData.find(
          (k) => k.caseOwner.toLowerCase().trim() === name.toLowerCase().trim()
        );

        return {
          name,
          totalLearners,
          learnerEngagement,
          otjhAtRisk,
          pending,
          prOverallCompletionRate,
          absenceAvg,
          records,
          summaryRecord,
          kpiRecord,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [latenessData, summaryData, kpiData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return coaches;
    return coaches.filter((c) => c.name.toLowerCase().includes(q));
  }, [coaches, search]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans">
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-2xl p-10 flex flex-col items-center gap-4 border border-white/10">
            <i className="ri-loader-4-line text-5xl text-[#7c4daa] animate-spin" />
            <span className="text-white text-sm font-medium">Loading coach data...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <i className="ri-error-warning-line text-xl" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Header */}
      <header className="relative overflow-hidden bg-[#0f0f0f] border-b border-white/10">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 48px)",
          }}
        />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/10">
          <img
            src="https://tutordashboard.kentbusinesscollege.net/assets/Kent-Business-College-COzDF_vQ.webp"
            alt="Kent Business College"
            className="h-10 w-auto object-contain"
          />
          <div className="flex items-center gap-6 text-sm text-white/50">
            <span className="text-white/80 font-medium">Coaches</span>
            <Link to="/dashboard" className="hover:text-white transition-colors">Lateness</Link>
            <Link to="/coach-summary" className="hover:text-white transition-colors">Coach Summary</Link>
            <Link to="/test-kpis" className="hover:text-white transition-colors">KPIs</Link>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-white/40 text-xs hidden sm:block">{dateStr}</span>
          </div>
        </nav>

        {/* Hero */}
        <div className="relative z-10 px-8 py-12">
          <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-white/60 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7c4daa] inline-block" />
                Performance Dashboard &mdash; Select a coach to explore
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-2 text-white">
                Our<br />
                <span className="text-[#7c4daa]">Coaches</span>
              </h1>
              <p className="text-white/40 text-sm mt-3 max-w-xs">
                Click any coach card to view their full performance profile across all metrics.
              </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Coaches", value: coaches.length, icon: "ri-shield-user-line", color: "#7c4daa" },
                { label: "Total Learners", value: coaches.reduce((s, c) => s + c.totalLearners, 0), icon: "ri-group-line", color: "#a8f0c6" },
                { label: "OTJH At Risk", value: coaches.reduce((s, c) => s + c.otjhAtRisk, 0), icon: "ri-alarm-warning-line", color: "#ff7a7a" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="px-6 py-5 flex flex-col gap-1 min-w-[120px] rounded-2xl border border-white/15"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  <i className={`${s.icon} text-lg`} style={{ color: s.color }} />
                  <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs text-white/40 whitespace-nowrap">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="max-w-[1600px] mx-auto mt-8">
            <div className="relative max-w-sm">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
              <input
                type="text"
                placeholder="Search coaches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-white/15 rounded-full pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#7c4daa]/60 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.25)",
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Coach cards grid */}
      <main className="px-8 py-10 max-w-[1600px] mx-auto">
        {filtered.length === 0 && !loading ? (
          <div className="text-center py-24 text-white/30">
            <i className="ri-user-search-line text-5xl block mb-3" />
            <p>No coaches found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((coach) => (
              <CoachCard key={coach.name} coach={coach} onClick={() => setSelectedCoach(coach)} />
            ))}
          </div>
        )}
      </main>

      {/* Profile drawer */}
      <CoachProfileDrawer
        coach={selectedCoach}
        allLateness={latenessData}
        onClose={() => setSelectedCoach(null)}
      />
    </div>
  );
}

function CoachCard({ coach, onClick }: { coach: CoachSummary; onClick: () => void }) {
  const engagementColor =
    coach.learnerEngagement >= 80
      ? "#a8f0c6"
      : coach.learnerEngagement >= 60
      ? "#fbbf24"
      : "#ff7a7a";

  const absenceColor =
    coach.absenceAvg === 0
      ? "#ffffff30"
      : coach.absenceAvg < 15
      ? "#a8f0c6"
      : coach.absenceAvg < 20
      ? "#fbbf24"
      : "#ff7a7a";

  const prColor =
    coach.prOverallCompletionRate >= 80
      ? "#a8f0c6"
      : coach.prOverallCompletionRate >= 60
      ? "#fbbf24"
      : "#ff7a7a";

  const initials = coach.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <button
      onClick={onClick}
      className="group relative text-left rounded-2xl border border-white/10 p-5 transition-all duration-300 hover:border-[#7c4daa]/60 hover:scale-[1.02] hover:shadow-2xl cursor-pointer"
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 16px rgba(0,0,0,0.3)",
      }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(124,77,170,0.12) 0%, transparent 70%)" }}
      />

      {/* Avatar */}
      <div className="relative w-14 h-14 rounded-xl mb-4 flex items-center justify-center font-black text-lg text-white"
        style={{ background: "linear-gradient(135deg, #7c4daa 0%, #4d2a8a 100%)" }}
      >
        {initials}
        {coach.otjhAtRisk > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#ff7a7a] text-[9px] font-black text-white flex items-center justify-center">
            {coach.otjhAtRisk}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="font-bold text-white text-sm leading-tight mb-1 group-hover:text-[#c4b5fd] transition-colors">
        {coach.name}
      </div>
      <div className="text-white/30 text-xs mb-4">
        {coach.records.length} associate{coach.records.length !== 1 ? "s" : ""}
      </div>

      {/* Key metrics */}
      <div className="space-y-2.5">
        <MetricRow icon="ri-group-line" label="Learners" value={coach.totalLearners} color="#c4b5fd" />
        <MetricRow icon="ri-pulse-line" label="Engagement" value={`${coach.learnerEngagement}%`} color={engagementColor} />
        <MetricRow icon="ri-check-double-line" label="PR Completion" value={`${coach.prOverallCompletionRate}%`} color={prColor} />
        {coach.absenceAvg > 0 && (
          <MetricRow icon="ri-calendar-close-line" label="Avg Absence" value={`${coach.absenceAvg.toFixed(1)}%`} color={absenceColor} />
        )}
        {coach.pending > 0 && (
          <MetricRow icon="ri-hourglass-2-line" label="Pending" value={coach.pending} color="#7c4daa" />
        )}
      </div>

      {/* Arrow */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <i className="ri-arrow-right-line text-[#7c4daa] text-sm" />
      </div>
    </button>
  );
}

function MetricRow({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <i className={`${icon} text-xs text-white/25`} />
        <span className="text-white/40 text-xs">{label}</span>
      </div>
      <span className="text-xs font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  );
}
