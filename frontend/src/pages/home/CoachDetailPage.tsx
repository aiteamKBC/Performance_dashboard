import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import type { CoachRecord } from "@/mocks/dashboard";
import {
  fetchCoachesLateness, fetchCoachDrill,
  type CoachDrill,
} from "@/services/coachesLateness";
import AppShell from "@/components/AppShell";
import MetricBreakdownTable from "./components/MetricBreakdownTable";

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

function KpiCard({ label, value, sub, onClick }: { label: string; value: string | number; sub?: string; onClick?: () => void }) {
  const clickable = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `View ${label} breakdown` : undefined}
      className={clickable ? "kpi-card-clickable" : undefined}
      style={{
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)", padding: "var(--space-4)", boxShadow: "var(--shadow-card)",
        cursor: clickable ? "pointer" : "default",
        transition: "transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease",
      }}
    >
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p className="tabular-nums" style={{ margin: "4px 0 0", fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{sub}</p>}
    </div>
  );
}

export default function CoachDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CoachRecord | null>(null);
  const [drill, setDrill] = useState<CoachDrill | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillLoading, setDrillLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [breakdownMetric, setBreakdownMetric] = useState<string>("ALL");

  // Scroll to the metric breakdown table, optionally pre-filtering by metric,
  // and briefly highlight it.
  const scrollToBreakdown = (metricKey: string) => {
    setBreakdownMetric(metricKey);
    const el = document.getElementById("metric-breakdown");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedSection("metric-breakdown");
    window.setTimeout(() => {
      setHighlightedSection((cur) => (cur === "metric-breakdown" ? null : cur));
    }, 1600);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setDrillLoading(true);
        setError(null);
        setDrill(null);
        const all = await fetchCoachesLateness();
        const rec = all.find((r) => String(r.id) === String(id)) ?? null;
        if (cancelled) return;
        setRecord(rec);
        // Header/KPIs can render now; the learner detail loads separately.
        setLoading(false);
        if (rec) {
          try {
            const d = await fetchCoachDrill(rec.coach, rec.caseOwnerId);
            if (!cancelled) setDrill(d);
          } catch (err) {
            if (!cancelled) {
              console.error("Failed to load coach learner detail:", err);
              setError("Failed to load learner detail.");
            }
          } finally {
            if (!cancelled) setDrillLoading(false);
          }
        } else {
          setDrillLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load coach detail:", err);
          setError("Failed to load coach details.");
          setLoading(false);
          setDrillLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const otjhData = useMemo(() => {
    if (!record) return [];
    return [
      { name: "On Track", value: record.otjhOnTrack, color: STATUS_COLOR["On Track"] },
      { name: "Need Attention", value: record.otjhNeedAttention, color: STATUS_COLOR["Need Attention"] },
      { name: "At Risk", value: record.otjhAtRisk, color: STATUS_COLOR["At Risk"] },
    ].filter((d) => d.value > 0);
  }, [record]);

  // Monthly PR/MCM completion-rate trend, derived from the per-review rows in
  // the drill response. Each review slot counts toward its planned month's
  // "required"; a Completed status also counts toward "completed". This mirrors
  // the backend window definition (rate = completed / planned-in-window), just
  // bucketed by calendar month instead of by rolling 4/8/12-week windows. We
  // cap to the trailing 6 months up to the current month (future-dated, not-yet-
  // due reviews would otherwise drag the rate down artificially).
  const completionTrend = useMemo(() => {
    const rows = drill?.review_rows ?? [];
    if (rows.length === 0) return [];

    type Slot = { req: number; done: number };
    const byMonth = new Map<string, { pr: Slot; mcm: Slot }>();
    for (const r of rows) {
      const ym = r.date?.slice(0, 7); // "YYYY-MM"
      if (!ym || ym.length !== 7) continue;
      let bucket = byMonth.get(ym);
      if (!bucket) {
        bucket = { pr: { req: 0, done: 0 }, mcm: { req: 0, done: 0 } };
        byMonth.set(ym, bucket);
      }
      const slot = r.metric === "MCM" ? bucket.mcm : bucket.pr;
      slot.req += 1;
      if (r.status === "Completed") slot.done += 1;
    }

    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const months = Array.from(byMonth.keys())
      .filter((ym) => ym <= currentYm)
      .sort()
      .slice(-6);

    const label = (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      return `${new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" })} '${String(y).slice(-2)}`;
    };
    const pct = (s: Slot) => (s.req > 0 ? Math.round((s.done / s.req) * 1000) / 10 : null);

    return months.map((ym) => {
      const b = byMonth.get(ym)!;
      return { month: label(ym), PR: pct(b.pr), MCM: pct(b.mcm) };
    });
  }, [drill]);

  const evidenceData = useMemo(() => {
    if (!record) return [];
    return [
      { name: "Today", v: record.evToday ?? 0 },
      { name: "Yest", v: record.evYesterday ?? 0 },
      { name: "-2", v: record.evMinus2 ?? 0 },
      { name: "-3", v: record.evMinus3 ?? 0 },
      { name: "-4", v: record.evMinus4 ?? 0 },
      { name: "-5", v: record.evMinus5 ?? 0 },
      { name: "-6", v: record.evMinus6 ?? 0 },
      { name: "-7", v: record.evMinus7 ?? 0 },
    ];
  }, [record]);

  return (
    <AppShell
      topbarLeft={
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)",
            border: "1px solid var(--color-border)", background: "var(--color-canvas)",
            borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)",
            cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)",
          }}
        >
          <i className="ri-arrow-left-line" aria-hidden="true" /> Back
        </button>
      }
    >
      <div className="page-layout">
        {loading && (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-secondary)" }}>
            <i className="ri-loader-4-line" style={{ fontSize: 32, color: "var(--color-accent)", animation: "spin 1s linear infinite" }} aria-hidden="true" />
            <p style={{ marginTop: "var(--space-3)" }}>Loading coach…</p>
          </div>
        )}

        {error && <div role="alert" style={{ color: "var(--color-danger)" }}>{error}</div>}

        {!loading && !record && (
          <div className="empty-state" style={{ padding: "var(--space-8)" }}>
            <p className="empty-state-title">Coach not found</p>
          </div>
        )}

        {record && (
          <>
            {/* Heading */}
            <div className="page-heading-row">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--color-accent)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)",
                }}>
                  {record.coach.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ margin: 0, color: "var(--color-text-primary)" }}>{record.coach}</h2>
                  <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                    {record.totalLearners} active learners · last submission {record.lastSubDate || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* KPI header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-3)" }}>
              <KpiCard label="Total Learners" value={record.totalLearners} onClick={() => scrollToBreakdown("ALL")} />
              <KpiCard label="Learners Engagement" value={`${record.learnerEngagement}%`} sub={`${record.recentSubmitters} recent submitters`} onClick={() => scrollToBreakdown("RECENT")} />
              <KpiCard label="OTJH At Risk" value={record.otjhAtRisk} sub={`${record.otjhNeedAttention} need attention`} onClick={() => scrollToBreakdown("OTJH")} />
              <KpiCard label="PR 12-Week" value={`${record.prOverallCompletionRate}%`} sub={`${record.prOverallCompleted}/${record.prOverallRequired} completed`} onClick={() => scrollToBreakdown("PR")} />
              <KpiCard label="Evidence Pending" value={record.pending} sub={`${record.evidenceAccepted} accepted`} onClick={() => scrollToBreakdown("PENDING")} />
              <KpiCard label="Referred Closure" value={record.referredClosure} onClick={() => scrollToBreakdown("CLOSURE")} />
              <KpiCard label="MCM 4-Week" value={`${record.mcmCompletionRate4Weeks ?? 0}%`} sub={`${record.mcmCompleted4Weeks ?? 0}/${record.mcmRequired4Weeks ?? 0} completed`} onClick={() => scrollToBreakdown("MCM")} />
            </div>

            {/* Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
              <div className="chart-card" style={{ gridColumn: "span 2" }}>
                <div className="chart-header"><div><h3 className="chart-title">OTJH Breakdown</h3></div></div>
                <div className="chart-body">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={otjhData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label>
                        {otjhData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card" style={{ gridColumn: "span 2" }}>
                <div className="chart-header"><div><h3 className="chart-title">PR &amp; MCM Completion Rate (monthly trend)</h3></div></div>
                <div className="chart-body">
                  {drillLoading && !drill ? (
                    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>
                      <i className="ri-loader-4-line" style={{ fontSize: 24, color: "var(--color-accent)", animation: "spin 1s linear infinite" }} aria-hidden="true" />
                    </div>
                  ) : completionTrend.length === 0 ? (
                    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                      No review data to chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={completionTrend} margin={{ top: 8, right: 12, left: -4, bottom: 4 }}>
                        <CartesianGrid vertical={false} stroke="var(--color-border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />
                        <Tooltip formatter={(value: number | null) => (value == null ? "—" : `${value}%`)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="PR" name="PR" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="MCM" name="MCM" stroke="#0891B2" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-header"><div><h3 className="chart-title">Evidence Submitted (last 7 days)</h3></div></div>
                <div className="chart-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={evidenceData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="v" name="Evidence" fill="#4F46E5" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Learner detail is fetched after the header/KPIs; show a loader
                so we never display an empty "Learners (0)" mid-load. */}
            {drillLoading && !drill && (
              <div className="table-card" style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-secondary)" }}>
                <i className="ri-loader-4-line" style={{ fontSize: 28, color: "var(--color-accent)", animation: "spin 1s linear infinite" }} aria-hidden="true" />
                <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>Loading learner detail…</p>
              </div>
            )}

            {/* Filterable per-learner metric breakdown */}
            {drill && (
              <div
                id="metric-breakdown"
                style={{
                  scrollMarginTop: "var(--space-6)",
                  transition: "box-shadow 0.3s ease, border-color 0.3s ease",
                  borderRadius: "var(--radius-lg)",
                  ...(highlightedSection === "metric-breakdown"
                    ? { boxShadow: "0 0 0 2px var(--color-accent)" }
                    : {}),
                }}
              >
                <MetricBreakdownTable learners={drill.per_learner} reviewRows={drill.review_rows} initialMetric={breakdownMetric} coachName={record.coach} />
              </div>
            )}

          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .kpi-card-clickable:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-raised);
          border-color: var(--color-accent);
        }
        .kpi-card-clickable:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      `}</style>
    </AppShell>
  );
}
