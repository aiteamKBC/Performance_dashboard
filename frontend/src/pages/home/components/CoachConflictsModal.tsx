import { useEffect } from "react";
import { conflictsLabel, type CoachConflict } from "@/mocks/dashboard";
import { CONFLICTS_NOTE, CoachConflictList } from "./CoachConflictsBanner";

interface CoachConflictsModalProps {
  coachName: string;
  conflicts: CoachConflict[];
  onClose: () => void;
}

// Popup listing a coach's Aptem / LMS conflicts (opened from the card badge).
export default function CoachConflictsModal({ coachName, conflicts, onClose }: CoachConflictsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = conflicts.length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,22,41,0.5)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-4)", zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-conflicts-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-overlay)", width: "min(680px, 100%)",
          maxHeight: "calc(100vh - 2 * var(--space-4))",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-5) var(--space-5) var(--space-4)" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--radius-lg)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--color-warning-bg)", color: "var(--color-warning)",
            border: "1px solid var(--color-warning-border)",
          }}>
            <i className="ri-git-merge-line" style={{ fontSize: 20 }} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <h2 id="coach-conflicts-title" style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
                Aptem / LMS conflicts
              </h2>
              <span className="tabular-nums" style={{
                fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)",
                padding: "1px 8px", borderRadius: "var(--radius-full)",
                color: "var(--color-warning)", background: "var(--color-warning-bg)",
                border: "1px solid var(--color-warning-border)",
              }}>
                {count}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
              {coachName} · {conflictsLabel(conflicts)}: {count > 1 ? "these learners have" : "this learner has"} a different coach or status on Aptem and on the LMS.
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 32, height: 32, flexShrink: 0, borderRadius: "var(--radius-md)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text-secondary)", cursor: "pointer",
            }}
          >
            <i className="ri-close-line" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Learners */}
        <div style={{
          padding: "var(--space-4) var(--space-5)", overflowY: "auto",
          background: "var(--color-canvas)",
          borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)",
        }}>
          <CoachConflictList coachName={coachName} conflicts={conflicts} />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
          flexWrap: "wrap", padding: "var(--space-3) var(--space-5)",
        }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            <i className="ri-information-line" aria-hidden="true" />
            {CONFLICTS_NOTE}
          </p>
          <button type="button" onClick={onClose} className="btn btn--secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
