import { useEffect } from "react";
import type { DrillLearnerRow, ReviewRow } from "@/services/coachesLateness";
import { formatDate, lmsProfileUrl, toLearnerView } from "@/utils/learners";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", overflowWrap: "anywhere" }}>{value || "—"}</p>
    </div>
  );
}

// "View" popup for one learner on the coach page: programme, OTJH, evidence,
// and every PR / MCM review on record.
export default function LearnerViewModal({ learner, reviewRows, onClose }: {
  learner: DrillLearnerRow;
  reviewRows: ReviewRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const v = toLearnerView(learner);
  const key = learner.email.toLowerCase();
  const reviews = reviewRows
    .filter((r) => (key ? r.email.toLowerCase() === key : r.name === learner.name))
    .sort((a, b) => b.date.localeCompare(a.date));
  const profile = lmsProfileUrl(learner);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={learner.name}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,22,41,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-overlay)",
          width: "min(720px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--color-border)",
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-bold)", color: "var(--color-lms-purple)" }}>{learner.name}</h2>
            <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-faint)", overflowWrap: "anywhere" }}>
              {learner.email} · {learner.programme || "—"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
            {profile && (
              <a className="btn btn--secondary" href={profile} target="_blank" rel="noreferrer">View Profile</a>
            )}
            <button type="button" onClick={onClose} className="btn btn--secondary" aria-label="Close" style={{ padding: "var(--space-1) var(--space-2)" }}>
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={{ padding: "var(--space-5)", overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-4)" }}>
            <Field label="Status" value={learner.status} />
            <Field label="Cohort / group" value={learner.group || learner.cohort} />
            <Field label="Start date" value={formatDate(learner.start_date)} />
            <Field label="Last activity" value={formatDate(learner.last_activity)} />
            <Field label="OTJH" value={v.otjhPct == null ? "—" : `${Math.round(v.otjhPct)}% · ${v.otjhBand}`} />
            <Field label="OTJH hours" value={`${learner.completed ?? "—"}h / ${v.targetHours ?? "—"}h`} />
            <Field label="Progress variance" value={learner.otjh_progress_variance} />
            <Field label="Activities" value={learner.activities_total ? `${learner.activities_done} / ${learner.activities_total}` : "—"} />
            <Field label="Attendance" value={learner.attendance_total ? `${learner.attendance_done} / ${learner.attendance_total}` : "—"} />
            <Field label="Evidence pending" value={String(learner.pending)} />
            <Field label="Referred closure" value={String(learner.referred_closure)} />
            <Field label="Total evidence" value={String(learner.total_evidence)} />
          </div>

          <div>
            <h3 className="chart-title" style={{ margin: "0 0 var(--space-2)" }}>Reviews ({reviews.length})</h3>
            {reviews.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-faint)" }}>No PR or MCM reviews on record.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ cursor: "default" }}>Date</th>
                      <th style={{ cursor: "default" }}>Type</th>
                      <th style={{ cursor: "default" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r, i) => (
                      <tr key={`${r.metric}-${r.date}-${i}`}>
                        <td>{formatDate(r.date)}</td>
                        <td><span className={r.metric === "PR" ? "badge badge--info" : "badge badge--warning"}>{r.metric}</span></td>
                        <td>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
