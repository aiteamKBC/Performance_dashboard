import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";
import { useState } from "react";
import { CoachSummaryRecord } from "@/mocks/coachSummary";

const COMPANY_COLOR = "var(--coach-summary-chart-company)";
const ACCENT = "var(--coach-summary-chart-accent)";

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  color: "#111827",
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};
const tooltipLabelStyle = { color: "#111827", fontWeight: 600 };
const tooltipItemStyle = { color: "#6B7280" };
const cursorStyle = { fill: "#EEF2FF" };
const axisStyle = { fontSize: 10, fill: "#9CA3AF" };

const COACH_COLORS = [
  "var(--coach-summary-series-1)",
  "var(--coach-summary-series-2)",
  "var(--coach-summary-series-3)",
  "var(--coach-summary-series-4)",
  "var(--coach-summary-series-5)",
  "var(--coach-summary-series-6)",
  "var(--coach-summary-series-7)",
  "var(--coach-summary-series-8)",
  "var(--coach-summary-series-9)",
  "var(--coach-summary-series-10)",
  "var(--coach-summary-series-11)",
];

export default function CoachSummaryCharts({ records }: { records: CoachSummaryRecord[] }) {
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");
  const overall = records.find(r => r.coachName === "OVERALL COMPANY");

  const [selectedSeries, setSelectedSeries] = useState("all");

  const coachLineMeta = coaches.map((c, i) => {
    const words = c.coachName.split(" ");
    const shortLabel = `${words[0]} ${words[1]?.[0] ?? ""}`.trim();
    return {
      key: `coach_${i}`,
      shortLabel,
      color: COACH_COLORS[i % COACH_COLORS.length],
      coach: c,
    };
  });

  // Week labels come from the data (dynamic length). Chart oldest→newest so the
  // trend reads left-to-right in time; the table column order is newest→oldest.
  const weekCount = (overall ?? coaches[0])?.weeks.length ?? 0;
  const weekOrder = Array.from({ length: weekCount }, (_, i) => weekCount - 1 - i);

  const trendData = weekOrder.map((li) => {
    const sample = (overall ?? coaches[0])?.weeks[li];
    const row: Record<string, string | number> = { week: sample?.label ?? `W${li + 1}` };
    coachLineMeta.forEach((line) => {
      row[line.key] = parseFloat((line.coach.weeks[li]?.absenceRatio ?? 0).toFixed(2));
    });
    if (overall) {
      row["Company"] = parseFloat((overall.weeks[li]?.absenceRatio ?? 0).toFixed(2));
    }
    return row;
  });

  const visibleCoachLines = selectedSeries === "all"
    ? coachLineMeta
    : coachLineMeta.filter((line) => line.key === selectedSeries);

  const showCompany = selectedSeries === "all" || selectedSeries === "Company";

  const trendLegendItems = [
    ...visibleCoachLines.map((line) => ({ ...line, dashed: false })),
    ...(showCompany ? [{ key: "Company", shortLabel: "Company", color: COMPANY_COLOR, dashed: true }] : []),
  ];

  const avgData = coaches.map(r => ({
    name: r.coachName.split(" ")[0] + " " + (r.coachName.split(" ")[1]?.[0] ?? ""),
    avg: r.last10WeeksAbsenceRatio,
    company: overall?.last10WeeksAbsenceRatio ?? 0,
  }));


  
  return (
    <div className="coach-summary-charts" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Chart 1: 10-week trend */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Absence ratio trends — watch for coaches consistently above company average</h3>
            <p className="chart-subtitle">10-week trend — all coaches vs company baseline</p>
          </div>
          <div>
            <label className="sr-only" htmlFor="trend-series-filter">Filter line</label>
            <select
              id="trend-series-filter"
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              style={{
                borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                background: "var(--color-canvas)", padding: "var(--space-1) var(--space-2)",
                fontSize: "var(--text-xs)", color: "var(--color-text-primary)", outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Coaches</option>
              {coachLineMeta.map((line) => (
                <option key={line.key} value={line.key}>{line.shortLabel}</option>
              ))}
              <option value="Company">Company</option>
            </select>
          </div>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="week" tick={axisStyle} />
              <YAxis tick={axisStyle} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                cursor={cursorStyle}
                formatter={(value, name) => [`${value}%`, String(name)]}
              />
              {visibleCoachLines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.shortLabel}
                  stroke={line.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
              {showCompany && (
                <Line
                  type="monotone"
                  dataKey="Company"
                  name="Company"
                  stroke={COMPANY_COLOR}
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: "var(--space-3)", display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            {trendLegendItems.map((item) => (
              <span key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                <span style={{ display: "inline-block", width: 16, borderTop: `2px ${item.dashed ? "dashed" : "solid"} ${item.color}` }} />
                {item.shortLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Chart 2: 10W avg bar */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Coaches above company average on 10-week absence rate need support</h3>
            <p className="chart-subtitle">10-week average absence ratio per coach</p>
          </div>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={avgData} margin={{ top: 0, right: 10, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={axisStyle} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={axisStyle} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                cursor={cursorStyle}
                formatter={(value, name) => [`${value}%`, String(name)]}
              />
              <ReferenceLine
                y={overall?.last10WeeksAbsenceRatio ?? 0}
                stroke={COMPANY_COLOR}
                strokeDasharray="4 4"
                label={{ value: `Co. avg ${overall?.last10WeeksAbsenceRatio ?? 0}%`, fill: "#6B7280", fontSize: 10, position: "insideTopRight" }}
              />
              <Bar dataKey="avg" name="10W Avg Absence %" fill={ACCENT} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
