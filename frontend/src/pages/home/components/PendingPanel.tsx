import { CoachRecord } from "@/mocks/dashboard";

interface PendingPanelProps {
  records: CoachRecord[];
}

export default function PendingPanel({ records }: PendingPanelProps) {
  const totalPending = records.reduce((s, r) => s + r.pending, 0);
  const totalLastWeek = records.reduce((s, r) => s + r.lastWeekPending, 0);
  const totalMarking = records.reduce((s, r) => s + r.markingProgressWeekly, 0);

  const maxPending = Math.max(...records.map((r) => r.pending), 1);

  return (
    <div className="bg-[#141414] rounded-2xl p-6 border border-white/8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-white/30 uppercase tracking-widest mb-1">Workload</div>
          <h2 className="text-white font-bold text-lg">Pending &amp; Progress</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#7c4daa] inline-block"></span>
            <span className="text-white/40">Last Week</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff7a7a] inline-block"></span>
            <span className="text-white/40">Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#a8f0c6] inline-block"></span>
            <span className="text-white/40">Marking</span>
          </div>
        </div>
      </div>

      {/* Top 3 summary tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Pending", value: totalPending, color: "#ff7a7a", icon: "ri-hourglass-2-line" },
          { label: "Last Week Pending", value: totalLastWeek, color: "#7c4daa", icon: "ri-calendar-check-line" },
          { label: "Weekly Marking", value: totalMarking, color: "#a8f0c6", icon: "ri-pen-nib-line" },
        ].map((t) => (
          <div key={t.label} className="bg-white/5 rounded-xl p-4 text-center">
            <div className="w-8 h-8 flex items-center justify-center mx-auto mb-2">
              <i className={`${t.icon} text-xl`} style={{ color: t.color }}></i>
            </div>
            <div className="text-xl font-black text-white">{t.value}</div>
            <div className="text-xs text-white/40 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart per associate */}
      <div className="space-y-3">
        {records.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <div className="text-xs text-white/60 truncate">{r.associate}</div>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {/* Last week pending */}
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 rounded-full bg-[#7c4daa]"
                  style={{ width: `${(r.lastWeekPending / maxPending) * 100}%`, minWidth: "4px" }}
                />
                <span className="text-[10px] text-white/30 font-mono">{r.lastWeekPending}</span>
              </div>
              {/* Pending */}
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 rounded-full bg-[#ff7a7a]"
                  style={{ width: `${(r.pending / maxPending) * 100}%`, minWidth: "4px" }}
                />
                <span className="text-[10px] text-white/30 font-mono">{r.pending}</span>
              </div>
              {/* Marking */}
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 rounded-full bg-[#a8f0c6]"
                  style={{ width: `${(r.markingProgressWeekly / maxPending) * 100}%`, minWidth: "4px" }}
                />
                <span className="text-[10px] text-white/30 font-mono">{r.markingProgressWeekly}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
