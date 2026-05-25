import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import type { CoachRecord } from "@/mocks/dashboard";
import { fetchCoachesLateness } from "@/services/coachesLateness";

// ─── colour tokens ────────────────────────────────────────────────────────────
const BLUE   = "var(--home-chart-blue)";
const RED    = "var(--home-chart-red)";
const YELLOW = "var(--home-chart-yellow)";

const tooltipStyle = {
  backgroundColor: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "11px",
};
const tooltipLabelStyle = { color: "#ffffff", fontWeight: 600 };
const tooltipItemStyle  = { color: "#d1d5db" };
const cursorStyle       = { fill: "rgba(255,255,255,0.04)" };
const axisStyle         = { fontSize: 11, fill: "rgba(255,255,255,0.6)" };

const fmtLabel = (v: string | number) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const p = s.split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[1][0]}.`;
};

const toPercent = (n: number, d: number) =>
  d <= 0 ? 0 : Math.round((n / d) * 1000) / 10;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// ─── aggregate ────────────────────────────────────────────────────────────────
interface Agg {
  name: string;
  totalLearners: number; recentSubmitters: number;
  evidenceReferred: number; referredClosure: number;
  lastWeekPending: number; pending: number;
  prRequired4Weeks: number; prCompleted4Weeks: number; prDoneOld4Weeks: number;
  prOverallRequired: number; prOverallCompleted: number;
  otjhOnTrack: number; otjhNormal: number; otjhNeedAttention: number; otjhAtRisk: number;
}

function aggregate(records: CoachRecord[]): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of records) {
    const name = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
    const a = map.get(name) ?? {
      name, totalLearners: 0, recentSubmitters: 0,
      evidenceReferred: 0, referredClosure: 0,
      lastWeekPending: 0, pending: 0,
      prRequired4Weeks: 0, prCompleted4Weeks: 0, prDoneOld4Weeks: 0,
      prOverallRequired: 0, prOverallCompleted: 0,
      otjhOnTrack: 0, otjhNormal: 0, otjhNeedAttention: 0, otjhAtRisk: 0,
    };
    a.totalLearners      += r.totalLearners;
    a.recentSubmitters   += r.recentSubmitters;
    a.evidenceReferred   += r.evidenceReferred;
    a.referredClosure    += r.referredClosure;
    a.lastWeekPending    += r.lastWeekPending;
    a.pending            += r.pending;
    a.prRequired4Weeks   += r.prRequired4Weeks;
    a.prCompleted4Weeks  += r.prCompleted4Weeks;
    a.prDoneOld4Weeks    += r.prDoneOld4Weeks ?? r.prCompleted4Weeks;
    a.prOverallRequired  += r.prOverallRequired;
    a.prOverallCompleted += r.prOverallCompleted;
    a.otjhOnTrack        += r.otjhOnTrack;
    a.otjhNormal         += r.otjhNormal ?? 0;
    a.otjhNeedAttention  += r.otjhNeedAttention;
    a.otjhAtRisk         += r.otjhAtRisk;
    map.set(name, a);
  }
  return Array.from(map.values());
}

// ─── chart definitions ────────────────────────────────────────────────────────
interface ChartDef {
  id: string;
  title: string;
  subtitle: string;
  buildData: (agg: Agg[]) => Record<string, unknown>[];
  chart: (data: Record<string, unknown>[]) => React.ReactNode;
  drillColumns: { key: keyof CoachRecord; label: string }[];
  drillFilter?: (record: CoachRecord, clickedName: string) => boolean;
}

const CHARTS: ChartDef[] = [
  {
    id: "engagement",
    title: "Learner Engagement vs. CaseOwner",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({ name: r.name, Engagement: toPercent(r.recentSubmitters, r.totalLearners) })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Engagement"]} />
        <Bar dataKey="Engagement" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "totalLearners", label: "Learners" },
      { key: "recentSubmitters", label: "Recent Sub." },
      { key: "learnerEngagement", label: "Engagement %" },
    ],
  },
  {
    id: "closure",
    title: "Referred Closure vs. CaseOwner",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({ name: r.name, ReferredClosure: r.referredClosure })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [v, "Referred Closure"]} />
        <Bar dataKey="ReferredClosure" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "evidenceReferred", label: "Referred" },
      { key: "referredClosure", label: "Closure" },
      { key: "referredClosurePct", label: "Closure %" },
    ],
  },
  {
    id: "marking",
    title: "Marking Progress Weekly",
    subtitle: "week over week (%)",
    buildData: (agg) => agg.map((r) => {
      const raw = r.lastWeekPending > 0
        ? ((r.lastWeekPending - r.pending) / r.lastWeekPending) * 100
        : (r.pending > 0 ? -100 : 0);
      return { name: r.name, Marking: Math.round(clamp(raw, -100, 100) * 10) / 10 };
    }),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} domain={[-100, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Marking"]} />
        <Bar dataKey="Marking" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "lastWeekPending", label: "Last Wk Pending" },
      { key: "pending", label: "Pending" },
      { key: "markingProgressWeekly", label: "Progress %" },
    ],
  },
  {
    id: "otjh",
    title: "OTJH Status",
    subtitle: "Need Attention / Normal / OnTrack",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      OnTrack: r.otjhOnTrack,
      Normal: r.otjhNormal > 0 ? r.otjhNormal : r.otjhAtRisk,
      "Need Attention": r.otjhNeedAttention,
    })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-20} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="OnTrack" stackId="a" fill="#22c55e" maxBarSize={48} />
        <Bar dataKey="Normal" stackId="a" fill="#f59e0b" maxBarSize={48} />
        <Bar dataKey="Need Attention" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "otjhOnTrack", label: "On Track" },
      { key: "otjhNormal", label: "Normal" },
      { key: "otjhNeedAttention", label: "Need Attn" },
      { key: "otjhAtRisk", label: "At Risk" },
    ],
  },
  {
    id: "pr4weeks",
    title: "Completion Rate (PR) — Last 4 Weeks",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      "4Wk Rate": toPercent(r.prCompleted4Weeks, r.prRequired4Weeks),
    })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "4Wk Rate"]} />
        <Bar dataKey="4Wk Rate" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "prRequired4Weeks", label: "Required" },
      { key: "prCompleted4Weeks", label: "Completed" },
      { key: "prBehindRate4Weeks", label: "Behind %" },
    ],
  },
  {
    id: "overall-pr",
    title: "Overall Completion (PR)",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      "Completion%": toPercent(r.prOverallCompleted, r.prOverallRequired),
    })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Completion"]} />
        <Bar dataKey="Completion%" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "prOverallRequired", label: "Required" },
      { key: "prOverallCompleted", label: "Completed" },
      { key: "prOverallBehind", label: "Behind" },
      { key: "prOverallCompletionRate", label: "Completion %" },
    ],
  },
  {
    id: "assignment",
    title: "Last Week & Current Week Assignment",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      "Last Week": r.lastWeekPending,
      Pending: r.pending,
    })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="Last Week" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Pending" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "lastWeekPending", label: "Last Wk Pending" },
      { key: "pending", label: "Pending" },
    ],
  },
  {
    id: "pr-perf",
    title: "Progress Review Performance",
    subtitle: "CaseOwner",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      "Last 4 Weeks": r.prDoneOld4Weeks,
      "Total Overall (PR)": r.prOverallRequired,
      "Overall Completed": r.prOverallCompleted,
    })),
    chart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={axisStyle} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="Last 4 Weeks" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="Total Overall (PR)" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="Overall Completed" fill={YELLOW} radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" },
      { key: "coach", label: "Coach" },
      { key: "caseOwner", label: "Case Owner" },
      { key: "prDoneOld4Weeks", label: "Last 4Wk Done" },
      { key: "prOverallRequired", label: "Overall Req." },
      { key: "prOverallCompleted", label: "Overall Done" },
    ],
  },
];

// ─── drill table ──────────────────────────────────────────────────────────────
function DrillTable({ records, columns, filterOwner }: {
  records: CoachRecord[];
  columns: { key: keyof CoachRecord; label: string }[];
  filterOwner: string | null;
}) {
  const rows = filterOwner
    ? records.filter((r) => {
        const owner = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
        return owner === filterOwner;
      })
    : records;

  if (rows.length === 0)
    return <p className="text-white/30 text-sm text-center py-8">No records for this selection.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-2.5 text-left text-white/50 font-semibold uppercase tracking-wider whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-2 text-white/80 whitespace-nowrap">
                  {String(r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function ChartDrillPage() {
  const { chartId } = useParams<{ chartId: string }>();
  const navigate = useNavigate();

  const [records, setRecords] = useState<CoachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCoachesLateness()
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  const def = CHARTS.find((c) => c.id === chartId);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        !q ||
        r.associate.toLowerCase().includes(q) ||
        r.coach.toLowerCase().includes(q) ||
        r.caseOwner.toLowerCase().includes(q),
    );
  }, [records, search]);

  const agg = useMemo(() => aggregate(filtered), [filtered]);
  const chartData = useMemo(() => (def ? def.buildData(agg) : []), [def, agg]);

  if (!def) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white/40 text-sm">Chart not found.</p>
          <button onClick={() => navigate("/dashboard")} className="text-[#7c4daa] text-sm hover:underline">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans">
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-8 flex flex-col items-center gap-4">
            <i className="ri-loader-4-line text-4xl text-[#7c4daa] animate-spin" />
            <span className="text-white text-sm">Loading data…</span>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="border-b border-white/8 bg-[#0f0f0f] sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors group"
          >
            <i className="ri-arrow-left-s-line text-lg group-hover:-translate-x-0.5 transition-transform" />
            Lateness
          </button>
          <span className="text-white/20">/</span>
          <span className="text-white/70 text-sm font-medium truncate">{def.title}</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
        {/* header */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-white/25">{def.subtitle}</p>
          <h1 className="text-white font-bold text-xl">{def.title}</h1>
          <p className="text-white/35 text-xs">
            Click a bar to filter the detail table below by that case owner.
          </p>
        </div>

        {/* search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <i className="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search associate, coach, case owner…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#7c4daa]/60 transition-colors"
            />
          </div>
          {selectedOwner && (
            <button
              onClick={() => setSelectedOwner(null)}
              className="flex items-center gap-1.5 text-xs text-white/50 border border-white/15 rounded-lg px-3 py-2 hover:text-white hover:border-white/30 transition-colors"
            >
              <i className="ri-filter-off-line" />
              Clear filter ({selectedOwner})
            </button>
          )}
        </div>

        {/* big chart */}
        <div
          className="rounded-2xl border border-white/15 p-6 overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.035) 100%), rgba(18,18,22,0.92)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.35)",
          }}
        >
          <ResponsiveContainer width="100%" height={320}>
            {/* @ts-expect-error — children is ReactNode, recharts internal cloning is fine */}
            {def.chart(chartData)}
          </ResponsiveContainer>
          <p className="text-[10px] text-white/25 text-center mt-2">Click a bar to drill into records</p>
        </div>

        {/* owner pills */}
        {agg.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedOwner(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedOwner === null
                  ? "bg-[#7c4daa] border-[#7c4daa] text-white"
                  : "bg-white/5 border-white/15 text-white/50 hover:text-white"
              }`}
            >
              All
            </button>
            {agg.map((a) => (
              <button
                key={a.name}
                onClick={() => setSelectedOwner(selectedOwner === a.name ? null : a.name)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedOwner === a.name
                    ? "bg-[#7c4daa] border-[#7c4daa] text-white"
                    : "bg-white/5 border-white/15 text-white/50 hover:text-white"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* detail table */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-white/70 text-sm font-semibold">
              Detail Records
              {selectedOwner && <span className="ml-2 text-[#7c4daa]">— {selectedOwner}</span>}
            </h2>
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-white/25 text-xs">
              {(selectedOwner ? filtered.filter((r) => {
                const owner = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
                return owner === selectedOwner;
              }) : filtered).length} rows
            </span>
          </div>
          <DrillTable records={filtered} columns={def.drillColumns} filterOwner={selectedOwner} />
        </div>
      </main>
    </div>
  );
}
