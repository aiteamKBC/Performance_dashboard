import { useState, useEffect } from "react";
import CoachSummaryNav from "./components/CoachSummaryNav";
import CoachSummaryTable from "./components/CoachSummaryTable";
import CoachSummaryCharts from "./components/CoachSummaryCharts";
import type { CoachSummaryRecord } from "@/mocks/coachSummary";
import { fetchCoachSummary } from "@/services/coachSummary";

export default function CoachSummaryPage() {
  const [records, setRecords] = useState<CoachSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCoachSummary();
        setRecords(data);
      } catch (err) {
        console.error('Failed to load coach summary data:', err);
        setError('Failed to load coach summary data from API.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const overall = records.find(r => r.coachName === "OVERALL COMPANY");
  const coaches = records.filter(r => r.coachName !== "OVERALL COMPANY");
  const highRisk = coaches.filter(c => c.last10WeeksAbsenceRatio >= 20).length;
  const totalStudents = overall?.studentsCount ?? coaches.reduce((s, c) => s + c.studentsCount, 0);
  const avgAbsence = coaches.length > 0 ? (coaches.reduce((s, c) => s + c.last10WeeksAbsenceRatio, 0) / coaches.length).toFixed(1) : "0.0";

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans">
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-8 flex flex-col items-center gap-4">
            <i className="ri-loader-4-line text-4xl text-[#7c4daa] animate-spin" />
            <span className="text-white text-sm">Loading coach summary data...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <i className="ri-error-warning-line text-xl" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <CoachSummaryNav />

      {/* Quick stat strip */}
      <div className="border-b border-white/5 bg-[#0f0f0f]">
        <div className="max-w-[1600px] mx-auto px-8 py-3 flex items-center gap-8 overflow-x-auto">
          {[
            { label: "Total Coaches", value: coaches.length, icon: "ri-shield-user-line", color: "#7c4daa" },
            { label: "Total Students", value: totalStudents, icon: "ri-group-line", color: "#a8f0c6" },
            { label: "Avg 10W Absence", value: `${avgAbsence}%`, icon: "ri-percent-line", color: "#e8b4f8" },
            { label: "Company W1 Absence", value: `${(overall?.weeks[0]?.absenceRatio || 0).toFixed(2)}%`, icon: "ri-building-line", color: "#fbbf24" },
            { label: "High Risk Coaches (≥20%)", value: highRisk, icon: "ri-alarm-warning-line", color: "#f87171" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 shrink-0">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className={`${s.icon} text-sm`} style={{ color: s.color }} />
              </div>
              <span className="font-bold text-sm font-mono" style={{ color: s.color }}>{s.value}</span>
              <span className="text-white/30 text-xs whitespace-nowrap">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <main className="px-8 py-6 max-w-[1600px] mx-auto space-y-6">
        {/* Table */}
        <CoachSummaryTable records={records} />

        {/* Charts */}
        <CoachSummaryCharts records={records} />


      </main>
    </div>
  );
}
