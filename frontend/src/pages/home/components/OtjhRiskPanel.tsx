import { CoachRecord } from "@/mocks/dashboard";

interface OtjhRiskPanelProps {
  records: CoachRecord[];
}

export default function OtjhRiskPanel({ records }: OtjhRiskPanelProps) {
  const totalOnTrack = records.reduce((s, r) => s + r.otjhOnTrack, 0);
  const totalNeedAttention = records.reduce((s, r) => s + r.otjhNeedAttention, 0);
  const totalAtRisk = records.reduce((s, r) => s + r.otjhAtRisk, 0);
  const total = totalOnTrack + totalNeedAttention + totalAtRisk;

  const onTrackPct = total ? Math.round((totalOnTrack / total) * 100) : 0;
  const needPct = total ? Math.round((totalNeedAttention / total) * 100) : 0;
  const riskPct = total ? Math.round((totalAtRisk / total) * 100) : 0;

  const tiers = [
    {
      label: "On Track",
      sublabel: "OTJH < 10%",
      value: totalOnTrack,
      pct: onTrackPct,
      color: "#a8f0c6",
      bg: "bg-[#a8f0c6]/10",
      border: "border-[#a8f0c6]/30",
      icon: "ri-checkbox-circle-line",
      desc: "Learners progressing at expected pace.",
    },
    {
      label: "Need Attention",
      sublabel: "OTJH 11–25%",
      value: totalNeedAttention,
      pct: needPct,
      color: "#7c4daa",
      bg: "bg-[#7c4daa]/10",
      border: "border-[#7c4daa]/30",
      icon: "ri-error-warning-line",
      desc: "Require coaching check-in this week.",
    },
    {
      label: "At Risk",
      sublabel: "OTJH > 25%",
      value: totalAtRisk,
      pct: riskPct,
      color: "#ff7a7a",
      bg: "bg-[#ff7a7a]/10",
      border: "border-[#ff7a7a]/30",
      icon: "ri-alarm-warning-line",
      desc: "Immediate intervention recommended.",
    },
  ];

  return (
    <div className="bg-[#141414] rounded-2xl p-6 border border-white/8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-white/30 uppercase tracking-widest mb-1">OTJ Hours</div>
          <h2 className="text-white font-bold text-lg">Risk Distribution</h2>
        </div>
        <div className="text-xs text-white/30">{total} learners tracked</div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-6">
        <div className="rounded-l-full transition-all" style={{ width: `${onTrackPct}%`, background: "#a8f0c6" }} />
        <div className="transition-all" style={{ width: `${needPct}%`, background: "#7c4daa" }} />
        <div className="rounded-r-full transition-all" style={{ width: `${riskPct}%`, background: "#ff7a7a" }} />
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiers.map((t) => (
          <div
            key={t.label}
            className={`rounded-xl border ${t.bg} ${t.border} p-4 flex flex-col gap-2`}
          >
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 flex items-center justify-center">
                <i className={`${t.icon} text-lg`} style={{ color: t.color }}></i>
              </div>
              <span className="text-xs font-mono" style={{ color: t.color }}>{t.pct}%</span>
            </div>
            <div>
              <div className="text-white font-bold text-2xl">{t.value}</div>
              <div className="text-white/70 text-sm font-medium">{t.label}</div>
              <div className="text-white/30 text-xs">{t.sublabel}</div>
            </div>
            <div className="text-white/40 text-xs leading-relaxed mt-1">{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
