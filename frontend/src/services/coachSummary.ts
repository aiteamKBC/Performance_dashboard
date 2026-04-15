import { CoachSummaryRecord } from '@/mocks/coachSummary';

const defaultDates = [
  { start: "2026-04-06", end: "2026-04-12" }, // W1
  { start: "2026-03-30", end: "2026-04-05" }, // W2
  { start: "2026-03-23", end: "2026-03-29" }, // W3
  { start: "2026-03-16", end: "2026-03-22" }, // W4
  { start: "2026-03-09", end: "2026-03-15" }, // W5
  { start: "2026-03-02", end: "2026-03-08" }, // W6
  { start: "2026-02-23", end: "2026-03-01" }, // W7
  { start: "2026-02-16", end: "2026-02-22" }, // W8
  { start: "2026-02-09", end: "2026-02-15" }, // W9
  { start: "2026-02-02", end: "2026-02-08" }  // W10
];

export const fetchCoachSummary = async (): Promise<CoachSummaryRecord[]> => {
  try {
    const response = await fetch('http://localhost:8000/api/coach-summary/');
    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    return data.map((item: any) => {
      const coachName = item.coach_name || 'Unknown';
      const actualStudentsCount = item.students_count || 0;

      return {
        coachName,
        studentsCount: actualStudentsCount,
        last10WeeksAbsenceRatio: parseFloat(item.last_10_weeks_absence_ratio) || 0,
        weeks: [
          {
            weekStart: defaultDates[0].start,
            weekEnd: defaultDates[0].end,
            expected: item.week_1_expected ? parseInt(item.week_1_expected, 10) : 0,
            present: item.week_1_present ? parseInt(item.week_1_present, 10) : 0,
            absent: item.week_1_absent || 0,
            absenceRatio: parseFloat(item.week_1_absence_ratio) || 0,
            vsCompany: parseFloat(item.week1_company) || 0,
          },
          {
            weekStart: defaultDates[1].start,
            weekEnd: defaultDates[1].end,
            absenceRatio: parseFloat(item.week_2_absence_ratio) || 0,
            vsCompany: parseFloat(item.week2_company) || 0,
          },
          {
            weekStart: defaultDates[2].start,
            weekEnd: defaultDates[2].end,
            absenceRatio: parseFloat(item.week_3_absence_ratio) || 0,
            vsCompany: parseFloat(item.week3_company) || 0,
          },
          {
            weekStart: defaultDates[3].start,
            weekEnd: defaultDates[3].end,
            absenceRatio: parseFloat(item.week_4_absence_ratio) || 0,
            vsCompany: parseFloat(item.week4_company) || 0,
          },
          {
            weekStart: defaultDates[4].start,
            weekEnd: defaultDates[4].end,
            absenceRatio: parseFloat(item.week_5_absence_ratio) || 0,
            vsCompany: parseFloat(item.week5_company) || 0,
          },
          {
            weekStart: defaultDates[5].start,
            weekEnd: defaultDates[5].end,
            absenceRatio: parseFloat(item.week_6_absence_ratio) || 0,
            vsCompany: parseFloat(item.week6_company) || 0,
          },
          {
            weekStart: defaultDates[6].start,
            weekEnd: defaultDates[6].end,
            absenceRatio: parseFloat(item.week_7_absence_ratio) || 0,
            vsCompany: parseFloat(item.week7_company) || 0,
          },
          {
            weekStart: defaultDates[7].start,
            weekEnd: defaultDates[7].end,
            absenceRatio: parseFloat(item.week_8_absence_ratio) || 0,
            vsCompany: parseFloat(item.week8_company) || 0,
          },
          {
            weekStart: defaultDates[8].start,
            weekEnd: defaultDates[8].end,
            absenceRatio: parseFloat(item.week_9_absence_ratio) || 0,
            vsCompany: parseFloat(item.week9_company) || 0,
          },
          {
            weekStart: defaultDates[9].start,
            weekEnd: defaultDates[9].end,
            absenceRatio: parseFloat(item.week_10_absence_ratio) || 0,
            vsCompany: parseFloat(item.week10_company) || 0,
          }
        ]
      };
    });
  } catch (error) {
    console.error('Failed to fetch coach summary:', error);
    throw error;
  }
};