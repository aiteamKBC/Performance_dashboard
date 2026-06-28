import { useEffect, useState } from "react";
import {
  fetchActionPlans, createActionPlan, deleteActionPlan, type ActionPlan,
} from "@/services/coachesLateness";

interface Props {
  coachName: string;
  caseOwnerId?: number | null;
  onClose: () => void;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box" as const,
  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
  background: "var(--color-canvas)", padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-sm)", color: "var(--color-text-primary)", outline: "none",
};

const labelStyle = {
  display: "flex", flexDirection: "column" as const, gap: 4,
  fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 600,
};

// ISO-8601 week number (Monday-based) for a "YYYY-MM-DD" string.
function isoWeekNumber(iso: string): number | null {
  const date = new Date(iso + "T00:00:00");
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  // Shift to the Thursday of this week (ISO weeks are Thursday-anchored).
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(
    ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
  );
}

// "2026-06-27 (W26)" — saved date with its ISO week number next to it.
function formatSavedDate(iso: string | null): string {
  if (!iso) return "";
  const w = isoWeekNumber(iso);
  return w ? `${iso} (W${w})` : iso;
}

export default function ActionPlanModal({ coachName, caseOwnerId, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [creator, setCreator] = useState("");
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ActionPlan | null>(null);   // detail popup
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActionPlans(coachName)
      .then((data) => { if (!cancelled) setPlans(data); })
      .catch(() => { if (!cancelled) setPlans([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coachName]);

  // Close on Escape — the detail popup first, then the main modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);

  const canSave = title.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createActionPlan({
        coach: coachName, title: title.trim(), notes: notes.trim(),
        creator: creator.trim(), caseOwnerId,
      });
      setPlans((prev) => [created, ...prev]);
      setTitle("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the action plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selected || exporting) return;
    setExporting(true);
    setDetailError(null);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxW = pageW - margin * 2;
      const dateStr = new Date().toLocaleDateString();
      const docTitle = `${coachName} - Action Plan - ${dateStr}`;
      doc.setProperties({ title: docTitle });

      let y = margin;
      // Header: coach name + date
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(15, 22, 41);
      doc.text(`${coachName} — Action Plan`, margin, y);
      y += 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90, 100, 128);
      doc.text(dateStr, margin, y);
      y += 30;

      // Plan title
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(15, 22, 41);
      const titleLines = doc.splitTextToSize(selected.title, maxW);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 18 + 10;

      // Notes
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(40, 48, 70);
      const noteLines = doc.splitTextToSize(selected.notes || "No notes.", maxW);
      const lineH = 16;
      for (const line of noteLines) {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += lineH;
      }

      const slug = (coachName || "coach").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      const dateSlug = new Date().toISOString().slice(0, 10);
      doc.save(`${slug}-action-plan-${dateSlug}.pdf`);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to export the PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    setDetailError(null);
    try {
      await deleteActionPlan(selected.id);
      setPlans((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to delete the action plan.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,22,41,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "var(--space-6)", zIndex: 1000, overflowY: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Action plans for ${coachName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)", width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 2 * var(--space-6))", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-4)", borderBottom: "1px solid var(--color-border)",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
              Action Plan
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{coachName}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn--secondary" aria-label="Close" style={{ padding: "var(--space-1) var(--space-2)" }}>
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <label style={labelStyle}>
            Title
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Action plan title" style={inputStyle} maxLength={200} autoFocus
            />
          </label>
          <label style={labelStyle}>
            Notes
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes…" rows={5} style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <label style={labelStyle}>
            Created by
            <input
              type="text" value={creator} onChange={(e) => setCreator(e.target.value)}
              placeholder="Your name" style={inputStyle} maxLength={120}
            />
          </label>

          {error && <p role="alert" style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <button type="button" onClick={onClose} className="btn btn--secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={!canSave} className="btn btn--primary">
              {saving ? "Saving…" : "Save action plan"}
            </button>
          </div>
        </div>

        {/* Existing plans */}
        <div style={{ padding: "0 var(--space-4) var(--space-4)", overflowY: "auto" }}>
          <p style={{ margin: "var(--space-2) 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Saved plans
          </p>
          {loading ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>Loading…</p>
          ) : plans.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No action plans yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setDetailError(null); setSelected(p); }}
                  title="Open action plan"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)",
                    width: "100%", textAlign: "left", cursor: "pointer",
                    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                    padding: "var(--space-3)", background: "var(--color-canvas)",
                    fontSize: "var(--text-sm)", color: "var(--color-text-primary)", fontWeight: 600,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title}
                    {(p.creator_name || p.saved_date) && (
                      <span style={{ marginLeft: "var(--space-2)", fontSize: 11, fontWeight: 400, color: "var(--color-text-muted)" }}>
                        {[p.creator_name, formatSavedDate(p.saved_date)].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <i className="ri-arrow-right-s-line" aria-hidden="true" style={{ color: "var(--color-text-muted)" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail popup for one plan, with delete */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,22,41,0.45)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "var(--space-6)", zIndex: 1001, overflowY: "auto",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-surface)", borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)", width: "min(520px, 100%)",
              maxHeight: "calc(100vh - 2 * var(--space-6))", display: "flex", flexDirection: "column",
            }}
          >
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)",
              padding: "var(--space-4)", borderBottom: "1px solid var(--color-border)",
            }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)" }}>
                  {selected.title}
                </h2>
                {(selected.creator_name || selected.saved_date) && (
                  <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                    {[selected.creator_name, formatSavedDate(selected.saved_date)].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setSelected(null)} className="btn btn--secondary" aria-label="Close" style={{ padding: "var(--space-1) var(--space-2)" }}>
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </div>

            <div style={{ padding: "var(--space-4)", overflowY: "auto" }}>
              {selected.notes
                ? <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>{selected.notes}</p>
                : <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No notes.</p>}
              {detailError && <p role="alert" style={{ margin: "var(--space-3) 0 0", color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>{detailError}</p>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", padding: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
              <button type="button" onClick={() => setSelected(null)} className="btn btn--secondary">Close</button>
              <button type="button" onClick={handleExportPdf} disabled={exporting} className="btn btn--secondary" title="Save this action plan as a PDF">
                <i className="ri-file-pdf-2-line" aria-hidden="true" /> {exporting ? "Saving…" : "Save as PDF"}
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="btn btn--danger">
                <i className="ri-delete-bin-line" aria-hidden="true" /> {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
