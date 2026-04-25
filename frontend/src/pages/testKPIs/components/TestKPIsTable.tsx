import { useState } from "react";
import type { TestKPIsRecord } from "@/services/testKPIs";

interface Props {
  records: TestKPIsRecord[];
}

type SortKey = keyof TestKPIsRecord;

const columns: { key: SortKey; label: string; group?: string }[] = [
  { key: "caseOwner", label: "Case Owner" },
  // PR
  { key: "requiredPR", label: "Required PR", group: "PR" },
  { key: "completedPR", label: "Completed PR", group: "PR" },
  { key: "stillInprogressPR", label: "In Progress", group: "PR" },
  { key: "scheduledOverduePR", label: "Sched. Overdue", group: "PR" },
  { key: "unscheduledOverduePR", label: "Unsched. Overdue", group: "PR" },
  { key: "scheduledForNextPRPct", label: "Sched. Next %", group: "PR" },
  // MCM
  { key: "completedMCM", label: "Completed MCM", group: "MCM" },
  { key: "stillInprogressMCM", label: "In Progress", group: "MCM" },
  { key: "scheduledOverdueMCM", label: "Sched. Overdue", group: "MCM" },
  { key: "unscheduledOverdueMCM", label: "Unsched. Overdue", group: "MCM" },
  { key: "scheduledForNextMCMPct", label: "Sched. Next %", group: "MCM" },
  { key: "learnerEmailsMCM", label: "Learner Emails", group: "MCM" },
  // Emails
  { key: "employerEmailsPR", label: "Employer Emails PR", group: "Emails" },
  // Learners
  { key: "requiredLearners", label: "Required", group: "Learners" },
  { key: "scheduledPR", label: "Scheduled PR", group: "Learners" },
  { key: "scheduledLearners", label: "Scheduled", group: "Learners" },
  { key: "completedPRLower", label: "Completed PR", group: "Learners" },
  { key: "completedLearners", label: "Completed", group: "Learners" },
  { key: "scheduledOverdueLearner", label: "Sched. Overdue", group: "Learners" },
  { key: "stillInprogressLearner", label: "In Progress", group: "Learners" },
  { key: "unscheduledOverdueLearners", label: "Unsched. Overdue", group: "Learners" },
  { key: "scheduledPctPR", label: "Scheduled %", group: "Learners" },
];

const groupColors: Record<string, string> = {
  PR: "#7c4daa",
  MCM: "#e8a838",
  Emails: "#4da8e8",
  Learners: "#4de87c",
};

function chipClass(value: number, warnAt: number, riskAt: number) {
  if (value === 0) return "bg-white/5 text-white/30";
  if (value >= riskAt) return "bg-red-900/40 text-red-300 border border-red-700/40";
  if (value >= warnAt) return "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40";
  return "bg-green-900/30 text-green-300 border border-green-700/30";
}

export default function TestKPIsTable({ records }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("caseOwner");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortAsc ? cmp : -cmp;
  });

  // Build group header spans
  const groups: { label: string; span: number; color: string }[] = [];
  let i = 0;
  while (i < columns.length) {
    const g = columns[i].group;
    if (!g) { groups.push({ label: "", span: 1, color: "transparent" }); i++; }
    else {
      let span = 0;
      while (i + span < columns.length && columns[i + span].group === g) span++;
      groups.push({ label: g, span, color: groupColors[g] ?? "#888" });
      i += span;
    }
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0f0f0f]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-white/80 border-collapse">
          <thead>
            {/* Group row */}
            <tr>
              {groups.map((g, idx) => (
                <th
                  key={idx}
                  colSpan={g.span}
                  className="px-3 py-1.5 text-center font-semibold tracking-widest uppercase text-[10px] border-b border-white/5"
                  style={{ color: g.color, borderTop: g.label ? `2px solid ${g.color}` : undefined }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Column row */}
            <tr className="bg-white/5">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left whitespace-nowrap cursor-pointer select-none text-white/50 hover:text-white/80 transition-colors border-b border-white/10"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-[10px]">{sortAsc ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              <tr
                key={row.caseOwner}
                className={`border-b border-white/5 transition-colors ${ri % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"} hover:bg-white/[0.05]`}
              >
                <td className="px-3 py-2 font-medium text-white/90 whitespace-nowrap sticky left-0 bg-[#0f0f0f] z-10">
                  {row.caseOwner}
                </td>
                {/* Required PR */}
                <td className="px-3 py-2 text-center">{row.requiredPR}</td>
                {/* Completed PR — good if high */}
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${row.completedPR > 0 ? "bg-green-900/30 text-green-300 border border-green-700/30" : "bg-white/5 text-white/30"}`}>
                    {row.completedPR}
                  </span>
                </td>
                {/* In Progress PR */}
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.stillInprogressPR, 3, 6)}`}>
                    {row.stillInprogressPR}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-white/50">{row.scheduledOverduePR || "—"}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.unscheduledOverduePR, 2, 5)}`}>
                    {row.unscheduledOverduePR}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-white/60">{row.scheduledForNextPRPct || "—"}</td>
                {/* MCM */}
                <td className="px-3 py-2 text-center text-white/60">{row.completedMCM || "—"}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.stillInprogressMCM, 3, 6)}`}>
                    {row.stillInprogressMCM}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.scheduledOverdueMCM, 2, 5)}`}>
                    {row.scheduledOverdueMCM}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.unscheduledOverdueMCM, 2, 5)}`}>
                    {row.unscheduledOverdueMCM}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-white/60">{row.scheduledForNextMCMPct || "—"}</td>
                <td className="px-3 py-2 text-center">{row.learnerEmailsMCM}</td>
                {/* Emails */}
                <td className="px-3 py-2 text-center">{row.employerEmailsPR}</td>
                {/* Learners */}
                <td className="px-3 py-2 text-center">{row.requiredLearners}</td>
                <td className="px-3 py-2 text-center">{row.scheduledPR}</td>
                <td className="px-3 py-2 text-center text-white/60">{row.scheduledLearners || "—"}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${row.completedPRLower > 0 ? "bg-green-900/30 text-green-300 border border-green-700/30" : "bg-white/5 text-white/30"}`}>
                    {row.completedPRLower}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${row.completedLearners > 0 ? "bg-green-900/30 text-green-300 border border-green-700/30" : "bg-white/5 text-white/30"}`}>
                    {row.completedLearners}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.scheduledOverdueLearner, 2, 5)}`}>
                    {row.scheduledOverdueLearner}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.stillInprogressLearner, 3, 6)}`}>
                    {row.stillInprogressLearner}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${chipClass(row.unscheduledOverdueLearners, 2, 5)}`}>
                    {row.unscheduledOverdueLearners}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-white/60">{row.scheduledPctPR || "—"}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-white/30">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
