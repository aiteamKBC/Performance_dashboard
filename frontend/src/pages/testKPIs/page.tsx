import { useState, useEffect } from "react";
import TestKPIsNav from "./components/TestKPIsNav";
import TestKPIsTable from "./components/TestKPIsTable";
import { fetchTestKPIs, type TestKPIsRecord } from "@/services/testKPIs";

export default function TestKPIsPage() {
  const [records, setRecords] = useState<TestKPIsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTestKPIs();
        setRecords(data);
      } catch {
        setError("Failed to load KPIs data from API.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const totalRequired = records.reduce((s, r) => s + r.requiredPR, 0);
  const totalCompleted = records.reduce((s, r) => s + r.completedPR, 0);
  const totalUnschedOverdue = records.reduce((s, r) => s + r.unscheduledOverduePR, 0);
  const completionRate = totalRequired > 0 ? ((totalCompleted / totalRequired) * 100).toFixed(1) : "0.0";

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans">
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-8 flex flex-col items-center gap-4">
            <i className="ri-loader-4-line text-4xl text-[#e8a838] animate-spin" />
            <span className="text-white text-sm">Loading KPIs data...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <i className="ri-error-warning-line text-xl" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <TestKPIsNav />

      {/* Quick stat strip */}
      <div className="border-b border-white/5 bg-[#0f0f0f]">
        <div className="max-w-[1600px] mx-auto px-8 py-3 flex items-center gap-8 overflow-x-auto">
          {[
            { label: "Case Owners", value: records.length, icon: "ri-user-line", color: "#e8a838" },
            { label: "Total Required PRs", value: totalRequired, icon: "ri-file-list-3-line", color: "#7c4daa" },
            { label: "Total Completed PRs", value: totalCompleted, icon: "ri-check-double-line", color: "#4de87c" },
            { label: "PR Completion Rate", value: `${completionRate}%`, icon: "ri-percent-line", color: "#a8f0c6" },
            { label: "Unscheduled Overdue PRs", value: totalUnschedOverdue, icon: "ri-alarm-warning-line", color: "#f87171" },
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

      <main className="px-8 py-6 max-w-[1600px] mx-auto">
        <TestKPIsTable records={records} />
      </main>
    </div>
  );
}
