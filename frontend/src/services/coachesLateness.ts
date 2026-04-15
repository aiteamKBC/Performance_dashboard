import { CoachRecord } from '@/mocks/dashboard';

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const fetchCoachesLateness = async (): Promise<CoachRecord[]> => {
  try {
    const response = await fetch('http://localhost:8000/api/coaches-lateness/');
    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    
    return data.map((item: any, index: number) => {
      const caseOwner = String(item.caseowner ?? '').trim();

      const totalLearners = toNumber(item.total_learners);
      const recentSubmitters = toNumber(item.recent_submitters);
      const evidenceAccepted = toNumber(item.evidence_accepted);
      const evidenceReferred = toNumber(item.evidence_referred);
      const totalEvidence = toNumber(item.total_evidence);

      const prRequired4Weeks = toNumber(item.total_pr_required_for_last_4_weeks);
      const prCompleted4Weeks = toNumber(item.acutally_done_for_last_4_weeks);
      const prRequired8Weeks = toNumber(item.total_pr_required_for_last_8_weeks);
      const prCompleted8Weeks = toNumber(item.acutally_done_pr_for_last_8_weeks);
      const prOverallRequired = toNumber(item.overall_pr_required);
      const prOverallCompleted = toNumber(item.overall_pr_completed);

      const otjhOnTrack = toNumber(item.otjh_ontrack_0_field);

      const learnerEngagement = totalLearners > 0
        ? Math.round((recentSubmitters / totalLearners) * 100)
        : 0;

      // Map Closure to the upstream source field; fallback keeps current API compatible.
      const referredClosure = toNumber(
        item.referred_closure
        ?? item.referred_closure_text
        ?? item.referredclosure
        ?? item.evidence_referred
      );

      const referredClosurePct = evidenceReferred > 0
        ? Math.round((referredClosure / evidenceReferred) * 10000) / 100
        : 0;

      const prBehind4Weeks = Math.max(prRequired4Weeks - prCompleted4Weeks, 0);
      const prBehind8Weeks = Math.max(prRequired8Weeks - prCompleted8Weeks, 0);
      const prBehindRate4Weeks = prRequired4Weeks > 0
        ? Math.round((prBehind4Weeks / prRequired4Weeks) * 1000) / 10
        : 0;
      const prBehindRate8Weeks = prRequired8Weeks > 0
        ? Math.round((prBehind8Weeks / prRequired8Weeks) * 1000) / 10
        : 0;

      const overallCompletionFromApi = toNumber(item.overall_pr_completion_rate);
      const prOverallCompletionRate = prOverallRequired > 0
        ? Math.round((prOverallCompleted / prOverallRequired) * 1000) / 10
        : overallCompletionFromApi;

      return {
        id: index + 1,
        associate: caseOwner.split(' ')[0] || 'Unknown',
        coach: caseOwner || 'Unknown',
        caseOwner,
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
        lastWeekPending: toNumber(item.last_week_pending),
        pending: toNumber(item.pending),
        markingProgressWeekly: toNumber(item.last_week_pr),
        evidenceAccepted,
        evidenceReferred,
        referredClosure,
        referredClosurePct,
        totalEvidence,
        prToday: toNumber(item.today),
        prYesterday: toNumber(item.yesterday),
        prMinus2: toNumber(item.field_2),
        prLastWeek: toNumber(item.last_week_pr),
        prSecondWeek: toNumber(item.field_second_week_pr),
        prThirdWeek: toNumber(item.field_third_week_pr),
        prFourthWeek: toNumber(item.field_fourth_week_pr),
        prRequired4Weeks,
        prCompleted4Weeks,
        prDoneOld4Weeks: toNumber(item.total_pr_done_old_for_last_4_weeks),
        prBehindRate4Weeks,
        prRequired8Weeks,
        prCompleted8Weeks,
        prBehind8Weeks,
        prBehindRate8Weeks,
        prOverallRequired,
        prOverallCompleted,
        prOverallBehind: Math.max(prOverallRequired - prOverallCompleted, toNumber(item.overall_pr_behind)),
        prOverallCompletionRate,
      };
    });
  } catch (error) {
    console.error('Failed to fetch coaches lateness:', error);
    throw error;
  }
};
