import { useEffect, useState } from "react";
import { fetchCoachDrill, type CoachDrill } from "@/services/coachesLateness";

interface CoachDrillDrawerProps {
  coach: string | null;
  caseOwnerId?: number | null;
  onClose: () => void;
}

export default function CoachDrillDrawer({ coach, caseOwnerId, onClose }: CoachDrillDrawerProps) {
  const [drill, setDrill] = useState<CoachDrill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const open = coach !== null;

  useEffect(() => {
    if (!open || !coach) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDrill(null);
    setActiveSection(null);
    fetchCoachDrill(coach, caseOwnerId)
      .then((data) => {
        if (cancelled) return;
        setDrill(data);
        setActiveSection(data.sections.find((s) => s.count > 0)?.key ?? data.sections[0]?.key ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load coach drill:", err);
        setError("Failed to load learner details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, coach, caseOwnerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = drill?.sections.find((s) => s.key === activeSection) ?? null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)",
          zIndex: 60,
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={`Learner details for ${coach}`}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(560px, 92vw)",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-raised)",
          zIndex: 61, display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-4) var(--space-5)",
          borderBottom: "1px solid var(--color-border)",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Learner Breakdown
            </p>
            <h2 style={{ margin: "2px 0 0", fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
              {coach}
            </h2>
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
            <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>Loading learners…</p>
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: "var(--space-5)", color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
            {error}
          </div>
        )}

        {drill && !loading && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* Section list */}
            <nav style={{
              width: 200, flexShrink: 0, overflowY: "auto",
              borderRight: "1px solid var(--color-border)",
              padding: "var(--space-2)",
            }} className="themed-scrollbar">
              {drill.sections.map((s) => {
                const isActive = s.key === activeSection;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", gap: "var(--space-2)", textAlign: "left",
                      padding: "var(--space-2) var(--space-3)",
                      marginBottom: 2, borderRadius: "var(--radius-md)",
                      border: "none", cursor: "pointer",
                      background: isActive ? "var(--color-accent-tint)" : "transparent",
                      color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                      fontSize: "var(--text-xs)", fontWeight: isActive ? "var(--font-semibold)" : "var(--font-normal)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                    <span className="badge" style={{
                      background: "var(--color-canvas)", color: "var(--color-text-muted)",
                      fontSize: 10, padding: "1px 6px", borderRadius: 999, flexShrink: 0,
                    }}>{s.count}</span>
                  </button>
                );
              })}
            </nav>

            {/* Learner list for active section */}
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4) var(--space-5)" }} className="themed-scrollbar">
              {active && (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                    <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>{active.label}</h3>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{active.count} learner{active.count === 1 ? "" : "s"}</span>
                  </div>

                  {active.learners.length === 0 ? (
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No learners in this group.</p>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {active.learners.map((l, i) => (
                        <li
                          key={`${l.name}-${i}`}
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
                          {l.detail && (
                            <span className="tabular-nums" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", flexShrink: 0 }}>{l.detail}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
