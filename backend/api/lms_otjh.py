"""Read-only counterpart of the LMS coach dashboard canonical OTJH reader.

The ledger/monthly-plan query and native-save projection follow LMS_v2's
learner_api.canonical_learning.otjh_summary_bulk. No summary-column fallback.
"""
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from .lms_otjh_rules import (
    decoded, number, parse_date_value, project_current, merge_submissions,
    merge_attempts, frozen_records, progress_records_with_completion,
)
from .lms_otjh_reviews import planned_hours_bulk


def metrics_from_records(records, monthly_targets):
    # canonical_learning.allocations changes dates only, never actual seconds.
    actual = round(sum(number(r.get('actual_seconds')) for r in records
                       if r.get('accepted') is True) / 3600, 4)
    planned = round(sum(monthly_targets.values()), 4) if monthly_targets else None
    return {'otjh': {'actual': actual, 'planned': planned}}


def _validated_profile(owner):
    email = str(owner.get('email') or '').strip().casefold()
    account_email = str(owner.get('account_email') or '').strip().casefold()
    aptem = str(owner.get('account_aptem_id') or '').strip().lstrip('0')
    if (owner.get('account_record_id') is None or not email or email != account_email
            or (aptem and aptem != str(owner.get('aptem_id') or '').lstrip('0'))):
        raise ValueError('The consolidated learner identity needs review.')
    return owner

def pending_hour_records(owners, query):
    """Use the learner projection without hydrating a caseload's full history.

    Stored seconds (including zero) remain authoritative. Only direct saves
    without stored seconds or reporting segments can contribute extra hours.
    Attempts and reflection-only rows cannot introduce additional ledger rows.
    """

    owners = {int(owner['id']): owner for owner in owners}
    result = {owner_id: [] for owner_id in owners}
    if not owners:
        return result
    pending = query('''SELECT p.id,p.learner_id,p.kind,p.component_ref,
        p.component_type,p.quiz_ref,p.passed,p.reported_time,p.submitted_at,
        p.time_tracking_source,p.claimed_seconds,p.verified_seconds,
        p.component_link_source,p.source_system,p.actual_seconds,p.accepted,
        p.reporting_month
        FROM "Learner".learner_progress_entries p
        WHERE p.learner_id=ANY(%s) AND p.deleted_at IS NULL
          AND p.actual_seconds IS NULL AND coalesce(p.source_system,'')=''
          AND p.component_link_source IN ('direct','quiz_ref')
          AND NOT EXISTS (SELECT 1 FROM "Learner".learner_activity_reporting_segments s
                          WHERE s.progress_id=p.id AND s.learner_id=p.learner_id)
        ORDER BY p.id''', [list(owners)])
    if not pending:
        return result
    affected = sorted({int(record['learner_id']) for record in pending})
    # project_current owns retry/replacement policy. Supply its small amount of
    # stored context so a retained import or staff correction suppresses the
    # original direct save exactly as it does on the learner dashboard.
    context = query('''SELECT id,learner_id,component_ref,actual_basis,
        actual_seconds,source_system,
        jsonb_build_object('original_source_ref',source_payload->>'original_source_ref') AS source_payload
        FROM "Learner".learner_progress_entries
        WHERE learner_id=ANY(%s) AND deleted_at IS NULL
          AND (coalesce(source_system,'')<>'' OR actual_basis='staff:module-progress')''', [affected])
    assignment_owners = sorted({int(record['learner_id']) for record in pending
                                if record.get('component_type') == 'assignment'})
    markings = {}
    if assignment_owners:
        pairs = [(str(owners[key]['enrolment_id']), str(owners[key].get('learner_type') or ''))
                 for key in assignment_owners]
        placeholders = ','.join(['(%s,%s)'] * len(pairs))
        submissions = query(f'''SELECT learner_id,learner_kind,component_ref,
            status,actual_time_hours
            FROM "Learner".learning_reflection_submissions
            WHERE (learner_id,learner_kind) IN ({placeholders})
              AND activity_type IN ('assignment','extra_activity')
            ORDER BY submitted_at NULLS FIRST,id''', [value for pair in pairs for value in pair])
        for row in submissions:
            if row.get('component_ref'):
                key = (str(row['learner_id']), str(row['learner_kind']))
                markings.setdefault(key, {})[str(row['component_ref'])] = row
    for owner_id in affected:
        owner = owners[owner_id]
        records = [row for row in pending if int(row['learner_id']) == owner_id]
        pending_ids = {row['id'] for row in records}
        records += [row for row in context if int(row['learner_id']) == owner_id]
        decisions = markings.get((str(owner['enrolment_id']), str(owner.get('learner_type') or '')), {})
        result[owner_id] = [row for row in project_current(records, decisions) if row['id'] in pending_ids]
    return result

class Reader:
    def __init__(self, cursor):
        self.cursor = cursor

    def query(self, sql, params=()):
        self.cursor.execute(sql, params)
        names = [column[0] for column in self.cursor.description]
        return [dict(zip(names, row)) for row in self.cursor.fetchall()]

    def attempts_relation_exists(self):
        return bool(self.query('SELECT to_regclass(%s) AS name', ['"Learner".subject_activity_attempts'])[0]['name'])

    def summary(self, learner_ids):
        """Profile OTJH facts in bounded reads, without content/KSB hydration.

        Accepted seconds belong to progress rows, not their source snapshots,
        segments or unpersisted submissions. The plan uses the same scoped monthly
        targets as Monthly Logs and the Coach Profile (not Created_users.Planned_hours).
        Invalid or ambiguous identities remain unavailable, just as in metrics().
        """
        enrolment_ids = list(dict.fromkeys(int(value) for value in learner_ids if value is not None))
        if not enrolment_ids:
            return {}
        candidates = {}
        for owner in self.query('''SELECT l.id,l.enrolment_id,l.aptem_id,l.programme_id,l.programme,
            l.email,l.start_date,l.end_date,l.learner_type,
            u.id AS account_record_id,u."Email" AS account_email,u.aptem_id AS account_aptem_id,
            EXISTS(SELECT 1 FROM "Learner".progress_transfer_requests t WHERE t.enrolment_id=l.enrolment_id) AS progress_transfer_active
            FROM "Learner".learners l
            LEFT JOIN enrolment."Created_users" u ON u.id=l.enrolment_id
            WHERE l.enrolment_id=ANY(%s)''', [enrolment_ids]):
            candidates.setdefault(int(owner['enrolment_id']), []).append(owner)
        result = {enrolment_id: None for enrolment_id in enrolment_ids}
        owners = {}
        for enrolment_id, matches in candidates.items():
            if len(matches) != 1:
                continue
            try:
                owners[enrolment_id] = _validated_profile(matches[0])
            except ValueError:
                continue
        if not owners:
            return result
        profile_ids = [int(owner['id']) for owner in owners.values()]
        retake_profiles = {int(item['learner_id']) for item in self.query('''
            SELECT DISTINCT learner_id FROM "Learner".learner_progress_entries
            WHERE learner_id=ANY(%s) AND deleted_at IS NULL
              AND source_payload->>'retakeTimeChoice' IN ('keep','new')''', [profile_ids])}
        relation = self.query('SELECT to_regclass(%s) AS name', ['"Learner".subject_activity_attempts'])
        if relation and relation[0].get('name'):
            selected_enrolments = {int(item['enrolment_id']) for item in self.query('''
                SELECT DISTINCT enrolment_id FROM "Learner".subject_activity_attempts
                WHERE enrolment_id=ANY(%s) AND submitted_at IS NOT NULL AND completed IS TRUE
                  AND definition->'studyTime'->>'retakeTimeChoice' IN ('keep','new')''', [list(owners)])}
            retake_profiles.update(int(owner['id']) for key, owner in owners.items() if key in selected_enrolments)
        records = {profile_id: [] for profile_id in profile_ids}
        # Aggregate before transfer: full caseloads can contain many historical rows.
        # Mirror number(): ignore non-finite values and clamp negative seconds to 0.
        for item in self.query('''SELECT learner_id,
            SUM(CASE WHEN actual_seconds::text IN ('NaN','Infinity','-Infinity')
                     THEN 0 ELSE GREATEST(COALESCE(actual_seconds,0),0) END) AS actual_seconds
            FROM "Learner".learner_progress_entries
            WHERE learner_id=ANY(%s) AND deleted_at IS NULL AND accepted IS TRUE
            GROUP BY learner_id''', [profile_ids]):
            records[int(item['learner_id'])].append({**item, 'accepted': True})
        for profile_id, pending in pending_hour_records(owners.values(), self.query).items():
            records[profile_id].extend(pending)
        targets = {profile_id: {} for profile_id in profile_ids}
        for item in self.query('''SELECT DISTINCT ON (t.learner_id,t.report_month)
            t.learner_id,t.report_month,t.target_hours
            FROM "Learner".learner_monthly_targets t
            JOIN "Learner".learners l ON l.id=t.learner_id
            WHERE t.learner_id=ANY(%s) AND coalesce(t.programme_profile_id,'')=''
              AND (t.enrolment_id IS NULL OR t.enrolment_id IS NOT DISTINCT FROM l.enrolment_id)
              AND (t.programme_id IS NULL OR t.programme_id IS NOT DISTINCT FROM l.programme_id)
            ORDER BY t.learner_id,t.report_month,
              (t.enrolment_id IS NOT DISTINCT FROM l.enrolment_id) DESC,
              (t.programme_id IS NOT DISTINCT FROM l.programme_id) DESC,
              t.updated_at DESC,t.id DESC''', [profile_ids]):
            if item['target_hours'] is not None:
                targets[int(item['learner_id'])][item['report_month']] = float(item['target_hours'])
        for enrolment_id, owner in owners.items():
            profile_id = int(owner['id'])
            if owner.get('progress_transfer_active') or profile_id in retake_profiles:
                records[profile_id] = self.entries_for(owner)
            result[enrolment_id] = {
                'profile_id': profile_id,
                'start_date': owner.get('start_date'), 'end_date': owner.get('end_date'),
                **metrics_from_records(records[profile_id], targets[profile_id])['otjh'],
            }
        review_hours = planned_hours_bulk(list(owners.values()), self.query)
        for enrolment_id, hours in review_hours.items():
            if not hours:
                continue
            result[enrolment_id]['review_planned'] = hours
            if result[enrolment_id]['planned'] is not None:
                result[enrolment_id]['planned'] += hours
        return result

    def current_records(self, owner, records):
        submissions = self.query('''SELECT id,component_ref,progress_entry_id,status,actual_time_hours,
            submitted_at,activity_type,activity_title,module_title,ksb_codes,
            full_submission->>'submissionOrigin' = 'imported_legacy' AS imported
            FROM "Learner".learning_reflection_submissions
            WHERE learner_id=%s AND learner_kind=%s AND activity_type IN ('assignment','extra_activity')
            ORDER BY submitted_at NULLS FIRST,id''', [str(owner['enrolment_id']), owner.get('learner_type')])
        markings = {str(s['component_ref']): s for s in submissions if s.get('component_ref')}
        projected = merge_submissions(project_current(records, markings), submissions)
        return merge_attempts(projected, self.subject_attempt_rows(owner))

    def subject_attempt_rows(self, owner, *, timed_only=False):
        """Owned persisted attempts, shared by full and hours-only projections."""
        if not owner.get('aptem_id') or not self.attempts_relation_exists():
            return []
        return self.query('''SELECT group_id,activity_id,
            coalesce(definition->>'catalogue_kind','material') AS catalogue_kind,bool_or(completed) AS completed,
            max(score_percent) AS best_percent,max(submitted_at) AS submitted_at,
            max(definition->>'title') AS title,
            jsonb_agg(jsonb_build_object('id',id,'completed',completed,'timing',definition->'studyTime'))
                FILTER (WHERE definition ? 'studyTime') AS timed_attempts
            FROM "Learner".subject_activity_attempts
            WHERE enrolment_id=%s AND aptem_id=%s AND submitted_at IS NOT NULL'''
            + (" AND definition ? 'studyTime'" if timed_only else '') + '''
            GROUP BY group_id,activity_id,coalesce(definition->>'catalogue_kind','material')''', [owner['enrolment_id'], owner['aptem_id']])

    def entries_for(self, owner):
        """LMS catalogue-summary ledger read, followed by its hours projection.

        Restrict to this learner before joining lineage. Segment presence is
        sufficient; neither KSB payloads nor evidence bodies affect earned hours.
        """
        rows = self.query('''WITH canonical AS (
                SELECT progress.id,progress.learner_id,progress.kind,progress.module_ref,progress.module_title,progress.component_ref,progress.component_title,progress.component_type,progress.quiz_ref,progress.passed,progress.reported_time,progress.submitted_at,progress.declared_completed_at,progress.started_at,progress.time_tracking_source,progress.claimed_seconds,progress.verified_seconds,progress.expected_otjh,progress.source_system,progress.component_link_source,progress.actual_seconds,progress.accepted,progress.reporting_started_at,progress.reporting_ended_at,progress.reporting_month,progress.achieved_score,progress.total_score,progress.activity_status,CASE WHEN jsonb_typeof(progress.source_payload)='object'
                    THEN jsonb_build_object('retakeTimeChoice',progress.source_payload->'retakeTimeChoice','original_source_ref',progress.source_payload->'original_source_ref')
                    ELSE progress.source_payload END AS source_payload,
                    progress.feed_kind,to_jsonb(progress)->'actual_basis' AS actual_basis
                FROM "Learner".learner_progress_entries progress
                WHERE progress.learner_id=%s AND progress.deleted_at IS NULL
            ), reporting_segments AS (
                SELECT s.progress_id,'[{}]'::jsonb AS payload
                FROM "Learner".learner_activity_reporting_segments s
                JOIN canonical p ON p.id=s.progress_id AND p.learner_id=s.learner_id
                GROUP BY s.progress_id
            ), activity_sources AS (
                SELECT s.canonical_progress_id AS progress_id,jsonb_agg(jsonb_build_object(
                    'source_id',s.id,'source_system',s.source_system,'source_activity_id',s.source_activity_id,
                    'completed',s.completed,
                    'source_course_ref',c.source_course_ref,'source_course_id',c.id,
                    'course_title',c.source_course_title,'catalogue_id',a.id,
                    'component_ref',coalesce(nullif(s.curriculum_component_ref,''),a.curriculum_component_ref),
                    'module_ref',c.curriculum_module_ref,'group_ref',c.curriculum_group_ref,
                    'activity_status',s.activity_status,
                    'source_activity_kind',a.source_activity_kind) ORDER BY s.id) AS payload
                FROM "Learner".learner_activity_sources s
                JOIN canonical p ON s.canonical_progress_id=p.id AND s.learner_id=p.learner_id
                LEFT JOIN curriculum.source_activities a ON a.id=s.source_catalog_activity_id AND a.deleted_at IS NULL
                LEFT JOIN curriculum.source_courses c ON c.id=a.source_course_id AND c.deleted_at IS NULL
                WHERE s.deleted_at IS NULL
                GROUP BY s.canonical_progress_id
            ), journal_routes AS (
                SELECT j.progress_id,jsonb_agg(jsonb_build_object(
                    'group_id',j.group_id,'activity_id',j.activity_id,'source_ref',j.source_ref,
                    'source_system',s.source_system,'month',j.month,'activity_date',j.activity_date) ORDER BY j.id) AS payload,
                    sum(j.planned_hours) AS planned
                FROM "Learner".learner_journal_rows j
                JOIN canonical p ON j.progress_id=p.id AND j.canonical_learner_id=p.learner_id
                JOIN "Learner".learner_activity_sources s ON s.id=j.source_id
                  AND s.learner_id=p.learner_id AND s.canonical_progress_id=p.id AND s.deleted_at IS NULL
                WHERE j.deleted_at IS NULL
                GROUP BY j.progress_id
            ), historical_components AS (
                SELECT link.progress_id,jsonb_agg(jsonb_build_object('source_system',h.source_system,'source_course_ref',h.source_course_ref,'source_activity_id',h.source_activity_id) ORDER BY h.id) AS payload
                FROM "Learner".learner_progress_historical_components link
                JOIN canonical p ON p.id=link.progress_id
                JOIN curriculum.historical_components h ON h.id=link.historical_component_ref
                  AND h.deleted_at IS NULL AND h.historical_only=true
                GROUP BY link.progress_id
            )
                SELECT to_jsonb(p) AS payload,
                  '[]'::jsonb AS ksbs,
                  coalesce(seg.payload,'[]'::jsonb) AS segments,
                  coalesce(src.payload,'[]'::jsonb) AS sources,
                  coalesce(j.payload,'[]'::jsonb) AS journal_routes,
                  j.planned AS journal_planned_hours,
                  coalesce(h.payload,'[]'::jsonb) AS historical_components
                FROM canonical p

                LEFT JOIN reporting_segments seg ON seg.progress_id=p.id
                LEFT JOIN activity_sources src ON src.progress_id=p.id
                LEFT JOIN journal_routes j ON j.progress_id=p.id
                LEFT JOIN historical_components h ON h.progress_id=p.id
                ORDER BY p.reporting_month,p.reporting_started_at NULLS LAST,p.id''', [owner['id']])
        loaded = [{**decoded(row['payload'], {}), **{
            field: decoded(row.get(field), []) for field in
            ('ksbs', 'segments', 'sources', 'journal_routes', 'historical_components')}} for row in rows]
        state = self.read_transfer_state(owner['enrolment_id']) if owner.get('progress_transfer_active') else None
        if state is not None:
            loaded = frozen_records(loaded, state)
        result = progress_records_with_completion(loaded, self.current_records(owner, loaded))
        return frozen_records(result, state) if state is not None else result

    def read_transfer_state(self, enrolment_id):
        items = self.query('''SELECT i.snapshot FROM "Learner".progress_transfer_requests r
            JOIN "Learner".progress_transfer_items i ON i.request_id=r.id AND i.enrolment_id=r.enrolment_id
            WHERE r.enrolment_id=%s ORDER BY r.requested_at,i.course_ref''', [enrolment_id])
        snapshots = self.query('''SELECT records FROM "Learner".progress_transfer_requests
            WHERE enrolment_id=%s ORDER BY requested_at''', [enrolment_id]) if items else []
        return {'items': [decoded(i['snapshot'], {}) for i in items],
                'records': [r for s in snapshots for r in decoded(s['records'], [])]}


def programme_window(row):
    """Match coach_api.selectors.otjh: enrolment dates precede profile dates."""
    def first(*keys):
        return next((row.get(k) for k in keys
                     if row.get(k) is not None and str(row[k]).strip().casefold()
                     not in {'', 'none', 'null', '--', 'n/a'}), None)
    return (first('source_start', 'source_learner_start', 'start_date'),
            first('source_end', 'source_learner_end', 'source_apprenticeship_end',
                  'source_practical_end', 'end_date'))


def to_date_metrics(actual, planned, start, end, today):
    """Same rounding, date pacing, capped percentage and RAG as the LMS API."""
    start, end = parse_date_value(start), parse_date_value(end)
    start = start.date() if isinstance(start, datetime) else start
    end = end.date() if isinstance(end, datetime) else end
    target = None
    if planned is not None and planned > 0 and start and end and end > start:
        target = round(max(0.0, min(planned, planned * (today - start).days / (end - start).days)), 2)
    shortfall = round(max(target - actual, 0.0), 2) if actual is not None and target is not None else None
    delta = actual - target if shortfall is not None else None
    percent = round(max(0.0, min(100.0, actual / target * 100)), 2) if delta is not None and target > 0 else None
    status = ('Unavailable' if shortfall is None else 'At Risk' if shortfall > 40
              else 'Need Attention' if shortfall > 20 else 'On Track')
    return {'completed': actual, 'planned': planned, 'target': target,
            'progress_hours': round(delta, 2) if delta is not None else None,
            'progress_variance': delta / target if delta is not None and target else None,
            'progress_percent': percent, 'shortfall_hours': shortfall, 'otjh_status': status,
            'as_of': today.isoformat(), 'source': 'lms:canonical-programme-plan-window'}


def read_otjh(cursor, profile_ids, *, today=None):
    ids = sorted({int(i) for i in profile_ids if i is not None})
    if not ids:
        return {}
    today = today or datetime.now(ZoneInfo('Europe/London')).date()
    reader = Reader(cursor)
    profiles = reader.query('''SELECT l.id,l.enrolment_id,l.start_date,l.end_date,
        u."Start_date" AS source_start,u."Learner_start_date" AS source_learner_start,
        u."End_date" AS source_end,u."Learner_end_date" AS source_learner_end,
        u."Apprenticeship_End_date" AS source_apprenticeship_end,
        u."Practical_period_end_date" AS source_practical_end
        FROM "Learner".learners l LEFT JOIN enrolment."Created_users" u ON u.id=l.enrolment_id
        WHERE l.id=ANY(%s)''', [ids])
    totals = reader.summary([p['enrolment_id'] for p in profiles])
    result = {}
    for profile in profiles:
        facts = totals.get(profile['enrolment_id']) or {}
        if facts.get('profile_id') != profile['id']:
            facts = {}
        start, end = programme_window(profile)
        result[profile['id']] = to_date_metrics(facts.get('actual'), facts.get('planned'), start, end, today)
    return result

