import { CoachRecord } from '@/mocks/dashboard';

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

const buildApiUrl = (path: string) => (API_BASE_URL ? `${API_BASE_URL}${path}` : path);

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface DrillLearner {
  name: string;
  email?: string;
  detail?: string;
}

export interface DrillSection {
  key: string;
  label: string;
  count: number;
  learners: DrillLearner[];
}

export interface DrillLearnerRow {
  name: string;
  email: string;
  programme: string;
  otjh_status: string;
  submitted: number;
  completed: number;
  planned: number;
  minimum: number;
  pending: number;
  referred_closure: number;
  total_evidence: number;
  last_sub: string;
  pr_status: string;
  pr_date: string;
  mcm_status: string;
  mcm_date: string;
}

export interface CoachDrill {
  coach: string;
  case_owner_id: number | null;
  per_learner: DrillLearnerRow[];
  sections: DrillSection[];
}

export const fetchCoachDrill = async (
  coach: string,
  caseOwnerId?: number | null,
): Promise<CoachDrill> => {
  const params = new URLSearchParams({ coach });
  if (caseOwnerId !== undefined && caseOwnerId !== null) {
    params.set('case_owner_id', String(caseOwnerId));
  }
  const response = await fetch(buildApiUrl(`/api/coach-drill/?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

export const fetchCoachesLateness = async (): Promise<CoachRecord[]> => {
  try {
    const response = await fetch(buildApiUrl('/api/coaches-lateness/'));
    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    
    return data.map((item: any, index: number) => {
      const caseOwner = String(item.caseowner ?? '').trim();

      const totalLearners = toNumber(item.total_learners);
      const recentSubmitters = toNumber(item.recent_submitters);
      const totalEvidence = toNumber(item.total_evidence);
      const evidenceReferred = toNumber(item.evidence_referred);
      const referredClosure = toNumber(item.referred_closure);

      const prRequired4Weeks = toNumber(item.total_pr_required_for_last_4_weeks);
      const prCompleted4Weeks = toNumber(item.pr_completed_for_last_4_weeks);
      const prRequired8Weeks = toNumber(item.total_pr_required_for_last_8_weeks);
      const prCompleted8Weeks = toNumber(item.pr_completed_for_last_8_weeks);
      const prOverallRequired = toNumber(item.overall_pr_required);
      const prOverallCompleted = toNumber(item.overall_pr_completed);

      const otjhOnTrack = toNumber(item.otjh_ontrack_0_field);

      const learnerEngagement = item.learner_engagement !== undefined
        ? toNumber(item.learner_engagement)
        : (totalLearners > 0 ? Math.round((recentSubmitters / totalLearners) * 100) : 0);

      const prBehind8Weeks = Math.max(prRequired8Weeks - prCompleted8Weeks, 0);
      const prBehindRate4Weeks = prRequired4Weeks > 0
        ? Math.round((Math.max(prRequired4Weeks - prCompleted4Weeks, 0) / prRequired4Weeks) * 1000) / 10
        : 0;
      const prBehindRate8Weeks = prRequired8Weeks > 0
        ? Math.round((prBehind8Weeks / prRequired8Weeks) * 1000) / 10
        : 0;

      const overallCompletionFromApi = toNumber(item.overall_pr_completion_rate);
      const prOverallCompletionRate = prOverallRequired > 0
        ? Math.round((prOverallCompleted / prOverallRequired) * 1000) / 10
        : overallCompletionFromApi;

      // PR 12-week (overall) — kept explicit alongside the legacy overall_* keys.
      const prRequired12Weeks = toNumber(item.pr_required_12_weeks ?? item.overall_pr_required);
      const prCompleted12Weeks = toNumber(item.pr_completed_12_weeks ?? item.overall_pr_completed);

      // MCM (from the MCR table) — 4 / 8 / 12-week windows, mirroring PR.
      const mcmRequired4Weeks = toNumber(item.mcm_required_4_weeks ?? item.required_mcm);
      const mcmCompleted4Weeks = toNumber(item.mcm_completed_4_weeks ?? item.completed_mcm);
      const mcmRequired8Weeks = toNumber(item.mcm_required_8_weeks);
      const mcmCompleted8Weeks = toNumber(item.mcm_completed_8_weeks);
      const mcmRequired12Weeks = toNumber(item.mcm_required_12_weeks);
      const mcmCompleted12Weeks = toNumber(item.mcm_completed_12_weeks);
      const rate = (done: number, req: number) => req > 0 ? Math.round((done / req) * 1000) / 10 : 0;
      const mcmCompletionRate4Weeks = toNumber(item.mcm_completion_rate_4_weeks ?? rate(mcmCompleted4Weeks, mcmRequired4Weeks));
      const mcmCompletionRate8Weeks = toNumber(item.mcm_completion_rate_8_weeks ?? rate(mcmCompleted8Weeks, mcmRequired8Weeks));
      const mcmCompletionRate12Weeks = toNumber(item.mcm_completion_rate_12_weeks ?? rate(mcmCompleted12Weeks, mcmRequired12Weeks));
      // "Behind" counts + behind-rate, mirroring the PR columns.
      const behindRate = (req: number, done: number) => req > 0 ? Math.round((Math.max(req - done, 0) / req) * 1000) / 10 : 0;
      const mcmBehind4Weeks = Math.max(mcmRequired4Weeks - mcmCompleted4Weeks, 0);
      const mcmBehind8Weeks = Math.max(mcmRequired8Weeks - mcmCompleted8Weeks, 0);
      const mcmBehind12Weeks = Math.max(mcmRequired12Weeks - mcmCompleted12Weeks, 0);
      const mcmBehindRate4Weeks = behindRate(mcmRequired4Weeks, mcmCompleted4Weeks);
      const mcmBehindRate8Weeks = behindRate(mcmRequired8Weeks, mcmCompleted8Weeks);

      const pending = toNumber(item.pending);
      const referredClosurePct = evidenceReferred > 0
        ? Math.round((referredClosure / evidenceReferred) * 10000) / 100
        : 0;

      // Daily evidence buckets + 7-day total, from the Require Marking table.
      const evToday = toNumber(item.today);
      const evYesterday = toNumber(item.yesterday);
      const evMinus2 = toNumber(item.ev_minus_2);
      const evMinus3 = toNumber(item.ev_minus_3);
      const evMinus4 = toNumber(item.ev_minus_4);
      const evMinus5 = toNumber(item.ev_minus_5);
      const evMinus6 = toNumber(item.ev_minus_6);
      const evMinus7 = toNumber(item.ev_minus_7);
      const evidenceWeekTotal = item.evidence_week_total !== undefined
        ? toNumber(item.evidence_week_total)
        : evToday + evYesterday + evMinus2 + evMinus3 + evMinus4 + evMinus5 + evMinus6 + evMinus7;

      return {
        id: index + 1,
        associate: caseOwner.split(' ')[0] || 'Unknown',
        coach: caseOwner || 'Unknown',
        caseOwner,
        caseOwnerId: item.case_owner_id ?? null,
        phone: String(item.phone ?? ''),
        lastSubDate: String(item.lastsubdate ?? ''),
        elapsedDays: toNumber(item.elapseddays),
        lastSnapshotDate: String(item.last_snapshot_date ?? ''),
        totalLearners,
        recentSubmitters,
        learnerEngagement,
        otjhOnTrack,
        otjhNormal: toNumber(item.otjh_normal_0_20_field),
        otjhNeedAttention: toNumber(item.otjh_need_attention_20_40_field),
        otjhAtRisk: toNumber(item.otjh_at_risk_40_field),
        // Marking Weekly needs a prior-week pending snapshot the live sources
        // don't carry, so lastWeekPending mirrors pending (0% week-over-week).
        lastWeekPending: pending,
        pending,
        markingProgressWeekly: 0,
        evidenceAccepted: toNumber(item.evidence_accepted),
        evidenceReferred,
        referredClosure,
        referredClosurePct,
        totalEvidence,
        // Daily evidence buckets (from Require Marking).
        evToday,
        evYesterday,
        evMinus2,
        evMinus3,
        evMinus4,
        evMinus5,
        evMinus6,
        evMinus7,
        evidenceWeekTotal,
        // PR weekly carries the legacy daily fields as 0; PR Weekly columns now
        // use the per-week completed counts below.
        prToday: 0,
        prYesterday: 0,
        prMinus2: 0,
        prLastWeek: toNumber(item.pr_week_1_completed),
        prSecondWeek: toNumber(item.pr_week_2_completed),
        prThirdWeek: toNumber(item.pr_week_3_completed),
        prFourthWeek: toNumber(item.pr_week_4_completed),
        prRequired4Weeks,
        prCompleted4Weeks,
        prDoneOld4Weeks: prCompleted4Weeks,
        prBehindRate4Weeks,
        prRequired8Weeks,
        prCompleted8Weeks,
        prBehind8Weeks,
        prBehindRate8Weeks,
        prOverallRequired,
        prOverallCompleted,
        prOverallBehind: Math.max(prOverallRequired - prOverallCompleted, 0),
        prOverallCompletionRate,
        prRequired12Weeks,
        prCompleted12Weeks,
        prCompletionRate12Weeks: prOverallCompletionRate,
        mcmRequired4Weeks,
        mcmCompleted4Weeks,
        mcmCompletionRate4Weeks,
        mcmBehind4Weeks,
        mcmBehindRate4Weeks,
        mcmRequired8Weeks,
        mcmCompleted8Weeks,
        mcmCompletionRate8Weeks,
        mcmBehind8Weeks,
        mcmBehindRate8Weeks,
        mcmRequired12Weeks,
        mcmCompleted12Weeks,
        mcmCompletionRate12Weeks,
        mcmBehind12Weeks,
      };
    });
  } catch (error) {
    console.error('Failed to fetch coaches lateness:', error);
    throw error;
  }
};
