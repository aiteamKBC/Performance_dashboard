import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ReferenceLine, ComposedChart,
  Cell, LabelList,
} from "recharts";
import { useState } from "react";
import { CoachSummaryRecord } from "@/mocks/coachSummary";

const COMPANY_COLOR = "var(--coach-summary-chart-company)";

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

export default function CoachSummaryCharts({ records }: { records: CoachSummaryRecord[] }) {
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");
  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const [selectedCoach, setSelectedCoach] = useState("all");

  // Week labels come from the data (dynamic length). Chart oldest→newest so the
  // trend reads left-to-right in time; the table column order is newest→oldest.
  const weekCount = (overall ?? coaches[0])?.weeks.length ?? 0;
  const weekOrder = Array.from({ length: weekCount }, (_, i) => weekCount - 1 - i);

  const weeklyAverageData = weekOrder.map((li) => {
    const sample = (overall ?? coaches[0])?.weeks[li];
    const ratios = coaches.map((coach) => coach.weeks[li]?.absenceRatio).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const averageCoachAbsence = ratios.length > 0 ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0;
    const selected = selectedCoach === "all" ? averageCoachAbsence : (coaches.find((coach) => coach.coachName === selectedCoach)?.weeks[li]?.absenceRatio ?? 0);
    return {
      week: sample?.label ?? `W${li + 1}`,
      averageCoachAbsence: Number(selected.toFixed(2)),
      companyAverage: Number((overall?.weeks[li]?.absenceRatio ?? 0).toFixed(2)),
    };
  });

  const avgData = coaches.map(r => ({
    name: r.coachName.split(" ")[0] + " " + (r.coachName.split(" ")[1]?.[0] ?? ""),
    avg: r.last10WeeksAbsenceRatio,
    company: overall?.last10WeeksAbsenceRatio ?? 0,
    aboveCompany: r.last10WeeksAbsenceRatio > (overall?.last10WeeksAbsenceRatio ?? 0),
  }));

  return (
    <div className="coach-summary-charts" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Chart 1: 10-week trend */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
          <h3 className="chart-title">Coach Absence Analysis</h3>
          <p className="chart-subtitle">10-week overview vs company average</p>
          </div>
          <div>
            <select
              aria-label="Coach scope"
              value={selectedCoach}
              onChange={(event) => setSelectedCoach(event.target.value)}
              style={{
                borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                background: "var(--color-canvas)", padding: "var(--space-1) var(--space-2)",
                fontSize: "var(--text-xs)", color: "var(--color-text-primary)", outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Coaches</option>
              {coaches.map((coach) => <option key={coach.coachName} value={coach.coachName}>{coach.coachName}</option>)}
            </select>
            <div style={{ marginTop: 8, padding: "8px 10px", maxWidth: 285, border: "1px solid #D9E4F2", borderRadius: 8, background: "#F7FAFE", color: "#52607A", fontSize: 10, lineHeight: 1.45 }}>
              <div style={{ color: "#25324D", fontWeight: 700, marginBottom: 3 }}>How to read this analysis</div>
              <div><strong>Top chart:</strong> weekly average absence across coaches vs company absence.</div>
              <div><strong>Bottom chart:</strong> each coach&apos;s pooled 10-week absence rate vs company average.</div>
            </div>
          </div>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={weeklyAverageData} margin={{ top: 18, right: 30, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="week" tick={{ ...axisStyle, fill: "#25324D", fontWeight: 600 }} />
              <YAxis tick={axisStyle} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                cursor={cursorStyle}
                formatter={(value, name) => [`${value}%`, String(name)]}
              />
              <Bar dataKey="averageCoachAbsence" name="Average Coach Absence" fill="#B9DCF5" radius={[5, 5, 0, 0]}>
                <LabelList dataKey="averageCoachAbsence" position="top" formatter={(value: number) => `${Math.round(value)}%`} style={{ fill: "#102A68", fontSize: 12, fontWeight: 700 }} />
              </Bar>
              <Line type="monotone" dataKey="companyAverage" name="Company Average" stroke="#1458B8" strokeWidth={3} dot={{ r: 5, fill: "#fff", stroke: "#1458B8", strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "var(--space-5)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 3, background: "#B9DCF5" }} />{selectedCoach === "all" ? "Average Coach Absence" : `${selectedCoach} Absence`}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, borderTop: "3px solid #1458B8" }} />Company Average</span>
          </div>
        </div>
      </div>

      {/* Chart 2: 10W avg bar */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Coaches above company average on 10-week absence rate</h3>
            <p className="chart-subtitle">Absence rate per coach · company average: {(overall?.last10WeeksAbsenceRatio ?? 0).toFixed(0)}%</p>
          </div>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={avgData} margin={{ top: 18, right: 18, bottom: 72, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ ...axisStyle, fill: "#25324D", fontSize: 10 }} angle={-28} textAnchor="end" interval={0} height={72} />
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
              <Bar dataKey="avg" name="10W Avg Absence %" radius={[5, 5, 0, 0]}>
                {avgData.map((entry) => <Cell key={entry.name} fill={entry.aboveCompany ? "#F87171" : "#6FD38A"} />)}
                <LabelList dataKey="avg" position="top" formatter={(value: number) => `${Math.round(value)}%`} style={{ fill: "#102A68", fontSize: 12, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "var(--space-5)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 3, background: "#F87171" }} />Above Company Average</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 3, background: "#6FD38A" }} />At or Below Company Average</span>
          </div>
        </div>
      </div>
    </div>
  );
}
