// Explains which learners the dashboard counts, so its figures can be read
// against other reports (e.g. the LMS's own coach page, which counts more).
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
        <strong style={{ color: "var(--color-text-primary)" }}>Active learners only.</strong>{" "}
        All figures (learners, engagement, OTJH, PR, MCM, pending) count learners who are{" "}
        <strong>Active</strong> on Aptem, or <strong>Active / Delivery</strong> on the LMS.
        Not counted: on break, onboarding, ready to enrol, entered EPA, withdrawn, completed,
        and test / staff accounts.
      </span>
    </div>
  );
}
