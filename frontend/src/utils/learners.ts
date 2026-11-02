import type { DrillLearnerRow } from "@/services/coachesLateness";
import { otjhBand, otjhStatusFromHours, parseProgressHours } from "@/utils/otjh";

// Per-learner figures for the coach page's learner table and "View" popup.

export interface LearnerView {
  row: DrillLearnerRow;
  otjhPct: number | null;
  targetHours: number | null;
  otjhBand: string;
  activitiesPct: number | null;
  attendancePct: number | null;
}

export function toLearnerView(row: DrillLearnerRow): LearnerView {
  const canonical = row.otjh_source !== undefined;
  const target = canonical ? row.otjh_target_hours ?? null : parseProgressHours(row.otjh_target);
  const pct = (done: number, total: number) => (total > 0 ? (done / total) * 100 : null);
  return {
    row,
    // The LMS presents completion as a capped progress indicator. Keep the
    // signed hour/variance fields intact for the actual RAG calculation.
    otjhPct: canonical ? row.otjh_percent ?? null
      : target && target > 0 && row.completed != null ? Math.min(100, (row.completed / target) * 100) : null,
    targetHours: target,
    otjhBand: canonical ? otjhBand(row.otjh_status)
      : row.otjh_status ? otjhStatusFromHours(row.completed ?? 0, target, row.otjh_status) : "",
    activitiesPct: pct(row.activities_done, row.activities_total),
    attendancePct: pct(row.attendance_done, row.attendance_total),
  };
}

export function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysSince(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

// Link to the learner's LMS profile, from VITE_LMS_LEARNER_URL (a URL with
// {id} and / or {uuid} placeholders). Null when not configured.
export function lmsProfileUrl(row: DrillLearnerRow): string | null {
  const template = import.meta.env.VITE_LMS_LEARNER_URL as string | undefined;
  if (!template || (row.lms_id == null && !row.uuid)) return null;
  return template.replace("{id}", String(row.lms_id ?? "")).replace("{uuid}", row.uuid);
}
