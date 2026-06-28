import type { CoachSummaryRecord } from '@/mocks/coachSummary';

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
const buildApiUrl = (path: string) => (API_BASE_URL ? `${API_BASE_URL}${path}` : path);

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

interface WeekMetaDTO {
  year: number;
  week: number;
  weekStart: string;
  weekEnd: string;
  label: string;
}

interface WeekCellDTO {
  ratio: number;
  vsCompany: number;
  absent: number;
  present: number;
  total: number;
}

interface CoachRowDTO {
  coachName: string;
  studentsCount: number;
  windowAvgRatio: number;
  weeks: WeekCellDTO[];
}

interface AttendanceWeeksDTO {
  weeks: WeekMetaDTO[];
  coaches: CoachRowDTO[];
  company: CoachRowDTO;
  oldestWeekKey: string | null;
  newestWeekKey: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface AttendanceWeeksResult {
  weekMeta: WeekMetaDTO[];
  records: CoachSummaryRecord[];
  oldestWeekKey: string | null;
  newestWeekKey: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

const toRecord = (row: CoachRowDTO, weekMeta: WeekMetaDTO[]): CoachSummaryRecord => ({
  coachName: row.coachName,
  studentsCount: row.studentsCount,
  last10WeeksAbsenceRatio: num(row.windowAvgRatio),
  weeks: row.weeks.map((w, i) => ({
    weekStart: weekMeta[i]?.weekStart ?? '',
    weekEnd: weekMeta[i]?.weekEnd ?? '',
    year: weekMeta[i]?.year,
    weekNumber: weekMeta[i]?.week,
    label: weekMeta[i]?.label,
    expected: num(w.total),
    present: num(w.present),
    absent: num(w.absent),
    absenceRatio: num(w.ratio),
    vsCompany: num(w.vsCompany),
  })),
});

/**
 * Fetch per-coach weekly attendance, computed live from kbc_attendance.
 * Provide `before` (a "year-week" key) to page to the older window, or `after`
 * to page to the newer window. They are mutually exclusive.
 */
export const fetchAttendanceWeeks = async (
  count = 10,
  page?: { before?: string | null; after?: string | null },
): Promise<AttendanceWeeksResult> => {
  const params = new URLSearchParams({ count: String(count) });
  if (page?.before) params.set('before', page.before);
  else if (page?.after) params.set('after', page.after);
  const response = await fetch(buildApiUrl(`/api/attendance-weeks/?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  const data: AttendanceWeeksDTO = await response.json();
  const records = [
    ...data.coaches.map((c) => toRecord(c, data.weeks)),
    toRecord(data.company, data.weeks),
  ];
  return {
    weekMeta: data.weeks,
    records,
    oldestWeekKey: data.oldestWeekKey,
    newestWeekKey: data.newestWeekKey,
    hasOlder: data.hasOlder,
    hasNewer: data.hasNewer,
  };
};

export interface AttendanceDrillSession {
  date: string;
  status: 'attended' | 'absent';
  module: string;
}

export interface AttendanceDrillLearner {
  id: number;
  name: string;
  email: string;
  group: string;
  attended: number;
  absent: number;
  status: 'attended' | 'absent' | 'partial';
  sessions: AttendanceDrillSession[];
}

export interface AttendanceDrill {
  coach: string;
  year: number;
  week: number;
  weekStart: string;
  weekEnd: string;
  label: string;
  studentsCount: number;
  absentSessions: number;
  countedSessions: number;
  ratio: number;
  learners: AttendanceDrillLearner[];
}

export const fetchAttendanceDrill = async (
  coach: string,
  year?: number,
  week?: number,
): Promise<AttendanceDrill> => {
  const params = new URLSearchParams({ coach });
  if (year != null) params.set('year', String(year));
  if (week != null) params.set('week', String(week));
  const response = await fetch(buildApiUrl(`/api/attendance-drill/?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};
