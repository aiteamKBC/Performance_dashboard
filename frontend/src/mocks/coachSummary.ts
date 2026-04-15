export interface WeekData {
  weekStart: string;
  weekEnd: string;
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
