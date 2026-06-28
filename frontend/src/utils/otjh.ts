// Shared OTJH calculations used by both the Metric Breakdown table and the
// coach-page OTJH chart, so the displayed status and the chart stay in sync.

// Parse the signed "Xh Ym" progress-hours string (e.g. "-136h 8m", "6h 57m")
// into decimal hours. Returns null when there's nothing parseable.
export function parseProgressHours(raw: string): number | null {
  if (!raw) return null;
  const t = raw.trim();
  const hM = t.match(/(\d+)\s*h/i);
  const mM = t.match(/(\d+)\s*m/i);
  if (!hM && !mM) {
    const n = Number(t.replace(/[^0-9.\-]/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  const mag = (hM ? Number(hM[1]) : 0) + (mM ? Number(mM[1]) : 0) / 60;
  return t.startsWith("-") ? -mag : mag;
}

// OTJH target = completed hours − progress-hours (the signed deviation from
// expected), i.e. the expected on-the-job hours at this point in the programme.
export function otjhTarget(completed: number, progressHoursRaw: string): number | null {
  const ph = parseProgressHours(progressHoursRaw);
  if (ph == null) return null;
  return completed - ph;
}

// OTJH progress variance (%) = progress-hours ÷ target × 100, where
// target = completed − progress-hours. Returns null when it can't be computed.
export function otjhVariance(completed: number, progressHoursRaw: string): number | null {
  const ph = parseProgressHours(progressHoursRaw);
  if (ph == null) return null;
  const target = completed - ph;
  if (!target) return null;   // avoid divide-by-zero
  return (ph / target) * 100;
}

// The raw source OTJHoursStatus normalised to a band (fallback when variance
// can't be computed).
export function otjhBand(raw: string): string {
  const t = raw.toLowerCase().replace(/-/g, " ").trim();
  if (t === "at risk" || t === "atrisk") return "At Risk";
  if (t === "need attention") return "Need Attention";
  if (t === "ontrack" || t === "on track") return "On Track";
  return raw || "—";
}

// OTJH band from the progress variance %: 0 to −5% On Track, −5% to −15% Need
// Attention, worse than −15% At Risk. Falls back to the source status band when
// variance can't be computed.
export function otjhStatusFromVariance(variance: number | null, fallbackRaw: string): string {
  if (variance == null) return otjhBand(fallbackRaw);
  if (variance >= -5) return "On Track";
  if (variance >= -15) return "Need Attention";
  return "At Risk";
}

// Format decimal hours as "Xh Ym" (matching the Progress-Hours column), sign preserved.
export function formatHours(value: number): string {
  const sign = value < 0 ? "-" : "";
  let h = Math.floor(Math.abs(value));
  let m = Math.round((Math.abs(value) - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return `${sign}${h}h ${m}m`;
}
