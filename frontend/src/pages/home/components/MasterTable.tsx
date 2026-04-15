import { useState } from "react";
import type { CoachRecord } from "@/mocks/dashboard";

interface MasterTableProps {
  records: CoachRecord[];
}

type SortKey = keyof CoachRecord;
type SortDir = "asc" | "desc";

function Chip({
  value,
  good,
  warn,
  suffix = "",
  invert = false,
}: {
  value: number;
  good: number;
  warn: number;
  suffix?: string;
  invert?: boolean;
}) {
  let tone: "good" | "warn" | "risk" = "good";
  if (invert) {
    // higher = worse
    if (value >= warn) tone = "risk";
    else if (value >= good) tone = "warn";
  } else {
    // higher = better
    if (value < warn) tone = "risk";
    else if (value < good) tone = "warn";
  }

  const toneStyles =
    tone === "good"
      ? { text: "text-[#a8f0c6]", bg: "bg-[#a8f0c6]/15", dot: "bg-[#a8f0c6]" }
      : tone === "warn"
        ? { text: "text-[#7c4daa]", bg: "bg-[#7c4daa]/15", dot: "bg-[#7c4daa]" }
        : { text: "text-[#ff7a7a]", bg: "bg-[#ff7a7a]/15", dot: "bg-[#ff7a7a]" };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono whitespace-nowrap ${toneStyles.text} ${toneStyles.bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${toneStyles.dot}`} />
      {value}{suffix}
    </span>
  );
}

function Plain({ val, dim = false }: { val: string | number; dim?: boolean }) {
  return (
    <span className={`text-xs font-mono whitespace-nowrap ${dim ? "text-white/40" : "text-white/80"}`}>
      {val}
    </span>
  );
}

export default function MasterTable({ records }: MasterTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("coach");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const getMarkingProgressWeekly = (record: CoachRecord) => {
    if (record.lastWeekPending <= 0) return 0;
    return (record.lastWeekPending - record.pending) / record.lastWeekPending;
  };

  const getSortValue = (record: CoachRecord, key: SortKey) => {
    if (key === "markingProgressWeekly") return getMarkingProgressWeekly(record);
    return record[key];
  };

  const formatMarkingProgressWeekly = (value: number) => {
    const percentage = (value * 100).toFixed(2);
    return `${percentage.replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}%`;
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...records].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (typeof av === "number" && typeof bv === "number")
      return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  // Totals row
  const totalLastWeekPending = records.reduce((s, r) => s + r.lastWeekPending, 0);
  const totalPending = records.reduce((s, r) => s + r.pending, 0);
  const totalReferredClosure = records.reduce((s, r) => s + r.referredClosure, 0);

  const totals = {
    totalLearners: records.reduce((s, r) => s + r.totalLearners, 0),
    recentSubmitters: records.reduce((s, r) => s + r.recentSubmitters, 0),
    learnerEngagement: records.length ? Math.round(records.reduce((s, r) => s + r.learnerEngagement, 0) / records.length) : 0,
    otjhOnTrack: records.reduce((s, r) => s + r.otjhOnTrack, 0),
    otjhNeedAttention: records.reduce((s, r) => s + r.otjhNeedAttention, 0),
    otjhAtRisk: records.reduce((s, r) => s + r.otjhAtRisk, 0),
    lastWeekPending: totalLastWeekPending,
    pending: totalPending,
    markingProgressWeekly: totalLastWeekPending > 0
      ? (totalLastWeekPending - totalPending) / totalLastWeekPending
      : 0,
    referredClosure: totalReferredClosure,
    // PR totals
    prToday: records.reduce((s, r) => s + r.prToday, 0),
    prYesterday: records.reduce((s, r) => s + r.prYesterday, 0),
    prMinus2: records.reduce((s, r) => s + r.prMinus2, 0),
    prLastWeek: records.reduce((s, r) => s + r.prLastWeek, 0),
    prSecondWeek: records.reduce((s, r) => s + r.prSecondWeek, 0),
    prThirdWeek: records.reduce((s, r) => s + r.prThirdWeek, 0),
    prFourthWeek: records.reduce((s, r) => s + r.prFourthWeek, 0),
    prRequired4Weeks: records.reduce((s, r) => s + r.prRequired4Weeks, 0),
    prCompleted4Weeks: records.reduce((s, r) => s + r.prCompleted4Weeks, 0),
    prBehindRate4Weeks: records.length ? Math.round(records.reduce((s, r) => s + r.prBehindRate4Weeks, 0) / records.length * 10) / 10 : 0,
    prRequired8Weeks: records.reduce((s, r) => s + r.prRequired8Weeks, 0),
    prCompleted8Weeks: records.reduce((s, r) => s + r.prCompleted8Weeks, 0),
    prBehind8Weeks: records.reduce((s, r) => s + r.prBehind8Weeks, 0),
    prBehindRate8Weeks: records.length ? Math.round(records.reduce((s, r) => s + r.prBehindRate8Weeks, 0) / records.length * 10) / 10 : 0,
    prOverallRequired: records.reduce((s, r) => s + r.prOverallRequired, 0),
    prOverallCompleted: records.reduce((s, r) => s + r.prOverallCompleted, 0),
    prOverallBehind: records.reduce((s, r) => s + r.prOverallBehind, 0),
    prOverallCompletionRate: records.length ? Math.round(records.reduce((s, r) => s + r.prOverallCompletionRate, 0) / records.length * 10) / 10 : 0,
  };

  const Sorter = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <i className="ri-expand-up-down-fill text-white/20 text-[9px] ml-0.5" />;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-s-fill text-[#7c4daa] text-[9px] ml-0.5" />
      : <i className="ri-arrow-down-s-fill text-[#7c4daa] text-[9px] ml-0.5" />;
  };

  const TH = ({ col, label, align = "left" }: { col: SortKey; label: string; align?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none text-${align}`}
    >
      <span className="inline-flex items-center gap-0.5">{label}<Sorter col={col} /></span>
    </th>
  );

  return (
    <div className="bg-[#111111] rounded-2xl border border-white/8 overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <div>
          <p className="text-[11px] text-white/30 uppercase tracking-widest mb-0.5">All Associates</p>
          <h2 className="text-white font-bold text-lg leading-none">Performance Overview</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#a8f0c6] inline-block" />Good
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#7c4daa] inline-block" />Warning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff7a7a] inline-block" />At Risk
          </span>
          <span className="font-mono">{records.length} rows</span>
        </div>
      </div>

      <div className="overflow-x-auto themed-scrollbar">
        <table className="w-full text-sm border-collapse">

          {/* ── Group header row ── */}
          <thead>
            <tr className="border-b border-white/5">
              {/* Identity group */}
              <th colSpan={2} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-white/20 font-semibold border-r border-white/5">
                Identity
              </th>
              {/* Activity group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-white/20 font-semibold border-r border-white/5">
                Activity
              </th>
              {/* Learners group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#7c4daa]/70 font-semibold border-r border-white/5">
                Learners
              </th>
              {/* OTJH group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#7c4daa]/70 font-semibold border-r border-white/5">
                OTJ Hours Risk
              </th>
              {/* Pending group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#ff7a7a]/50 font-semibold border-r border-white/5">
                Pending &amp; Marking
              </th>
              {/* Evidence group */}
              <th colSpan={1} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#a8f0c6]/50 font-semibold border-r border-white/5">
                Evidence Pipeline
              </th>
              {/* PR Daily group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#c4b5fd]/60 font-semibold border-r border-white/5">
                PR Daily
              </th>
              {/* PR Weekly group */}
              <th colSpan={4} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#c4b5fd]/60 font-semibold border-r border-white/5">
                PR Weekly
              </th>
              {/* 4-Week PR group */}
              <th colSpan={3} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#c4b5fd]/60 font-semibold border-r border-white/5">
                4-Week PR
              </th>
              {/* 8-Week PR group */}
              <th colSpan={4} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#c4b5fd]/60 font-semibold border-r border-white/5">
                8-Week PR
              </th>
              {/* Overall PR group */}
              <th colSpan={4} className="px-3 py-2 text-center text-[9px] uppercase tracking-widest text-[#c4b5fd]/80 font-semibold">
                Overall PR
              </th>
            </tr>

            {/* ── Column header row ── */}
            <tr className="border-b border-white/8 bg-white/[0.02]">
              {/* Identity */}
              <TH col="coach" label="Coach" />
              <th className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold whitespace-nowrap border-r border-white/5">Phone</th>

              {/* Activity */}
              <TH col="lastSubDate" label="Last Sub" />
              <TH col="elapsedDays" label="Elapsed" />
              <th className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold whitespace-nowrap border-r border-white/5">Snapshot</th>

              {/* Learners */}
              <TH col="totalLearners" label="Total Learners" />
              <TH col="recentSubmitters" label="Recent Submitters" />
              <th className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold whitespace-nowrap border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">
                  Engagement<Sorter col="learnerEngagement" />
                </span>
              </th>

              {/* OTJH */}
              <TH col="otjhOnTrack" label="On Track" />
              <TH col="otjhNeedAttention" label="Attention" />
              <th className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold whitespace-nowrap border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">
                  At Risk<Sorter col="otjhAtRisk" />
                </span>
              </th>

              {/* Pending */}
              <TH col="lastWeekPending" label="Last Wk" />
              <TH col="pending" label="Pending" />
              <th className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold whitespace-nowrap border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">
                  Marking Progress Weekly<Sorter col="markingProgressWeekly" />
                </span>
              </th>

              {/* Evidence */}
              <th onClick={() => handleSort("referredClosure")} className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">Referred Closure<Sorter col="referredClosure" /></span>
              </th>

              {/* PR Daily */}
              <TH col="prToday" label="Today" />
              <TH col="prYesterday" label="Yesterday" />
              <th onClick={() => handleSort("prMinus2")} className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">-2<Sorter col="prMinus2" /></span>
              </th>

              {/* PR Weekly */}
              <TH col="prLastWeek" label="Last Wk PR" />
              <TH col="prSecondWeek" label="-2nd Wk" />
              <TH col="prThirdWeek" label="-3rd Wk" />
              <th onClick={() => handleSort("prFourthWeek")} className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">-4th Wk<Sorter col="prFourthWeek" /></span>
              </th>

              {/* 4-Week PR */}
              <TH col="prRequired4Weeks" label="Req 4Wk" />
              <TH col="prCompleted4Weeks" label="Done 4Wk" />
              <th onClick={() => handleSort("prBehindRate4Weeks")} className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">Behind% 4Wk<Sorter col="prBehindRate4Weeks" /></span>
              </th>

              {/* 8-Week PR */}
              <TH col="prRequired8Weeks" label="Req 8Wk" />
              <TH col="prCompleted8Weeks" label="Done 8Wk" />
              <TH col="prBehind8Weeks" label="Behind 8Wk" />
              <th onClick={() => handleSort("prBehindRate8Weeks")} className="px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wide font-semibold cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap select-none border-r border-white/5">
                <span className="inline-flex items-center gap-0.5">Behind% 8Wk<Sorter col="prBehindRate8Weeks" /></span>
              </th>

              {/* Overall PR */}
              <TH col="prOverallRequired" label="Overall Req" />
              <TH col="prOverallCompleted" label="Overall Done" />
              <TH col="prOverallBehind" label="Overall Behind" />
              <TH col="prOverallCompletionRate" label="Overall Rate" />
            </tr>
          </thead>

          <tbody>
            {sorted.map((r, i) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                  className={`border-b border-white/[0.04] cursor-pointer transition-colors group ${
                    i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"
                  } ${expandedRow === r.id ? "bg-[#7c4daa]/[0.06]" : ""}`}
                >
                  {/* Coach — now first */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-white/60 bg-white/5 px-2 py-0.5 rounded-full whitespace-nowrap">{r.coach}</span>
                  </td>
                  {/* Phone */}
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5"><Plain val={r.phone} dim /></td>

                  {/* Last Sub Date */}
                  <td className="px-3 py-3 whitespace-nowrap"><Plain val={r.lastSubDate} dim /></td>
                  {/* Elapsed Days */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Chip value={r.elapsedDays} good={3} warn={7} suffix="d" invert />
                  </td>
                  {/* Snapshot Date */}
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5"><Plain val={r.lastSnapshotDate} dim /></td>

                  {/* Total Learners */}
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    <span className="text-xs font-mono text-[#c4b5fd] font-bold">{r.totalLearners}</span>
                  </td>
                  {/* Recent Submitters */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><Plain val={r.recentSubmitters} /></td>
                  {/* Engagement */}
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5">
                    <Chip value={r.learnerEngagement} good={85} warn={70} suffix="%" />
                  </td>

                  {/* On Track */}
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    <span className="text-xs font-mono text-[#a8f0c6]">{r.otjhOnTrack}</span>
                  </td>
                  {/* Need Attention */}
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    <Chip value={r.otjhNeedAttention} good={7} warn={11} invert />
                  </td>
                  {/* At Risk */}
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5">
                    <Chip value={r.otjhAtRisk} good={4} warn={7} invert />
                  </td>

                  {/* Last Week Pending */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Chip value={r.lastWeekPending} good={8} warn={13} invert />
                  </td>
                  {/* Pending */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Chip value={r.pending} good={12} warn={20} invert />
                  </td>
                  {/* Marking Weekly */}
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5">
                    <span className="text-xs font-mono text-[#a8f0c6]">{formatMarkingProgressWeekly(getMarkingProgressWeekly(r))}</span>
                  </td>

                  {/* Referred Closure */}
                  <td className="px-3 py-3 whitespace-nowrap text-center border-r border-white/5"><Plain val={r.referredClosure} /></td>

                  {/* ── PR Daily ── */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-[#c4b5fd]">{r.prToday}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/60">{r.prYesterday}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center border-r border-white/5"><span className="text-xs font-mono text-white/60">{r.prMinus2}</span></td>

                  {/* ── PR Weekly ── */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/70">{r.prLastWeek}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/50">{r.prSecondWeek}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/50">{r.prThirdWeek}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center border-r border-white/5"><span className="text-xs font-mono text-white/50">{r.prFourthWeek}</span></td>

                  {/* ── 4-Week PR ── */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/60">{r.prRequired4Weeks}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-[#a8f0c6]">{r.prCompleted4Weeks}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5"><Chip value={r.prBehindRate4Weeks} good={10} warn={30} suffix="%" invert /></td>

                  {/* ── 8-Week PR ── */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/60">{r.prRequired8Weeks}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-[#a8f0c6]">{r.prCompleted8Weeks}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><Chip value={r.prBehind8Weeks} good={20} warn={60} invert /></td>
                  <td className="px-3 py-3 whitespace-nowrap border-r border-white/5"><Chip value={r.prBehindRate8Weeks} good={10} warn={30} suffix="%" invert /></td>

                  {/* ── Overall PR ── */}
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-white/60">{r.prOverallRequired}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-center"><span className="text-xs font-mono text-[#a8f0c6]">{r.prOverallCompleted}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap"><Chip value={r.prOverallBehind} good={20} warn={80} invert /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><Chip value={r.prOverallCompletionRate} good={90} warn={70} suffix="%" /></td>
                </tr>

                {/* Expanded detail */}
                {expandedRow === r.id && (
                  <tr key={`exp-${r.id}`} className="bg-[#1a1a1a] border-b border-white/8">
                    <td colSpan={33} className="px-6 py-4">
                      <div className="flex items-start gap-6">
                        <div className="shrink-0">
                          <div className="w-10 h-10 rounded-full bg-[#7c4daa]/30 flex items-center justify-center">
                            <span className="text-[#c4b5fd] text-sm font-black">
                              {r.associate.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                          {[
                            { label: "Coach", value: r.coach },
                            { label: "Phone", value: r.phone },
                            { label: "Engagement", value: `${r.learnerEngagement}%` },
                            { label: "OTJH On Track", value: r.otjhOnTrack },
                            { label: "Closure Rate", value: `${r.referredClosurePct}%` },
                            { label: "PR Today", value: r.prToday },
                            { label: "Overall Done", value: r.prOverallCompleted },
                            { label: "Overall Rate", value: `${r.prOverallCompletionRate}%` },
                          ].map((item) => (
                            <div key={item.label}>
                              <p className="text-[9px] uppercase tracking-widest text-white/25 mb-0.5">{item.label}</p>
                              <p className="text-white text-sm font-semibold">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* ── Totals row ── */}
            {records.length > 0 && (
              <tr className="border-t-2 border-[#7c4daa]/40 bg-[#7c4daa]/[0.05]">
                <td colSpan={2} className="px-3 py-3 border-r border-white/5">
                  <span className="text-[#c4b5fd] text-xs font-black uppercase tracking-wide">Totals / Avg</span>
                </td>
                {/* Activity cols blank */}
                <td className="px-3 py-3" />
                <td className="px-3 py-3" />
                <td className="px-3 py-3 border-r border-white/5" />
                {/* Learners totals */}
                <td className="px-3 py-3 text-center"><span className="text-[#c4b5fd] font-mono text-xs font-bold">{totals.totalLearners}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-white/70 font-mono text-xs">{totals.recentSubmitters}</span></td>
                <td className="px-3 py-3 border-r border-white/5">
                  <Chip value={totals.learnerEngagement} good={85} warn={70} suffix="%" />
                </td>
                {/* OTJH totals */}
                <td className="px-3 py-3 text-center"><span className="text-[#a8f0c6] font-mono text-xs">{totals.otjhOnTrack}</span></td>
                <td className="px-3 py-3"><Chip value={totals.otjhNeedAttention} good={7} warn={11} invert /></td>
                <td className="px-3 py-3 border-r border-white/5"><Chip value={totals.otjhAtRisk} good={4} warn={7} invert /></td>
                {/* Pending totals */}
                <td className="px-3 py-3"><Chip value={totals.lastWeekPending} good={8} warn={13} invert /></td>
                <td className="px-3 py-3"><Chip value={totals.pending} good={12} warn={20} invert /></td>
                <td className="px-3 py-3 border-r border-white/5"><span className="text-[#a8f0c6] font-mono text-xs">{formatMarkingProgressWeekly(totals.markingProgressWeekly)}</span></td>
                {/* Evidence totals */}
                <td className="px-3 py-3 text-center border-r border-white/5"><span className="text-white/70 font-mono text-xs">{totals.referredClosure}</span></td>
                {/* PR Daily totals */}
                <td className="px-3 py-3 text-center"><span className="text-[#c4b5fd] font-mono text-xs font-bold">{totals.prToday}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-white/60 font-mono text-xs">{totals.prYesterday}</span></td>
                <td className="px-3 py-3 text-center border-r border-white/5"><span className="text-white/60 font-mono text-xs">{totals.prMinus2}</span></td>
                {/* PR Weekly totals */}
                <td className="px-3 py-3 text-center"><span className="text-white/70 font-mono text-xs">{totals.prLastWeek}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-white/50 font-mono text-xs">{totals.prSecondWeek}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-white/50 font-mono text-xs">{totals.prThirdWeek}</span></td>
                <td className="px-3 py-3 text-center border-r border-white/5"><span className="text-white/50 font-mono text-xs">{totals.prFourthWeek}</span></td>
                {/* 4-Week totals */}
                <td className="px-3 py-3 text-center"><span className="text-white/60 font-mono text-xs">{totals.prRequired4Weeks}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-[#a8f0c6] font-mono text-xs">{totals.prCompleted4Weeks}</span></td>
                <td className="px-3 py-3 border-r border-white/5"><Chip value={totals.prBehindRate4Weeks} good={10} warn={30} suffix="%" invert /></td>
                {/* 8-Week totals */}
                <td className="px-3 py-3 text-center"><span className="text-white/60 font-mono text-xs">{totals.prRequired8Weeks}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-[#a8f0c6] font-mono text-xs">{totals.prCompleted8Weeks}</span></td>
                <td className="px-3 py-3"><Chip value={totals.prBehind8Weeks} good={20} warn={60} invert /></td>
                <td className="px-3 py-3 border-r border-white/5"><Chip value={totals.prBehindRate8Weeks} good={10} warn={30} suffix="%" invert /></td>
                {/* Overall PR totals */}
                <td className="px-3 py-3 text-center"><span className="text-white/60 font-mono text-xs">{totals.prOverallRequired}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-[#a8f0c6] font-mono text-xs">{totals.prOverallCompleted}</span></td>
                <td className="px-3 py-3"><Chip value={totals.prOverallBehind} good={20} warn={80} invert /></td>
                <td className="px-3 py-3"><Chip value={totals.prOverallCompletionRate} good={90} warn={70} suffix="%" /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
