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
  completed: number | null;
  planned: number | null;
  minimum: number;
  otjh_target: string;
  otjh_progress_hours: string;
  otjh_progress_variance: string;
  otjh_source?: string;
  otjh_as_of?: string | null;
  otjh_target_hours?: number | null;
  otjh_percent?: number | null;
  otjh_shortfall_hours?: number | null;
  pending: number;
  referred_closure: number;
  total_evidence: number;
  last_sub: string;
  pr_status: string;
  pr_date: string;
  mcm_status: string;
  mcm_date: string;
  // Latest completed PR / MCM (ISO date, "" if none).
  pr_last_completed: string;
  mcm_last_completed: string;
  // LMS side of the learner (blank / 0 when the LMS has no record).
  lms_id: number | null;
  uuid: string;
  status: string;
  cohort: string;
  group: string;
  start_date: string;
  activities_done: number;
  activities_total: number;
  attendance_done: number;
  attendance_total: number;
  last_activity: string;
}

export interface ReviewRow {
  name: string;
  email: string;
  programme: string;
  metric: "PR" | "MCM";
  status: string;
  date: string;
  // Original source slot when available (1-based, e.g. MCM 1).
  slot?: number;
}

export interface PendingMarkingRow {
  lms_id: number;
  enrolment_id: string;
  name: string;
  email: string;
  programme: string;
  programme_status: string;
  pending_count: number;
  oldest_pending: string | null;
  latest_pending: string | null;
}

export interface CoachDrill {
  coach: string;
  case_owner_id: number | null;
  per_learner: DrillLearnerRow[];
  pending_marking: PendingMarkingRow[];
  pending_marking_count: number;
  // The coach's learners' catch-up sessions this work week (Mon–Fri).
  catchups_this_week: number;
  week_start?: string;
  week_end?: string;
  pr_this_week?: number;
  mcm_this_week?: number;
  review_rows: ReviewRow[];
  sections: DrillSection[];
}

export interface ActionPlan {
  id: number;
  coach_name: string;
  case_owner_id: string | null;
  title: string;
  notes: string;
  creator_name: string | null;
  saved_date: string | null;
  // Whether this plan has an attached file. The file blob itself is fetched on
  // demand via fetchActionPlanFile() so lists stay lightweight.
  has_attachment: boolean;
}

export const fetchActionPlans = async (coach: string): Promise<ActionPlan[]> => {
  const params = new URLSearchParams({ coach });
  const response = await fetch(buildApiUrl(`/api/action-plans/?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

// Fetch one plan's attached file (a base64 data URL) on demand. Returns null
// when the plan has no attachment.
export const fetchActionPlanFile = async (id: number): Promise<string | null> => {
  const params = new URLSearchParams({ id: String(id) });
  const response = await fetch(buildApiUrl(`/api/action-plans/file/?${params.toString()}`));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return body?.attached_file ?? null;
};

export const createActionPlan = async (input: {
  coach: string;
  title: string;
  notes: string;
  creator?: string;
  caseOwnerId?: number | null;
  attachedFile?: string | null;
}): Promise<ActionPlan> => {
  const response = await fetch(buildApiUrl('/api/action-plans/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coach: input.coach,
      title: input.title,
      notes: input.notes,
      creator: input.creator ?? '',
      case_owner_id: input.caseOwnerId ?? null,
      attached_file: input.attachedFile ?? null,
    }),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return response.json();
};

export const deleteActionPlan = async (id: number): Promise<void> => {
  const params = new URLSearchParams({ id: String(id) });
  const response = await fetch(buildApiUrl(`/api/action-plans/?${params.toString()}`), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
};

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

export const fetchCoachesLateness = async (options?: { signal?: AbortSignal; refresh?: boolean }): Promise<CoachRecord[]> => {
  try {
    const path = options?.refresh ? '/api/coaches-lateness/?refresh=1' : '/api/coaches-lateness/';
    const response = await fetch(buildApiUrl(path), {
      signal: options?.signal,
    });
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

      // Daily marking-submission buckets + 7-day total, from the New LMS.
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

      // Canonical LMS review counts; missing data must never become a false zero.
      const periodCounts = (obj: any) => {
        const pick = (key: string) => {
          const counts = obj?.[key];
          if (!counts || !['required', 'completed', 'overdue'].every((field) =>
            typeof counts[field] === 'number' && Number.isFinite(counts[field]))) {
            throw new Error('LMS review metrics unavailable. Refresh the dashboard.');
          }
          return { required: counts.required, completed: counts.completed, overdue: counts.overdue };
        };
        return { '4w': pick('4w'), '8w': pick('8w'), '12w': pick('12w'), all: pick('all') };
      };

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
        attendanceRate: item.attendance_rate == null ? null : toNumber(item.attendance_rate),
        otjhOnTrack,
        otjhNormal: toNumber(item.otjh_normal_0_20_field),
        otjhNeedAttention: toNumber(item.otjh_need_attention_20_40_field),
        otjhAtRisk: toNumber(item.otjh_at_risk_40_field),
        otjhVarOnTrack: toNumber(item.otjh_var_ontrack),
        otjhVarNeedAttention: toNumber(item.otjh_var_need_attention),
        otjhVarAtRisk: toNumber(item.otjh_var_at_risk),
        // No historical queue snapshot is supplied by this endpoint.
        lastWeekPending: null,
        pending,
        markingProgressWeekly: null,
        evidenceAccepted: toNumber(item.evidence_accepted),
        evidenceReferred,
        referredClosure,
        referredClosureAvailable: item.referred_closure_available !== false,
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
        prLmsRate: item.lms_pr_rate === null || item.lms_pr_rate === undefined
          ? null
          : toNumber(item.lms_pr_rate),
        prRequired12Weeks,
        prCompleted12Weeks,
        prCompletionRate12Weeks: prOverallCompletionRate,
        prByLearner: periodCounts(item.pr_periods),
        mcmByLearner: periodCounts(item.mcm_periods),
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
        coachConflicts: Array.isArray(item.coach_conflicts) ? item.coach_conflicts : [],      };
    });
  } catch (error) {
    console.error('Failed to fetch coaches lateness:', error);
    throw error;
  }
};
