// Matches the LMS All Learners population and pending-marking queue.
export default function ActiveLearnersNote() {
  return (
    <div
      role="note"
      style={{
        display: "flex", alignItems: "flex-start", gap: "var(--space-2)",
        background: "var(--color-canvas)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", lineHeight: 1.5,
      }}
    >
      <i className="ri-information-line" style={{ fontSize: 16, color: "var(--color-accent)", flexShrink: 0 }} aria-hidden="true" />
      <span>
        <strong style={{ color: "var(--color-text-primary)" }}>LMS coach caseload.</strong>{" "}
        Total Learners follows the LMS coach caseload and includes only learners with
        programme status Active or Delivery. Learners on break, onboarding, withdrawn,
        completed and EPA stages are excluded.
        Pending Marking follows the full LMS marking queue: all activity types awaiting tutor review or escalated, including owned profiles outside this active caseload.
      </span>
    </div>
  );
}
