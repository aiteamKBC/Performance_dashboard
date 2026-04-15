import { useState } from "react";
import { CoachRecord } from "@/mocks/dashboard";

interface DataTableProps {
  records: CoachRecord[];
}

type SortKey = keyof CoachRecord;
type SortDir = "asc" | "desc";

function EngagementBadge({ value }: { value: number }) {
  if (value >= 85) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#a8f0c6]/15 text-[#a8f0c6] text-xs font-mono whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-[#a8f0c6] inline-block"></span>{value}%
    </span>
  );
  if (value >= 70) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#7c4daa]/15 text-[#7c4daa] text-xs font-mono whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-[#7c4daa] inline-block"></span>{value}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff7a7a]/15 text-[#ff7a7a] text-xs font-mono whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-[#ff7a7a] inline-block"></span>{value}%
    </span>
  );
}

function RiskDot({ value, warn, danger }: { value: number; warn: number; danger: number }) {
  const color = value >= danger ? "#ff7a7a" : value >= warn ? "#7c4daa" : "#a8f0c6";
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs whitespace-nowrap" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }}></span>
      {value}
    </span>
  );
}

function ElapsedBadge({ days }: { days: number }) {
  const color = days <= 3 ? "#a8f0c6" : days <= 6 ? "#7c4daa" : "#ff7a7a";
  return (
    <span className="font-mono text-xs whitespace-nowrap" style={{ color }}>{days}d</span>
  );
}

export default function DataTable({ records }: DataTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("associate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const cols: { key: SortKey; label: string; short?: string }[] = [
    { key: "associate", label: "Associate" },
    { key: "coach", label: "Coach" },
    { key: "caseOwner", label: "Case Owner" },
    { key: "phone", label: "Phone" },
    { key: "lastSubDate", label: "Last Sub Date", short: "Sub Date" },
    { key: "elapsedDays", label: "Elapsed Days", short: "Elapsed" },
    { key: "lastSnapshotDate", label: "Snapshot Date", short: "Snapshot" },
    { key: "totalLearners", label: "Total Learners", short: "Learners" },
    { key: "recentSubmitters", label: "Recent Submitters", short: "Submitters" },
    { key: "learnerEngagement", label: "Engagement" },
    { key: "otjhOnTrack", label: "On Track <10%", short: "On Track" },
    { key: "otjhNeedAttention", label: "Attention 11–25%", short: "Attention" },
    { key: "otjhAtRisk", label: "At Risk >25%", short: "At Risk" },
    { key: "lastWeekPending", label: "LW Pending", short: "LW Pend" },
    { key: "pending", label: "Pending" },
    { key: "markingProgressWeekly", label: "Marking/Wk", short: "Marking" },
    { key: "evidenceAccepted", label: "Ev. Accepted", short: "Accepted" },
    { key: "evidenceReferred", label: "Ev. Referred", short: "Referred" },
    { key: "referredClosure", label: "Ref. Closure" },
    { key: "referredClosurePct", label: "Closure %", short: "Cls %" },
    { key: "totalEvidence", label: "Total Ev.", short: "Total Ev" },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <i className="ri-expand-up-down-fill text-white/20 text-[10px]"></i>;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-s-fill text-[#7c4daa] text-[10px]"></i>
      : <i className="ri-arrow-down-s-fill text-[#7c4daa] text-[10px]"></i>;
  };

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/8 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/8">
        <div>
          <div className="text-xs text-white/30 uppercase tracking-widest mb-0.5">All Coaches</div>
          <h2 className="text-white font-bold text-lg">Full Dataset</h2>
        </div>
        <div className="text-xs text-white/30">{records.length} records</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="px-3 py-3 text-left text-[11px] text-white/30 uppercase tracking-wide font-medium cursor-pointer hover:text-white/60 transition-colors whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">
                    {c.short ?? c.label}
                    <SortIcon col={c.key} />
                  </span>
                </th>
              ))}
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${
                    i % 2 === 0 ? "bg-white/[0.02]" : ""
                  } ${expandedRow === r.id ? "bg-white/[0.06]" : ""}`}
                >
                  {/* Associate */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#7c4daa]/20 flex items-center justify-center shrink-0">
                        <span className="text-[#7c4daa] text-[10px] font-bold">
                          {r.associate.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                      <span className="text-white text-xs font-medium">{r.associate}</span>
                    </div>
                  </td>
                  {/* Coach */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/60">{r.coach}</td>
                  {/* Case Owner */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/60">{r.caseOwner}</td>
                  {/* Phone */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/40 font-mono">{r.phone}</td>
                  {/* Last Sub Date */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/50 font-mono">{r.lastSubDate}</td>
                  {/* Elapsed Days */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <ElapsedBadge days={r.elapsedDays} />
                  </td>
                  {/* Snapshot Date */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/40 font-mono">{r.lastSnapshotDate}</td>
                  {/* Total Learners */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white font-mono">{r.totalLearners}</td>
                  {/* Recent Submitters */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/70 font-mono">{r.recentSubmitters}</td>
                  {/* Engagement */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <EngagementBadge value={r.learnerEngagement} />
                  </td>
                  {/* OTJH On Track */}
                  <td className="px-3 py-3">
                    <RiskDot value={r.otjhOnTrack} warn={0} danger={0} />
                  </td>
                  {/* OTJH Need Attention */}
                  <td className="px-3 py-3">
                    <RiskDot value={r.otjhNeedAttention} warn={8} danger={12} />
                  </td>
                  {/* OTJH At Risk */}
                  <td className="px-3 py-3">
                    <RiskDot value={r.otjhAtRisk} warn={4} danger={7} />
                  </td>
                  {/* Last Week Pending */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <RiskDot value={r.lastWeekPending} warn={8} danger={13} />
                  </td>
                  {/* Pending */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <RiskDot value={r.pending} warn={12} danger={20} />
                  </td>
                  {/* Marking weekly */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[#a8f0c6] font-mono">{r.markingProgressWeekly}</td>
                  {/* Evidence Accepted */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/70 font-mono">{r.evidenceAccepted}</td>
                  {/* Evidence Referred */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <RiskDot value={r.evidenceReferred} warn={30} danger={50} />
                  </td>
                  {/* Referred Closure */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-white/60 font-mono">{r.referredClosure}</td>
                  {/* Referred Closure % */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <EngagementBadge value={r.referredClosurePct} />
                  </td>
                  {/* Total Evidence */}
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[#7c4daa] font-mono font-bold">{r.totalEvidence}</td>
                  {/* Expand */}
                  <td className="px-3 py-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <i className={`text-white/30 text-sm transition-transform ${expandedRow === r.id ? "ri-arrow-up-s-line rotate-0" : "ri-arrow-down-s-line"}`}></i>
                    </div>
                  </td>
                </tr>
                {/* Expanded detail row */}
                {expandedRow === r.id && (
                  <tr key={`exp-${r.id}`} className="bg-white/[0.04]">
                    <td colSpan={cols.length + 1} className="px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[
                          { label: "Total Learners", value: r.totalLearners },
                          { label: "Recent Submitters", value: r.recentSubmitters },
                          { label: "Engagement", value: `${r.learnerEngagement}%` },
                          { label: "OTJH On Track", value: r.otjhOnTrack },
                          { label: "OTJH Attention", value: r.otjhNeedAttention },
                          { label: "OTJH At Risk", value: r.otjhAtRisk },
                          { label: "Last Week Pending", value: r.lastWeekPending },
                          { label: "Pending", value: r.pending },
                          { label: "Marking / Wk", value: r.markingProgressWeekly },
                          { label: "Ev. Accepted", value: r.evidenceAccepted },
                          { label: "Ev. Referred", value: r.evidenceReferred },
                          { label: "Closure %", value: `${r.referredClosurePct}%` },
                        ].map((item) => (
                          <div key={item.label} className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/30 uppercase tracking-wide">{item.label}</span>
                            <span className="text-white font-bold text-sm">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
