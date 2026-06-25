import { useEffect, useMemo, useRef, useState } from "react";
import type { DrillLearnerRow, ReviewRow } from "@/services/coachesLateness";
import { downloadXlsx, type Cell } from "@/utils/xlsx";

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

const PERIODS = [
  { key: "ALL", label: "All dates", days: null },
  { key: "12W", label: "12 weeks", days: 84 },
  { key: "8W", label: "8 weeks", days: 56 },
  { key: "4W", label: "4 weeks", days: 28 },
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
  progressHours?: string;
  progressVariance?: string;
}

// Day-of-window tag for a date relative to today.
function windowTag(dateIso: string, today: Date): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff < 0) return "Upcoming";
  if (diff <= 27) return "4w";
  if (diff <= 55) return "8w";
  if (diff <= 83) return "12w";
  return "Older";
}

function withinDays(dateIso: string, today: Date, days: number | null): boolean {
  if (days == null) return true;
  if (!dateIso) return false;
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  return diff >= 0 && diff <= days - 1;
}

function otjhBand(raw: string): string {
  const t = raw.toLowerCase().replace(/-/g, " ").trim();
  if (t === "at risk" || t === "atrisk") return "At Risk";
  if (t === "need attention") return "Need Attention";
  if (t === "ontrack" || t === "on track") return "On Track";
  return raw || "—";
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
    if (l.otjh_status) out.push({
      ...base, metric: "OTJH", metricKey: "OTJH", status: otjhBand(l.otjh_status), date: "",
      completed: l.completed, target: l.otjh_target, progressHours: l.otjh_progress_hours, progressVariance: l.otjh_progress_variance,
    });
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

  // Follow the metric chosen by a KPI card click on the parent page, clearing
  // any status/period that belonged to the previous metric.
  useEffect(() => { setMetric(initialMetric); setStatus("ALL"); setPeriod("ALL"); }, [initialMetric]);

  const changeMetric = (value: string) => {
    setMetric(value);
    setStatus("ALL");
    setPeriod("ALL");
  };

  const reviewMode = REVIEW_METRICS.has(metric);          // time-period filter (dated rows only)
  const statusOptions = STATUS_OPTIONS[metric] ?? [];     // status filter (PR/MCM/OTJH)
  const statusMode = statusOptions.length > 0;

  const rows = useMemo(() => {
    const periodDays = PERIODS.find((p) => p.key === period)?.days ?? null;
    return allRows.filter((r) => {
      if (metric !== "ALL" && r.metricKey !== metric) return false;
      if (programme !== "ALL" && r.programme !== programme) return false;
      // Status filter applies to the selected metric (PR/MCM/OTJH).
      if (statusMode && status !== "ALL" && r.status !== status) return false;
      // Time period only constrains dated PR/MCM rows.
      if (reviewMode && periodDays != null && !withinDays(r.date, today, periodDays)) return false;
      return true;
    });
  }, [allRows, metric, programme, status, period, statusMode, reviewMode, today]);

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

  // Screenshot the current (filtered) table and save it as a PDF. html2canvas
  // and jsPDF are imported lazily so they stay out of the main bundle. We
  // capture an off-screen clone of the table — sized to its full un-scrolled
  // width and prefixed with a title + active-filter summary — so nothing is
  // clipped by the horizontal scroll container, then tile the resulting image
  // across as many landscape pages as the table is tall.
  const handleExport = async () => {
    const table = tableRef.current;
    if (!table || exporting || rows.length === 0) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const fullWidth = table.scrollWidth;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `position:fixed;left:-100000px;top:0;width:${fullWidth}px;padding:20px;background:#ffffff;`;

      const heading = document.createElement("div");
      heading.style.cssText = "font:600 16px sans-serif;color:#0F1629;margin-bottom:4px;";
      heading.textContent = coachName ? `${coachName} — Metric Breakdown` : "Metric Breakdown";

      const sub = document.createElement("div");
      sub.style.cssText = "font:400 11px sans-serif;color:#5A6480;margin-bottom:12px;";
      const filterBits = [
        `Metric: ${metricLabel}`,
        programme !== "ALL" ? `Programme: ${programme}` : null,
        statusMode && status !== "ALL" ? `Status: ${status}` : null,
        reviewMode && period !== "ALL" ? `Period: ${PERIODS.find((p) => p.key === period)?.label}` : null,
      ].filter(Boolean);
      sub.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"} · ${filterBits.join(" · ")} · Exported ${new Date().toLocaleString()}`;

      wrapper.appendChild(heading);
      wrapper.appendChild(sub);
      wrapper.appendChild(table.cloneNode(true));
      document.body.appendChild(wrapper);

      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(wrapper, { scale: 2, backgroundColor: "#ffffff", windowWidth: fullWidth + 40 });
      } finally {
        document.body.removeChild(wrapper);
      }

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      // Tile a tall image across multiple pages.
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

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
            r.completed ?? "", r.target || "", r.progressHours || "", r.progressVariance || "",
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

      <div className="table-scroll themed-scrollbar">
        <table className="data-table" ref={tableRef}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" style={{
                  textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)",
                  color: "var(--color-text-muted)", background: "var(--color-canvas)",
                  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No rows match these filters.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.email || r.name}-${r.metricKey}-${i}`} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <th scope="row" style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", fontWeight: "var(--font-medium)", color: "var(--color-text-primary)", fontSize: "var(--text-xs)", textAlign: "left" }}>
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
