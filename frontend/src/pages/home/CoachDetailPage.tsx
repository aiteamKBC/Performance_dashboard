import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import type { CoachRecord } from "@/mocks/dashboard";
import {
  fetchCoachesLateness, fetchCoachDrill,
  type CoachDrill, type DrillLearnerRow,
} from "@/services/coachesLateness";
import AppShell from "@/components/AppShell";

const STATUS_COLOR: Record<string, string> = {
  "On Track": "#16A34A",
  "Need Attention": "#D97706",
  "At Risk": "#DC2626",
  Completed: "#16A34A",
  Scheduled: "#0891B2",
  "In Progress": "#4F46E5",
  "Not Scheduled": "#DC2626",
};

function statusPill(value: string) {
  const color = STATUS_COLOR[value] ?? "var(--color-text-muted)";
  if (!value) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, color, background: `${color}1a`,
      whiteSpace: "nowrap",
    }}>{value}</span>
  );
}

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

type LearnerSortKey = keyof DrillLearnerRow;

export default function CoachDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CoachRecord | null>(null);
  const [drill, setDrill] = useState<CoachDrill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<LearnerSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  // Scroll to a per-metric breakdown card and briefly highlight it.
  const scrollToSection = (sectionKey: string) => {
    const el = document.getElementById(`section-${sectionKey}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedSection(sectionKey);
    window.setTimeout(() => {
      setHighlightedSection((cur) => (cur === sectionKey ? null : cur));
    }, 1600);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const all = await fetchCoachesLateness();
        const rec = all.find((r) => String(r.id) === String(id)) ?? null;
        if (cancelled) return;
        setRecord(rec);
        if (rec) {
          const d = await fetchCoachDrill(rec.coach, rec.caseOwnerId);
          if (!cancelled) setDrill(d);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load coach detail:", err);
          setError("Failed to load coach details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
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

  const prData = useMemo(() => {
    if (!record) return [];
    return [
      { name: "4-Week", Required: record.prRequired4Weeks, Completed: record.prCompleted4Weeks },
      { name: "8-Week", Required: record.prRequired8Weeks, Completed: record.prCompleted8Weeks },
      { name: "Overall", Required: record.prOverallRequired, Completed: record.prOverallCompleted },
    ];
  }, [record]);

  const mcmData = useMemo(() => {
    if (!record) return [];
    return [
      { name: "4-Week", Required: record.mcmRequired4Weeks ?? 0, Completed: record.mcmCompleted4Weeks ?? 0 },
      { name: "8-Week", Required: record.mcmRequired8Weeks ?? 0, Completed: record.mcmCompleted8Weeks ?? 0 },
      { name: "12-Week", Required: record.mcmRequired12Weeks ?? 0, Completed: record.mcmCompleted12Weeks ?? 0 },
    ];
  }, [record]);

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

  const sortedLearners = useMemo(() => {
    if (!drill) return [];
    const rows = [...drill.per_learner];
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [drill, sortKey, sortDir]);

  const handleSort = (key: LearnerSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const headerCell = (key: LearnerSortKey, label: string) => (
    <th
      scope="col"
      onClick={() => handleSort(key)}
      style={{
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: "left",
        padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)",
        color: sortKey === key ? "var(--color-accent)" : "var(--color-text-muted)",
        background: "var(--color-canvas)",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}
    >
      {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

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
              <KpiCard label="Total Learners" value={record.totalLearners} onClick={() => scrollToSection("learners")} />
              <KpiCard label="Engagement" value={`${record.learnerEngagement}%`} sub={`${record.recentSubmitters} recent submitters`} onClick={() => scrollToSection("recent_submitters")} />
              <KpiCard label="OTJH At Risk" value={record.otjhAtRisk} sub={`${record.otjhNeedAttention} need attention`} onClick={() => scrollToSection("otjh_at_risk")} />
              <KpiCard label="PR 12-Week" value={`${record.prOverallCompletionRate}%`} sub={`${record.prOverallCompleted}/${record.prOverallRequired} completed`} onClick={() => scrollToSection("pr_required")} />
              <KpiCard label="Evidence Pending" value={record.pending} sub={`${record.referredClosure} referred closure`} onClick={() => scrollToSection("pending")} />
              <KpiCard label="MCM 4-Week" value={`${record.mcmCompletionRate4Weeks ?? 0}%`} sub={`${record.mcmCompleted4Weeks ?? 0}/${record.mcmRequired4Weeks ?? 0} completed`} onClick={() => scrollToSection("mcm_completed")} />
              <KpiCard label="MCM 8-Week" value={`${record.mcmCompletionRate8Weeks ?? 0}%`} sub={`${record.mcmCompleted8Weeks ?? 0}/${record.mcmRequired8Weeks ?? 0} completed`} onClick={() => scrollToSection("mcm_completed")} />
              <KpiCard label="MCM 12-Week" value={`${record.mcmCompletionRate12Weeks ?? 0}%`} sub={`${record.mcmCompleted12Weeks ?? 0}/${record.mcmRequired12Weeks ?? 0} completed`} onClick={() => scrollToSection("mcm_required")} />
            </div>

            {/* Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
              <div className="chart-card">
                <div className="chart-header"><div><h3 className="chart-title">OTJH Breakdown</h3></div></div>
                <div className="chart-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={otjhData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                        {otjhData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-header"><div><h3 className="chart-title">PR Required vs Completed</h3></div></div>
                <div className="chart-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={prData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Required" fill="#94A3B8" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Completed" fill="#16A34A" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-header"><div><h3 className="chart-title">MCM Required vs Completed</h3></div></div>
                <div className="chart-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={mcmData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Required" fill="#94A3B8" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Completed" fill="#0891B2" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
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

            {/* Full learner table */}
            <div className="table-card">
              <div className="table-toolbar">
                <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
                  Learners ({drill?.per_learner.length ?? 0})
                </h2>
              </div>
              <div className="table-scroll themed-scrollbar">
                <table className="data-table">
                  <thead>
                    <tr>
                      {headerCell("name", "Learner")}
                      {headerCell("programme", "Programme")}
                      {headerCell("otjh_status", "OTJH")}
                      {headerCell("pending", "Pending")}
                      {headerCell("referred_closure", "Ref Closure")}
                      {headerCell("total_evidence", "Total Ev")}
                      {headerCell("last_sub", "Last Sub")}
                      {headerCell("pr_status", "PR Status")}
                      {headerCell("pr_date", "PR Date")}
                      {headerCell("mcm_status", "MCM Status")}
                      {headerCell("mcm_date", "MCM Date")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLearners.map((l, i) => (
                      <tr key={`${l.email}-${i}`} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                        <th scope="row" style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", fontWeight: "var(--font-medium)", color: "var(--color-text-primary)", fontSize: "var(--text-xs)" }}>
                          {l.name}
                          {l.email && <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 400 }}>{l.email}</div>}
                        </th>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{l.programme || "—"}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusPill(l.otjh_status)}</td>
                        <td className="num tabular-nums" style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>{l.pending}</td>
                        <td className="num tabular-nums" style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>{l.referred_closure}</td>
                        <td className="num tabular-nums" style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>{l.total_evidence}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{l.last_sub || "—"}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusPill(l.pr_status)}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{l.pr_date || "—"}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusPill(l.mcm_status)}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{l.mcm_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-metric learner lists */}
            {drill && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
                {drill.sections.map((s) => (
                  <div
                    key={s.key}
                    id={`section-${s.key}`}
                    className="chart-card"
                    style={{
                      scrollMarginTop: "var(--space-6)",
                      transition: "box-shadow 0.3s ease, border-color 0.3s ease",
                      ...(highlightedSection === s.key
                        ? { boxShadow: "0 0 0 2px var(--color-accent)", borderColor: "var(--color-accent)" }
                        : {}),
                    }}
                  >
                    <div className="chart-header">
                      <div>
                        <h3 className="chart-title">{s.label}</h3>
                        <p className="chart-subtitle">{s.count} learner{s.count === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="chart-body" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {s.learners.length === 0 ? (
                        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>None</p>
                      ) : (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                          {s.learners.map((l, i) => (
                            <li key={`${l.name}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", padding: "3px 0", fontSize: "var(--text-xs)", borderBottom: "1px solid var(--color-border)" }}>
                              <span style={{ color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                              {l.detail && <span className="tabular-nums" style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{l.detail}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
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
