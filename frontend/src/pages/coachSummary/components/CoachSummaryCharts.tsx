import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";
import { useState } from "react";
import { CoachSummaryRecord } from "@/mocks/coachSummary";

const COMPANY_COLOR = "var(--coach-summary-chart-company)";
const ACCENT = "var(--coach-summary-chart-accent)";

const tooltipStyle = {
  backgroundColor: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "11px",
};
const tooltipLabelStyle = { color: "#ffffff", fontWeight: 600 };
const tooltipItemStyle = { color: "#d1d5db" };
const cursorStyle = { fill: "rgba(255,255,255,0.04)" };
const axisStyle = { fontSize: 10, fill: "rgba(255,255,255,0.35)" };
const dropdownOptionStyle = { color: "#111827", backgroundColor: "#f3f4f6" };

const weekLabels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10"];

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

  const trendData = weekLabels.map((label, li) => {
    const weekIdx = li;
    const row: Record<string, string | number> = { week: label };
    coachLineMeta.forEach((line) => {
      row[line.key] = parseFloat(line.coach.weeks[weekIdx].absenceRatio.toFixed(2));
    });
    if (overall) {
      row["Company"] = parseFloat(overall.weeks[weekIdx].absenceRatio.toFixed(2));
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
    <div className="coach-summary-charts grid grid-cols-1 gap-6">
      {/* Chart 1: 10-week trend lines */}
      <div className="bg-[#111] rounded-xl border border-white/10 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest mb-1">10-Week Trend</div>
            <div className="font-bold text-white text-sm">Absence Ratio Over Time (All Coaches)</div>
          </div>
          <div className="shrink-0">
            <label className="sr-only" htmlFor="trend-series-filter">Filter line</label>
            <select
              id="trend-series-filter"
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-[#7c4daa]"
            >
              <option value="all" style={dropdownOptionStyle}>All Coaches</option>
              {coachLineMeta.map((line) => (
                <option key={line.key} value={line.key} style={dropdownOptionStyle}>{line.shortLabel}</option>
              ))}
              <option value="Company" style={dropdownOptionStyle}>Company</option>
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
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
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {trendLegendItems.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <span
                className={`inline-block w-4 border-t-2 ${item.dashed ? "border-dashed" : ""}`}
                style={{ borderColor: item.color }}
              />
              {item.shortLabel}
            </span>
          ))}
        </div>
      </div>

      {/* Chart 2: 10W avg per coach */}
      <div className="bg-[#111] rounded-xl border border-white/10 p-5">
        <div className="text-xs text-white/40 uppercase tracking-widest mb-1">Rolling Average</div>
        <div className="font-bold text-white text-sm mb-4">10-Week Average Absence Ratio per Coach</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={avgData} margin={{ top: 0, right: 10, bottom: 40, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
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
              label={{ value: `Co. avg ${overall?.last10WeeksAbsenceRatio ?? 0}%`, fill: COMPANY_COLOR, fontSize: 10, position: "insideTopRight" }}
            />
            <Bar dataKey="avg" name="10W Avg Absence %" fill={ACCENT} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
