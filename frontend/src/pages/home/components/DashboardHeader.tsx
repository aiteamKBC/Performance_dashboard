/* Topbar content rendered inside AppShell's topbar slots */

interface TopbarLeftProps {
  liveSnapshotDate: string;
}

export function TopbarLeft({ liveSnapshotDate }: TopbarLeftProps) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
        Performance Dashboard
      </h1>
      {liveSnapshotDate && liveSnapshotDate !== "N/A" && (
        <span style={{
          fontSize: "var(--text-xs)",
          color: "var(--color-text-muted)",
          background: "var(--color-canvas)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "2px var(--space-2)",
        }}>
          Snapshot: {liveSnapshotDate}
        </span>
      )}
    </>
  );
}

interface TopbarRightProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeCoach: string;
  onCoachChange: (val: string) => void;
  coaches: string[];
}

export function TopbarRight({ searchQuery, onSearchChange, activeCoach, onCoachChange, coaches }: TopbarRightProps) {
  return (
    <>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <i className="ri-search-line" style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none",
        }} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search associate or coach…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search associates and coaches"
          className="table-search"
          style={{ paddingLeft: 30, minWidth: 200 }}
        />
      </div>

      {/* Coach filter pills */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {["All", ...coaches].map((c) => (
          <button
            key={c}
            onClick={() => onCoachChange(c)}
            className={`pill-filter${activeCoach === c ? " active" : ""}`}
            aria-pressed={activeCoach === c}
          >
            {c}
          </button>
        ))}
      </div>
    </>
  );
}
