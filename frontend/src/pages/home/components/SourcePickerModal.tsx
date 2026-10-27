import { useEffect } from "react";
import type { LearnerSource } from "@/services/coachesLateness";

interface SourcePickerModalProps {
  coachName: string;
  /** Learner counts per source, shown on each option. */
  counts: Record<LearnerSource, number>;
  onPick: (source: LearnerSource) => void;
  onClose: () => void;
}

const OPTIONS: { source: LearnerSource; label: string; hint: string; icon: string }[] = [
  { source: "aptem", label: "APTEM learners", hint: "Active learners on Aptem", icon: "ri-database-2-line" },
  { source: "lms", label: "LMS learners", hint: "Active & Delivery learners on the new LMS", icon: "ri-graduation-cap-line" },
];

// Asks which learner source to open a coach's detail page with.
export default function SourcePickerModal({ coachName, counts, onPick, onClose }: SourcePickerModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,22,41,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-6)", zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose learners for ${coachName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)", width: "min(440px, 100%)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-4)", borderBottom: "1px solid var(--color-border)",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
              Which learners?
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{coachName}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn--secondary" aria-label="Close" style={{ padding: "var(--space-1) var(--space-2)" }}>
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>

        {/* Options */}
        <div style={{ padding: "var(--space-4)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          {OPTIONS.map((o) => {
            const count = counts[o.source] ?? 0;
            const disabled = count === 0;
            return (
              <button
                key={o.source}
                type="button"
                disabled={disabled}
                onClick={() => onPick(o.source)}
                title={disabled ? `No ${o.label} for this coach` : `Open ${o.label}`}
                style={{
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  background: "var(--color-canvas)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--space-4)",
                  display: "flex", flexDirection: "column", gap: "var(--space-1)",
                  transition: "border-color .15s, box-shadow .15s",
                }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              >
                <i className={o.icon} style={{ fontSize: 22, color: "var(--color-accent)" }} aria-hidden="true" />
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>{o.label}</span>
                <span className="tabular-nums" style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--color-text-primary)" }}>{count}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
