import { useEffect, useMemo, useRef, useState } from "react";
import type { DrillLearnerRow } from "@/services/coachesLateness";
import { daysSince, formatDate, lmsProfileUrl, toLearnerView, type LearnerView } from "@/utils/learners";
import { downloadXlsx, type Cell } from "@/utils/xlsx";

// The coach page's "All Learners" table, laid out like the LMS tutor
// dashboard: learner, status, progress (OTJH / activities / attendance), start
// date, last activity, last PR / MCM, actions.

// A completed review older than this is overdue (flagged red): PRs run roughly
// every 10 weeks, MCMs monthly.
const PR_OVERDUE_DAYS = 70;
const MCM_OVERDUE_DAYS = 28;
// Last activity at least this many days ago is flagged amber.
const STALE_ACTIVITY_DAYS = 10;

const AVATAR_TONES = [
  { bg: "#F3EEFB", fg: "#4C2A85" },
  { bg: "#FFF3E6", fg: "#B25E00" },
  { bg: "#E9F8EF", fg: "#12814A" },
  { bg: "#FDECEF", fg: "#B4234A" },
  { bg: "#E8F1FD", fg: "#2B5CB8" },
];

const BAND_COLOR: Record<string, string> = {
  "On Track": "var(--color-success)",
  "Need Attention": "var(--color-warning)",
  "At Risk": "var(--color-danger)",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function toneFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100) / 100}%`);
const fmtHours = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100) / 100}h`);

function ProgressCell({ pct, label, sub, color }: { pct: number | null; label: string; sub?: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 96 }}>
      <span className="tabular-nums" style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: pct == null ? "var(--color-text-faint)" : color }}>
        {label}
      </span>
      <div style={{ width: 82, height: 6, borderRadius: 999, background: "var(--color-border)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, height: "100%", background: color }} />
      </div>
      {sub && <span className="tabular-nums" style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{sub}</span>}
    </div>
  );
}

function DateCell({ iso, note, noteColor }: { iso: string; note?: string; noteColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", whiteSpace: "nowrap" }}>
        <i className="ri-calendar-line" style={{ color: "var(--color-lms-purple)", opacity: 0.6 }} aria-hidden="true" />
        {formatDate(iso)}
      </span>
      {note && <span style={{ fontSize: 11, fontWeight: "var(--font-medium)", color: noteColor ?? "var(--color-text-faint)" }}>{note}</span>}
    </div>
  );
}

function reviewNote(iso: string, overdueDays: number) {
  const age = daysSince(iso);
  if (age == null) return { note: "None completed", color: "var(--color-danger)" };
  return { note: "Latest completed", color: age >= overdueDays ? "var(--color-danger)" : "var(--color-text-faint)" };
}

function activityNote(iso: string) {
  const age = daysSince(iso);
  if (age == null) return undefined;
  return {
    note: `${age} days ago`,
    color: age >= STALE_ACTIVITY_DAYS ? "var(--color-warning)" : "var(--color-text-faint)",
  };
}

type SortKey = "name" | "otjh" | "activities" | "attendance" | "start" | "activity" | "pr" | "mcm";

const SORTERS: Record<SortKey, (v: LearnerView) => string | number> = {
  name: (v) => v.row.name.toLowerCase(),
  otjh: (v) => v.otjhPct ?? -1,
  activities: (v) => v.activitiesPct ?? -1,
  attendance: (v) => v.attendancePct ?? -1,
  start: (v) => v.row.start_date || "",
  activity: (v) => v.row.last_activity || "",
  pr: (v) => v.row.pr_last_completed || "",
  mcm: (v) => v.row.mcm_last_completed || "",
};

const selectStyle: React.CSSProperties = {
  height: 40, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  color: "var(--color-lms-purple)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)",
  minWidth: 180,
};

interface CoachLearnersTableProps {
  coachName: string;
  learners: DrillLearnerRow[];
  /** Pre-selected OTJH status filter (e.g. "At Risk" from the KPI card). */
  otjhFilter?: string;
  onView: (row: DrillLearnerRow) => void;
}

export default function CoachLearnersTable({ coachName, learners, otjhFilter = "", onView }: CoachLearnersTableProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [otjh, setOtjh] = useState(otjhFilter);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOtjh(otjhFilter), [otjhFilter]);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportOpen]);

  const views = useMemo(() => learners.map(toLearnerView), [learners]);
  const groups = useMemo(
    () => Array.from(new Set(views.map((v) => v.row.group || v.row.cohort).filter(Boolean))).sort(),
    [views],
  );
  const statuses = useMemo(
    () => Array.from(new Set(views.map((v) => v.row.status).filter(Boolean))).sort(),
    [views],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = views.filter((v) =>
      (!q || v.row.name.toLowerCase().includes(q) || v.row.email.toLowerCase().includes(q))
      && (!group || (v.row.group || v.row.cohort) === group)
      && (!otjh || v.otjhBand === otjh)
      && (!status || v.row.status === status),
    );
    const key = SORTERS[sort.key];
    return out.sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [views, query, group, otjh, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const exportRows = (): Cell[][] => [
    ["Learner", "Email", "Programme", "Cohort / group", "Status", "OTJH %", "OTJH completed (h)", "OTJH target (h)",
      "Activities %", "Activities done", "Activities total", "Attendance %", "Start date", "Last activity",
      "Last PR completed", "Last MCM completed"],
    ...rows.map((v) => [
      v.row.name, v.row.email, v.row.programme, v.row.group || v.row.cohort, v.row.status,
      v.otjhPct == null ? null : Math.round(v.otjhPct * 100) / 100, v.row.completed, v.targetHours,
      v.activitiesPct == null ? null : Math.round(v.activitiesPct * 100) / 100, v.row.activities_done, v.row.activities_total,
      v.attendancePct == null ? null : Math.round(v.attendancePct), v.row.start_date, v.row.last_activity,
      v.row.pr_last_completed, v.row.mcm_last_completed,
    ]),
  ];

  const fileBase = `${coachName.replace(/[^\w-]+/g, "_")}_learners`;

  const exportXlsx = () => {
    downloadXlsx(`${fileBase}.xlsx`, "Learners", exportRows());
    setExportOpen(false);
  };

  const exportCsv = () => {
    const csv = exportRows()
      .map((r) => r.map((c) => {
        const s = c == null ? "" : String(c);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const SortHead = ({ k, children, rowSpan, colSpan }: { k?: SortKey; children: React.ReactNode; rowSpan?: number; colSpan?: number }) => (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      onClick={k ? () => toggleSort(k) : undefined}
      aria-sort={k && sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className="learners-th"
      style={{ cursor: k ? "pointer" : "default" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {children}
        {k && <i className={sort.key === k ? (sort.dir === 1 ? "ri-arrow-up-line" : "ri-arrow-down-line") : "ri-arrow-up-down-line"} style={{ opacity: 0.75 }} aria-hidden="true" />}
      </span>
    </th>
  );

  return (
    <section className="table-card" style={{ overflow: "visible" }}>
      {/* Heading */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-5)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "var(--radius-md)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#FFF3E6", color: "var(--color-lms-purple)",
          }}>
            <i className="ri-group-line" style={{ fontSize: 24 }} aria-hidden="true" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: "var(--color-lms-purple)" }}>All Learners</h3>
            <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-faint)" }}>
              Manage and monitor your learners' progress · {rows.length} of {views.length}
            </p>
          </div>
        </div>
        <div ref={exportRef} style={{ position: "relative" }}>
          <button type="button" className="btn btn--secondary" onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen}>
            <i className="ri-download-2-line" aria-hidden="true" /> Export <i className="ri-arrow-down-s-line" aria-hidden="true" />
          </button>
          {exportOpen && (
            <div role="menu" style={{
              position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20, minWidth: 170,
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-raised)", padding: 4,
            }}>
              {[
                { label: "Excel (.xlsx)", icon: "ri-file-excel-2-line", onClick: exportXlsx },
                { label: "CSV (.csv)", icon: "ri-file-text-line", onClick: exportCsv },
              ].map((o) => (
                <button key={o.label} type="button" role="menuitem" onClick={o.onClick} className="export-item">
                  <i className={o.icon} aria-hidden="true" /> {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", padding: "0 var(--space-5) var(--space-4)" }}>
        <div style={{ position: "relative", flex: "0 1 320px", minWidth: 220 }}>
          <i className="ri-search-line" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-faint)" }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by learner name or email..."
            aria-label="Search learners"
            className="table-search"
            style={{ width: "100%", height: 40, paddingLeft: 36, background: "var(--color-surface)" }}
          />
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={selectStyle} aria-label="Cohort / group">
          <option value="">All cohorts / groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={otjh} onChange={(e) => setOtjh(e.target.value)} style={selectStyle} aria-label="OTJH status">
          <option value="">All OTJH statuses</option>
          {["On Track", "Need Attention", "At Risk"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle} aria-label="Programme status">
          <option value="">All programme statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ padding: "0 var(--space-5) var(--space-5)" }}>
        <table className="learners-table">
          <thead>
            <tr>
              <SortHead k="name" rowSpan={2}>Learner</SortHead>
              <SortHead rowSpan={2}><span style={{ fontSize: 11 }}>Status</span></SortHead>
              <SortHead colSpan={3}>Progress</SortHead>
              <SortHead k="start" rowSpan={2}>Start date</SortHead>
              <SortHead k="activity" rowSpan={2}>Last activity</SortHead>
              <SortHead k="pr" rowSpan={2}>Last PR</SortHead>
              <SortHead k="mcm" rowSpan={2}>Last MCM</SortHead>
              <SortHead rowSpan={2}>Actions</SortHead>
            </tr>
            <tr>
              <SortHead k="otjh">OTJH</SortHead>
              <SortHead k="activities">Activities</SortHead>
              <SortHead k="attendance">Attendance</SortHead>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "var(--space-8)", color: "var(--color-text-faint)" }}>
                  No learners match these filters.
                </td>
              </tr>
            )}
            {rows.map((v) => {
              const r = v.row;
              const tone = toneFor(r.name);
              const pr = reviewNote(r.pr_last_completed, PR_OVERDUE_DAYS);
              const mcm = reviewNote(r.mcm_last_completed, MCM_OVERDUE_DAYS);
              const act = activityNote(r.last_activity);
              const profile = lmsProfileUrl(r);
              return (
                <tr key={r.email || r.name}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 220 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: "var(--font-semibold)",
                      }}>
                        {initials(r.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)" }}>{r.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-faint)" }}>{r.programme || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {r.status
                      ? <span className="badge badge--success">{r.status}</span>
                      : <span style={{ color: "var(--color-text-faint)" }}>—</span>}
                  </td>
                  <td>
                    <ProgressCell
                      pct={v.otjhPct}
                      label={v.otjhPct == null ? "—" : `${Math.round(v.otjhPct)}%`}
                      sub={`${fmtHours(r.completed)} / ${fmtHours(v.targetHours)}`}
                      color={BAND_COLOR[v.otjhBand] ?? "var(--color-danger)"}
                    />
                  </td>
                  <td>
                    <ProgressCell
                      pct={v.activitiesPct}
                      label={fmtPct(v.activitiesPct)}
                      sub={r.activities_total ? `${r.activities_done} / ${r.activities_total}` : undefined}
                      color="var(--color-success)"
                    />
                  </td>
                  <td>
                    <ProgressCell
                      pct={v.attendancePct}
                      label={v.attendancePct == null ? "—" : `${Math.round(v.attendancePct)}%`}
                      color="var(--color-success)"
                    />
                  </td>
                  <td><DateCell iso={r.start_date} /></td>
                  <td><DateCell iso={r.last_activity} note={act?.note} noteColor={act?.color} /></td>
                  <td><DateCell iso={r.pr_last_completed} note={pr.note} noteColor={pr.color} /></td>
                  <td><DateCell iso={r.mcm_last_completed} note={mcm.note} noteColor={mcm.color} /></td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
                      <button type="button" className="learner-action" onClick={() => onView(r)}>
                        <i className="ri-link" aria-hidden="true" /> View
                      </button>
                      {profile && (
                        <a className="learner-action learner-action--strong" href={profile} target="_blank" rel="noreferrer">
                          View Profile
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .learners-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
        .learners-table .learners-th {
          background: var(--color-lms-purple); color: #fff; font-weight: var(--font-semibold);
          text-transform: uppercase; letter-spacing: 0.02em; font-size: var(--text-sm);
          padding: var(--space-3) var(--space-4); text-align: center; white-space: nowrap; user-select: none;
          border-bottom: 1px solid rgba(255,255,255,0.15);
        }
        .learners-table thead tr:first-child th:first-child { border-top-left-radius: var(--radius-md); }
        .learners-table thead tr:first-child th:last-child { border-top-right-radius: var(--radius-md); }
        .learners-table td {
          padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border);
          vertical-align: middle; background: var(--color-surface);
        }
        .learners-table tbody tr:nth-child(even) td { background: #FAFAFC; }
        .learners-table tbody tr:hover td { background: var(--color-lms-purple-tint); }
        .learner-action {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
          padding: 8px 14px; border-radius: var(--radius-md); cursor: pointer; text-decoration: none;
          border: 1px solid var(--color-border); background: var(--color-surface);
          color: var(--color-lms-purple); font-size: var(--text-sm); font-weight: var(--font-semibold);
          font-family: var(--font-sans);
        }
        .learner-action:hover { border-color: var(--color-lms-purple); background: var(--color-lms-purple-tint); }
        .learner-action--strong { border-color: var(--color-lms-purple-light); }
        .export-item {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
          padding: 8px 10px; border: 0; border-radius: var(--radius-sm); background: transparent;
          cursor: pointer; font-size: var(--text-sm); color: var(--color-text-primary); font-family: var(--font-sans);
        }
        .export-item:hover { background: var(--color-lms-purple-tint); }
      `}</style>
    </section>
  );
}
