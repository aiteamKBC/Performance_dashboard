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

const ttStyle  = { backgroundColor: "#ffffff", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#111827", fontSize: "11px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" };
const ttLabel  = { color: "#111827", fontWeight: 600 };
const ttItem   = { color: "#6B7280" };
const ttCursor = { fill: "#EEF2FF" };
const ax       = { fontSize: 11, fill: "#9CA3AF" };

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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={ax} angle={-20} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#6B7280", paddingTop: 8 }} />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#6B7280", paddingTop: 8 }} />
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
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={ax} angle={-28} textAnchor="end" interval={0} height={60} tickMargin={6} tickFormatter={fmtLabel} />
        <YAxis tick={ax} />
        <Tooltip contentStyle={ttStyle} labelStyle={ttLabel} itemStyle={ttItem} cursor={ttCursor} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#6B7280", paddingTop: 8 }} />
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
    return <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", textAlign: "center", padding: "var(--space-6) 0" }}>No records for this selection.</p>;

  return (
    <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
      <table style={{ width: "100%", fontSize: "var(--text-xs)", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{
                padding: "var(--space-2) var(--space-3)", textAlign: "left",
                color: "var(--color-text-muted)", fontWeight: "var(--font-semibold)",
                textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "transparent" : "var(--color-surface)" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <i className={`${icon}`} style={{ color, fontSize: "var(--text-sm)" }} />
        <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)" }}>{title}</h3>
        <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
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
          background: "var(--color-canvas)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
        }}
      >
        {def && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>

            {/* Header */}
            <div style={{
              position: "relative", overflow: "hidden",
              padding: "var(--space-8) var(--space-8) var(--space-6)",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-surface)", flexShrink: 0,
            }}>
              <button
                onClick={onClose}
                aria-label="Close drawer"
                style={{
                  position: "absolute", top: "var(--space-4)", right: "var(--space-4)",
                  width: 32, height: 32, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--color-border)", background: "transparent",
                  color: "var(--color-text-muted)", cursor: "pointer",
                }}
              >
                <i className="ri-close-line" style={{ fontSize: "var(--text-md)" }} />
              </button>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-4)" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "var(--radius-lg)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  background: "var(--color-accent-tint)", color: "var(--color-accent)",
                }}>
                  <i className={def.icon} style={{ fontSize: 20 }} />
                </div>
                <div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>Chart Drill-Down</div>
                  <h2 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)", lineHeight: 1.2 }}>{def.title}</h2>
                  <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{def.subtitle}</p>
                </div>
              </div>

              {/* summary pills */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
                {[
                  { label: "Case Owners", value: agg.length, color: "var(--color-accent)" },
                  { label: "Records", value: filteredRecords.length, color: "var(--color-success)" },
                  { label: "Showing", value: drillRowCount, color: "var(--color-text-primary)" },
                ].map((s) => (
                  <div key={s.label} style={{
                    borderRadius: "var(--radius-md)", padding: "var(--space-3)",
                    border: "1px solid var(--color-border)", background: "var(--color-canvas)",
                  }}>
                    <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: "var(--space-6) var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <i className="ri-search-2-line" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search associate, coach, case owner…"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--color-surface)", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", paddingLeft: 32, paddingRight: 12,
                    paddingTop: "var(--space-2)", paddingBottom: "var(--space-2)",
                    fontSize: "var(--text-sm)", color: "var(--color-text-primary)", outline: "none",
                  }}
                />
              </div>

              {/* Chart */}
              <Section title="Chart" icon={def.icon} color="var(--color-accent)">
                <div style={{
                  borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)",
                  padding: "var(--space-4)", background: "var(--color-surface)",
                }}>
                  <ResponsiveContainer width="100%" height={260}>
                    {/* @ts-expect-error — recharts internal child cloning */}
                    {def.renderChart(chartData)}
                  </ResponsiveContainer>
                </div>
              </Section>

              {/* Owner filter pills */}
              {agg.length > 0 && (
                <Section title="Filter by Case Owner" icon="ri-user-line" color="var(--color-accent)">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <button
                      onClick={() => setSelectedOwner(null)}
                      style={{
                        padding: "var(--space-1) var(--space-3)", borderRadius: 999,
                        fontSize: "var(--text-xs)", fontWeight: "var(--font-medium)", cursor: "pointer",
                        border: `1px solid ${selectedOwner === null ? "var(--color-accent)" : "var(--color-border)"}`,
                        background: selectedOwner === null ? "var(--color-accent)" : "transparent",
                        color: selectedOwner === null ? "#ffffff" : "var(--color-text-secondary)",
                      }}
                    >
                      All
                    </button>
                    {agg.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => setSelectedOwner(selectedOwner === a.name ? null : a.name)}
                        style={{
                          padding: "var(--space-1) var(--space-3)", borderRadius: 999,
                          fontSize: "var(--text-xs)", fontWeight: "var(--font-medium)", cursor: "pointer",
                          border: `1px solid ${selectedOwner === a.name ? "var(--color-accent)" : "var(--color-border)"}`,
                          background: selectedOwner === a.name ? "var(--color-accent)" : "transparent",
                          color: selectedOwner === a.name ? "#ffffff" : "var(--color-text-secondary)",
                        }}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Detail table */}
              <Section title={`Detail Records${selectedOwner ? ` — ${selectedOwner}` : ""}`} icon="ri-table-line" color="var(--color-success)">
                <DrillTable records={filteredRecords} columns={def.drillColumns} filterOwner={selectedOwner} />
              </Section>

              <div style={{ paddingBottom: "var(--space-8)" }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
