import { useEffect, useMemo, useRef, useState } from "react";
import type { DrillLearnerRow, ReviewRow } from "@/services/coachesLateness";
import { downloadXlsx, type Cell } from "@/utils/xlsx";
import { otjhTarget, otjhVariance, otjhStatusFromVariance, formatHours, parseProgressHours } from "@/utils/otjh";

const STATUS_COLOR: Record<string, string> = {
  "On Track": "#16A34A",
  "Need Attention": "#D97706",
  "At Risk": "#DC2626",
  Completed: "#16A34A",
  Scheduled: "#0891B2",
  "Awaiting Signature": "#EA580C",
  "In Progress": "#4F46E5",
  "Not Scheduled": "#DC2626",
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
  { key: "PENDING", label: "Evidence Pending" },
  { key: "CLOSURE", label: "Referred Closure" },
  { key: "RECENT", label: "Recent Submitters" },
] as const;

const REVIEW_METRICS = new Set(["PR", "MCM"]);

// Status options per metric. PR/MCM share the review statuses; OTJH filters by
// its risk bands. Metrics not listed here have no status filter.
const STATUS_OPTIONS: Record<string, string[]> = {
  PR: ["Completed", "Scheduled", "Awaiting Signature", "Not Scheduled", "In Progress"],
  MCM: ["Completed", "Scheduled", "Awaiting Signature", "Not Scheduled", "In Progress"],
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
  // OTJH-only detail columns (shown in place of Window/Date when OTJH selected).
  completed?: number;
  target?: string;
  targetHours?: number;   // numeric form of the computed target (for Excel export)
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
 *  - OTJH/Engaged/Pending/Closure/Recent = one row per learner (from `learners`).
 */
function buildRows(learners: DrillLearnerRow[], reviewRows: ReviewRow[]): MetricRow[] {
  const out: MetricRow[] = [];

  for (const r of reviewRows) {
    out.push({
      name: r.name, email: r.email, programme: r.programme,
      metric: r.metric, metricKey: r.metric, status: r.status, date: r.date,
    });
  }

  for (const l of learners) {
    const base = { name: l.name, email: l.email, programme: l.programme };
    if (l.otjh_status) {
      const tgt = otjhTarget(l.completed, l.otjh_progress_hours);
      const variance = otjhVariance(l.completed, l.otjh_progress_hours);
      out.push({
        ...base, metric: "OTJH", metricKey: "OTJH",
        status: otjhStatusFromVariance(variance, l.otjh_status), date: "",
        completed: l.completed,
        target: tgt == null ? "" : formatHours(tgt),
        targetHours: tgt == null ? undefined : Math.round(tgt * 10) / 10,
        progressHours: l.otjh_progress_hours,
        progressVariance: variance == null ? "" : `${Math.round(variance)}%`,
      });
    }
    if (l.submitted > 0) out.push({ ...base, metric: "Engaged", metricKey: "ENGAGED", status: "Engaged", date: l.last_sub });
    if (l.pending > 0) out.push({ ...base, metric: "Evidence Pending", metricKey: "PENDING", status: `${l.pending} pending`, date: l.last_sub });
    if (l.referred_closure > 0) out.push({ ...base, metric: "Referred Closure", metricKey: "CLOSURE", status: `${l.referred_closure} closure`, date: "" });
    if (l.last_sub) out.push({ ...base, metric: "Recent Submitter", metricKey: "RECENT", status: l.last_sub, date: l.last_sub });
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

export default function MetricBreakdownTable({ learners, reviewRows, initialMetric = "ALL", coachName }: { learners: DrillLearnerRow[]; reviewRows: ReviewRow[]; initialMetric?: string; coachName?: string }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const allRows = useMemo(() => buildRows(learners, reviewRows), [learners, reviewRows]);

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
  // Column sort — null means natural (unsorted) order.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Follow the metric chosen by a KPI card click on the parent page, clearing
  // any status/period that belonged to the previous metric.
  useEffect(() => { setMetric(initialMetric); setStatus("ALL"); setPeriod("ALL"); setSort(null); }, [initialMetric]);

  const changeMetric = (value: string) => {
    setMetric(value);
    setStatus("ALL");
    setPeriod("ALL");
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
  }, [allRows, metric, programme, status, period, search, statusMode, reviewMode, today, sort]);

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
            {rows.length} row{rows.length === 1 ? "" : "s"}
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
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
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
    </div>
  );
}
