"""
LMS (Neon "LMS" project) as a second learner source for the Coaches dashboard.

The LMS's ``"Learner".learners`` table holds every learner — the Aptem
learners (linked by ``aptem_id``) *and* learners enrolled directly on the LMS.
The LMS decides who each coach's learners are: every learner Active / Delivery
on the LMS is counted under their LMS coach. Taken from it:

  * ``coach_by_email`` — the LMS coach assignment for every learner.
    lateness_compute files Aptem learners under it (Aptem's owner is only the
    fallback when the LMS has no coach).
  * ``lifecycle_by_email`` — the LMS lifecycle for every learner. Aptem-Active
    learners that the LMS has in another state (e.g. ready to enrol) are dropped.
  * ``extras`` — learners Active / Delivery on the LMS that Aptem doesn't have
    as Active (LMS-native learners, and Aptem-linked ones missing from the
    extract or not Active there), with their OTJH hours, last learning
    activity, and PR / MCM review slots (from the LMS's own review system,
    ``curriculum.review_instances``).
  * ``aptem_linked_active`` — Aptem-linked learners that are Active / Delivery
    on the LMS. lateness_compute flags the ones Aptem doesn't have as Active
    (status conflicts); they're counted from the LMS (as ``extras``).

Learners Active on Aptem keep their Aptem metrics (evidence, PR, MCR); the LMS
review instances generated for them are skipped so nothing is double counted.

Reads use psycopg directly against ``LMS_DATABASE_URL``. Results are cached
briefly because one page load triggers several compute calls. If the LMS is
unreachable the dashboard degrades to Aptem-only rather than failing.
"""

import logging
import os
import re
import threading
import time

import psycopg
from django.db import connection, connections

log = logging.getLogger(__name__)


class LmsDataUnavailable(RuntimeError):
    """The authoritative learner/marking population could not be loaded."""

CACHE_SECONDS = 30

# LMS lifecycle states that count as an active learner (Aptem "Active" maps to
# active / delivery; onboarding, on break, EPA, withdrawn, completed don't).
ACTIVE_LIFECYCLES = ("active", "delivery")

# LMS review type codes -> dashboard metric. Other types (personal support plan,
# gateway, first session) aren't PR/MCM and are ignored, as in the Aptem tables.
REVIEW_METRIC = {"progress_review": "PR", "mcm": "MCM"}

# Staff, partner and synthetic accounts that appear as LMS learners.
_NON_LEARNER_DOMAINS = (
    "@kentbusinesscollege.com", "@kentbusinesscollege.org", "@kentbusinesscollege.net",
    "@alfanar.com",
)
_NON_LEARNER_SUFFIXES = (".invalid", ".test")
# Placeholder email the LMS gives a real learner whose login was removed
# ("removed-account-599@accounts.invalid"); they still count while active.
_REMOVED_ACCOUNT_DOMAIN = "@accounts.invalid"
_TEST_RE = re.compile(r"\btest\b|\bqa\b", re.IGNORECASE)

_cache = {"at": 0.0, "data": None}
_lock = threading.Lock()


def _clean(value):
    return str(value if value is not None else "").strip()


def normalize_name(value):
    """Collapse runs of whitespace (the LMS has e.g. "Asmaa  Hamazeen")."""
    return " ".join(_clean(value).split())


def _is_test_coach(coach):
    return not coach or bool(_TEST_RE.search(coach))


def _is_test_learner(name, email, programme):
    e = _clean(email).lower()
    if not e or e.endswith(_NON_LEARNER_DOMAINS):
        return True
    if e.endswith(_NON_LEARNER_SUFFIXES) and not e.endswith(_REMOVED_ACCOUNT_DOMAIN):
        return True
    if "@example." in e:
        return True
    if not _clean(programme):
        return True
    return bool(_TEST_RE.search(_clean(name)) or _TEST_RE.search(_clean(programme)))


def _status_text(status):
    """LMS review status slug -> the Aptem-style text _classify_status expects
    ("not-scheduled" -> "Not Scheduled", "awaiting-signature" -> ...)."""
    return _clean(status).replace("-", " ").replace("_", " ").title()


def _as_date(value):
    if value is None:
        return None
    return value.date() if hasattr(value, "date") else value


def _num(value):
    return float(value) if value is not None else None


def _otjh_facts(cur, lms_ids):
    """Canonical LMS OTJH facts per profile, including saved attempts and extras.

    No stale summary-column substitution: invalid identity or missing programme
    plan remains unavailable. Bands use rounded shortfall hours from the same
    programme dates and accepted-hour projection as the LMS coach dashboard.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    ids = sorted({int(i) for i in lms_ids if i is not None})
    if not ids:
        return {}
    today = datetime.now(ZoneInfo('Europe/London')).date()
    # Latest snapshot wins when a learner appears under more than one coach.
    cur.execute(
        '''SELECT DISTINCT ON ((l->>'id')::bigint) (l->>'id')::bigint,
                  (l->>'otjhActual')::numeric, (l->>'otjhPlanned')::numeric,
                  (l->>'otjhTargetAsOfToday')::numeric,
                  l->>'otjhRagStatus'
             FROM "Coach".coach_dashboard_snapshot s
             CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.payload->'learners', '[]'::jsonb)) l
            WHERE l->>'id' ~ '^[0-9]+$' AND (l->>'id')::bigint = ANY(%s)
            ORDER BY (l->>'id')::bigint, s.refreshed_at DESC''',
        (ids,),
    )
    snap = {r[0]: r[1:] for r in cur.fetchall()}
    cur.execute(
        'SELECT t.learner_id, t.planned_hours, t.target_hours, '
        '(SELECT sum(e.actual_seconds) / 3600.0 FROM "Learner".learner_progress_entries e '
        ' WHERE e.learner_id = t.learner_id AND e.deleted_at IS NULL AND e.accepted) '
        'FROM "Learner".learner_target_hours_current t WHERE t.learner_id = ANY(%s)',
        (ids,),
    )
    view = {r[0]: r[1:] for r in cur.fetchall()}

    out = {}
    for i in ids:
        s_actual, s_planned, s_target, s_rag = snap.get(i, (None, None, None, None))
        v_planned, v_target, v_actual = view.get(i, (None, None, None))
        from_lms = s_target is not None
        actual = _num(s_actual) if s_actual is not None else _num(v_actual)
        planned = _num(s_planned if from_lms else v_planned)
        target = _num(s_target if from_lms else v_target)
        if actual is None and target is not None:
            actual = 0.0
        shortfall = round(max(target - actual, 0.0), 2) if target is not None else None
        delta = actual - target if target is not None else None
        normalized_rag = _clean(s_rag).lower().replace('_', '-').replace(' ', '-')
        snapshot_status = {
            'on-track': 'On Track',
            'need-attention': 'Need Attention',
            'at-risk': 'At Risk',
            'unavailable': 'Unavailable',
        }.get(normalized_rag)
        out[i] = {
            "completed": actual, "planned": planned, "target": target,
            "progress_hours": round(delta, 2) if delta is not None else None,
            "progress_variance": delta / target if delta is not None and target else None,
            "progress_percent": round(max(0.0, min(100.0, actual / target * 100)), 2)
            if delta is not None and target > 0 else None,
            "shortfall_hours": shortfall,
            # The snapshot's RAG is the LMS coach-dashboard classification.
            # Only derive it from hours when the snapshot does not provide one.
            "otjh_status": (snapshot_status or
                            ("Unavailable" if shortfall is None else "At Risk" if shortfall > 40
                             else "Need Attention" if shortfall > 20 else "On Track")),
            "as_of": today.isoformat(),
            "source": ("lms:canonical-programme-plan-window" if from_lms
                       else "lms:learner_target_hours_current" if target is not None else "unavailable"),
        }
    return out


def _aptem_owners():
    """Aptem owner of every Active learner in the Aptem extract, by Aptem id and
    by email — used only for learners the LMS has no coach for."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT "ID", "Email", "OwnerName", "Program-Status" FROM aptem_auto_extracting')
            rows = cursor.fetchall()
    except Exception:
        log.warning("Aptem extract unavailable; learners without an LMS coach stay unassigned.")
        return {}
    owners = {}
    for id_, email, owner, status in rows:
        if _clean(status).lower() != "active" or not _clean(owner):
            continue
        if _clean(id_).isdigit():
            owners[("id", int(id_))] = _clean(owner)
        if _clean(email):
            owners[("email", _clean(email).lower())] = _clean(owner)
    return owners


def _aptem_active():
    """(ids, emails) of the learners Active in the Aptem extract — the ones
    counted from Aptem's own tables."""
    with connection.cursor() as cursor:
        try:
            cursor.execute('SELECT "ID", "Email", "Program-Status" FROM aptem_auto_extracting')
        except Exception as exc:
            # The LMS database can be deployed without the legacy Aptem
            # extract.  In that configuration the LMS caseload is the complete
            # authoritative population, so treat the optional Aptem set as
            # empty instead of making the whole dashboard unavailable.
            cause = getattr(exc, "__cause__", None)
            sqlstate = getattr(exc, "sqlstate", None) or getattr(cause, "sqlstate", None)
            if sqlstate == "42P01":
                log.warning("Legacy Aptem extract table is unavailable; using LMS caseload only.")
                return set(), set()
            raise
        rows = cursor.fetchall()
    ids, emails = set(), set()
    for id_, email, status in rows:
        if _clean(status).lower() != "active":
            continue
        if id_ is not None and _clean(id_).isdigit():
            ids.add(int(id_))
        if _clean(email):
            emails.add(_clean(email).lower())
    return ids, emails


def _empty():
    return {
        "coach_by_email": {}, "lifecycle_by_email": {}, "extras": [],
        "aptem_linked_active": [], "otjh_by_email": {},
        "caseload": [], "marking_queue": [], "caseload_available": False,
        "performance_by_email": {},
    }


def _coach_performance(cursor, coach_emails, caseload, as_of=None):
    """Return the LMS dashboard's authoritative card metrics by coach email.

    This mirrors ``coach_performance_metrics_by_coach`` in LMS_v2: attendance
    is separate from learning activity engagement; review rates come from ``Learner.reviews`` and
    OTJH bands come from the persisted coach dashboard snapshot.
    """
    emails = sorted({str(email).strip().lower() for email in coach_emails if str(email or '').strip()})
    if not emails:
        return {}

    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    as_of = as_of or datetime.now(ZoneInfo('Europe/London')).date()

    # Snapshot metrics are already the LMS UI's canonical attendance/OTJH
    # projection.  The query aggregates JSON in Postgres so full snapshots do
    # not cross the application boundary.
    q = '''
        SELECT lower(s.owner_email),
               round(avg((learner->>\'attendanceRate\')::numeric)
                     FILTER (WHERE learner->>\'enrollmentStatus\' = \'active\'
                                  AND learner->>\'attendanceRateAvailable\' = \'true\'
                                  AND learner->>\'attendanceRate\' IS NOT NULL))::int,
               count(*) FILTER (WHERE learner->>\'enrollmentStatus\' = \'active\'
                                  AND learner->>\'otjhRagStatus\' = \'on-track\')::int,
               count(*) FILTER (WHERE learner->>\'enrollmentStatus\' = \'active\'
                                  AND learner->>\'otjhRagStatus\' = \'need-attention\')::int,
               count(*) FILTER (WHERE learner->>\'enrollmentStatus\' = \'active\'
                                  AND learner->>\'otjhRagStatus\' = \'at-risk\')::int
          FROM \"Coach\".\"coach_dashboard_snapshot\" s
          CROSS JOIN LATERAL jsonb_array_elements(
              coalesce(s.payload->\'learners\', \'[]\'::jsonb)
          ) AS learner
         GROUP BY lower(s.owner_email)
    '''
    cursor.execute(q)
    result = {}
    for email, attendance, on_track, need_attention, at_risk in cursor.fetchall():
        if email not in emails:
            continue
        result[email] = {
            'attendance_rate': int(attendance) if attendance is not None else None,
            'otjh_ontrack': int(on_track or 0),
            'otjh_need_attention': int(need_attention or 0),
            'otjh_at_risk': int(at_risk or 0),
        }

    # All periods use the same LMS coach-directory review population and rules.
    from .lms_reviews import read_review_metrics
    for email, periods in read_review_metrics(cursor, caseload, as_of).items():
        item = result.setdefault(email, {'attendance_rate': None})
        item['pr_weeks'] = periods['pr_weeks']
        item['pr_periods'] = periods['PR']
        item['mcm_periods'] = periods['MCM']
        for prefix, key in (('pr', '12w'), ('mcm', '4w')):
            for field, value in periods['PR' if prefix == 'pr' else 'MCM'][key].items():
                item[f'{prefix}_{field}'] = value
    # Match the LMS marking card: all named owned profiles, assignment/extra
    # activity submissions only. This queue is independent of caseload status.
    cursor.execute('''SELECT lower(trim(l.coach_email)), l.id, l.full_name, l.email,
               l.programme_status, count(*)::int
        FROM "Learner".learners l
        JOIN "Learner".learning_reflection_submissions s
          ON s.learner_id = l.enrolment_id::text
        WHERE lower(trim(l.coach_email)) = ANY(%s)
          AND nullif(trim(l.full_name), '') IS NOT NULL
          AND s.status IN ('submitted_for_tutor_review', 'escalated')
          AND lower(trim(s.activity_type)) = ANY(%s)
        GROUP BY lower(trim(l.coach_email)), l.id, l.full_name, l.email, l.programme_status''',
        [emails, ['assignment', 'extra_activity']])
    pending = {}
    for email, identity, name, learner_email, programme_status, count in cursor.fetchall():
        pending.setdefault(email, []).append({
            'name': name, 'email': learner_email or '', 'lms_id': identity,
            'detail': f'{count} pending - {programme_status or "Unknown status"}',
            'pending_count': count,
        })
    for email in emails:
        item = result.setdefault(email, {})
        item['assignment_pending_learners'] = pending.get(email, [])
        item['assignment_pending'] = sum(row['pending_count'] for row in item['assignment_pending_learners'])
    from .lms_marking import read_marking_queue
    for email, rows in read_marking_queue(cursor, emails).items():
        result[email]['pending_learners'] = rows
        result[email]['pending'] = sum(row['pending_count'] for row in rows)
    return result


def _load():
    dsn = os.environ.get("LMS_DATABASE_URL")
    if not dsn:
        log.warning("LMS_DATABASE_URL is not configured; using Aptem data only.")
        return _empty()

    aptem_ids, aptem_emails = _aptem_active()

    with psycopg.connect(dsn, connect_timeout=15, options='-c default_transaction_read_only=on') as conn, conn.cursor() as cur:
        # All LMS metrics in one response describe one consistent database snapshot.
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        # Neon poolers reject statement_timeout as a startup option, but
        # accept it after the connection is established. This prevents a slow
        # LMS query from holding the dashboard request indefinitely.
        cur.execute("SET statement_timeout = '60000ms'")
        from .lms_caseload import read_caseload
        aptem_owners = _aptem_owners()

        def aptem_owner(row):
            aptem_id = row.get("aptem_id")
            return (aptem_owners.get(("id", int(aptem_id))) if aptem_id is not None else None)                 or aptem_owners.get(("email", _clean(row.get("email")).lower()))

        caseload, marking_queue = read_caseload(cur, aptem_owner)
        cur.execute(
            'SELECT id, aptem_id, full_name, email, secondary_email, lifecycle_status, '
            'coach_name, programme, completed_hours, target_hours, minimum_hours, '
            'planned_hours, progress_hours, progress_variance, otjh_status '
            'FROM "Learner".learners'
        )
        cols = [c[0] for c in cur.description]
        learners = [dict(zip(cols, row)) for row in cur.fetchall()]

        # OTJH for the caseload (the LMS's own figures, see _otjh_facts). The
        # denormalised Learner.learners hour columns are stale, so they are
        # only kept for learners outside the caseload.
        canonical_by_id = {
            learner['id']: {
                'completed': _num(learner.get('completed_hours')),
                'target': _num(learner.get('target_hours')),
                'planned': _num(learner.get('planned_hours')),
                'progress_hours': _num(learner.get('progress_hours')),
                'progress_variance': _num(learner.get('progress_variance')),
                'otjh_status': _clean(learner.get('otjh_status')) or 'Unavailable',
            }
            for learner in learners
        }
        canonical_by_id.update(_otjh_facts(cur, [learner['id'] for learner in caseload]))
        # Latest learning activity on the LMS, for engagement (active in 30 days).
        cur.execute(
            'SELECT learner_id, max(submitted_at) FROM "Learner".learner_progress_entries '
            'WHERE learner_id = ANY(%s) AND deleted_at IS NULL AND submitted_at IS NOT NULL '
            'GROUP BY learner_id',
            ([learner['id'] for learner in caseload],),
        )
        last_activity = {r[0]: _as_date(r[1]) for r in cur.fetchall()}
        for learner in caseload:
            learner['last_activity'] = last_activity.get(learner['id'])
        for learner in caseload:
            learner['otjh'] = canonical_by_id.get(learner['id'], {})
        try:
            performance_by_email = _coach_performance(
                cur, [learner.get('coach_email') for learner in caseload], caseload
            )
        except Exception:
            # Do not cache partial results as genuine zero review metrics.
            # The cache retains the previous complete snapshot on failure.
            log.exception("LMS coach performance snapshot is unavailable.")
            raise LmsDataUnavailable("LMS review metrics could not be loaded.")
        otjh_by_email = {}

        # A learner can have several LMS records (e.g. an old withdrawn one);
        # the Active / Delivery record wins, so it's applied last.
        learners.sort(key=lambda l: _clean(l["lifecycle_status"]).lower() in ACTIVE_LIFECYCLES)

        coach_by_email = {}
        lifecycle_by_email = {}
        extras = {}
        aptem_linked_active = []
        for l in learners:
            coach = normalize_name(l["coach_name"])
            lifecycle = _clean(l["lifecycle_status"]).lower()
            emails = [e for e in (_clean(l["email"]).lower(), _clean(l["secondary_email"]).lower()) if e]
            canonical = canonical_by_id.get(l["id"])
            for e in emails:
                lifecycle_by_email[e] = lifecycle
                if not _is_test_coach(coach):
                    coach_by_email[e] = coach
                if canonical:
                    otjh_by_email[e] = canonical

            lms_active = lifecycle in ACTIVE_LIFECYCLES
            if not lms_active:
                continue
            if (l["aptem_id"] is not None
                    and not _is_test_learner(l["full_name"], l["email"], l["programme"])):
                aptem_linked_active.append({
                    "aptem_id": int(l["aptem_id"]),
                    "name": normalize_name(l["full_name"]) or "Unknown Learner",
                    "email": _clean(l["email"]),
                    "coach": "" if _is_test_coach(coach) else coach,
                    "lifecycle": lifecycle,
                })
            # Learners Active on Aptem are counted from Aptem's tables.
            if l["aptem_id"] in aptem_ids or any(e in aptem_emails for e in emails):
                continue
            if _is_test_coach(coach) or _is_test_learner(l["full_name"], l["email"], l["programme"]):
                continue
            extras[l["id"]] = {
                "lms_id": l["id"],
                "aptem_id": int(l["aptem_id"]) if l["aptem_id"] is not None else None,
                "name": normalize_name(l["full_name"]) or "Unknown Learner",
                "email": _clean(l["email"]),
                "coach": coach,
                "programme": _clean(l["programme"]),
                "otjh_status": (canonical or {}).get("otjh_status", "Unavailable"),
                "completed": (canonical or {}).get("completed"),
                "target": (canonical or {}).get("target"),
                "minimum": _num(l["minimum_hours"]),
                "planned": (canonical or {}).get("planned"),
                "progress_hours": (canonical or {}).get("progress_hours"),
                "progress_variance": (canonical or {}).get("progress_variance"),
                "last_activity": None,
                "reviews": {"PR": [], "MCM": []},
            }

        ids = list(extras)
        if ids:
            cur.execute(
                'SELECT learner_id, max(submitted_at) FROM "Learner".learner_progress_entries '
                'WHERE learner_id = ANY(%s) AND deleted_at IS NULL AND submitted_at IS NOT NULL '
                'GROUP BY learner_id',
                (ids,),
            )
            for learner_id, last in cur.fetchall():
                extras[learner_id]["last_activity"] = _as_date(last)

            cur.execute(
                'SELECT ri.learner_id, ty.code, ri.target_date, ri.status, ri.completed_at '
                'FROM curriculum.review_instances ri '
                'JOIN curriculum.review_templates rt ON rt.id = ri.review_template_id '
                'JOIN curriculum.review_types ty ON ty.id = rt.review_type_id '
                'WHERE ri.learner_id = ANY(%s)',
                (ids,),
            )
            for learner_id, code, target_date, status, completed_at in cur.fetchall():
                metric = REVIEW_METRIC.get(_clean(code).lower())
                if not metric or target_date is None:
                    continue
                extras[learner_id]["reviews"][metric].append({
                    "planned": target_date,
                    "status_raw": _status_text(status),
                    "completed_on": _as_date(completed_at),
                })

    return {
        "coach_by_email": coach_by_email,
        "lifecycle_by_email": lifecycle_by_email,
        "extras": list(extras.values()),
        "aptem_linked_active": aptem_linked_active,
        "otjh_by_email": otjh_by_email,
        "caseload": caseload, "marking_queue": marking_queue, "caseload_available": True,
        "performance_by_email": performance_by_email,
    }


def get_lms_data():
    """{"coach_by_email": {email: coach}, "lifecycle_by_email": {email: lifecycle},
    "extras": [learner counted from the LMS, ...],
    "aptem_linked_active": [Aptem-linked learner Active / Delivery on the LMS, ...]}."""
    # Once loaded, requests never wait for a reload: an out-of-date snapshot is
    # served while a background thread refreshes it (one at a time).
    if _cache["data"] is not None:
        if time.monotonic() - _cache["at"] >= CACHE_SECONDS:
            _refresh_in_background()
        return _cache["data"]
    with _lock:
        if _cache["data"] is not None:
            return _cache["data"]
        return _reload()


def _reload():
    """Load the LMS data into the cache (caller holds ``_lock``)."""
    try:
        data = _load()
    except Exception:
        log.exception("Failed to load authoritative LMS metrics; retaining the last complete snapshot.")
        # Keep serving the last good snapshot if there is one.
        return _cache["data"] or _empty()
    _cache["data"], _cache["at"] = data, time.monotonic()
    return data


def _refresh_in_background():
    if not _lock.acquire(blocking=False):
        return  # a load is already running

    def run():
        try:
            if time.monotonic() - _cache["at"] >= CACHE_SECONDS:
                _reload()
        finally:
            _lock.release()
            # The Aptem reads used Django's per-thread connection.
            connections.close_all()

    threading.Thread(target=run, name="lms-cache-refresh", daemon=True).start()


def clear_lms_cache():
    """Force the next dashboard request to reload the LMS population."""
    with _lock:
        _cache["data"] = None
        _cache["at"] = 0.0


# Activity / attendance outcomes on "Learner".learner_progress_entries. An entry
# is done unless it failed (passed = false) or its status is a "not ..." one
# (not attended, not accepted, not_accepted); attendance entries count as
# attended only when attended / accepted / present.
_ATTENDED = ("attended", "accepted", "present")


def get_learner_details(emails, week_start, week_end, profile_ids=None):
    """Per-learner LMS detail for the coach page's learner table.

    Returns ({email: {lms_id, uuid, status, cohort, group, start_date,
    activities_done, activities_total, attendance_done, attendance_total,
    last_activity}}, catchups, review_counts, timetable_rows) where ``catchups`` counts these
    learners' catch-up sessions dated within [week_start, week_end] and
    ``review_counts`` contains current-week PR/MCM meeting counts from the LMS
    coaching calendar.  The calendar is the source of truth for meetings;
    ``Learner.reviews`` is only used as a compatibility fallback when the
    calendar table is unavailable. ``timetable_rows`` carries each meeting's
    status/date so the UI can show Scheduled, Completed, and other statuses.
    Learners are matched on their email or secondary email, preferring the
    Active / Delivery record. Empty on any LMS failure, so the page still
    renders.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    as_of = datetime.now(ZoneInfo("Europe/London")).date()
    dsn = os.environ.get("LMS_DATABASE_URL")
    emails = sorted({_clean(e).lower() for e in emails if _clean(e)})
    profile_ids = sorted({int(i) for i in (profile_ids or []) if i is not None})
    if not dsn or not (emails or profile_ids):
        return {}, 0, {}, []
    try:
        with psycopg.connect(dsn, connect_timeout=15, options='-c default_transaction_read_only=on') as conn, conn.cursor() as cur:
            cur.execute(
                'SELECT id, uuid, aptem_id, lower(email), lower(secondary_email), lifecycle_status, '
                'programme_status, cohort, group_name, start_date, "Learner_Start_date", '
                'completed_hours, target_hours, minimum_hours, planned_hours, '
                'progress_hours, progress_variance, otjh_status '
                'FROM "Learner".learners '
                + ('WHERE id = ANY(%s)' if profile_ids else
                   'WHERE lower(email) = ANY(%s) OR lower(secondary_email) = ANY(%s)'),
                (profile_ids,) if profile_ids else (emails, emails),
            )
            rows = cur.fetchall()
            # The Active / Delivery record wins, so it's applied last.
            rows.sort(key=lambda r: _clean(r[5]).lower() in ACTIVE_LIFECYCLES)
            wanted = set(emails)
            by_email = {}
            for (id_, uuid, aptem_id, email, email2, lifecycle, prog_status, cohort, group,
                 start, learner_start, completed_hours, target_hours, minimum_hours,
                 planned_hours, progress_hours, progress_variance, otjh_status) in rows:
                detail = {
                    "lms_id": id_,
                    "aptem_id": int(aptem_id) if aptem_id is not None else None,
                    "uuid": str(uuid) if uuid else "",
                    "status": _clean(prog_status) or _clean(lifecycle).title(),
                    "cohort": _clean(cohort),
                    "group": _clean(group),
                    # The learner's own start date; the cohort start as fallback.
                    "start_date": _clean(learner_start)[:10] or (start.isoformat() if start else ""),
                    "activities_done": 0, "activities_total": 0,
                    "attendance_done": 0, "attendance_total": 0,
                    "last_activity": "",
                    "lms_completed_hours": _num(completed_hours),
                    "lms_target_hours": _num(target_hours),
                    "lms_minimum_hours": _num(minimum_hours),
                    "lms_planned_hours": _num(planned_hours),
                    "lms_progress_hours": _num(progress_hours),
                    "lms_progress_variance": _num(progress_variance),
                    "lms_otjh_status": _clean(otjh_status),
                }
                for e in (email, email2):
                    if e in wanted:
                        by_email[e] = detail
                by_email[id_] = detail

            ids = list({d["lms_id"] for d in by_email.values()})
            if not ids:
                return {}, 0, {}, []
            cur.execute(
                'SELECT learner_id, count(*), '
                "count(*) FILTER (WHERE passed IS NOT FALSE "
                "AND lower(coalesce(activity_status, '')) NOT LIKE 'not%%'), "
                "count(*) FILTER (WHERE kind = 'attendance'), "
                "count(*) FILTER (WHERE kind = 'attendance' AND lower(activity_status) = ANY(%s)), "
                'max(submitted_at) '
                'FROM "Learner".learner_progress_entries '
                'WHERE learner_id = ANY(%s) AND deleted_at IS NULL GROUP BY learner_id',
                (list(_ATTENDED), ids),
            )
            stats = {r[0]: r[1:] for r in cur.fetchall()}
            for d in by_email.values():
                s = stats.get(d["lms_id"])
                if s:
                    total, done, att_total, att_done, last = s
                    last = _as_date(last)
                    d.update({
                        "activities_done": done, "activities_total": total,
                        "attendance_done": att_done, "attendance_total": att_total,
                        "last_activity": last.isoformat() if last else "",
                    })

            # The same OTJH figures as the coach cards (see _otjh_facts), not
            # the denormalised Learner.learners summary columns.
            canonical_by_id = _otjh_facts(cur, [d["lms_id"] for d in by_email.values()])
            for d in by_email.values():
                canonical = canonical_by_id.get(d["lms_id"])
                if not canonical:
                    continue
                d.update({
                    "lms_completed_hours": canonical["completed"],
                    "lms_target_hours": canonical["target"],
                    "lms_planned_hours": canonical["planned"],
                    "lms_progress_hours": canonical["progress_hours"],
                    "lms_progress_variance": canonical["progress_variance"],
                    "lms_otjh_status": canonical["otjh_status"],
                    "otjh_percent": canonical["progress_percent"],
                    "otjh_target_hours": canonical["target"],
                    "otjh_shortfall_hours": canonical["shortfall_hours"],
                    "otjh_source": canonical["source"],
                    "otjh_as_of": canonical["as_of"],
                })

            cur.execute(
                'SELECT count(*) FROM "Learner".learner_attendance_details '
                'WHERE learner_id = ANY(%s) AND catchup_date BETWEEN %s AND %s',
                (ids, week_start, week_end),
            )
            catchups = cur.fetchone()[0]

            # Match the LMS /coach_api/coach/timetable source precedence:
            #   1) Coach.coach_calendar_event = booked meetings
            #   2) Learner.reviews = imported Aptem reviews not booked above
            #   3) Coach.coach_imported_review_instance = status/owner overlay
            # A calendar booking for an imported review must not be counted a
            # second time from Learner.reviews. Not Scheduled and cancelled
            # rows are plans, not meetings, so they are excluded.
            review_counts = {"PR": 0, "MCM": 0}
            timetable_rows = []
            review_type_to_metric = {
                "monthly coaching meeting": "MCM",
                "monthly coaching review": "MCM",
                "progress review": "PR",
                "progress review (+ skills radar)": "PR",
            }
            booking_type_to_metric = {"mcr": "MCM", "progress-review": "PR"}

            def _meeting_status_is_countable(status):
                compact = re.sub(r"[^a-z]", "", _clean(status).lower())
                return compact not in {"notscheduled", "cancelled", "canceled"}

            def _meeting_status_label(status):
                compact = re.sub(r"[^a-z]", "", _clean(status).lower())
                return {
                    "completed": "Completed",
                    "complete": "Completed",
                    "awaitingsignature": "Awaiting Signature",
                    "scheduled": "Scheduled",
                    "inprogress": "In Progress",
                    "notscheduled": "Not Scheduled",
                    "cancelled": "Cancelled",
                    "canceled": "Cancelled",
                }.get(compact, _clean(status).replace("-", " ").title() or "In Progress")

            def _effective_meeting_status(event_status, review_status, meeting_date):
                """Use the booked event, then review status, for display.

                A past scheduled booking with no completion is awaiting the
                learner/coach signature in the LMS UI, even when the calendar
                row still says ``scheduled``. Keep completed as the strongest
                signal, then apply that display rule to past meetings.
                """
                event_label = _meeting_status_label(event_status) if _clean(event_status) else ""
                review_label = _meeting_status_label(review_status) if _clean(review_status) else ""
                label = review_label if review_label == "Completed" else (event_label or review_label or "In Progress")
                if label == "Scheduled" and meeting_date is not None and meeting_date < as_of:
                    return "Awaiting Signature"
                return label

            try:
                # Load all relevant reviews for type lookup and for the
                # unbooked-review half of the timetable aggregation.
                cur.execute(
                    'SELECT r.id, r.learner_id, lower(trim(r.review_type)), '
                    'r.planned_scheduled_date::date, r.status, '
                    'i.status '
                    'FROM "Learner".reviews r '
                    'LEFT JOIN LATERAL ( '
                    '  SELECT status FROM "Coach".coach_imported_review_instance '
                    '  WHERE source_review_id = r.id '
                    '  ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1 '
                    ') i ON TRUE '
                    'WHERE r.learner_id = ANY(%s) '
                    'AND lower(trim(r.review_type)) = ANY(%s)',
                    (list(ids), list(review_type_to_metric)),
                )
                review_rows = cur.fetchall()
                review_by_id = {
                    int(row[0]): row for row in review_rows if row[0] is not None
                }

                cur.execute(
                    'SELECT event_key, lower(trim(event_type)), status, scheduled_date, target_date, learner_id '
                    'FROM "Coach".coach_calendar_event '
                    'WHERE learner_id = ANY(%s)',
                    (list(ids),),
                )
                booking_rows = cur.fetchall()

                booked_review_ids = set()
                for event_key, event_type, status, scheduled_date, target_date, learner_id in booking_rows:
                    key = _clean(event_key)
                    linked_review = None
                    if key.startswith("imported-review:"):
                        source_id = key.split(":", 1)[1]
                        if source_id.isdigit():
                            source_id = int(source_id)
                            booked_review_ids.add(source_id)
                            linked_review = review_by_id.get(source_id)

                    metric = booking_type_to_metric.get(event_type)
                    if metric is None and linked_review is not None:
                        metric = review_type_to_metric.get(linked_review[2])
                    meeting_date = scheduled_date or target_date
                    effective_status = _effective_meeting_status(
                        status,
                        linked_review[4] if linked_review else "",
                        meeting_date,
                    )
                    if metric and meeting_date is not None:
                        # Keep every status in the coach trend. Only statuses
                        # that represent a real meeting affect the KPI count.
                        if (_meeting_status_is_countable(effective_status)
                                and week_start <= meeting_date <= week_end):
                            review_counts[metric] += 1
                        timetable_rows.append({
                            "learner_id": learner_id,
                            "metric": metric,
                            "status": effective_status,
                            "date": meeting_date.isoformat(),
                        })

                for review_id, learner_id, review_type, planned_date, review_status, instance_status in review_rows:
                    if int(review_id) in booked_review_ids:
                        continue
                    metric = review_type_to_metric.get(review_type)
                    effective_status = _effective_meeting_status(instance_status, review_status, planned_date)
                    if metric and planned_date is not None:
                        if (_meeting_status_is_countable(effective_status)
                                and week_start <= planned_date <= week_end):
                            review_counts[metric] += 1
                        timetable_rows.append({
                            "learner_id": learner_id,
                            "metric": metric,
                            "status": effective_status,
                            "date": planned_date.isoformat(),
                        })
            except Exception:
                # Older LMS branches may not have the timetable tables yet.
                # Keep the dashboard usable with the simple review-ledger
                # query, without masking the main learner data load.
                conn.rollback()
                log.exception("LMS timetable sources unavailable; using review ledger fallback.")
                cur.execute(
                    'SELECT lower(trim(review_type)), count(*) '
                    'FROM "Learner".reviews '
                    'WHERE learner_id = ANY(%s) '
                    'AND lower(trim(review_type)) = ANY(%s) '
                    'AND planned_scheduled_date::date BETWEEN %s AND %s '
                    'GROUP BY lower(trim(review_type))',
                    (list(ids), list(review_type_to_metric), week_start, week_end),
                )
                for review_type, count in cur.fetchall():
                    metric = review_type_to_metric.get(review_type)
                    if metric:
                        review_counts[metric] += int(count or 0)
        return by_email, catchups, review_counts, timetable_rows
    except Exception:
        log.exception("Failed to load LMS learner details.")
        return {}, 0, {}, []
