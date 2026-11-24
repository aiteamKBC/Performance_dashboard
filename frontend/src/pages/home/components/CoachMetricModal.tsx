import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CoachRecord } from "@/mocks/dashboard";
import { fetchCoachDrill, type CoachDrill } from "@/services/coachesLateness";
import MetricBreakdownTable from "./MetricBreakdownTable";

export type CoachMetric = "TOTAL" | "ENGAGED" | "PR" | "OTJH" | "PENDING" | "ATTENDANCE";

const METRIC_INFO: Record<CoachMetric, { title: string; description: string }> = {
  TOTAL: { title: "Total Learners", description: "Active and Delivery learners on this coach's LMS caseload." },
  ENGAGED: { title: "Engagement", description: "Learners with LMS learning activity in the last 30 days." },
  PR: { title: "PR Rate", description: "Completed progress reviews divided by reviews due in the last 12 weeks." },
  OTJH: { title: "OTJH Risk", description: "Learners currently in the At Risk OTJH band." },
  PENDING: { title: "Pending Marking", description: "LMS submissions awaiting a tutor review." },
  ATTENDANCE: { title: "Attendance", description: "Average of the available attendance rates for this coach's learners." },
};

function metricValue(record: CoachRecord, metric: CoachMetric): string {
  switch (metric) {
    case "TOTAL": return String(record.totalLearners);
    case "ENGAGED": return `${record.learnerEngagement}%`;
    case "PR": {
      const rate = record.prLmsRate === undefined ? record.prOverallCompletionRate : record.prLmsRate;
      return rate == null ? "—" : `${rate}%`;
    }
    case "OTJH": return String(record.otjhVarAtRisk ?? record.otjhAtRisk);
    case "PENDING": return String(record.pending);
    case "ATTENDANCE": return record.attendanceRate == null ? "—" : `${record.attendanceRate}%`;
  }
}

export default function CoachMetricModal({ record, metric, onClose }: { record: CoachRecord; metric: CoachMetric; onClose: () => void }) {
  const [drill, setDrill] = useState<CoachDrill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchCoachDrill(record.coach, record.caseOwnerId)
      .then((data) => { if (!cancelled) setDrill(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load coach metric details:", err);
          setError(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [record.coach, record.caseOwnerId, retry]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const info = METRIC_INFO[metric];
  return createPortal(
    <div onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "var(--space-4)", background: "rgba(15,22,41,0.5)", backdropFilter: "blur(2px)",
    }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="coach-metric-title" style={{
        width: "min(1120px, 100%)", maxHeight: "calc(100vh - 2 * var(--space-4))",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--color-surface)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-overlay)",
      }}>
        <header style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{record.coach}</p>
            <h2 id="coach-metric-title" style={{ margin: "2px 0", fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>{info.title} · {metricValue(record, metric)}</h2>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>{info.description}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close metric window" style={{
            width: 34, height: 34, flexShrink: 0, cursor: "pointer", border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)", background: "var(--color-surface)", color: "var(--color-text-secondary)",
          }}><i className="ri-close-line" aria-hidden="true" /></button>
        </header>
        <div className="themed-scrollbar" style={{ overflow: "auto", padding: "var(--space-4) var(--space-5)", minHeight: 0 }}>
          {loading && <p style={{ color: "var(--color-text-secondary)" }}>Loading {info.title.toLowerCase()} details…</p>}
          {error && !loading && <div role="alert" style={{ color: "var(--color-danger)" }}>
            Could not load the details. <button type="button" onClick={() => setRetry((n) => n + 1)} className="btn btn--secondary">Retry</button>
          </div>}
          {drill && !loading && !error && <MetricBreakdownTable
            learners={drill.per_learner}
            reviewRows={drill.review_rows}
            pendingRows={drill.pending_marking ?? []}
            initialMetric={metric}
            lockMetric
            initialStatus={metric === "OTJH" ? "At Risk" : "ALL"}
            initialPeriod={metric === "PR" ? "12W" : "ALL"}
            pr12Counts={record.prByLearner?.["12w"]}
            coachName={record.coach}
          />}
        </div>
      </section>
    </div>,
    document.body,
  );
}
