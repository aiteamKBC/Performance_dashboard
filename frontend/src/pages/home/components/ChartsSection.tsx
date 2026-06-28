import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { CoachRecord, type PeriodCounts, type ReviewPeriodKey } from "@/mocks/dashboard";

const PERIOD_OPTIONS: { key: ReviewPeriodKey; label: string }[] = [
  { key: "4w", label: "4 weeks" },
  { key: "8w", label: "8 weeks" },
  { key: "12w", label: "12 weeks" },
  { key: "all", label: "All dates" },
];

const emptyPeriodCounts = (): PeriodCounts => ({
  "4w": { required: 0, completed: 0 },
  "8w": { required: 0, completed: 0 },
  "12w": { required: 0, completed: 0 },
  all: { required: 0, completed: 0 },
});

function addPeriodCounts(target: PeriodCounts, src?: PeriodCounts) {
  if (!src) return;
  (Object.keys(target) as ReviewPeriodKey[]).forEach((k) => {
    target[k].required += src[k]?.required ?? 0;
    target[k].completed += src[k]?.completed ?? 0;
  });
}

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
  mcmRequired4Weeks: number;
  mcmCompleted4Weeks: number;
  prByLearner: PeriodCounts;
  mcmByLearner: PeriodCounts;
  // Variance-based OTJH bands, matching the coach-page chart & Metric Breakdown.
  otjhOnTrack: number;
  otjhNeedAttention: number;
  otjhAtRisk: number;
}

/* Token palette for chart series */
const C1 = "#4F46E5";
const C2 = "#0891B2";
const C3 = "#D97706";
const C4 = "#16A34A";
const C5 = "#DC2626";
const C6 = "#94A3B8";  // neutral slate (used for "Required" so "Over Due" can be the red)

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  color: "#111827",
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};
const tooltipLabelStyle = { color: "#111827", fontWeight: 600 };
const tooltipItemStyle = { color: "#6B7280" };
const cursorStyle = { fill: "#EEF2FF" };
const axisStyle = { fontSize: 11, fill: "#9CA3AF" };

const formatCaseOwnerLabel = (value: string | number) => {
  const name = String(value ?? "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
};

function ChartCard({
  title, subtitle, action, children,
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="chart-card">
      <div className="chart-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
        <div>
          <h3 className="chart-title">{title}</h3>
          {subtitle && <p className="chart-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="chart-body">
        {children}
      </div>
    </div>
  );
}

const periodSelectStyle = {
  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
  background: "var(--color-canvas)", padding: "2px 6px",
  fontSize: "var(--text-xs)", color: "var(--color-text-primary)", outline: "none", cursor: "pointer",
} as const;

function PeriodSelect({ value, onChange }: { value: ReviewPeriodKey; onChange: (v: ReviewPeriodKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ReviewPeriodKey)}
      style={periodSelectStyle}
      aria-label="Time period"
      title="Time period"
    >
      {PERIOD_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}

const toPercent = (numerator: number, denominator: number) => {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

function aggregateByCaseOwner(records: CoachRecord[]): CaseOwnerAggregate[] {
  const grouped = records.reduce((map, r) => {
    const name = (r.caseOwner || r.coach || r.associate || "Unknown").trim() || "Unknown";
    const current = map.get(name) ?? {
      name, totalLearners: 0, recentSubmitters: 0, evidenceAccepted: 0,
      evidenceReferred: 0, referredClosure: 0, lastWeekPending: 0, pending: 0,
      prRequired4Weeks: 0, prCompleted4Weeks: 0, prDoneOld4Weeks: 0,
      prOverallRequired: 0, prOverallCompleted: 0,
      mcmRequired4Weeks: 0, mcmCompleted4Weeks: 0,
      prByLearner: emptyPeriodCounts(), mcmByLearner: emptyPeriodCounts(),
      otjhOnTrack: 0, otjhNeedAttention: 0, otjhAtRisk: 0,
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
    current.mcmRequired4Weeks += r.mcmRequired4Weeks ?? 0;
    current.mcmCompleted4Weeks += r.mcmCompleted4Weeks ?? 0;
    addPeriodCounts(current.prByLearner, r.prByLearner);
    addPeriodCounts(current.mcmByLearner, r.mcmByLearner);
    // Use the variance-based bands so the home chart matches the coach page.
    current.otjhOnTrack += r.otjhVarOnTrack ?? r.otjhOnTrack;
    current.otjhNeedAttention += r.otjhVarNeedAttention ?? r.otjhNeedAttention;
    current.otjhAtRisk += r.otjhVarAtRisk ?? r.otjhAtRisk;
    map.set(name, current);
    return map;
  }, new Map<string, CaseOwnerAggregate>());
  return Array.from(grouped.values());
}

export default function ChartsSection({ records }: ChartsSectionProps) {
  const [prPeriod, setPrPeriod] = useState<ReviewPeriodKey>("12w");
  const [mcmPeriod, setMcmPeriod] = useState<ReviewPeriodKey>("4w");

  if (records.length === 0) {
    return (
      <div className="chart-card">
        <div className="empty-state" style={{ padding: "var(--space-8)" }}>
          <span className="empty-state-icon">📊</span>
          <p className="empty-state-title">No data to display</p>
          <p className="empty-state-body">Adjust your filters to see chart data.</p>
        </div>
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

  const assignmentData = grouped.map((r) => ({
    name: r.name,
    "Last Week": r.lastWeekPending,
    Pending: r.pending,
  }));

  const otjhData = grouped.map((r) => ({
    name: r.name,
    "On Track": r.otjhOnTrack,
    "Need Attention": r.otjhNeedAttention,
    "At Risk": r.otjhAtRisk,
  }));

  const perfRow = (name: string, counts: { required: number; completed: number }) => ({
    name,
    Required: counts.required,
    Completed: counts.completed,
    "Over Due": Math.max(counts.required - counts.completed, 0),
  });

  const prPerfData = grouped.map((r) => perfRow(r.name, r.prByLearner[prPeriod]));
  const mcmPerfData = grouped.map((r) => perfRow(r.name, r.mcmByLearner[mcmPeriod]));

  const periodLabel = (k: ReviewPeriodKey) => PERIOD_OPTIONS.find((p) => p.key === k)?.label ?? "";

  return (
    <div className="home-analytics-charts" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
        <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", padding: "0 var(--space-2)" }}>Analytics Charts</span>
        <div style={{ height: 1, flex: 1, background: "var(--color-border)" }} />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Engagement varies significantly across case owners"
          subtitle="Learner engagement % by case owner"
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={engagementData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [`${v}%`, "Learner Engagement"]} />
              <Bar dataKey="Engagement" fill={C1} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Referred closure count per case owner"
          subtitle="Total referred closures"
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={closureData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} formatter={(v) => [v, "Referred Closure"]} />
              <Bar dataKey="ReferredClosure" fill={C2} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="OTJH risk spread — check for high 'At Risk' volumes"
          subtitle="On Track / Need Attention / At Risk by case owner"
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={otjhData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-20} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--color-text-secondary)", paddingTop: 8 }} />
              <Bar dataKey="On Track" stackId="a" fill={C4} maxBarSize={36} />
              <Bar dataKey="Need Attention" stackId="a" fill={C3} maxBarSize={36} />
              <Bar dataKey="At Risk" stackId="a" fill={C5} radius={[3, 3, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pending workload: last week vs current"
          subtitle="Count of pending assignments"
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={assignmentData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--color-text-secondary)", paddingTop: 8 }} />
              <Bar dataKey="Last Week" fill={C2} radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Pending" fill={C5} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Progress review performance"
          subtitle={`Required vs completed vs over due — by learner · ${periodLabel(prPeriod)}`}
          action={<PeriodSelect value={prPeriod} onChange={setPrPeriod} />}
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={prPerfData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--color-text-secondary)", paddingTop: 8 }} />
              <Bar dataKey="Required" fill={C6} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Completed" fill={C4} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Over Due" fill={C5} radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="MCM performance"
          subtitle={`Required vs completed vs over due — by learner · ${periodLabel(mcmPeriod)}`}
          action={<PeriodSelect value={mcmPeriod} onChange={setMcmPeriod} />}
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={mcmPerfData} margin={{ top: 4, right: 8, left: -20, bottom: 36 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-28} textAnchor="end" interval={0} height={44} tickMargin={6} tickFormatter={formatCaseOwnerLabel} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={cursorStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--color-text-secondary)", paddingTop: 8 }} />
              <Bar dataKey="Required" fill={C6} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Completed" fill={C2} radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Over Due" fill={C5} radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
