"""
LMS (Neon "LMS" project) as a second learner source for the Coaches dashboard.

The LMS's ``"Learner".learners`` table holds every learner — the Aptem
learners (linked by ``aptem_id``) *and* learners enrolled directly on the LMS.
Two things are taken from it:

  * ``coach_by_email`` — the LMS coach assignment for every learner.
    lateness_compute uses it only for Aptem learners that Aptem leaves
    unassigned ("Default Owner"); Aptem's own assignments are never changed.
  * ``extras`` — LMS-native learners (no Aptem id, not in the Aptem extract),
    with their OTJH hours, last learning activity, and PR / MCM review slots
    (from the LMS's own review system, ``curriculum.review_instances``).
  * ``aptem_linked_active`` — Aptem-linked learners that are Active / Delivery
    on the LMS. lateness_compute flags the ones Aptem doesn't have as Active
    (status conflicts); they stay uncounted, since Aptem's status wins.

Aptem learners keep their Aptem metrics (evidence, PR, MCR); the LMS review
instances generated for them are skipped so nothing is double counted.

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
from django.db import connection

log = logging.getLogger(__name__)

CACHE_SECONDS = 300

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
    if not e or e.endswith(_NON_LEARNER_DOMAINS) or e.endswith(_NON_LEARNER_SUFFIXES):
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


def _aptem_emails():
    """Emails of every learner in the Aptem extract (any status)."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT "Email" FROM aptem_auto_extracting')
        rows = cursor.fetchall()
    return {_clean(r[0]).lower() for r in rows if _clean(r[0])}


def _load():
    dsn = os.environ.get("LMS_DATABASE_URL")
    if not dsn:
        log.warning("LMS_DATABASE_URL is not configured; using Aptem data only.")
        return {"coach_by_email": {}, "extras": [], "aptem_linked_active": []}

    aptem_emails = _aptem_emails()

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT id, aptem_id, full_name, email, secondary_email, lifecycle_status, '
            'coach_name, programme, completed_hours, target_hours, minimum_hours, '
            'planned_hours, progress_hours, progress_variance, otjh_status '
            'FROM "Learner".learners'
        )
        cols = [c[0] for c in cur.description]
        learners = [dict(zip(cols, row)) for row in cur.fetchall()]

        coach_by_email = {}
        extras = {}
        aptem_linked_active = []
        for l in learners:
            coach = normalize_name(l["coach_name"])
            emails = [e for e in (_clean(l["email"]).lower(), _clean(l["secondary_email"]).lower()) if e]
            if not _is_test_coach(coach):
                for e in emails:
                    coach_by_email[e] = coach

            # Any learner with an Aptem id is an Aptem learner, whose status comes
            # from Aptem — even when they've left the active extract (e.g. entered
            # EPA) while the LMS lifecycle still says active.
            lms_active = _clean(l["lifecycle_status"]).lower() in ACTIVE_LIFECYCLES
            in_aptem = l["aptem_id"] is not None or any(e in aptem_emails for e in emails)
            if in_aptem:
                if (l["aptem_id"] is not None and lms_active
                        and not _is_test_learner(l["full_name"], l["email"], l["programme"])):
                    aptem_linked_active.append({
                        "aptem_id": int(l["aptem_id"]),
                        "name": normalize_name(l["full_name"]) or "Unknown Learner",
                        "email": _clean(l["email"]),
                        "coach": "" if _is_test_coach(coach) else coach,
                        "lifecycle": _clean(l["lifecycle_status"]).lower(),
                    })
                continue
            if not lms_active:
                continue
            if _is_test_coach(coach) or _is_test_learner(l["full_name"], l["email"], l["programme"]):
                continue
            extras[l["id"]] = {
                "lms_id": l["id"],
                "name": normalize_name(l["full_name"]) or "Unknown Learner",
                "email": _clean(l["email"]),
                "coach": coach,
                "programme": _clean(l["programme"]),
                "otjh_status": _clean(l["otjh_status"]),
                "completed": _num(l["completed_hours"]),
                "target": _num(l["target_hours"]),
                "minimum": _num(l["minimum_hours"]),
                "planned": _num(l["planned_hours"]),
                "progress_hours": _num(l["progress_hours"]),
                "progress_variance": _num(l["progress_variance"]),
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
        "extras": list(extras.values()),
        "aptem_linked_active": aptem_linked_active,
    }


def get_lms_data():
    """{"coach_by_email": {email: coach}, "extras": [LMS-only learner, ...],
    "aptem_linked_active": [Aptem-linked learner Active / Delivery on the LMS, ...]}."""
    with _lock:
        if _cache["data"] is not None and time.monotonic() - _cache["at"] < CACHE_SECONDS:
            return _cache["data"]
        try:
            data = _load()
        except Exception:
            log.exception("Failed to load LMS learners; using Aptem data only.")
            # Keep serving the last good snapshot if there is one.
            return _cache["data"] or {"coach_by_email": {}, "extras": [], "aptem_linked_active": []}
        _cache["data"], _cache["at"] = data, time.monotonic()
        return data
