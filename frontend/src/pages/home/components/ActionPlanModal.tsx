import { useEffect, useRef, useState } from "react";
import {
  fetchActionPlans, createActionPlan, deleteActionPlan, fetchActionPlanFile,
  type ActionPlan,
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

// Largest file we'll attach, in bytes. Kept below the backend's data-URL cap
// (base64 inflates by ~33%, so 100 MB raw ≈ 133 MB encoded < the backend limit).
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

// Read a File into a base64 data URL, with the original filename preserved as a
// `name=` media-type parameter (e.g. "data:application/pdf;name=plan.pdf;base64,…")
// so it can be recovered on download. The backend stores this string verbatim.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result); // "data:<mime>;base64,<…>"
      const encodedName = encodeURIComponent(file.name);
      const withName = result.replace(/^data:([^;,]*)/, `data:$1;name=${encodedName}`);
      resolve(withName);
    };
    reader.readAsDataURL(file);
  });
}

// Recover the original filename from a data URL's `name=` parameter (falls back
// to a generic name if absent).
function dataUrlFilename(dataUrl: string): string {
  const m = dataUrl.match(/^data:[^;,]*;name=([^;,]+)/);
  return m ? decodeURIComponent(m[1]) : "attachment";
}

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
  // The create form offers either a free-text note or a file attachment — the
  // user picks one via a segmented toggle. Only the selected input is shown.
  const [mode, setMode] = useState<"note" | "file">("note");
  // Pending attachment for the create form: filename + base64 data URL.
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ActionPlan | null>(null);   // detail popup
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Cache of attachment data URLs by plan id, so a file just uploaded (or
  // downloaded once) doesn't have to be refetched. Attachments are fetched on
  // demand — the list/detail responses only carry a has_attachment flag.
  const fileCache = useRef<Map<number, string>>(new Map());

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

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`"${file.name}" is too large. The maximum attachment size is 100 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachment({ name: file.name, dataUrl });
    } catch {
      setError("Could not read the selected file.");
    }
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const uploadedDataUrl = mode === "file" ? (attachment?.dataUrl ?? null) : null;
      const created = await createActionPlan({
        coach: coachName, title: title.trim(),
        // Only the input for the active mode is submitted.
        notes: mode === "note" ? notes.trim() : "",
        creator: creator.trim(), caseOwnerId,
        attachedFile: uploadedDataUrl,
      });
      // Seed the cache so this just-uploaded file downloads instantly without a
      // round-trip back to the server.
      if (uploadedDataUrl) fileCache.current.set(created.id, uploadedDataUrl);
      setPlans((prev) => [created, ...prev]);
      setTitle("");
      setNotes("");
      clearAttachment();
      setMode("note");
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

  // Download the selected plan's attachment. The blob isn't loaded with the
  // list/detail metadata, so fetch it on demand (unless it's already cached),
  // then convert to a Blob URL and trigger a download with the original
  // filename — more reliable across browsers than a huge href.
  const handleDownloadAttachment = async () => {
    if (!selected || downloading) return;
    setDetailError(null);
    setDownloading(true);
    try {
      let dataUrl = fileCache.current.get(selected.id) ?? null;
      if (!dataUrl) {
        dataUrl = await fetchActionPlanFile(selected.id);
        if (dataUrl) fileCache.current.set(selected.id, dataUrl);
      }
      if (!dataUrl) {
        setDetailError("This attachment could not be found.");
        return;
      }
      const name = dataUrlFilename(dataUrl);
      // Split "data:<mime>[;params],<base64>" into its mime + payload.
      const comma = dataUrl.indexOf(",");
      const header = dataUrl.slice(5, comma); // after "data:"
      const mime = header.split(";")[0] || "application/octet-stream";
      const base64 = dataUrl.slice(comma + 1);
      const bytes = atob(base64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const blob = new Blob([buf], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setDetailError("Could not open the attachment.");
    } finally {
      setDownloading(false);
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
          {/* Choose to add either a note or a file attachment. */}
          <div style={labelStyle}>
            Add
            <div
              role="tablist"
              aria-label="Add a note or a file"
              style={{
                display: "inline-flex", alignSelf: "flex-start", gap: 2, padding: 3,
                borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                background: "var(--color-canvas)",
              }}
            >
              {([
                { key: "note", label: "Note", icon: "ri-file-text-line" },
                { key: "file", label: "File", icon: "ri-attachment-2" },
              ] as const).map((opt) => {
                const active = mode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setMode(opt.key); setError(null); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                      padding: "var(--space-1) var(--space-3)", borderRadius: "calc(var(--radius-md) - 2px)",
                      border: "none", fontSize: "var(--text-sm)", fontWeight: 600,
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "#fff" : "var(--color-text-secondary)",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    <i className={opt.icon} aria-hidden="true" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "note" ? (
            <label style={labelStyle}>
              Notes
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes…" rows={5} style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          ) : (
            <div style={labelStyle}>
              Attachment <span style={{ fontWeight: 400, textTransform: "none" }}>(max 100 MB)</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handlePickFile}
                style={{ display: "none" }}
              />
              {attachment ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: "var(--space-2)",
                  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                  background: "var(--color-canvas)", padding: "var(--space-2) var(--space-3)",
                  fontSize: "var(--text-sm)", color: "var(--color-text-primary)", fontWeight: 400,
                }}>
                  <i className="ri-attachment-2" aria-hidden="true" style={{ color: "var(--color-accent)" }} />
                  <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachment.name}</span>
                  <button
                    type="button" onClick={() => fileInputRef.current?.click()}
                    className="btn btn--secondary" title="Choose a different file"
                    style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                  >
                    Replace
                  </button>
                  <button
                    type="button" onClick={clearAttachment}
                    title="Remove attachment" aria-label="Remove attachment"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0, display: "inline-flex" }}
                  >
                    <i className="ri-close-line" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn--secondary"
                  style={{ alignSelf: "flex-start", fontWeight: 600 }}
                >
                  <i className="ri-upload-2-line" aria-hidden="true" /> Choose file
                </button>
              )}
            </div>
          )}

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
                    {p.has_attachment && (
                      <i className="ri-attachment-2" aria-hidden="true" title="Has an attachment" style={{ marginRight: 6, color: "var(--color-text-muted)" }} />
                    )}
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
                : !selected.has_attachment && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No notes.</p>}
              {selected.has_attachment && (
                <button
                  type="button"
                  onClick={handleDownloadAttachment}
                  disabled={downloading}
                  title="Download the attached file"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
                    marginTop: selected.notes ? "var(--space-3)" : 0, cursor: downloading ? "default" : "pointer",
                    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                    padding: "var(--space-2) var(--space-3)", background: "var(--color-canvas)",
                    fontSize: "var(--text-sm)", color: "var(--color-accent)", fontWeight: 600,
                    maxWidth: "100%", opacity: downloading ? 0.6 : 1,
                  }}
                >
                  <i className="ri-attachment-2" aria-hidden="true" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {downloading ? "Downloading…" : "Download attachment"}
                  </span>
                  {!downloading && <i className="ri-download-2-line" aria-hidden="true" style={{ color: "var(--color-text-muted)" }} />}
                </button>
              )}
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
