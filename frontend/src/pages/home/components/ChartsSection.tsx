import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { CoachRecord } from "@/mocks/dashboard";

interface ChartsSectionProps {
  records: CoachRecord[];
}

interface CaseOwnerAggregate {
  name: string;
  totalLearners: number;
  recentSubmitters: number;
  evidenceAccepted: number;
  evidenceReferred: number;
  referredClosure: number;
  lastWeekPending: number;
  pending: number;
  prRequired4Weeks: number;
  prCompleted4Weeks: number;
  prDoneOld4Weeks: number;
  prOverallRequired: number;
  prOverallCompleted: number;
  otjhOnTrack: number;
  otjhNormal: number;
  otjhNeedAttention: number;
  otjhAtRisk: number;
}

const BLUE = "var(--home-chart-blue)";
const RED = "var(--home-chart-red)";
const YELLOW = "var(--home-chart-yellow)";
const PURPLE = "var(--home-chart-purple)";

const tooltipStyle = {
  backgroundColor: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "11px",
};
const tooltipLabelStyle = { color: "#ffffff", fontWeight: 600 };
const tooltipItemStyle = { color: "#d1d5db" };
const cursorStyle = { fill: "rgba(255,255,255,0.04)" };
const axisStyle = { fontSize: 11, fill: "rgba(255,255,255,0.6)" };

const formatCaseOwnerLabel = (value: string | number) => {
  const name = String(value ?? "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
};

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-white/15 p-5 flex flex-col gap-3 overflow-hidden isolate"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.035) 100%), rgba(18,18,22,0.92)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.35)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-0.5">{subtitle ?? "CaseOwner"}</p>
        <h3 className="text-white font-bold text-sm leading-tight">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const toPercent = (numerator: number, denominator: number) => {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function aggregateByCaseOwner(records: CoachRecord[]): CaseOwnerAggregate[] {
  const grouped = records.reduce((map, r) => {
    const name = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
    const current = map.get(name) ?? {
      name,
      totalLearners: 0,
      recentSubmitters: 0,
      evidenceAccepted: 0,
      evidenceReferred: 0,
      referredClosure: 0,
      lastWeekPending: 0,
      pending: 0,
      prRequired4Weeks: 0,
      prCompleted4Weeks: 0,
      prDoneOld4Weeks: 0,
      prOverallRequired: 0,
      prOverallCompleted: 0,
      otjhOnTrack: 0,
      otjhNormal: 0,
      otjhNeedAttention: 0,
      otjhAtRisk: 0,
    };

    current.totalLearners += r.totalLearners;
    current.recentSubmitters += r.recentSubmitters;
    current.evidenceAccepted += r.evidenceAccepted;
    current.evidenceReferred += r.evidenceReferred;
    current.referredClosure += r.referredClosure;
    current.lastWeekPending += r.lastWeekPending;
    current.pending += r.pending;
    current.prRequired4Weeks += r.prRequired4Weeks;
    current.prCompleted4Weeks += r.prCompleted4Weeks;
    current.prDoneOld4Weeks += r.prDoneOld4Weeks ?? r.prCompleted4Weeks;
    current.prOverallRequired += r.prOverallRequired;
    current.prOverallCompleted += r.prOverallCompleted;
    current.otjhOnTrack += r.otjhOnTrack;
    current.otjhNormal += r.otjhNormal ?? 0;
    current.otjhNeedAttention += r.otjhNeedAttention;
    current.otjhAtRisk += r.otjhAtRisk;

    map.set(name, current);
    return map;
  }, new Map<string, CaseOwnerAggregate>());

  return Array.from(grouped.values());
}

export default function ChartsSection({ records }: ChartsSectionProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-white/15 p-8 text-center text-white/30 text-sm" style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
        No data to display. Adjust your filters.
      </div>
    );
  }

  const grouped = aggregateByCaseOwner(records);

  const engagementData = grouped.map((r) => ({
    name: r.name,
    Engagement: toPercent(r.recentSubmitters, r.totalLearners),
  }));

  const closureData = grouped.map((r) => ({
    name: r.name,
    ReferredClosure: r.referredClosure,
  }));

  const markingData = grouped.map((r) => {
    const rawChangePct = r.lastWeekPending > 0
      ? ((r.lastWeekPending - r.pending) / r.lastWeekPending) * 100
      : (r.pending > 0 ? -100 : 0);

    return {
      name: r.name,
      Marking: Math.round(clamp(rawChangePct, -100, 100) * 10) / 10,
    };
  });

  const overallPrData = grouped.map((r) => ({
    name: r.name,
    "Completion%": toPercent(r.prOverallCompleted, r.prOverallRequired),
  }));

  const assignmentData = grouped.map((r) => ({
    name: r.name,
    "Last Week": r.lastWeekPending,
    Pending: r.pending,
  }));

  const pr4WeeksData = grouped.map((r) => ({
    name: r.name,
    "4Wk Rate": toPercent(r.prCompleted4Weeks, r.prRequired4Weeks),
  }));

  const otjhData = grouped.map((r) => ({
    name: r.name,
    OnTrack: r.otjhOnTrack,
    Normal: r.otjhNormal > 0 ? r.otjhNormal : r.otjhAtRisk,
    "Need Attention": r.otjhNeedAttention,
  }));

  const prPerfData = grouped.map((r) => ({
    name: r.name,
    "Last 4 Weeks": r.prDoneOld4Weeks,
    "Total Overall (PR)": r.prOverallRequired,
    "Overall Completed": r.prOverallCompleted,
  }));

  return (
    <div className="home-analytics-charts space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/8" />
        <span className="text-[10px] uppercase tracking-widest text-white/25 px-2">Analytics Charts</span>
        <div className="h-px flex-1 bg-white/8" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Learner Engagement vs. CaseOwner" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={engagementData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Learner"]} />
              <Bar dataKey="Engagement" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Referred Closure vs. CaseOwner" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={closureData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [v, "Referred Closure"]} />
              <Bar dataKey="ReferredClosure" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Marking Progress Weekly" subtitle="week over week (%)">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={markingData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} domain={[-100, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Marking"]} />
              <Bar dataKey="Marking" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <ChartCard title="OTJH Status" subtitle="Need Attention / Normal / OnTrack">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={otjhData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={axisStyle} angle={-20} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
                <Bar dataKey="OnTrack" stackId="a" fill={BLUE} maxBarSize={36} />
                <Bar dataKey="Normal" stackId="a" fill={PURPLE} maxBarSize={36} />
                <Bar dataKey="Need Attention" stackId="a" fill={YELLOW} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Completion Rate (PR) for Last 4 Weeks" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pr4WeeksData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "4Wk Rate"]} />
              <Bar dataKey="4Wk Rate" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Overall Completion(PR)" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={overallPrData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Completion"]} />
              <Bar dataKey="Completion%" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Last Week and current Week Assignment" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={assignmentData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
              <Bar dataKey="Last Week" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Pending" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Progress Review Performance" subtitle="CaseOwner">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={prPerfData} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={56} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)", paddingTop: 8 }} />
              <Bar dataKey="Last 4 Weeks" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Total Overall (PR)" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Overall Completed" fill={YELLOW} radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
