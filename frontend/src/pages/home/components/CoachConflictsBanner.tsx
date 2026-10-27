import { conflictsLabel, type CoachConflict } from "@/mocks/dashboard";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// One system's coach (or status) for the learner. ``counted`` marks the side
// the dashboard's numbers follow (Aptem); ``current`` the coach being viewed.
function CoachChip({ system, coach, current, counted, counts = "Counted" }: {
  system: string; coach: string; current: boolean; counted?: boolean; counts?: string;
}) {
  return (
    <div style={{
      minWidth: 0, flex: "1 1 0",
      display: "flex", flexDirection: "column", gap: 2,
      padding: "6px 10px", borderRadius: "var(--radius-md)",
      background: current ? "var(--color-accent-tint)" : "var(--color-canvas)",
      border: `1px solid ${current ? "var(--color-accent-light)" : "var(--color-border-light)"}`,
    }}>
      <span style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 10, fontWeight: "var(--font-semibold)", letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--color-text-muted)",
      }}>
        {system}
        {counted && (
          <span style={{
            fontSize: 9, letterSpacing: "0.04em", padding: "0 6px", borderRadius: "var(--radius-full)",
            ...(counts === "Counted"
              ? { color: "var(--color-success)", background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }
              : { color: "var(--color-warning)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }),
          }}>
            {counts}
          </span>
        )}
      </span>
      <span style={{
        fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)",
        color: current ? "var(--color-accent)" : "var(--color-text-primary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {coach}
      </span>
    </div>
  );
}

// The learners whose Aptem and LMS records disagree (coach or status), one row each.
export function CoachConflictList({ coachName, conflicts }: { coachName: string; conflicts: CoachConflict[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {conflicts.map((c) => (
        <li
          key={c.email || c.name}
          style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)",
            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
          }}
        >
          {/* Learner */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "1 1 200px", minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--color-accent-tint)", color: "var(--color-accent)",
              fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)",
            }}>
              {initials(c.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </p>
              {c.email && (
                <p title={c.email} style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.email}
                </p>
              )}
            </div>
          </div>

          {/* Aptem coach / status -> LMS coach / status */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 280px", minWidth: 0 }}>
            {c.kind === "status" ? (
              <>
                <CoachChip system="Aptem" coach={c.aptem_status ?? ""} current={false} counted counts="Not counted" />
                <i className="ri-arrow-left-right-line" style={{ color: "var(--color-text-faint)", flexShrink: 0 }} aria-label="differs from" />
                <CoachChip system="LMS" coach={c.lms_status ?? ""} current={false} />
              </>
            ) : (
              <>
                <CoachChip system="Aptem" coach={c.aptem_coach} current={c.aptem_coach === coachName} counted />
                <i className="ri-arrow-left-right-line" style={{ color: "var(--color-text-faint)", flexShrink: 0 }} aria-label="differs from" />
                <CoachChip system="LMS" coach={c.lms_coach} current={c.lms_coach === coachName} />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// How the dashboard treats each conflict kind (banner + modal footer).
export const CONFLICTS_NOTE =
  "Coach conflicts are counted under the Aptem coach; learners Active only on the LMS aren't counted. Update Aptem or the LMS so both systems agree.";

interface CoachConflictsBannerProps {
  coachName: string;
  conflicts: CoachConflict[];
}

// Coach-page banner: the coach's Aptem / LMS conflicts. Coach conflicts are
// counted under the Aptem coach and status conflicts aren't counted, until one
// of the two systems is corrected.
export default function CoachConflictsBanner({ coachName, conflicts }: CoachConflictsBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <section
      role="alert"
      style={{
        background: "var(--color-surface)", border: "1px solid var(--color-warning-border)",
        borderLeft: "4px solid var(--color-warning)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-xs)", padding: "var(--space-4)",
        display: "flex", flexDirection: "column", gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "var(--radius-md)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--color-warning-bg)", color: "var(--color-warning)",
        }}>
          <i className="ri-error-warning-line" style={{ fontSize: 18 }} aria-hidden="true" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
            {conflictsLabel(conflicts)} between Aptem and the LMS
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            {CONFLICTS_NOTE}
          </p>
        </div>
      </div>
      <CoachConflictList coachName={coachName} conflicts={conflicts} />
    </section>
  );
}
