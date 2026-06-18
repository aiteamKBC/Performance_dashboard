export interface WeekData {
  weekStart: string;
  weekEnd: string;
  /** Day-of-year week number (W1 = Jan 1-7) and its calendar year. */
  year?: number;
  weekNumber?: number;
  label?: string;
  expected?: number;
  present?: number;
  absent?: number;
  absenceRatio: number;
  vsCompany: number;
}

export interface CoachSummaryRecord {
  coachName: string;
  studentsCount: number;
  last10WeeksAbsenceRatio: number;
  weeks: WeekData[];
}
