import { Link } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

interface DashboardHeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeCoach: string;
  onCoachChange: (val: string) => void;
  coaches: string[];
  liveSnapshotDate: string;
  headlineStats: {
    totalLearners: number;
    avgEngagement: number;
    totalPending: number;
  };
}

export default function DashboardHeader({
  searchQuery,
  onSearchChange,
  activeCoach,
  onCoachChange,
  coaches,
  liveSnapshotDate,
  headlineStats,
}: DashboardHeaderProps) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative overflow-hidden bg-[#0f0f0f] text-white">
      {/* Background texture lines */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 48px)"
      }} />

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center">
          <img
            src="https://tutordashboard.kentbusinesscollege.net/assets/Kent-Business-College-COzDF_vQ.webp"
            alt="Kent Business College"
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-6 text-sm text-white/50">
          <span className="text-white/80 font-medium whitespace-nowrap">Coaches Lateness</span>
          <Link to="/coach-summary" className="hover:text-white transition-colors whitespace-nowrap cursor-pointer">Coach Summary</Link>
          <Link to="/test-kpis" className="hover:text-white transition-colors whitespace-nowrap cursor-pointer">KPIs</Link>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <span className="text-white/40 text-xs hidden sm:inline-block">{dateStr}</span>
        </div>
      </nav>

      {/* Hero area */}
      <div className="relative z-10 px-8 py-10">
        <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8">
          {/* Left: Title block */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-white/60 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7c4daa] inline-block"></span>
              Live snapshot &mdash; {liveSnapshotDate}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-2">
              Coaches<br />
              <span className="text-[#7c4daa]">Performance Dashboard</span>
            </h1>
            <p className="text-white/40 text-sm mt-3 max-w-xs">
              Coaching cohort metrics, evidence pipeline, and learner risk signals — all in one place.
            </p>
          </div>

          {/* Right: 3 headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total Learners", value: headlineStats.totalLearners, icon: "ri-group-line", colorClass: "text-[#7c4daa]" },
              { label: "Avg Engagement", value: `${headlineStats.avgEngagement}%`, icon: "ri-pulse-line", colorClass: "text-[#a8f0c6]" },
              { label: "Total Pending", value: headlineStats.totalPending, icon: "ri-time-line", colorClass: "text-[#7c4daa]" },
            ].map((s) => (
              <div
                key={s.label}
                className="px-6 py-5 flex flex-col gap-1 min-w-[130px] rounded-2xl border border-white/15"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 24px rgba(0,0,0,0.3)",
                }}
              >
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${s.icon} text-lg ${s.colorClass}`}></i>
                </div>
                <div className={`text-2xl font-black ${s.colorClass}`}>{s.value}</div>
                <div className="text-xs text-white/40 whitespace-nowrap">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-8">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm"></i>
            <input
              type="text"
              placeholder="Search associate or coach..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full border border-white/15 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#7c4daa]/50 transition-colors"
              style={{
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.25)",
              }}
            />
          </div>

          {/* Coach filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {["All", ...coaches].map((c) => (
              <button
                key={c}
                onClick={() => onCoachChange(c)}
                className={`whitespace-nowrap text-xs px-4 py-2 rounded-full border transition-all cursor-pointer ${
                  activeCoach === c
                    ? "bg-[#7c4daa] border-[#7c4daa] text-white font-bold"
                    : "text-white/50"
                }`}
                style={
                  activeCoach === c
                    ? {
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 16px rgba(124,77,170,0.35)",
                      }
                    : {
                        background: "rgba(255,255,255,0.06)",
                        borderColor: "rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.5)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.2)",
                      }
                }
              >
                {c}
              </button>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
