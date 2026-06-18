import { useEffect, useState } from "react";
import { fetchAttendanceDrill, type AttendanceDrill } from "@/services/attendance";

export interface CoachWeekSelection {
  coachName: string;
  year?: number;
  weekNumber?: number;
  label?: string;
  weekStart?: string;
  weekEnd?: string;
}

interface CoachWeekDrawerProps {
  selection: CoachWeekSelection | null;
  onClose: () => void;
}

const formatRange = (start?: string, end?: string) => {
  if (!start || !end) return "";
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
};

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  attended: { label: "Attended", bg: "var(--color-success-bg)", color: "var(--color-success)" },
  absent: { label: "Absent", bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  partial: { label: "Partial", bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  "no-session": { label: "No session", bg: "var(--color-canvas)", color: "var(--color-text-muted)" },
};

function StatusPill({ status, attended, absent }: { status: string; attended: number; absent: number }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE["no-session"];
  const counted = attended + absent;
  const detail = counted > 1 ? ` ${attended}/${counted}` : "";
  return (
    <span className="badge" style={{ background: s.bg, color: s.color, flexShrink: 0, whiteSpace: "nowrap" }}>
      {s.label}{detail}
    </span>
  );
}

export default function CoachWeekDrawer({ selection, onClose }: CoachWeekDrawerProps) {
  const open = selection !== null;
  const [drill, setDrill] = useState<AttendanceDrill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !selection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDrill(null);
    fetchAttendanceDrill(selection.coachName, selection.year, selection.weekNumber)
      .then((data) => {
        if (!cancelled) setDrill(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load attendance drill:", err);
        setError("Failed to load attendance records for this week.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !selection) return null;

  const ratio = drill?.ratio ?? 0;
  const ratioColor = ratio === 0 ? "var(--color-success)"
    : ratio < 15 ? "var(--color-success)"
    : ratio < 25 ? "var(--color-warning)"
    : "var(--color-danger)";

  const attendedStudents = drill?.learners.filter((l) => l.status === "attended").length ?? 0;
  const absentStudents = drill?.learners.filter((l) => l.status === "absent" || l.status === "partial").length ?? 0;
  const rangeText = formatRange(
    drill?.weekStart ?? selection.weekStart,
    drill?.weekEnd ?? selection.weekEnd,
  );
  const weekLabel = drill?.label ?? selection.label ?? "";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 60 }} />

      <aside
        role="dialog"
        aria-label={`Weekly attendance for ${selection.coachName}`}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(540px, 94vw)",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-raised)",
          zIndex: 61, display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--color-border)",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Weekly Attendance {weekLabel && `· ${weekLabel}`}
            </p>
            <h2 style={{ margin: "2px 0 0", fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
              {selection.coachName}
            </h2>
            {rangeText && (
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                {rangeText}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "1px solid var(--color-border)", background: "var(--color-canvas)",
              borderRadius: "var(--radius-md)", width: 32, height: 32, cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>

        {loading && (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-secondary)" }}>
            <i className="ri-loader-4-line" style={{ fontSize: 28, color: "var(--color-accent)", animation: "spin 1s linear infinite" }} aria-hidden="true" />
            <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>Loading attendance…</p>
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: "var(--space-5)", color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
            {error}
          </div>
        )}

        {drill && !loading && (
          <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5)" }} className="themed-scrollbar">
            {/* Summary strip */}
            <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
              <div style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center", background: "var(--color-canvas)" }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Absence</p>
                <p className="tabular-nums" style={{ margin: "4px 0 0", fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: ratioColor }}>
                  {ratio.toFixed(ratio < 10 ? 2 : 1)}%
                </p>
              </div>
              <div style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center", background: "var(--color-canvas)" }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Attended</p>
                <p className="tabular-nums" style={{ margin: "4px 0 0", fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: "var(--color-success)" }}>
                  {attendedStudents}
                </p>
              </div>
              <div style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center", background: "var(--color-canvas)" }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Absent</p>
                <p className="tabular-nums" style={{ margin: "4px 0 0", fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: "var(--color-danger)" }}>
                  {absentStudents}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
                Students
              </h3>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                {drill.learners.length} active · absent first
              </span>
            </div>

            {drill.learners.length === 0 ? (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No active learners for this coach.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {drill.learners.map((l) => (
                  <li
                    key={l.id}
                    title={l.sessions.map((s) => `${s.date}: ${s.status}${s.module ? ` (${s.module})` : ""}`).join("\n") || "No session this week"}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: "var(--space-3)", padding: "var(--space-2) 0",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</p>
                      {l.email && (
                        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.email}</p>
                      )}
                    </div>
                    <StatusPill status={l.status} attended={l.attended} absent={l.absent} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
