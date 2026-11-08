import { useEffect, useMemo, useRef, useState } from "react";
import type { DrillLearnerRow, ReviewRow, PendingMarkingRow } from "@/services/coachesLateness";
import { downloadXlsx, type Cell } from "@/utils/xlsx";
import { parseProgressHours } from "@/utils/otjh";
import { toLearnerView } from "@/utils/learners";

const STATUS_COLOR: Record<string, string> = {
  "On Track": "#16A34A",
  "Need Attention": "#D97706",
  "At Risk": "#DC2626",
  Completed: "#16A34A",
  Scheduled: "#0891B2",
  "Awaiting Signature": "#EA580C",
  "In Progress": "#4F46E5",
  "Not Scheduled": "#DC2626",
  Rescheduled: "#B65313",
  Cancelled: "#6B7280",
  Archived: "#6B7280",
};

function statusPill(value: string) {
  if (!value) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const color = STATUS_COLOR[value] ?? "var(--color-text-muted)";
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, color, background: `${color}1a`, whiteSpace: "nowrap",
    }}>{value}</span>
  );
}

// Metric keys. Status + time-period filters apply only to PR and MCM.
const METRICS = [
  { key: "ALL", label: "All Metrics" },
  { key: "PR", label: "PR" },
  { key: "MCM", label: "MCM" },
  { key: "OTJH", label: "OTJH" },
  { key: "ENGAGED", label: "Engaged" },
  { key: "PENDING", label: "Pending Marking" },
  { key: "CLOSURE", label: "Referred Closure" },
  { key: "RECENT", label: "Recent Submitters" },
] as const;

const REVIEW_METRICS = new Set(["PR", "MCM"]);

// Status options per metric. PR/MCM share the review statuses; OTJH filters by
// its risk bands. Metrics not listed here have no status filter.
const STATUS_OPTIONS: Record<string, string[]> = {
  PR: ["Completed", "Scheduled", "Awaiting Signature", "Not Scheduled", "In Progress", "Rescheduled", "Cancelled", "Archived"],
  MCM: ["Completed", "Scheduled", "Awaiting Signature", "Not Scheduled", "In Progress", "Rescheduled", "Cancelled", "Archived"],
  OTJH: ["At Risk", "Need Attention", "On Track"],
};

// Windows are calendar months back from today (4w → 1 month, 8w → 2, 12w → 3),
// rolling day by day — e.g. today 2026-06-26, "4 weeks" starts 2026-05-26.
const PERIODS = [
  { key: "ALL", label: "All dates", months: null },
  { key: "12W", label: "12 weeks", months: 3 },
  { key: "8W", label: "8 weeks", months: 2 },
  { key: "4W", label: "4 weeks", months: 1 },
] as const;

interface MetricRow {
  name: string;
  email: string;
  programme: string;
  metric: string;       // display label e.g. "PR"
  metricKey: string;    // PR / MCM / OTJH / ...
  status: string;
  date: string;         // ISO or ""
  slot?: number;        // original source slot, 1-based when available
  // OTJH-only detail columns (shown in place of Window/Date when OTJH selected).
  completed?: number;
  target?: string;
  targetHours?: number;   // numeric form of the computed target (for Excel export)
  pendingCount?: number;
  progressHours?: string;
  progressVariance?: string;
}

// The date `n` calendar months before `base`, same day-of-month, clamped to the
// target month's last day (e.g. Mar 31 − 1mo → Feb 28).
function monthsBackDate(base: Date, n: number): Date {
  const m = base.getMonth() - n;
  const targetY = base.getFullYear() + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const lastDay = new Date(targetY, targetM + 1, 0).getDate();
  const d = new Date(targetY, targetM, Math.min(base.getDate(), lastDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Window tag for a date relative to today (calendar-month windows).
function windowTag(dateIso: string, today: Date): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  if (d.getTime() > today.getTime()) return "Upcoming";
  if (d.getTime() >= monthsBackDate(today, 1).getTime()) return "4w";
  if (d.getTime() >= monthsBackDate(today, 2).getTime()) return "8w";
  if (d.getTime() >= monthsBackDate(today, 3).getTime()) return "12w";
  return "Older";
}

// Sort key for a row given the clicked column header. Returns a number for the
// numeric/date columns (so they sort numerically) or a lowercased string for the
// text columns; null for "no value" so those rows always sort to the bottom.
function sortValue(r: MetricRow, header: string): string | number | null {
  switch (header) {
    case "Learner": return (r.name || "").toLowerCase();
    case "Programme": return (r.programme || "").toLowerCase();
    case "Metric": return (r.metric || "").toLowerCase();
    case "Status": return (r.status || "").toLowerCase();
    case "Window":
    case "Date": {
      if (!r.date) return null;
      const t = new Date(r.date + "T00:00:00").getTime();
      return Number.isNaN(t) ? null : t;
    }
    case "Completed": return r.completed ?? null;
    case "Target": return r.targetHours ?? null;
    case "Progress-Hours": return parseProgressHours(r.progressHours ?? "");
    case "ProgressVariance": {
      if (!r.progressVariance) return null;
      const n = Number(r.progressVariance.replace(/[^0-9.\-]/g, ""));
      return Number.isNaN(n) ? null : n;
    }
    default: return null;
  }
}

// Whether a date falls within the last `months` (inclusive of today, no future).
function withinPeriod(dateIso: string, today: Date, months: number | null): boolean {
  if (months == null) return true;
  if (!dateIso) return false;
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= monthsBackDate(today, months).getTime() && d.getTime() <= today.getTime();
}

/**
 * Build table rows:
 *  - PR/MCM = one row per individual review slot (from `reviewRows`), so each
 *    Completed/Scheduled/etc. review is its own filterable row.
 *  - Pending = canonical marking queue; other metrics use the learner table.
 */
function buildRows(learners: DrillLearnerRow[], reviewRows: ReviewRow[], pendingRows: PendingMarkingRow[]): MetricRow[] {
  const out: MetricRow[] = [];

  for (const r of reviewRows) {
    out.push({
      name: r.name, email: r.email, programme: r.programme,
      metric: r.metric, metricKey: r.metric, status: r.status, date: r.date, slot: r.slot,
    });
  }

  for (const l of learners) {
    const base = { name: l.name, email: l.email, programme: l.programme };
    if (l.otjh_status) {
      // Target, Progress-Hours and ProgressVariance all come straight from
      // their source columns rather than being derived.
      const view = toLearnerView(l);
      const tgtHours = view.targetHours;
      // Numeric form of the source variance, for status banding.
      out.push({
        ...base, metric: "OTJH", metricKey: "OTJH",
        status: view.otjhBand, date: "",
        completed: l.completed ?? undefined,
        target: l.otjh_target || "",
        targetHours: tgtHours ?? undefined,
        progressHours: l.otjh_progress_hours,
        progressVariance: l.otjh_progress_variance || "",
      });
    }
    if (l.submitted > 0) out.push({ ...base, metric: "Engaged", metricKey: "ENGAGED", status: "Engaged", date: l.last_sub });
    if (l.referred_closure > 0) out.push({ ...base, metric: "Referred Closure", metricKey: "CLOSURE", status: `${l.referred_closure} closure`, date: "" });
    if (l.last_sub) out.push({ ...base, metric: "Recent Submitter", metricKey: "RECENT", status: l.last_sub, date: l.last_sub });
  }
  for (const pending of pendingRows) {
    out.push({ name: pending.name, email: pending.email, programme: pending.programme,
      metric: "Pending Marking", metricKey: "PENDING", status: `${pending.pending_count} pending`,
      pendingCount: pending.pending_count, date: pending.oldest_pending?.slice(0, 10) ?? "" });
  }
  return out;
}

const selectStyle = {
  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
  background: "var(--color-canvas)", padding: "var(--space-1) var(--space-2)",
  fontSize: "var(--text-xs)", color: "var(--color-text-primary)", outline: "none", cursor: "pointer",
} as const;

const cellStyle = {
  padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)",
  color: "var(--color-text-secondary)", whiteSpace: "nowrap",
} as const;

type TimelineStatus = {
  icon: string;
  label: string;
  color: string;
  background: string;
  border: string;
};

function timelineStatus(status: string): TimelineStatus {
  const normalized = (status || "").toLowerCase();
  if (normalized === "planned" || normalized === "not scheduled" || !normalized) {
    return { icon: "ri-calendar-line", label: "Planned", color: "#52607A", background: "#EEF2F6", border: "#AAB7C7" };
  }
  if (normalized === "completed") {
    return { icon: "ri-checkbox-circle-line", label: "Attended", color: "#087443", background: "#DDF8E9", border: "#8BE5B1" };
  }
  if (normalized === "scheduled") {
    return { icon: "ri-calendar-schedule-line", label: "Scheduled", color: "#A45D00", background: "#FFF0C8", border: "#F2C969" };
  }
  if (normalized.includes("awaiting")) {
    return { icon: "ri-file-edit-line", label: "Awaiting signatures", color: "#6840B8", background: "#EEE7FF", border: "#C9B5FF" };
  }
  if (normalized.includes("progress")) {
    return { icon: "ri-play-circle-line", label: "In progress", color: "#007A9C", background: "#DDF7FC", border: "#82DCEB" };
  }
  if (normalized.includes("reschedul")) {
    return { icon: "ri-refresh-line", label: "Rescheduled", color: "#B65313", background: "#FFE8D9", border: "#F1B28C" };
  }
  if (normalized.includes("cancel")) {
    return { icon: "ri-forbid-2-line", label: "Cancelled", color: "#6B7280", background: "#F1F3F5", border: "#D4D8DE" };
  }
  if (normalized.includes("archive")) {
    return { icon: "ri-archive-line", label: "Archived", color: "#6B7280", background: "#F1F3F5", border: "#D4D8DE" };
  }
  if (normalized.includes("miss")) {
    return { icon: "ri-close-circle-line", label: "Missed", color: "#C73737", background: "#FFE3E3", border: "#FF9D9D" };
  }
  return { icon: "ri-more-line", label: normalized === "not scheduled" ? "Planned" : (status || "Planned"), color: "#667085", background: "#F1F3F5", border: "#D4D8DE" };
}

function formatMeetingDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function learnerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ReviewTrend({ rows, learners, includeAllLearners, metric }: { rows: MetricRow[]; learners: DrillLearnerRow[]; includeAllLearners: boolean; metric: "PR" | "MCM" }) {
  const learnerDetails = useMemo(() => {
    const byKey = new Map<string, DrillLearnerRow>();
    for (const learner of learners) {
      byKey.set(learner.email.toLowerCase(), learner);
      byKey.set(learner.name.toLowerCase(), learner);
    }
    return byKey;
  }, [learners]);

  const learnerRows = useMemo(() => {
    const grouped = new Map<string, MetricRow[]>();
    if (includeAllLearners) {
      for (const learner of learners) {
        grouped.set((learner.email || learner.name).toLowerCase(), []);
      }
    }
    for (const row of rows) {
      const key = (row.email || row.name).toLowerCase();
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }
    return Array.from(grouped.entries())
      .map(([key, meetingRows]) => ({
        key,
        meetingRows: meetingRows.slice().sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999) || a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => {
        const aName = a.meetingRows[0]?.name || learnerDetails.get(a.key)?.name || "";
        const bName = b.meetingRows[0]?.name || learnerDetails.get(b.key)?.name || "";
        return aName.localeCompare(bName);
      });
  }, [rows, learners, includeAllLearners, learnerDetails]);

  const columnCount = Math.max(12, ...learnerRows.flatMap(({ meetingRows }) => meetingRows.map((row) => row.slot ?? 0)), ...learnerRows.map(({ meetingRows }) => meetingRows.length), 0);
  const gridTemplateColumns = `280px repeat(${columnCount}, minmax(92px, 1fr))`;
  const slotDates = Array.from({ length: columnCount }, (_, index) => {
    const dates = Array.from(new Set(
      learnerRows
        .map(({ meetingRows }) => meetingRows.find((row) => row.slot === index + 1)?.date || "")
        .filter(Boolean),
    ));
    return dates.length > 0 ? formatMeetingDate(dates[0]) : "—";
  });

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--color-surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--color-canvas)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-md)", color: "var(--color-text-primary)" }}>Learner × {metric === "MCM" ? "monthly coaching meeting" : "progress review"}</h3>
        <span style={{ padding: "3px 8px", borderRadius: 999, background: "#F1EDFF", color: "#5B36B7", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
          {columnCount} {metric} columns
        </span>
        <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 11, whiteSpace: "nowrap" }}>Scroll sideways for all months →</span>
      </div>

      <div className="table-scroll themed-scrollbar" style={{ overflow: "auto", maxHeight: "70vh" }}>
        <div style={{ minWidth: `calc(280px + ${columnCount} * 92px)` }}>
          <div style={{ display: "grid", gridTemplateColumns, minHeight: 52, borderBottom: "1px solid var(--color-border)", background: "#FAFAF8" }}>
            <div style={{ padding: "13px 14px", color: "#52607A", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", borderRight: "1px solid var(--color-border)" }}>
              Learner · progress · next
            </div>
            {Array.from({ length: columnCount }, (_, index) => (
              <div key={index} style={{ textAlign: "center", padding: "10px 4px 7px", borderRight: "1px solid #ECEBE7" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#25324D" }}>{metric} {index + 1}</div>
                <div style={{ fontSize: 10, color: "#8A94A8", marginTop: 3, whiteSpace: "nowrap" }}>{slotDates[index]}</div>
              </div>
            ))}
          </div>

          {learnerRows.length === 0 ? (
            <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No {metric} reviews match these filters.</div>
          ) : learnerRows.map(({ key, meetingRows }) => {
            const first = meetingRows[0];
            const detail = learnerDetails.get(key);
            const learnerName = first?.name || detail?.name || "Unknown learner";
            const learnerProgramme = first?.programme || detail?.programme || "—";
            const attended = meetingRows.filter((row) => row.status === "Completed").length;
            const progress = Math.min(100, Math.round((attended / Math.max(columnCount, 1)) * 100));
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns, minHeight: 118, borderBottom: "1px solid #ECEBE7", background: "var(--color-surface)" }}>
                <div style={{ padding: "12px 14px", borderRight: "1px solid var(--color-border)", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "#E7EEFF", border: "1px solid #B7CBF8", color: "#244D9C", fontSize: 11, fontWeight: 700, flex: "0 0 auto" }}>{learnerInitials(learnerName)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{learnerName}</div>
                      <div style={{ color: "var(--color-text-secondary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{learnerProgramme}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ height: 4, flex: 1, background: "#E3E4E7", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: "#3D61AF", borderRadius: 99 }} /></div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#25324D", whiteSpace: "nowrap" }}>{attended}/{columnCount}</span>
                  </div>
                  <div style={{ marginTop: 7, color: "#78849B", fontSize: 10 }}>
                    {meetingRows.find((row) => row.status !== "Completed") ? `Next: ${formatMeetingDate(meetingRows.find((row) => row.status !== "Completed")?.date || "")}` : "All recorded meetings attended"}
                  </div>
                </div>

                {Array.from({ length: columnCount }, (_, index) => {
                  const meeting = meetingRows.find((row) => row.slot === index + 1) || (meetingRows.every((row) => row.slot == null) ? meetingRows[index] : undefined);
                  if (!meeting) {
                    return <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, borderRight: "1px solid #F0EFEC", color: "#52607A", background: "#FAFAFA" }}><div style={{ width: 42, height: 42, borderRadius: "50%", border: "2px solid #AAB7C7", background: "#EEF2F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}><i className="ri-calendar-line" aria-hidden="true" /></div><span style={{ fontSize: 10 }}>Planned</span></div>;
                  }
                  const visual = timelineStatus(meeting.status);
                  return (
                    <div key={index} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, borderRight: "1px solid #F0EFEC", minWidth: 0 }}>
                      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "#E5E7EB", zIndex: 0 }} />
                      <div style={{ position: "relative", zIndex: 1, color: visual.color, fontSize: 11, background: "var(--color-surface)", padding: "0 4px" }}>{formatMeetingDate(meeting.date)}</div>
                      <div style={{ position: "relative", zIndex: 1, width: 40, height: 40, borderRadius: "50%", border: `2px solid ${visual.border}`, background: visual.background, display: "flex", alignItems: "center", justifyContent: "center", color: visual.color, fontSize: 19, fontWeight: 700, boxShadow: `0 0 0 5px ${visual.background}` }}><i className={visual.icon} aria-hidden="true" /></div>
                      <div style={{ position: "relative", zIndex: 1, color: visual.color, background: "var(--color-surface)", padding: "0 3px", fontSize: 10, whiteSpace: "nowrap" }}>{visual.label}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "9px 14px", borderTop: "1px solid #ECEBE7", background: "#FCFCFB", color: "#718096", fontSize: 10 }}>
            {[
              ["Planned", "#52607A"],
              ["Scheduled", "#C27A00"],
              ["In Progress", "#4D75AA"],
              ["Awaiting signatures", "#7A4DCE"],
              ["Attended", "#41A86F"],
              ["Missed", "#D85D66"],
            ].map(([label, color]) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MetricBreakdownTable({ learners, reviewRows, pendingRows, initialMetric = "ALL", coachName }: { learners: DrillLearnerRow[]; reviewRows: ReviewRow[]; pendingRows: PendingMarkingRow[]; initialMetric?: string; coachName?: string }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const allRows = useMemo(() => buildRows(learners, reviewRows, pendingRows), [learners, reviewRows, pendingRows]);

  const programmes = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.programme) set.add(r.programme);
    return Array.from(set).sort();
  }, [allRows]);

  const [metric, setMetric] = useState(initialMetric);
  const [programme, setProgramme] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [period, setPeriod] = useState("ALL");
  const [search, setSearch] = useState("");   // free-text learner name/email filter
  const [dateFilter, setDateFilter] = useState(""); // exact meeting/review date
  const [monthFilter, setMonthFilter] = useState(""); // calendar month in YYYY-MM format
  // Column sort — null means natural (unsorted) order.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Follow the metric chosen by a KPI card click on the parent page, clearing
  // any status/period that belonged to the previous metric.
  useEffect(() => {
    setMetric(initialMetric);
    setStatus("ALL");
    setPeriod("ALL");
    setDateFilter("");
    setMonthFilter("");
    setSort(null);
  }, [initialMetric]);

  const changeMetric = (value: string) => {
    setMetric(value);
    setStatus("ALL");
    setPeriod("ALL");
    setDateFilter("");
    setMonthFilter("");
    setSort(null);   // columns differ between OTJH and the other metrics
  };

  // Clicking a header sorts by it ascending; clicking the active header again
  // flips the direction.
  const toggleSort = (header: string) => {
    setSort((cur) =>
      cur?.key === header
        ? { key: header, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key: header, dir: "asc" },
    );
  };

  const reviewMode = REVIEW_METRICS.has(metric);          // time-period filter (dated rows only)
  const statusOptions = STATUS_OPTIONS[metric] ?? [];     // status filter (PR/MCM/OTJH)
  const statusMode = statusOptions.length > 0;

  const rows = useMemo(() => {
    const periodMonths = PERIODS.find((p) => p.key === period)?.months ?? null;
    const query = search.trim().toLowerCase();
    const filtered = allRows.filter((r) => {
      if (metric !== "ALL" && r.metricKey !== metric) return false;
      if (programme !== "ALL" && r.programme !== programme) return false;
      // Status filter applies to the selected metric (PR/MCM/OTJH).
      if (statusMode && status !== "ALL" && r.status !== status) return false;
      // Time period only constrains dated PR/MCM rows.
      if (reviewMode && periodMonths != null && !withinPeriod(r.date, today, periodMonths)) return false;
      if (dateFilter && r.date !== dateFilter) return false;
      if (monthFilter && !r.date.startsWith(monthFilter)) return false;
      // Free-text search matches the learner name or email.
      if (query && !`${r.name} ${r.email}`.toLowerCase().includes(query)) return false;
      return true;
    });

    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Missing values always sink to the bottom, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const diff = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? diff : -diff;
    });
  }, [allRows, metric, programme, status, period, dateFilter, monthFilter, search, statusMode, reviewMode, today, sort]);

  const tableRef = useRef<HTMLTableElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? metric;

  // When OTJH is the selected metric, swap the Window/Date columns for the
  // OTJH hour-detail columns.
  const otjhView = metric === "OTJH";
  const headers = otjhView
    ? ["Learner", "Programme", "Metric", "Status", "Completed", "Target", "Progress-Hours", "ProgressVariance"]
    : ["Learner", "Programme", "Metric", "Status", "Window", "Date"];

  // Render the current (filtered) rows to a PDF as a real vector table using
  // jsPDF + jspdf-autotable (both imported lazily so they stay out of the main
  // bundle). Unlike the old html2canvas screenshot approach, this draws from the
  // underlying `rows` data, so the output is crisp, laid out to the page rather
  // than the screen, paginated cleanly with a repeated header row, and identical
  // regardless of the viewport / device the export was triggered from.
  const handleExport = async () => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    try {
      const [{ jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableMod.default;
      type CellHookData = Parameters<NonNullable<Parameters<typeof autoTable>[1]["didParseCell"]>>[0];

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const marginX = 32;

      // Title + active-filter summary line.
      const title = coachName ? `${coachName} — Metric Breakdown` : "Metric Breakdown";
      const filterBits = [
        `Metric: ${metricLabel}`,
        programme !== "ALL" ? `Programme: ${programme}` : null,
        statusMode && status !== "ALL" ? `Status: ${status}` : null,
        reviewMode && period !== "ALL" ? `Period: ${PERIODS.find((p) => p.key === period)?.label}` : null,
        dateFilter ? `Date: ${dateFilter}` : null,
        monthFilter ? `Month: ${monthFilter}` : null,
        search.trim() ? `Search: "${search.trim()}"` : null,
      ].filter(Boolean);
      const subtitle = `${rows.length} row${rows.length === 1 ? "" : "s"} · ${filterBits.join(" · ")} · Exported ${new Date().toLocaleString()}`;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor("#0F1629");
      pdf.text(title, marginX, 40);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor("#5A6480");
      pdf.text(subtitle, marginX, 56, { maxWidth: pageW - marginX * 2 });

      // Columns + rows built from the underlying data, mirroring the on-screen
      // (and Excel) column set. Learner name + email stack in one cell.
      const head = otjhView
        ? [["Learner", "Programme", "Metric", "Status", "Completed", "Target", "Progress Hours", "Progress Variance"]]
        : [["Learner", "Programme", "Metric", "Status", "Window", "Date"]];

      const body = rows.map((r) => {
        const learner = r.email ? `${r.name}\n${r.email}` : r.name;
        return otjhView
          ? [
              learner, r.programme || "", r.metric, r.status,
              r.completed != null ? String(r.completed) : "",
              r.targetHours != null ? String(r.targetHours) : "",
              r.progressHours || "", r.progressVariance || "",
            ]
          : [
              learner, r.programme || "", r.metric, r.status,
              REVIEW_METRICS.has(r.metricKey) ? windowTag(r.date, today) : "",
              r.date || "",
            ];
      });

      autoTable(pdf, {
        head,
        body,
        startY: 70,
        margin: { left: marginX, right: marginX, top: 70 },
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak", valign: "middle", lineColor: "#E5E7EB", lineWidth: 0.5 },
        headStyles: { fillColor: "#F1F5F9", textColor: "#0F1629", fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: "#F8FAFC" },
        // Let autoTable size columns to the page width; give the learner column
        // more room since it carries two lines.
        columnStyles: { 0: { cellWidth: otjhView ? 130 : 160 } },
        // Colour the Status cell text to match the on-screen status pills.
        didParseCell: (data: CellHookData) => {
          if (data.section === "body" && data.column.index === 3) {
            const value = data.cell.text.join(" ");
            const color = STATUS_COLOR[value];
            if (color) {
              data.cell.styles.textColor = color;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      const slug = (coachName || "metric-breakdown").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      pdf.save(`${slug}-metric-breakdown.pdf`);
    } catch (err) {
      console.error("Failed to export table to PDF:", err);
      alert("Sorry — the PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // Export the current (filtered) rows as a genuine .xlsx workbook. Unlike the
  // PDF — which screenshots the rendered table — this writes the underlying
  // data so values stay sortable/filterable in Excel. Numbers (e.g. OTJH
  // completed hours) are emitted as numeric cells; everything else as text.
  const handleExportExcel = () => {
    if (exportingXlsx || rows.length === 0) return;
    setExportingXlsx(true);
    try {
      const exportHeaders = otjhView
        ? ["Learner", "Email", "Programme", "Metric", "Status", "Completed", "Target", "Progress Hours", "Progress Variance"]
        : ["Learner", "Email", "Programme", "Metric", "Status", "Window", "Date"];

      const data: Cell[][] = [exportHeaders];
      for (const r of rows) {
        if (otjhView) {
          data.push([
            r.name, r.email || "", r.programme || "", r.metric, r.status,
            r.completed ?? "", r.targetHours ?? "", r.progressHours || "", r.progressVariance || "",
          ]);
        } else {
          data.push([
            r.name, r.email || "", r.programme || "", r.metric, r.status,
            REVIEW_METRICS.has(r.metricKey) ? windowTag(r.date, today) : "",
            r.date || "",
          ]);
        }
      }

      const slug = (coachName || "metric-breakdown").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      downloadXlsx(`${slug}-metric-breakdown.xlsx`, metricLabel, data);
    } catch (err) {
      console.error("Failed to export table to Excel:", err);
      alert("Sorry — the Excel export failed. Please try again.");
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <div className="table-card">
      <div className="table-toolbar" style={{ flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
            Metric Breakdown
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            {metric === "PENDING"
              ? `${rows.reduce((sum, row) => sum + (row.pendingCount ?? 0), 0)} pending submissions across ${rows.length} learners`
              : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Search learner
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <i
                className="ri-search-line"
                aria-hidden="true"
                style={{ position: "absolute", left: 8, fontSize: 13, color: "var(--color-text-muted)", pointerEvents: "none" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email…"
                aria-label="Search learner by name or email"
                style={{
                  ...selectStyle,
                  cursor: "text",
                  paddingLeft: 26,
                  paddingRight: search ? 24 : "var(--space-2)",
                  minWidth: 180,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  title="Clear search"
                  style={{
                    position: "absolute", right: 4, display: "flex", alignItems: "center",
                    border: "none", background: "transparent", cursor: "pointer", padding: 2,
                    color: "var(--color-text-muted)", fontSize: 14, lineHeight: 1,
                  }}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              )}
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Day
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by meeting or review date"
              title="Filter by meeting or review date"
              style={{ ...selectStyle, minWidth: 140, cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Month
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="Filter by meeting or review month"
              title="Filter by meeting or review month"
              style={{ ...selectStyle, minWidth: 140, cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Metric
            <select value={metric} onChange={(e) => changeMetric(e.target.value)} style={selectStyle}>
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            Programme
            <select value={programme} onChange={(e) => setProgramme(e.target.value)} style={selectStyle}>
              <option value="ALL">All programmes</option>
              {programmes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          {statusMode && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                <option value="ALL">All statuses</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s === "Not Scheduled" ? "Planned" : s}</option>)}
              </select>
            </label>
          )}

          {reviewMode && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Time period
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selectStyle}>
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exportingXlsx || rows.length === 0}
            className="btn btn--secondary"
            title="Export the current table data to Excel (.xlsx)"
            style={{ alignSelf: "flex-end" }}
          >
            <i className="ri-file-excel-2-line" aria-hidden="true" />
            {exportingXlsx ? "Exporting…" : "Export Excel"}
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || rows.length === 0}
            className="btn btn--secondary"
            title="Export the current table view to PDF"
            style={{ alignSelf: "flex-end" }}
          >
            <i className="ri-file-pdf-2-line" aria-hidden="true" />
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      {metric === "MCM" || metric === "PR" ? (
        <ReviewTrend
          rows={rows}
          learners={learners}
          metric={metric}
          includeAllLearners={status === "ALL" && programme === "ALL" && period === "ALL" && !search.trim() && !dateFilter && !monthFilter}
        />
      ) : (
      <div className="table-scroll themed-scrollbar" style={{ maxHeight: "70vh", overflow: "auto" }}>
        <table className="data-table" ref={tableRef}>
          <thead>
            <tr>
              {headers.map((h, hi) => {
                const active = sort?.key === h;
                const frozen = hi === 0;   // freeze the Learner column horizontally
                return (
                  <th
                    key={h}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    onClick={() => toggleSort(h)}
                    title={`Sort by ${h}`}
                    style={{
                      textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)",
                      color: active ? "var(--color-accent)" : "var(--color-text-muted)", background: "var(--color-canvas)",
                      textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                      cursor: "pointer", userSelect: "none",
                      // Sticky top for the header row; the Learner column is also sticky
                      // left (top-left corner), so it needs a higher z-index than the
                      // rest of the header to stay above the sticky body cells too.
                      position: "sticky", top: 0, left: frozen ? 0 : undefined, zIndex: frozen ? 3 : 2,
                      boxShadow: frozen
                        ? "inset 0 -1px 0 var(--color-border), inset -1px 0 0 var(--color-border)"
                        : "inset 0 -1px 0 var(--color-border)",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {h}
                      <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }} aria-hidden="true">
                        {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No rows match these filters.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.email || r.name}-${r.metricKey}-${i}`} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <th scope="row" style={{
                    padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap",
                    fontWeight: "var(--font-medium)", color: "var(--color-text-primary)",
                    fontSize: "var(--text-xs)", textAlign: "left",
                    // Freeze this column: an opaque background is required so the
                    // horizontally-scrolling cells don't show through. Match the
                    // row striping (odd rows = white + the rgba(0,0,0,0.015) overlay ≈ #FBFBFB).
                    position: "sticky", left: 0, zIndex: 1,
                    background: i % 2 === 0 ? "var(--color-surface)" : "#FBFBFB",
                    boxShadow: "inset -1px 0 0 var(--color-border)",
                  }}>
                    {r.name}
                    {r.email && <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 400 }}>{r.email}</div>}
                  </th>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{r.programme || "—"}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{r.metric}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusPill(r.status)}</td>
                  {otjhView ? (
                    <>
                      <td style={cellStyle} className="tabular-nums">{r.completed ?? "—"}</td>
                      <td style={cellStyle}>{r.target || "—"}</td>
                      <td style={cellStyle}>{r.progressHours || "—"}</td>
                      <td style={cellStyle}>{r.progressVariance || "—"}</td>
                    </>
                  ) : (
                    <>
                      <td style={cellStyle}>
                        {REVIEW_METRICS.has(r.metricKey) ? windowTag(r.date, today) : "—"}
                      </td>
                      <td style={cellStyle}>{r.date || "—"}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
