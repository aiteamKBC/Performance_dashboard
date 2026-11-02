import { useMemo } from "react";
import type { ReviewRow } from "@/services/coachesLateness";
import { daysSince, formatDate } from "@/utils/learners";

const METRIC_LABEL: Record<string, string> = { PR: "Progress review", MCM: "Monthly coaching" };

function MeetingsTable({ rows, emptyText, overdue = false }: { rows: ReviewRow[]; emptyText: string; overdue?: boolean }) {
  if (rows.length === 0) {
    return <p style={{ margin: 0, padding: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--color-text-faint)" }}>{emptyText}</p>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>Date</th>
            <th style={{ cursor: "default" }}>Learner</th>
            <th style={{ cursor: "default" }}>Programme</th>
            <th style={{ cursor: "default" }}>Meeting</th>
            <th style={{ cursor: "default" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const age = daysSince(r.date) ?? 0;
            return (
              <tr key={`${r.email}-${r.metric}-${r.date}-${i}`}>
                <td style={{ whiteSpace: "nowrap", fontWeight: "var(--font-semibold)" }}>
                  {formatDate(r.date)}
                  <span style={{ display: "block", fontSize: 11, fontWeight: "var(--font-normal)", color: overdue ? "var(--color-danger)" : "var(--color-text-faint)" }}>
                    {age === 0 ? "Today" : age < 0 ? `in ${-age} days` : `${age} days overdue`}
                  </span>
                </td>
                <td>{r.name}</td>
                <td style={{ color: "var(--color-text-faint)" }}>{r.programme || "—"}</td>
                <td>
                  <span className={r.metric === "PR" ? "badge badge--info" : "badge badge--warning"}>{r.metric}</span>{" "}
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)" }}>{METRIC_LABEL[r.metric]}</span>
                </td>
                <td>{r.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The coach's PR / MCM meetings that aren't completed yet: upcoming ones (today
// onwards) and overdue ones (planned date passed, still not completed).
export default function UpcomingMeetings({ reviewRows }: { reviewRows: ReviewRow[] }) {
  const { upcoming, overdue } = useMemo(() => {
    const open = reviewRows.filter((r) => r.status !== "Completed" && r.date);
    const byDate = (a: ReviewRow, b: ReviewRow) => a.date.localeCompare(b.date);
    return {
      upcoming: open.filter((r) => (daysSince(r.date) ?? 1) <= 0).sort(byDate),
      overdue: open.filter((r) => (daysSince(r.date) ?? 0) > 0).sort((a, b) => byDate(b, a)),
    };
  }, [reviewRows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <section className="table-card">
        <div className="table-toolbar">
          <h3 className="chart-title" style={{ margin: 0 }}>Upcoming meetings</h3>
          <span className="badge badge--info">{upcoming.length}</span>
        </div>
        <MeetingsTable rows={upcoming} emptyText="No upcoming progress reviews or monthly coaching meetings." />
      </section>
      <section className="table-card">
        <div className="table-toolbar">
          <h3 className="chart-title" style={{ margin: 0 }}>Overdue — not completed</h3>
          <span className="badge badge--danger">{overdue.length}</span>
        </div>
        <MeetingsTable rows={overdue} emptyText="Nothing overdue." overdue />
      </section>
    </div>
  );
}
