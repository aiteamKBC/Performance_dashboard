import { useEffect, useRef } from "react";
import type { CoachRecord } from "@/mocks/dashboard";
import type { CoachSummaryRecord } from "@/mocks/coachSummary";
import type { TestKPIsRecord } from "@/services/testKPIs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
  CartesianGrid,
} from "recharts";

interface CoachSummaryProp {
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

interface Props {
  coach: CoachSummaryProp | null;
  allLateness: CoachRecord[];
  onClose: () => void;
}

export default function CoachProfileDrawer({ coach, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!coach) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [coach, onClose]);

  const isOpen = !!coach;

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
        {coach && <DrawerContent coach={coach} onClose={onClose} />}
      </div>
    </>
  );
}

function DrawerContent({ coach, onClose }: { coach: CoachSummaryProp; onClose: () => void }) {
  const initials = coach.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const totalLearners = coach.records.reduce((s, r) => s + r.totalLearners, 0);
  const totalPending = coach.records.reduce((s, r) => s + r.pending, 0);
  const otjhOnTrack = coach.records.reduce((s, r) => s + r.otjhOnTrack, 0);
  const otjhNeedAttention = coach.records.reduce((s, r) => s + r.otjhNeedAttention, 0);
  const otjhAtRisk = coach.records.reduce((s, r) => s + r.otjhAtRisk, 0);
  const evidenceAccepted = coach.records.reduce((s, r) => s + r.evidenceAccepted, 0);
  const evidenceReferred = coach.records.reduce((s, r) => s + r.evidenceReferred, 0);
  const totalEvidence = coach.records.reduce((s, r) => s + r.totalEvidence, 0);
  const prRequired4 = coach.records.reduce((s, r) => s + r.prRequired4Weeks, 0);
  const prCompleted4 = coach.records.reduce((s, r) => s + r.prCompleted4Weeks, 0);
  const prRequired8 = coach.records.reduce((s, r) => s + r.prRequired8Weeks, 0);
  const prCompleted8 = coach.records.reduce((s, r) => s + r.prCompleted8Weeks, 0);
  const prOverallRequired = coach.records.reduce((s, r) => s + r.prOverallRequired, 0);
  const prOverallCompleted = coach.records.reduce((s, r) => s + r.prOverallCompleted, 0);

  const avgEngagement = coach.records.length
    ? Math.round(coach.records.reduce((s, r) => s + r.learnerEngagement, 0) / coach.records.length)
    : 0;

  const pr4Rate = prRequired4 > 0 ? Math.round((prCompleted4 / prRequired4) * 100) : 0;
  const pr8Rate = prRequired8 > 0 ? Math.round((prCompleted8 / prRequired8) * 100) : 0;
  const prOverallRate = prOverallRequired > 0 ? Math.round((prOverallCompleted / prOverallRequired) * 100) : 0;

  // PR weekly trend data
  const weeklyPRData = [
    { label: "W4", value: coach.records.reduce((s, r) => s + r.prFourthWeek, 0) },
    { label: "W3", value: coach.records.reduce((s, r) => s + r.prThirdWeek, 0) },
    { label: "W2", value: coach.records.reduce((s, r) => s + r.prSecondWeek, 0) },
    { label: "Last", value: coach.records.reduce((s, r) => s + r.prLastWeek, 0) },
    { label: "Yest", value: coach.records.reduce((s, r) => s + r.prYesterday, 0) },
    { label: "Today", value: coach.records.reduce((s, r) => s + r.prToday, 0) },
  ];

  // Absence weekly data
  const absenceData = coach.summaryRecord?.weeks.map((w, i) => ({
    label: `W${i + 1}`,
    absence: parseFloat(w.absenceRatio.toFixed(1)),
    vsCompany: parseFloat(w.vsCompany.toFixed(1)),
  })) ?? [];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div
        className="relative overflow-hidden px-8 pt-8 pb-6 border-b border-white/10 shrink-0"
        style={{ background: "linear-gradient(135deg, #1a0e2e 0%, #0f0f0f 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,#fff 0px,#fff 1px,transparent 1px,transparent 20px)",
          }}
        />
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <i className="ri-close-line text-lg" />
        </button>

        <div className="relative flex items-start gap-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #7c4daa 0%, #4d2a8a 100%)" }}
          >
            {initials}
          </div>
          <div>
            <div className="text-xs text-white/40 mb-0.5">Coach Profile</div>
            <h2 className="text-2xl font-black text-white leading-tight">{coach.name}</h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-white/40">
                <i className="ri-user-3-line mr-1" />{coach.records.length} associate{coach.records.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-white/40">
                <i className="ri-group-line mr-1" />{totalLearners} learners
              </span>
              {coach.records[0]?.lastSnapshotDate && (
                <span className="text-xs text-white/30">
                  <i className="ri-calendar-line mr-1" />Snapshot: {coach.records[0].lastSnapshotDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top-level KPI pills */}
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: "Engagement", value: `${avgEngagement}%`, color: avgEngagement >= 80 ? "#a8f0c6" : avgEngagement >= 60 ? "#fbbf24" : "#ff7a7a" },
            { label: "PR Completion", value: `${prOverallRate}%`, color: prOverallRate >= 80 ? "#a8f0c6" : prOverallRate >= 60 ? "#fbbf24" : "#ff7a7a" },
            { label: "OTJH At Risk", value: otjhAtRisk, color: otjhAtRisk === 0 ? "#a8f0c6" : otjhAtRisk <= 3 ? "#fbbf24" : "#ff7a7a" },
            { label: "Avg Absence", value: coach.absenceAvg > 0 ? `${coach.absenceAvg.toFixed(1)}%` : "N/A", color: coach.absenceAvg === 0 ? "#ffffff40" : coach.absenceAvg < 15 ? "#a8f0c6" : coach.absenceAvg < 20 ? "#fbbf24" : "#ff7a7a" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-3 border border-white/10 bg-white/5">
              <div className="text-xl font-black font-mono" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="text-xs text-white/40 mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

        {/* Section: Learner Overview */}
        <Section title="Learner Overview" icon="ri-group-line" color="#c4b5fd">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Learners" value={totalLearners} color="#c4b5fd" />
            <StatCard label="Recent Submitters" value={coach.records.reduce((s, r) => s + r.recentSubmitters, 0)} color="#a8f0c6" />
            <StatCard label="Avg Engagement" value={`${avgEngagement}%`} color={avgEngagement >= 80 ? "#a8f0c6" : "#fbbf24"} />
            <StatCard label="Pending" value={totalPending} color={totalPending > 10 ? "#ff7a7a" : "#7c4daa"} />
          </div>
        </Section>

        {/* Section: OTJH Risk */}
        <Section title="OTJH Risk Distribution" icon="ri-alarm-warning-line" color="#ff7a7a">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="On Track" value={otjhOnTrack} color="#a8f0c6" icon="ri-checkbox-circle-line" />
            <StatCard label="Needs Attention" value={otjhNeedAttention} color="#fbbf24" icon="ri-alert-line" />
            <StatCard label="At Risk" value={otjhAtRisk} color="#ff7a7a" icon="ri-alarm-warning-line" />
          </div>
          {(otjhOnTrack + otjhNeedAttention + otjhAtRisk) > 0 && (
            <div className="mt-4">
              <div className="flex rounded-full overflow-hidden h-3">
                {otjhOnTrack > 0 && (
                  <div style={{ flex: otjhOnTrack, background: "#a8f0c6" }} title={`On Track: ${otjhOnTrack}`} />
                )}
                {otjhNeedAttention > 0 && (
                  <div style={{ flex: otjhNeedAttention, background: "#fbbf24" }} title={`Needs Attention: ${otjhNeedAttention}`} />
                )}
                {otjhAtRisk > 0 && (
                  <div style={{ flex: otjhAtRisk, background: "#ff7a7a" }} title={`At Risk: ${otjhAtRisk}`} />
                )}
              </div>
              <div className="flex gap-4 mt-2">
                {[
                  { label: "On Track", color: "#a8f0c6" },
                  { label: "Needs Attention", color: "#fbbf24" },
                  { label: "At Risk", color: "#ff7a7a" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                    <span className="text-xs text-white/40">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Section: Evidence */}
        <Section title="Evidence Pipeline" icon="ri-file-list-3-line" color="#a8f0c6">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Accepted" value={evidenceAccepted} color="#a8f0c6" />
            <StatCard label="Referred" value={evidenceReferred} color="#fbbf24" />
            <StatCard label="Total Evidence" value={totalEvidence} color="#c4b5fd" />
          </div>
          {evidenceReferred > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/40">Referred Closure Rate</span>
                <span className="text-xs font-mono font-bold text-[#fbbf24]">
                  {Math.round((coach.records.reduce((s, r) => s + r.referredClosure, 0) / evidenceReferred) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(Math.round((coach.records.reduce((s, r) => s + r.referredClosure, 0) / evidenceReferred) * 100), 100)}%`,
                    background: "#fbbf24",
                  }}
                />
              </div>
            </div>
          )}
        </Section>

        {/* Section: PR Progress Reviews */}
        <Section title="Progress Reviews" icon="ri-check-double-line" color="#7c4daa">
          <div className="space-y-3">
            {[
              { label: "4-Week PR", required: prRequired4, completed: prCompleted4, rate: pr4Rate },
              { label: "8-Week PR", required: prRequired8, completed: prCompleted8, rate: pr8Rate },
              { label: "Overall PR", required: prOverallRequired, completed: prOverallCompleted, rate: prOverallRate },
            ].map((pr) => (
              <div key={pr.label} className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white/70">{pr.label}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: pr.rate >= 80 ? "#a8f0c6" : pr.rate >= 60 ? "#fbbf24" : "#ff7a7a" }}>
                    {pr.rate}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pr.rate, 100)}%`,
                      background: pr.rate >= 80 ? "#a8f0c6" : pr.rate >= 60 ? "#fbbf24" : "#ff7a7a",
                    }}
                  />
                </div>
                <div className="flex gap-4 mt-1.5">
                  <span className="text-[11px] text-white/30">Required: <span className="text-white/60 font-mono">{pr.required}</span></span>
                  <span className="text-[11px] text-white/30">Completed: <span className="text-white/60 font-mono">{pr.completed}</span></span>
                  <span className="text-[11px] text-white/30">Behind: <span className="font-mono" style={{ color: pr.required - pr.completed > 0 ? "#ff7a7a" : "#a8f0c6" }}>{Math.max(pr.required - pr.completed, 0)}</span></span>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly PR trend chart */}
          {weeklyPRData.some((d) => d.value > 0) && (
            <div className="mt-4">
              <div className="text-xs text-white/30 mb-3">Weekly PR Activity</div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyPRData} barSize={18}>
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {weeklyPRData.map((_, i) => (
                        <Cell key={i} fill={i === weeklyPRData.length - 1 ? "#7c4daa" : "rgba(124,77,170,0.4)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Section>

        {/* Section: Associate Analytics */}
        {coach.records.length > 0 && (() => {
          const formatLabel = (caseOwner: string) => {
            const parts = caseOwner.trim().split(/\s+/);
            if (parts.length === 1) return parts[0];
            return `${parts[0]} ${parts[parts.length - 1][0]}.`;
          };

          const engagementData = coach.records.map((r) => ({
            name: formatLabel(r.caseOwner),
            engagement: r.learnerEngagement,
          }));

          const otjhData = coach.records.map((r) => ({
            name: formatLabel(r.caseOwner),
            OnTrack: r.otjhOnTrack,
            NeedsAttention: r.otjhNeedAttention,
            AtRisk: r.otjhAtRisk,
          }));

          const pendingData = coach.records.map((r) => ({
            name: formatLabel(r.caseOwner),
            Pending: r.pending,
            Learners: r.totalLearners,
          }));

          const prRateData = coach.records.map((r) => ({
            name: formatLabel(r.caseOwner),
            prRate: r.prOverallCompletionRate,
          }));

          const axisTickStyle = { fill: "rgba(255,255,255,0.4)", fontSize: 10 };
          const tooltipStyle = {
            contentStyle: { background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 11, color: "#ffffff" },
            labelStyle: { color: "#ffffff", fontWeight: 600, marginBottom: 4 },
            itemStyle: { color: "#d1d5db" },
          };
          const legendStyle = { wrapperStyle: { fontSize: 10, color: "rgba(255,255,255,0.4)" } };

          return (
            <Section title="Associate Analytics" icon="ri-bar-chart-2-line" color="#c4b5fd">
              <div className="grid grid-cols-2 gap-4">

                {/* 1. Engagement by Associate */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Engagement by Associate</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={engagementData} barSize={16}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ ...axisTickStyle, angle: -25, textAnchor: "end" }} height={48} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar dataKey="engagement" radius={[4, 4, 0, 0]}>
                        {engagementData.map((d, i) => (
                          <Cell key={i} fill={d.engagement >= 80 ? "#22c55e" : d.engagement >= 60 ? "#f59e0b" : "#ff7a7a"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 2. OTJH Distribution by Associate */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">OTJH Distribution by Associate</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={otjhData} barSize={16}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ ...axisTickStyle, angle: -25, textAnchor: "end" }} height={48} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Legend {...legendStyle} />
                      <Bar dataKey="OnTrack" stackId="otjh" fill="#22c55e" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="NeedsAttention" stackId="otjh" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="AtRisk" stackId="otjh" fill="#ff7a7a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 3. Pending vs Learners */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Pending vs Learners</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pendingData} barSize={10}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ ...axisTickStyle, angle: -25, textAnchor: "end" }} height={48} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Legend {...legendStyle} />
                      <Bar dataKey="Pending" fill="#7c4daa" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Learners" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 4. PR Completion Rate by Associate */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">PR Completion Rate by Associate</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={prRateData} barSize={16}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ ...axisTickStyle, angle: -25, textAnchor: "end" }} height={48} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar dataKey="prRate" radius={[4, 4, 0, 0]}>
                        {prRateData.map((d, i) => (
                          <Cell key={i} fill={d.prRate >= 80 ? "#22c55e" : d.prRate >= 60 ? "#f59e0b" : "#ff7a7a"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

              </div>
            </Section>
          );
        })()}

        {/* Section: Test KPIs */}
        {coach.kpiRecord && (
          <Section title="Test KPIs" icon="ri-bar-chart-2-line" color="#e8a838">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/30 uppercase tracking-wider mb-2 font-medium">Progress Reviews (PR)</div>
                <div className="space-y-1.5">
                  <KpiRow label="Required" value={coach.kpiRecord.requiredPR} color="#c4b5fd" />
                  <KpiRow label="Completed" value={coach.kpiRecord.completedPR} color="#a8f0c6" />
                  <KpiRow label="In Progress" value={coach.kpiRecord.stillInprogressPR} color="#fbbf24" />
                  <KpiRow label="Sched. Overdue" value={coach.kpiRecord.scheduledOverduePR} color="#f87171" />
                  <KpiRow label="Unsched. Overdue" value={coach.kpiRecord.unscheduledOverduePR} color="#ff7a7a" />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/30 uppercase tracking-wider mb-2 font-medium">MCM</div>
                <div className="space-y-1.5">
                  <KpiRow label="Required" value={coach.kpiRecord.requiredMCM} color="#c4b5fd" />
                  <KpiRow label="Completed" value={coach.kpiRecord.completedMCM} color="#a8f0c6" />
                  <KpiRow label="In Progress" value={coach.kpiRecord.stillInprogressMCM} color="#fbbf24" />
                  <KpiRow label="Sched. Overdue" value={coach.kpiRecord.scheduledOverdueMCM} color="#f87171" />
                  <KpiRow label="Learner Emails" value={coach.kpiRecord.learnerEmailsMCM} color="#e8a838" />
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Section: Absence History */}
        {coach.summaryRecord && absenceData.length > 0 && (
          <Section title="Attendance (10-Week Absence)" icon="ri-calendar-close-line" color="#e8b4f8">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatCard
                label="10W Avg Absence"
                value={`${coach.summaryRecord.last10WeeksAbsenceRatio.toFixed(1)}%`}
                color={coach.summaryRecord.last10WeeksAbsenceRatio < 15 ? "#a8f0c6" : coach.summaryRecord.last10WeeksAbsenceRatio < 20 ? "#fbbf24" : "#ff7a7a"}
              />
              <StatCard label="Students" value={coach.summaryRecord.studentsCount} color="#c4b5fd" />
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={absenceData} barSize={14} barGap={2}>
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  />
                  <ReferenceLine y={20} stroke="rgba(255,122,122,0.4)" strokeDasharray="3 3" />
                  <Bar dataKey="absence" name="Absence %" radius={[3, 3, 0, 0]}>
                    {absenceData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.absence >= 20 ? "#ff7a7a" : d.absence >= 15 ? "#fbbf24" : "#a8f0c6"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-white/20 mt-1 text-center">Red reference line = 20% threshold</div>
          </Section>
        )}

        {/* Section: Associates list */}
        <Section title="Associates" icon="ri-user-3-line" color="#c4b5fd">
          <div className="space-y-2">
            {coach.records.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: "rgba(124,77,170,0.3)" }}
                  >
                    {r.associate[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/80">{r.caseOwner}</div>
                    <div className="text-xs text-white/30">{r.totalLearners} learners · {r.pending} pending</div>
                  </div>
                </div>
                <div className="flex gap-3 text-right">
                  <div>
                    <div className="text-xs font-mono font-bold" style={{ color: r.learnerEngagement >= 80 ? "#a8f0c6" : r.learnerEngagement >= 60 ? "#fbbf24" : "#ff7a7a" }}>
                      {r.learnerEngagement}%
                    </div>
                    <div className="text-[10px] text-white/25">engage</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold" style={{ color: r.otjhAtRisk > 0 ? "#ff7a7a" : "#a8f0c6" }}>
                      {r.otjhAtRisk}
                    </div>
                    <div className="text-[10px] text-white/25">at risk</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="pb-8" />
      </div>
    </div>
  );
}

function Section({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <i className={`${icon} text-sm`} style={{ color }} />
        <h3 className="text-sm font-bold text-white/80">{title}</h3>
        <div className="flex-1 h-px bg-white/10" />
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon?: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      {icon && <i className={`${icon} text-sm mb-1.5 block`} style={{ color }} />}
      <div className="text-xl font-black font-mono" style={{ color }}>{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
    </div>
  );
}

function KpiRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
}
