import { CoachRecord } from "@/mocks/dashboard";

interface EvidencePanelProps {
  records: CoachRecord[];
}

export default function EvidencePanel({ records }: EvidencePanelProps) {
  const totalAccepted = records.reduce((s, r) => s + r.evidenceAccepted, 0);
  const totalReferred = records.reduce((s, r) => s + r.evidenceReferred, 0);
  const totalClosure = records.reduce((s, r) => s + r.referredClosure, 0);
  const totalEvidence = records.reduce((s, r) => s + r.totalEvidence, 0);
  const avgClosurePct =
    records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.referredClosurePct, 0) / records.length)
      : 0;

  const acceptedPct = totalEvidence ? Math.round((totalAccepted / totalEvidence) * 100) : 0;
  const referredPct = totalEvidence ? Math.round((totalReferred / totalEvidence) * 100) : 0;

  const stats = [
    { label: "Evidence Accepted", value: totalAccepted, pct: acceptedPct, color: "#a8f0c6", icon: "ri-check-line" },
    { label: "Evidence Referred", value: totalReferred, pct: referredPct, color: "#7c4daa", icon: "ri-send-plane-line" },
    { label: "Referred Closure", value: totalClosure, pct: avgClosurePct, color: "#c4b5fd", icon: "ri-lock-2-line" },
    { label: "Total Evidence", value: totalEvidence, pct: 100, color: "#7c4daa", icon: "ri-file-list-3-line" },
  ];

  return (
    <div className="bg-[#141414] rounded-2xl p-6 border border-white/8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-white/30 uppercase tracking-widest mb-1">Evidence Pipeline</div>
          <h2 className="text-white font-bold text-lg">Submission Tracking</h2>
        </div>
        <div className="text-xs font-mono text-white/30">{avgClosurePct}% closure rate</div>
      </div>

      {/* Donut-style row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/5 rounded-xl p-4 flex flex-col gap-3">
            {/* Radial progress simulation */}
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke={s.color}
                  strokeWidth="3"
                  strokeDasharray={`${(s.pct / 100) * 100.5} 100.5`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="w-7 h-7 flex items-center justify-center">
                <i className={`${s.icon} text-base`} style={{ color: s.color }}></i>
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">{s.value.toLocaleString()}</div>
              <div className="text-xs text-white/40 mt-0.5 leading-snug">{s.label}</div>
            </div>
            <div className="text-xs font-mono" style={{ color: s.color }}>{s.pct}%</div>
          </div>
        ))}
      </div>

      {/* Evidence bar breakdown per record */}
      <div className="mt-6 space-y-2">
        {records.map((r) => {
          const accPct = r.totalEvidence ? Math.round((r.evidenceAccepted / r.totalEvidence) * 100) : 0;
          const refPct = r.totalEvidence ? Math.round((r.evidenceReferred / r.totalEvidence) * 100) : 0;
          return (
            <div key={r.id} className="flex items-center gap-3">
              <div className="w-28 text-xs text-white/40 truncate shrink-0">{r.associate}</div>
              <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden flex gap-0.5">
                <div className="bg-[#a8f0c6] h-full rounded-l-full" style={{ width: `${accPct}%` }} />
                <div className="bg-[#7c4daa] h-full" style={{ width: `${refPct}%` }} />
              </div>
              <div className="text-xs text-white/30 font-mono w-10 text-right">{r.totalEvidence}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
