import { useState } from "react";
import type { CoachRecord } from "@/mocks/dashboard";

interface MasterTableProps {
  records: CoachRecord[];
  onRowClick?: (record: CoachRecord) => void;
}

type SortKey = keyof CoachRecord;
type SortDir = "asc" | "desc";

function Chip({
  value, good, warn, suffix = "", invert = false,
}: {
  value: number; good: number; warn: number; suffix?: string; invert?: boolean;
}) {
  let tone: "good" | "warn" | "risk" = "good";
  if (invert) {
    if (value >= warn) tone = "risk";
    else if (value >= good) tone = "warn";
  } else {
    if (value < warn) tone = "risk";
    else if (value < good) tone = "warn";
  }

  const cls = tone === "good" ? "badge--success"
    : tone === "warn" ? "badge--warning"
    : "badge--danger";

  const label = tone === "good" ? "Good" : tone === "warn" ? "Warning" : "At Risk";

  return (
    <span className={`badge ${cls}`} title={label}>
      {value}{suffix}
    </span>
  );
}

function Num({ val, dim = false }: { val: string | number; dim?: boolean }) {
  return (
    <span className="tabular-nums" style={{
      fontSize: "var(--text-xs)",
      whiteSpace: "nowrap",
      color: dim ? "var(--color-text-muted)" : "var(--color-text-primary)",
    }}>
      {val}
    </span>
  );
}

export default function MasterTable({ records, onRowClick }: MasterTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("coach");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
      ? (totalLastWeekPending - totalPending) / totalLastWeekPending : 0,
    referredClosure: totalReferredClosure,
    evToday: records.reduce((s, r) => s + (r.evToday ?? 0), 0),
    evYesterday: records.reduce((s, r) => s + (r.evYesterday ?? 0), 0),
    evMinus2: records.reduce((s, r) => s + (r.evMinus2 ?? 0), 0),
    evMinus3: records.reduce((s, r) => s + (r.evMinus3 ?? 0), 0),
    evMinus4: records.reduce((s, r) => s + (r.evMinus4 ?? 0), 0),
    evMinus5: records.reduce((s, r) => s + (r.evMinus5 ?? 0), 0),
    evMinus6: records.reduce((s, r) => s + (r.evMinus6 ?? 0), 0),
    evMinus7: records.reduce((s, r) => s + (r.evMinus7 ?? 0), 0),
    evidenceWeekTotal: records.reduce((s, r) => s + (r.evidenceWeekTotal ?? 0), 0),
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
    mcmRequired4Weeks: records.reduce((s, r) => s + (r.mcmRequired4Weeks ?? 0), 0),
    mcmCompleted4Weeks: records.reduce((s, r) => s + (r.mcmCompleted4Weeks ?? 0), 0),
    mcmRequired8Weeks: records.reduce((s, r) => s + (r.mcmRequired8Weeks ?? 0), 0),
    mcmCompleted8Weeks: records.reduce((s, r) => s + (r.mcmCompleted8Weeks ?? 0), 0),
    mcmRequired12Weeks: records.reduce((s, r) => s + (r.mcmRequired12Weeks ?? 0), 0),
    mcmCompleted12Weeks: records.reduce((s, r) => s + (r.mcmCompleted12Weeks ?? 0), 0),
  };

  const pctOf = (done: number, req: number) => (req > 0 ? Math.round((done / req) * 1000) / 10 : 0);
  const behindPctOf = (req: number, done: number) => (req > 0 ? Math.round((Math.max(req - done, 0) / req) * 1000) / 10 : 0);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <i className="ri-expand-up-down-fill" style={{ fontSize: 9, color: "var(--color-text-muted)", marginLeft: 2 }} aria-hidden="true" />;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-s-fill" style={{ fontSize: 9, color: "var(--color-accent)", marginLeft: 2 }} aria-hidden="true" />
      : <i className="ri-arrow-down-s-fill" style={{ fontSize: 9, color: "var(--color-accent)", marginLeft: 2 }} aria-hidden="true" />;
  };

  const thStyle = (col: SortKey, sticky = false, borderRight = false): React.CSSProperties => ({
    position: sticky ? "sticky" : undefined,
    left: sticky ? 0 : undefined,
    zIndex: sticky ? 20 : undefined,
    background: "var(--color-canvas)",
    borderRight: borderRight ? "2px solid var(--color-border)" : undefined,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
    color: sortKey === col ? "var(--color-accent)" : "var(--color-text-muted)",
  });

  return (
    <div className="table-card">
      {/* Toolbar */}
      <div className="table-toolbar">
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
            All Associates
          </div>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
            Performance Overview
          </h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            <span className="badge badge--success">Good</span>
            <span className="badge badge--warning">Warning</span>
            <span className="badge badge--danger">At Risk</span>
          </div>
          <span className="tabular-nums" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            {records.length} rows
          </span>
        </div>
      </div>

      {/* Empty state */}
      {records.length === 0 && (
        <table className="data-table">
          <tbody>
            <tr className="table-empty">
              <td colSpan={50}>
                <div className="empty-state">
                  <span className="empty-state-icon">📋</span>
                  <p className="empty-state-title">No associates match these filters</p>
                  <p className="empty-state-body">Try adjusting your search or clearing the active filters.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {records.length > 0 && (
        <div className="table-scroll themed-scrollbar">
          <table className="data-table">
            <thead>
              {/* Group header row */}
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th scope="col" colSpan={2} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Identity</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>Activity</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>Learners</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-warning)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>OTJ Hours Risk</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-danger)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>Pending &amp; Marking</th>
                <th scope="col" colSpan={10} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-success)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>Evidence</th>
                <th scope="col" colSpan={4} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-info)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>PR Weekly</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>4-Week PR</th>
                <th scope="col" colSpan={4} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>8-Week PR</th>
                <th scope="col" colSpan={4} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>12-Week PR</th>
                <th scope="col" colSpan={3} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-info)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>4-Week MCM</th>
                <th scope="col" colSpan={4} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-info)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>8-Week MCM</th>
                <th scope="col" colSpan={4} style={{ background: "var(--color-canvas)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-info)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid var(--color-border)" }}>12-Week MCM</th>
              </tr>

              {/* Column headers */}
              <tr>
                <th scope="col" onClick={() => handleSort("coach")} style={thStyle("coach", true)} aria-sort={sortKey === "coach" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                  Coach <SortIcon col="coach" />
                </th>
                <th scope="col" style={{ ...thStyle("coach" as SortKey), borderRight: "2px solid var(--color-border)", cursor: "default" }}>Phone</th>

                <th scope="col" onClick={() => handleSort("lastSubDate")} style={{ ...thStyle("lastSubDate"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "lastSubDate" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Last Sub <SortIcon col="lastSubDate" /></th>
                <th scope="col" onClick={() => handleSort("elapsedDays")} style={thStyle("elapsedDays")} aria-sort={sortKey === "elapsedDays" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Elapsed <SortIcon col="elapsedDays" /></th>
                <th scope="col" style={{ ...thStyle("coach" as SortKey), borderRight: "2px solid var(--color-border)", cursor: "default" }}>Snapshot</th>

                <th scope="col" onClick={() => handleSort("totalLearners")} style={{ ...thStyle("totalLearners"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "totalLearners" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Total Learners <SortIcon col="totalLearners" /></th>
                <th scope="col" onClick={() => handleSort("recentSubmitters")} style={thStyle("recentSubmitters")} aria-sort={sortKey === "recentSubmitters" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Recent Sub <SortIcon col="recentSubmitters" /></th>
                <th scope="col" onClick={() => handleSort("learnerEngagement")} style={{ ...thStyle("learnerEngagement"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "learnerEngagement" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Engagement <SortIcon col="learnerEngagement" /></th>

                <th scope="col" onClick={() => handleSort("otjhOnTrack")} style={{ ...thStyle("otjhOnTrack"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "otjhOnTrack" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>On Track <SortIcon col="otjhOnTrack" /></th>
                <th scope="col" onClick={() => handleSort("otjhNeedAttention")} style={thStyle("otjhNeedAttention")} aria-sort={sortKey === "otjhNeedAttention" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Attention <SortIcon col="otjhNeedAttention" /></th>
                <th scope="col" onClick={() => handleSort("otjhAtRisk")} style={{ ...thStyle("otjhAtRisk"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "otjhAtRisk" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>At Risk <SortIcon col="otjhAtRisk" /></th>

                <th scope="col" onClick={() => handleSort("lastWeekPending")} style={{ ...thStyle("lastWeekPending"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "lastWeekPending" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Last Wk <SortIcon col="lastWeekPending" /></th>
                <th scope="col" onClick={() => handleSort("pending")} style={thStyle("pending")} aria-sort={sortKey === "pending" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Pending <SortIcon col="pending" /></th>
                <th scope="col" onClick={() => handleSort("markingProgressWeekly" as SortKey)} style={{ ...thStyle("markingProgressWeekly" as SortKey), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "markingProgressWeekly" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Marking Wkly <SortIcon col={"markingProgressWeekly" as SortKey} /></th>

                <th scope="col" onClick={() => handleSort("referredClosure")} style={{ ...thStyle("referredClosure"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "referredClosure" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Ref Closure <SortIcon col="referredClosure" /></th>
                <th scope="col" onClick={() => handleSort("evToday" as SortKey)} style={thStyle("evToday" as SortKey)} aria-sort={sortKey === "evToday" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Today <SortIcon col={"evToday" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evYesterday" as SortKey)} style={thStyle("evYesterday" as SortKey)} aria-sort={sortKey === "evYesterday" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Yesterday <SortIcon col={"evYesterday" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus2" as SortKey)} style={thStyle("evMinus2" as SortKey)} aria-sort={sortKey === "evMinus2" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-2 <SortIcon col={"evMinus2" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus3" as SortKey)} style={thStyle("evMinus3" as SortKey)} aria-sort={sortKey === "evMinus3" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-3 <SortIcon col={"evMinus3" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus4" as SortKey)} style={thStyle("evMinus4" as SortKey)} aria-sort={sortKey === "evMinus4" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-4 <SortIcon col={"evMinus4" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus5" as SortKey)} style={thStyle("evMinus5" as SortKey)} aria-sort={sortKey === "evMinus5" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-5 <SortIcon col={"evMinus5" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus6" as SortKey)} style={thStyle("evMinus6" as SortKey)} aria-sort={sortKey === "evMinus6" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-6 <SortIcon col={"evMinus6" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evMinus7" as SortKey)} style={thStyle("evMinus7" as SortKey)} aria-sort={sortKey === "evMinus7" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-7 <SortIcon col={"evMinus7" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("evidenceWeekTotal" as SortKey)} style={{ ...thStyle("evidenceWeekTotal" as SortKey), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "evidenceWeekTotal" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Week Total <SortIcon col={"evidenceWeekTotal" as SortKey} /></th>

                <th scope="col" onClick={() => handleSort("prLastWeek")} style={{ ...thStyle("prLastWeek"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "prLastWeek" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Last Wk PR <SortIcon col="prLastWeek" /></th>
                <th scope="col" onClick={() => handleSort("prSecondWeek")} style={thStyle("prSecondWeek")} aria-sort={sortKey === "prSecondWeek" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-2nd Wk <SortIcon col="prSecondWeek" /></th>
                <th scope="col" onClick={() => handleSort("prThirdWeek")} style={thStyle("prThirdWeek")} aria-sort={sortKey === "prThirdWeek" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-3rd Wk <SortIcon col="prThirdWeek" /></th>
                <th scope="col" onClick={() => handleSort("prFourthWeek")} style={{ ...thStyle("prFourthWeek"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "prFourthWeek" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>-4th Wk <SortIcon col="prFourthWeek" /></th>

                <th scope="col" onClick={() => handleSort("prRequired4Weeks")} style={{ ...thStyle("prRequired4Weeks"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "prRequired4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 4Wk <SortIcon col="prRequired4Weeks" /></th>
                <th scope="col" onClick={() => handleSort("prCompleted4Weeks")} style={thStyle("prCompleted4Weeks")} aria-sort={sortKey === "prCompleted4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 4Wk <SortIcon col="prCompleted4Weeks" /></th>
                <th scope="col" onClick={() => handleSort("prBehindRate4Weeks")} style={{ ...thStyle("prBehindRate4Weeks"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "prBehindRate4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind% 4Wk <SortIcon col="prBehindRate4Weeks" /></th>

                <th scope="col" onClick={() => handleSort("prRequired8Weeks")} style={{ ...thStyle("prRequired8Weeks"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "prRequired8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 8Wk <SortIcon col="prRequired8Weeks" /></th>
                <th scope="col" onClick={() => handleSort("prCompleted8Weeks")} style={thStyle("prCompleted8Weeks")} aria-sort={sortKey === "prCompleted8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 8Wk <SortIcon col="prCompleted8Weeks" /></th>
                <th scope="col" onClick={() => handleSort("prBehind8Weeks")} style={thStyle("prBehind8Weeks")} aria-sort={sortKey === "prBehind8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind 8Wk <SortIcon col="prBehind8Weeks" /></th>
                <th scope="col" onClick={() => handleSort("prBehindRate8Weeks")} style={{ ...thStyle("prBehindRate8Weeks"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "prBehindRate8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind% 8Wk <SortIcon col="prBehindRate8Weeks" /></th>

                <th scope="col" onClick={() => handleSort("prOverallRequired")} style={{ ...thStyle("prOverallRequired"), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "prOverallRequired" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 12Wk <SortIcon col="prOverallRequired" /></th>
                <th scope="col" onClick={() => handleSort("prOverallCompleted")} style={thStyle("prOverallCompleted")} aria-sort={sortKey === "prOverallCompleted" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 12Wk <SortIcon col="prOverallCompleted" /></th>
                <th scope="col" onClick={() => handleSort("prOverallBehind")} style={thStyle("prOverallBehind")} aria-sort={sortKey === "prOverallBehind" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind <SortIcon col="prOverallBehind" /></th>
                <th scope="col" onClick={() => handleSort("prOverallCompletionRate")} style={{ ...thStyle("prOverallCompletionRate"), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "prOverallCompletionRate" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Rate <SortIcon col="prOverallCompletionRate" /></th>

                <th scope="col" onClick={() => handleSort("mcmRequired4Weeks" as SortKey)} style={{ ...thStyle("mcmRequired4Weeks" as SortKey), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "mcmRequired4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 4Wk <SortIcon col={"mcmRequired4Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmCompleted4Weeks" as SortKey)} style={thStyle("mcmCompleted4Weeks" as SortKey)} aria-sort={sortKey === "mcmCompleted4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 4Wk <SortIcon col={"mcmCompleted4Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmBehindRate4Weeks" as SortKey)} style={{ ...thStyle("mcmBehindRate4Weeks" as SortKey), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "mcmBehindRate4Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind% 4Wk <SortIcon col={"mcmBehindRate4Weeks" as SortKey} /></th>

                <th scope="col" onClick={() => handleSort("mcmRequired8Weeks" as SortKey)} style={{ ...thStyle("mcmRequired8Weeks" as SortKey), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "mcmRequired8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 8Wk <SortIcon col={"mcmRequired8Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmCompleted8Weeks" as SortKey)} style={thStyle("mcmCompleted8Weeks" as SortKey)} aria-sort={sortKey === "mcmCompleted8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 8Wk <SortIcon col={"mcmCompleted8Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmBehind8Weeks" as SortKey)} style={thStyle("mcmBehind8Weeks" as SortKey)} aria-sort={sortKey === "mcmBehind8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind 8Wk <SortIcon col={"mcmBehind8Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmBehindRate8Weeks" as SortKey)} style={{ ...thStyle("mcmBehindRate8Weeks" as SortKey), borderRight: "2px solid var(--color-border)" }} aria-sort={sortKey === "mcmBehindRate8Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind% 8Wk <SortIcon col={"mcmBehindRate8Weeks" as SortKey} /></th>

                <th scope="col" onClick={() => handleSort("mcmRequired12Weeks" as SortKey)} style={{ ...thStyle("mcmRequired12Weeks" as SortKey), borderLeft: "2px solid var(--color-border)" }} aria-sort={sortKey === "mcmRequired12Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Req 12Wk <SortIcon col={"mcmRequired12Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmCompleted12Weeks" as SortKey)} style={thStyle("mcmCompleted12Weeks" as SortKey)} aria-sort={sortKey === "mcmCompleted12Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Done 12Wk <SortIcon col={"mcmCompleted12Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmBehind12Weeks" as SortKey)} style={thStyle("mcmBehind12Weeks" as SortKey)} aria-sort={sortKey === "mcmBehind12Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Behind <SortIcon col={"mcmBehind12Weeks" as SortKey} /></th>
                <th scope="col" onClick={() => handleSort("mcmCompletionRate12Weeks" as SortKey)} style={thStyle("mcmCompletionRate12Weeks" as SortKey)} aria-sort={sortKey === "mcmCompletionRate12Weeks" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>Rate <SortIcon col={"mcmCompletionRate12Weeks" as SortKey} /></th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => onRowClick?.(r)}
                    title="View learner breakdown"
                    style={{
                      cursor: "pointer",
                      background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                    }}
                  >
                    <th scope="row" style={{
                      position: "sticky", left: 0, zIndex: 10,
                      background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-canvas)",
                      padding: "var(--space-3) var(--space-4)",
                      whiteSpace: "nowrap", fontWeight: "var(--font-medium)",
                      color: "var(--color-text-primary)", fontSize: "var(--text-xs)",
                      borderRight: "2px solid var(--color-border)",
                    }}>
                      {r.coach}
                    </th>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Num val={r.phone} dim /></td>

                    <td style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.lastSubDate} dim /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.elapsedDays} good={3} warn={7} suffix="d" invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Num val={r.lastSnapshotDate} dim /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.totalLearners} /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.recentSubmitters} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.learnerEngagement} good={85} warn={70} suffix="%" /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)", color: "var(--color-success)" }}><Num val={r.otjhOnTrack} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.otjhNeedAttention} good={7} warn={11} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.otjhAtRisk} good={4} warn={7} invert /></td>

                    <td style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Chip value={r.lastWeekPending} good={8} warn={13} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.pending} good={12} warn={20} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}>
                      <span className="tabular-nums" style={{ fontSize: "var(--text-xs)", color: "var(--color-success)" }}>
                        {formatMarkingProgressWeekly(getMarkingProgressWeekly(r))}
                      </span>
                    </td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.referredClosure} /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evToday ?? 0} /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evYesterday ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus2 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus3 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus4 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus5 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus6 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.evMinus7 ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)", fontWeight: "var(--font-medium)" }}><Num val={r.evidenceWeekTotal ?? 0} /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.prLastWeek} /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.prSecondWeek} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={r.prThirdWeek} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Num val={r.prFourthWeek} dim /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.prRequired4Weeks} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.prCompleted4Weeks} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.prBehindRate4Weeks} good={10} warn={30} suffix="%" invert /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.prRequired8Weeks} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.prCompleted8Weeks} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.prBehind8Weeks} good={20} warn={60} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.prBehindRate8Weeks} good={10} warn={30} suffix="%" invert /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.prOverallRequired} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.prOverallCompleted} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.prOverallBehind} good={20} warn={80} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.prOverallCompletionRate} good={90} warn={70} suffix="%" /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.mcmRequired4Weeks ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.mcmCompleted4Weeks ?? 0} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.mcmBehindRate4Weeks ?? 0} good={10} warn={30} suffix="%" invert /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.mcmRequired8Weeks ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.mcmCompleted8Weeks ?? 0} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.mcmBehind8Weeks ?? 0} good={20} warn={60} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={r.mcmBehindRate8Weeks ?? 0} good={10} warn={30} suffix="%" invert /></td>

                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={r.mcmRequired12Weeks ?? 0} dim /></td>
                    <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={r.mcmCompleted12Weeks ?? 0} /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.mcmBehind12Weeks ?? 0} good={20} warn={80} invert /></td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={r.mcmCompletionRate12Weeks ?? 0} good={90} warn={70} suffix="%" /></td>
                  </tr>
              ))}

              {/* Totals row */}
              {records.length > 0 && (
                <tr style={{ borderTop: `2px solid var(--color-accent)`, background: "var(--color-accent-tint)" }}>
                  <th scope="row" style={{
                    position: "sticky", left: 0, zIndex: 10,
                    background: "var(--color-accent-tint)",
                    padding: "var(--space-3) var(--space-4)",
                    fontWeight: "var(--font-semibold)", color: "var(--color-accent)",
                    fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em",
                    borderRight: "2px solid var(--color-border)",
                    whiteSpace: "nowrap",
                  }}>
                    Totals / Avg
                  </th>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }} />
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }} />
                  <td style={{ padding: "var(--space-3) var(--space-4)" }} />
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }} />
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)", fontWeight: "var(--font-semibold)", color: "var(--color-accent)" }}><Num val={totals.totalLearners} /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.recentSubmitters} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={totals.learnerEngagement} good={85} warn={70} suffix="%" /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)", color: "var(--color-success)" }}><Num val={totals.otjhOnTrack} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={totals.otjhNeedAttention} good={7} warn={11} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={totals.otjhAtRisk} good={4} warn={7} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Chip value={totals.lastWeekPending} good={8} warn={13} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={totals.pending} good={12} warn={20} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)", color: "var(--color-success)", fontSize: "var(--text-xs)" }} className="tabular-nums">{formatMarkingProgressWeekly(totals.markingProgressWeekly)}</td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.referredClosure} /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evToday} /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evYesterday} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus2} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus3} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus4} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus5} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus6} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.evMinus7} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)", fontWeight: "var(--font-semibold)", color: "var(--color-accent)" }}><Num val={totals.evidenceWeekTotal} /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.prLastWeek} /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.prSecondWeek} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)" }}><Num val={totals.prThirdWeek} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Num val={totals.prFourthWeek} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.prRequired4Weeks} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.prCompleted4Weeks} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={totals.prBehindRate4Weeks} good={10} warn={30} suffix="%" invert /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.prRequired8Weeks} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.prCompleted8Weeks} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={totals.prBehind8Weeks} good={20} warn={60} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={totals.prBehindRate8Weeks} good={10} warn={30} suffix="%" invert /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.prOverallRequired} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.prOverallCompleted} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={totals.prOverallBehind} good={20} warn={80} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={totals.prOverallCompletionRate} good={90} warn={70} suffix="%" /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.mcmRequired4Weeks} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.mcmCompleted4Weeks} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={behindPctOf(totals.mcmRequired4Weeks, totals.mcmCompleted4Weeks)} good={10} warn={30} suffix="%" invert /></td>

                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.mcmRequired8Weeks} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.mcmCompleted8Weeks} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={Math.max(totals.mcmRequired8Weeks - totals.mcmCompleted8Weeks, 0)} good={20} warn={60} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderRight: "2px solid var(--color-border)" }}><Chip value={behindPctOf(totals.mcmRequired8Weeks, totals.mcmCompleted8Weeks)} good={10} warn={30} suffix="%" invert /></td>

                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", borderLeft: "2px solid var(--color-border)" }}><Num val={totals.mcmRequired12Weeks} dim /></td>
                  <td className="num" style={{ padding: "var(--space-3) var(--space-4)", color: "var(--color-success)" }}><Num val={totals.mcmCompleted12Weeks} /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={Math.max(totals.mcmRequired12Weeks - totals.mcmCompleted12Weeks, 0)} good={20} warn={80} invert /></td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}><Chip value={pctOf(totals.mcmCompleted12Weeks, totals.mcmRequired12Weeks)} good={90} warn={70} suffix="%" /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span>{records.length} associates</span>
        <span>Click a row to see the learners behind the numbers</span>
      </div>
    </div>
  );
}
