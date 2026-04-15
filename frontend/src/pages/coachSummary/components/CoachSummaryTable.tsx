import { CoachSummaryRecord } from "@/mocks/coachSummary";

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ratioColor(ratio: number, isOverall?: boolean): string {
  if (ratio === 0) return "bg-[#1a3a2a] text-[#4ade80]";
  if (ratio < 15) return "bg-[#1a2a1a] text-[#86efac]";
  if (ratio < 25) return isOverall ? "bg-[#3a1a00] text-[#fb923c]" : "bg-[#2a1a00] text-[#fbbf24]";
  return "bg-[#3a1010] text-[#f87171]";
}

function vsCompanyColor(vs: number): string {
  if (vs === 0) return "text-white/30";
  if (vs <= 5) return "text-[#86efac]";
  if (vs <= 15) return "text-[#fbbf24]";
  return "text-[#f87171]";
}

export default function CoachSummaryTable({ records }: { records: CoachSummaryRecord[] }) {
  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");

  const formatDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  return (
    <div className="bg-[#111111] rounded-2xl border border-white/8 overflow-hidden">
      {/* Header bar — matches MasterTable */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <div>
          <p className="text-[11px] text-white/30 uppercase tracking-widest mb-0.5">All Coaches</p>
          <h2 className="text-white font-bold text-lg leading-none">Absence Summary</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4ade80] inline-block" />Perfect
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#86efac] inline-block" />&lt;15%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#fbbf24] inline-block" />Warning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f87171] inline-block" />Critical
          </span>
          <span className="font-mono">{coaches.length} coaches</span>
        </div>
      </div>

      <div className="overflow-x-auto themed-scrollbar">
      <table className="w-full text-xs text-white/80 border-collapse min-w-[1400px]">
        <thead>
          {/* Week date header */}
          <tr className="bg-[#0f0f0f] border-b border-white/8">
            <th className="text-left px-4 py-3 text-white/40 font-medium w-44 sticky left-0 bg-[#0f0f0f] z-10">Coach</th>
            <th className="px-3 py-3 text-white/40 font-medium text-center w-16">Students</th>
            {WEEKS.map((w) => {
              const sample = overall?.weeks[w - 1];
              return (
                <th key={w} colSpan={2} className="px-2 py-2 text-center border-l border-white/5">
                  <div className="text-[#7c4daa] font-bold text-xs">W{w}</div>
                  {sample && (
                    <div className="text-white/25 text-[10px] font-normal">
                      {formatDate(sample.weekStart)}–{formatDate(sample.weekEnd)}
                    </div>
                  )}
                </th>
              );
            })}
            <th className="px-3 py-3 text-white/40 font-medium text-center border-l border-white/10">10W Avg</th>
          </tr>
          {/* Sub-header */}
          <tr className="bg-white/[0.02] border-b border-white/8">
            <th className="sticky left-0 bg-[#111] z-10 px-4 py-2"></th>
            <th className="px-3 py-2 text-white/25 font-normal text-center">Count</th>
            {WEEKS.map((w) => (
              <>
                <th key={`${w}-abs`} className="px-2 py-2 text-white/30 font-normal text-center border-l border-white/5 whitespace-nowrap">Abs %</th>
                <th key={`${w}-cmp`} className="px-2 py-2 text-white/30 font-normal text-center whitespace-nowrap">vs Co.</th>
              </>
            ))}
            <th className="px-3 py-2 text-white/30 font-normal text-center border-l border-white/10">Abs %</th>
          </tr>
        </thead>
        <tbody>
          {coaches.map((row, idx) => (
            <tr
              key={row.coachName}
              className={`border-b border-white/[0.04] transition-colors ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}`}
            >
              <td className={`sticky left-0 z-10 px-4 py-3 font-medium text-white/90 whitespace-nowrap ${idx % 2 === 0 ? "bg-[#111111]" : "bg-[#141414]"}`}>
                {row.coachName}
              </td>
              <td className="px-3 py-3 text-center text-white/50">{row.studentsCount}</td>
              {row.weeks.map((w, wi) => (
                <>
                  <td key={`${wi}-abs`} className={`px-2 py-2 text-center border-l border-white/5`}>
                    <span className={`inline-block rounded px-2 py-0.5 font-mono font-bold text-[11px] ${ratioColor(w.absenceRatio)}`}>
                      {w.absenceRatio.toFixed(2)}%
                    </span>
                  </td>
                  <td key={`${wi}-vs`} className={`px-2 py-2 text-center font-mono text-[11px] ${vsCompanyColor(w.vsCompany)}`}>
                    {w.vsCompany === 100 ? "—" : `${w.vsCompany}%`}
                  </td>
                </>
              ))}
              <td className="px-3 py-3 text-center border-l border-white/10">
                <span className={`inline-block rounded px-2 py-0.5 font-mono font-bold text-[11px] ${ratioColor(row.last10WeeksAbsenceRatio)}`}>
                  {row.last10WeeksAbsenceRatio.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}

          {/* Overall Company row */}
          {overall && (
            <tr className="border-t-2 border-[#7c4daa]/40 bg-[#7c4daa]/[0.05]">
              <td className="sticky left-0 z-10 bg-[#1a0f2a] px-4 py-3 font-bold text-[#c4b5fd] whitespace-nowrap uppercase tracking-wide text-xs">
                {overall.coachName}
              </td>
              <td className="px-3 py-3 text-center text-white/70 font-bold">{overall.studentsCount}</td>
              {overall.weeks.map((w, wi) => (
                <>
                  <td key={`overall-${wi}-abs`} className="px-2 py-2 text-center border-l border-white/5">
                    <span className={`inline-block rounded px-2 py-0.5 font-mono font-bold text-[11px] ${ratioColor(w.absenceRatio, true)}`}>
                      {w.absenceRatio.toFixed(2)}%
                    </span>
                  </td>
                  <td key={`overall-${wi}-vs`} className="px-2 py-2 text-center font-mono text-[11px] text-white/30">
                    100%
                  </td>
                </>
              ))}
              <td className="px-3 py-3 text-center border-l border-white/10">
                <span className={`inline-block rounded px-2 py-0.5 font-mono font-bold text-[11px] ${ratioColor(overall.last10WeeksAbsenceRatio, true)}`}>
                  {overall.last10WeeksAbsenceRatio.toFixed(1)}%
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
