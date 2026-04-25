const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

const buildApiUrl = (path: string) => (API_BASE_URL ? `${API_BASE_URL}${path}` : path);

export interface TestKPIsRecord {
  caseOwner: string;
  requiredPR: number;
  completedPR: number;
  stillInprogressPR: number;
  scheduledOverduePR: string;
  unscheduledOverduePR: number;
  scheduledForNextPRPct: string;
  completedMCM: string;
  stillInprogressMCM: number;
  scheduledOverdueMCM: number;
  unscheduledOverdueMCM: number;
  scheduledForNextMCMPct: string;
  learnerEmailsMCM: number;
  employerEmailsPR: number;
  requiredLearners: number;
  scheduledPR: number;
  scheduledLearners: string;
  completedPRLower: number;
  completedLearners: number;
  scheduledOverdueLearner: number;
  stillInprogressLearner: number;
  unscheduledOverdueLearners: number;
  scheduledPctPR: string;
}

const toInt = (v: unknown): number => {
  const n = parseInt(String(v ?? '0'), 10);
  return isNaN(n) ? 0 : n;
};

const toStr = (v: unknown): string => (v == null ? '' : String(v));

export const fetchTestKPIs = async (): Promise<TestKPIsRecord[]> => {
  try {
    const response = await fetch(buildApiUrl('/api/kpis/'));
    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    return data.map((item: Record<string, unknown>) => ({
      caseOwner: toStr(item.case_owner),
      requiredPR: toInt(item.required_pr),
      completedPR: toInt(item.completed_pr),
      stillInprogressPR: toInt(item.still_inprogress_pr),
      scheduledOverduePR: toStr(item.scheduled_overdue_pr),
      unscheduledOverduePR: toInt(item.unscheduled_overdue_pr),
      scheduledForNextPRPct: toStr(item.scheduled_for_next_pr_pct),
      completedMCM: toStr(item.completed_mcm),
      stillInprogressMCM: toInt(item.still_inprogress_mcm),
      scheduledOverdueMCM: toInt(item.scheduled_overdue_mcm),
      unscheduledOverdueMCM: toInt(item.unscheduled_overdue_mcm),
      scheduledForNextMCMPct: toStr(item.scheduled_for_next_mcm_pct),
      learnerEmailsMCM: toInt(item.learner_emails_mcm),
      employerEmailsPR: toInt(item.employer_emails_pr),
      requiredLearners: toInt(item.required_learners),
      scheduledPR: toInt(item.scheduled_pr),
      scheduledLearners: toStr(item.scheduled_learners),
      completedPRLower: toInt(item.completed_pr_lower),
      completedLearners: toInt(item.completed_learners),
      scheduledOverdueLearner: toInt(item.scheduled_overdue_learner),
      stillInprogressLearner: toInt(item.still_inprogress_learner),
      unscheduledOverdueLearners: toInt(item.unscheduled_overdue_learners),
      scheduledPctPR: toStr(item.scheduled_pct_pr),
    }));
  } catch (error) {
    console.error('Failed to fetch Test KPIs:', error);
    throw error;
  }
};
