import { useEffect, useRef, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import type { CoachRecord } from "@/mocks/dashboard";

// ─── colour tokens ────────────────────────────────────────────────────────────
const BLUE   = "var(--home-chart-blue)";
const RED    = "var(--home-chart-red)";
const YELLOW = "var(--home-chart-yellow)";

const ttStyle  = { backgroundColor: "#1e1e2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", color: "#ffffff", fontSize: "11px" };
const ttLabel  = { color: "#ffffff", fontWeight: 600 };
const ttItem   = { color: "#d1d5db" };
const ttCursor = { fill: "rgba(255,255,255,0.04)" };
const ax       = { fontSize: 11, fill: "rgba(255,255,255,0.6)" };

const fmtLabel = (v: string | number) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const p = s.split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[1][0]}.`;
};

const toPercent = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 1000) / 10);
const clamp     = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
export interface ChartDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  buildData: (agg: Agg[]) => Record<string, unknown>[];
  renderChart: (data: Record<string, unknown>[]) => React.ReactNode;
  drillColumns: { key: keyof CoachRecord; label: string }[];
}

export const CHART_DEFS: ChartDef[] = [
  {
    id: "engagement",
    title: "Learner Engagement",
    subtitle: "% of recent submitters per case owner",
    icon: "ri-pulse-line",
    color: "#a8f0c6",
    buildData: (agg) => agg.map((r) => ({ name: r.name, Engagement: toPercent(r.recentSubmitters, r.totalLearners) })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} formatter={(v) => [`${v}%`, "Engagement"]} />
        <Bar dataKey="Engagement" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "totalLearners", label: "Learners" }, { key: "recentSubmitters", label: "Recent Sub." }, { key: "learnerEngagement", label: "Engage %" },
    ],
  },
  {
    id: "closure",
    title: "Referred Closure",
    subtitle: "Closures per case owner",
    icon: "ri-file-reduce-line",
    color: "#c4b5fd",
    buildData: (agg) => agg.map((r) => ({ name: r.name, ReferredClosure: r.referredClosure })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} allowDecimals={false} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} formatter={(v) => [v, "Closure"]} />
        <Bar dataKey="ReferredClosure" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "evidenceReferred", label: "Referred" }, { key: "referredClosure", label: "Closure" }, { key: "referredClosurePct", label: "Closure %" },
    ],
  },
  {
    id: "marking",
    title: "Marking Progress Weekly",
    subtitle: "Week-over-week change (%)",
    icon: "ri-edit-2-line",
    color: "#fbbf24",
    buildData: (agg) => agg.map((r) => {
      const raw = r.lastWeekPending > 0 ? ((r.lastWeekPending - r.pending) / r.lastWeekPending) * 100 : (r.pending > 0 ? -100 : 0);
      return { name: r.name, Marking: Math.round(clamp(raw, -100, 100) * 10) / 10 };
    }),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} domain={[-100, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} formatter={(v) => [`${v}%`, "Marking"]} />
        <Bar dataKey="Marking" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "lastWeekPending", label: "Last Wk" }, { key: "pending", label: "Pending" }, { key: "markingProgressWeekly", label: "Progress %" },
    ],
  },
  {
    id: "otjh",
    title: "OTJH Status",
    subtitle: "On Track / Need Attention / At Risk",
    icon: "ri-alarm-warning-line",
    color: "#ff7a7a",
    buildData: (agg) => agg.map((r) => ({
      name: r.name, OnTrack: r.otjhOnTrack,
      Normal: r.otjhNormal > 0 ? r.otjhNormal : r.otjhAtRisk,
      "Need Attention": r.otjhNeedAttention,
    })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-20} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="OnTrack" stackId="a" fill="#22c55e" maxBarSize={44} />
        <Bar dataKey="Normal" stackId="a" fill="#f59e0b" maxBarSize={44} />
        <Bar dataKey="Need Attention" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "otjhOnTrack", label: "On Track" }, { key: "otjhNeedAttention", label: "Need Attn" }, { key: "otjhAtRisk", label: "At Risk" },
    ],
  },
  {
    id: "pr4weeks",
    title: "PR Completion — 4 Weeks",
    subtitle: "Completion rate for last 4-week window",
    icon: "ri-calendar-check-line",
    color: "#a8f0c6",
    buildData: (agg) => agg.map((r) => ({ name: r.name, "4Wk Rate": toPercent(r.prCompleted4Weeks, r.prRequired4Weeks) })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} formatter={(v) => [`${v}%`, "4Wk Rate"]} />
        <Bar dataKey="4Wk Rate" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "prRequired4Weeks", label: "Required" }, { key: "prCompleted4Weeks", label: "Completed" }, { key: "prBehindRate4Weeks", label: "Behind %" },
    ],
  },
  {
    id: "overall-pr",
    title: "Overall PR Completion",
    subtitle: "Overall progress review completion rate",
    icon: "ri-check-double-line",
    color: "#c4b5fd",
    buildData: (agg) => agg.map((r) => ({ name: r.name, "Completion%": toPercent(r.prOverallCompleted, r.prOverallRequired) })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} formatter={(v) => [`${v}%`, "Completion"]} />
        <Bar dataKey="Completion%" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "prOverallRequired", label: "Required" }, { key: "prOverallCompleted", label: "Completed" }, { key: "prOverallBehind", label: "Behind" },
    ],
  },
  {
    id: "assignment",
    title: "Assignment — Last & Current Week",
    subtitle: "Last week pending vs current pending",
    icon: "ri-hourglass-2-line",
    color: "#7c4daa",
    buildData: (agg) => agg.map((r) => ({ name: r.name, "Last Week": r.lastWeekPending, Pending: r.pending })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="Last Week" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Pending" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "lastWeekPending", label: "Last Wk" }, { key: "pending", label: "Pending" },
    ],
  },
  {
    id: "pr-perf",
    title: "Progress Review Performance",
    subtitle: "Last 4Wk done vs overall required vs completed",
    icon: "ri-bar-chart-grouped-line",
    color: "#e8a838",
    buildData: (agg) => agg.map((r) => ({
      name: r.name,
      "Last 4 Weeks": r.prDoneOld4Weeks,
      "Total Overall": r.prOverallRequired,
      "Overall Done": r.prOverallCompleted,
    })),
    renderChart: (data) => (
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 44 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
        <Bar dataKey="Last 4 Weeks" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="Total Overall" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="Overall Done" fill={YELLOW} radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    ),
    drillColumns: [
      { key: "associate", label: "Associate" }, { key: "coach", label: "Coach" }, { key: "caseOwner", label: "Case Owner" },
      { key: "prDoneOld4Weeks", label: "Last 4Wk Done" }, { key: "prOverallRequired", label: "Overall Req." }, { key: "prOverallCompleted", label: "Overall Done" },
    ],
  },
];

// ─── drill table ──────────────────────────────────────────────────────────────
function DrillTable({
  records,
  columns,
  filterOwner,
}: {
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
    return <p className="text-white/30 text-sm text-center py-6">No records for this selection.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2.5 text-left text-white/40 font-semibold uppercase tracking-wider whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-white/70 whitespace-nowrap">
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

// ─── section helper ───────────────────────────────────────────────────────────
function Section({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <i className={`${icon} text-sm`} style={{ color }} />
        <h3 className="text-sm font-bold text-white/80">{title}</h3>
        <div className="flex-1 h-px bg-white/10" />
      </div>
      {children}
    </div>
  );
}

// ─── drawer ───────────────────────────────────────────────────────────────────
interface Props {
  chartId: string | null;
  records: CoachRecord[];
  onClose: () => void;
}

export default function ChartDrillDrawer({ chartId, records, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const isOpen = !!chartId;
  const def = CHART_DEFS.find((c) => c.id === chartId) ?? null;

  // reset state when a new chart is opened
  useEffect(() => {
    setSelectedOwner(null);
    setSearch("");
  }, [chartId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(
      (r) => !q || r.associate.toLowerCase().includes(q) || r.coach.toLowerCase().includes(q) || r.caseOwner.toLowerCase().includes(q),
    );
  }, [records, search]);

  const agg = useMemo(() => aggregate(filteredRecords), [filteredRecords]);
  const chartData = useMemo(() => (def ? def.buildData(agg) : []), [def, agg]);

  const drillRowCount = selectedOwner
    ? filteredRecords.filter((r) => {
        const owner = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
        return owner === selectedOwner;
      }).length
    : filteredRecords.length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-40 transition-opacity duration-300"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          backdropFilter: isOpen ? "blur(4px)" : "none",
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full w-full max-w-2xl z-50 overflow-y-auto transition-transform duration-500 ease-in-out"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          background: "#111111",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {def && (
          <div className="flex flex-col min-h-full">

            {/* Header */}
            <div
              className="relative overflow-hidden px-8 pt-8 pb-6 border-b border-white/10 shrink-0"
              style={{ background: "linear-gradient(135deg, #1a0e2e 0%, #0f0f0f 100%)" }}
            >
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0px,#fff 1px,transparent 1px,transparent 20px)" }}
              />
              <button
                onClick={onClose}
                className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                <i className="ri-close-line text-lg" />
              </button>

              <div className="relative flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, #7c4daa 0%, #4d2a8a 100%)" }}
                >
                  <i className={`${def.icon} text-xl text-white`} />
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-0.5">Chart Drill-Down</div>
                  <h2 className="text-xl font-black text-white leading-tight">{def.title}</h2>
                  <p className="text-xs text-white/35 mt-1">{def.subtitle}</p>
                </div>
              </div>

              {/* summary pills */}
              <div className="relative grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: "Case Owners", value: agg.length, color: "#c4b5fd" },
                  { label: "Records", value: filteredRecords.length, color: "#a8f0c6" },
                  { label: "Showing", value: drillRowCount, color: def.color },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl p-3 border border-white/10 bg-white/5">
                    <div className="text-xl font-black font-mono" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 px-8 py-6 space-y-6">

              {/* Search */}
              <div className="relative">
                <i className="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search associate, coach, case owner…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#7c4daa]/60 transition-colors"
                />
              </div>

              {/* Chart */}
              <Section title="Chart" icon={def.icon} color={def.color}>
                <div
                  className="rounded-2xl border border-white/10 p-4"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <ResponsiveContainer width="100%" height={260}>
                    {/* @ts-expect-error — recharts internal child cloning */}
                    {def.renderChart(chartData)}
                  </ResponsiveContainer>
                </div>
              </Section>

              {/* Owner filter pills */}
              {agg.length > 0 && (
                <Section title="Filter by Case Owner" icon="ri-user-line" color="#c4b5fd">
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
                </Section>
              )}

              {/* Detail table */}
              <Section title={`Detail Records${selectedOwner ? ` — ${selectedOwner}` : ""}`} icon="ri-table-line" color="#a8f0c6">
                <DrillTable records={filteredRecords} columns={def.drillColumns} filterOwner={selectedOwner} />
              </Section>

              <div className="pb-8" />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
