"""
Attendance computation for the Coach Summary page.

Roster - the same active learners as the Coaches Performance page (see
lateness_compute): every *active* learner on the Aptem extract
(``aptem_auto_extracting``; Alfanar accounts and excluded owners dropped; coach
taken from Aptem, or from the LMS when the Aptem owner is a placeholder) plus
the LMS-only learners (Active / Delivery on the new LMS).

Attendance - two registers, merged the way the LMS merges them
(``kbc_sync.combined_attendance_source``): one session per learner per day per
module, attended if either register says present.

  * ``kbc_attendance`` (KBC main database) - the legacy register.
    ``Attendance`` 0 = absent, > 0 = present, null = not counted.
  * ``"Learner".learner_attendance_details`` (LMS database) - the LMS's Teams
    live-session attendance. Only sessions that actually ran (occurrence
    ``completed``) count, and a learner not expected at the session (not on the
    module roster) counts only if they attended.

A record is linked to a roster learner by Aptem id, then LMS learner id, then
email.

Weeks use the ISO-8601 week scheme (weeks run Monday-Sunday):

    each week runs Monday-Sunday; the week number and year are the ISO
    calendar values, e.g. ISO 2026-W26 = Mon 22 Jun - Sun 28 Jun 2026.

The absence ratio for a (coach, week) is per learner::

    learners who attended none of their sessions / learners with a session

expressed as a percentage. "vs company" is the coach's share of all company
absences that week (coach_absent / company_absent), as a percentage, so the
company-wide row is 100%.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import os

import psycopg

from .lateness_compute import (
    _clean, _fetch_dicts, _is_alfanar, _is_excluded_owner, _lower, _owner_resolver,
)
from .lms_source import get_lms_data

# Per (learner, week) a learner counts as "present" if they attended ANY session
# that week, and "absent" only if they missed every session they had.
# (Mirrors the n8n Attendence.js logic.)

# Reporting timezone — "today" (and therefore the visible week window) is
# anchored to this zone, matching the n8n node.
TIMEZONE = "Africa/Cairo"

# The earliest week the report covers (a Monday). Weeks before this are hidden.
START_FROM = date(2026, 3, 9)


def _today():
    """Today's date in the reporting timezone (Africa/Cairo)."""
    return datetime.now(ZoneInfo(TIMEZONE)).date()


def _kbc_dsn():
    dsn = os.environ.get("kbc_main_database_url")
    if not dsn:
        raise RuntimeError("kbc_main_database_url is not configured in the environment.")
    return dsn


def _connect():
    return psycopg.connect(_kbc_dsn())


def _lms_connect():
    dsn = os.environ.get("LMS_DATABASE_URL")
    if not dsn:
        raise RuntimeError("LMS_DATABASE_URL is not configured in the environment.")
    return psycopg.connect(dsn)


# --------------------------------------------------------------------------
# Year-week helpers (ISO-8601 week, Monday-Sunday)
# --------------------------------------------------------------------------

def iso_year_week(d):
    """(ISO year, ISO week) for a date. Note the ISO year can differ from the
    calendar year for late-December / early-January dates."""
    iso = d.isocalendar()
    return iso[0], iso[1]


def year_week_of(d):
    """ISO week number (Monday-start). See iso_year_week for the (year, week) key."""
    return d.isocalendar()[1]


def _iso_weeks_in_year(iso_year):
    """Number of ISO weeks in an ISO year (52 or 53). Dec 28 is always in the
    last ISO week of its ISO year, so its week number is the count."""
    return date(iso_year, 12, 28).isocalendar()[1]


def week_bounds(year, week):
    """Inclusive [Monday, Sunday] dates for an ISO (year, week)."""
    start = date.fromisocalendar(year, week, 1)  # Monday
    end = date.fromisocalendar(year, week, 7)    # Sunday
    return start, end


def current_year_week(today=None):
    """The ISO (year, week) that *contains* today — i.e. the in-progress week."""
    today = today or _today()
    return iso_year_week(today)


def latest_visible_week(today=None):
    """The newest week the dashboard shows.

    The in-progress week is hidden until it ends. Matching the n8n rule, the
    current week becomes visible on its Sunday (the last day); on any other day
    the newest shown week is the previous (fully completed) one.
    """
    today = today or _today()
    monday = date.fromisocalendar(*iso_year_week(today), 1)  # Monday of today's week
    if today.weekday() == 6:                # Sunday — current week is complete
        return iso_year_week(monday)
    prev_sunday = monday - timedelta(days=1)
    return iso_year_week(prev_sunday)


def recent_weeks(count=10, today=None):
    """
    Return a list of (year, week) tuples for the most recent ``count`` weeks,
    newest first, walking backwards across year boundaries. The newest week is
    the most recent *completed* week — the in-progress current week is excluded.
    """
    year, week = latest_visible_week(today)
    weeks = []
    for _ in range(count):
        weeks.append((year, week))
        week -= 1
        if week < 1:
            year -= 1
            # Last ISO week index of the previous ISO year.
            week = _iso_weeks_in_year(year)
    return weeks


def _step_back(year, week):
    """The (year, week) immediately older than the given one."""
    w = week - 1
    y = year
    if w < 1:
        y -= 1
        w = _iso_weeks_in_year(y)
    return y, w


def _step_forward(year, week):
    """The (year, week) immediately newer than the given one."""
    last = _iso_weeks_in_year(year)
    w = week + 1
    y = year
    if w > last:
        y += 1
        w = 1
    return y, w


def weeks_before(year, week, count=10):
    """The ``count`` weeks strictly older than (year, week), newest first."""
    weeks = []
    y, w = year, week
    for _ in range(count):
        y, w = _step_back(y, w)
        weeks.append((y, w))
    return weeks


def weeks_after(year, week, count=10, today=None):
    """
    The ``count`` weeks ending at the week strictly newer than (year, week),
    newest first. Never returns weeks beyond the most recent *completed* week
    (the in-progress current week stays hidden). The newest week of the returned
    window is (year, week) + count steps forward, clamped to that latest week.
    """
    cur_year, cur_week = latest_visible_week(today)
    # Walk forward ``count`` steps from the anchor to find this window's newest.
    y, w = year, week
    for _ in range(count):
        y, w = _step_forward(y, w)
        # Clamp: don't go past the latest completed week.
        if (y, w) > (cur_year, cur_week):
            y, w = cur_year, cur_week
            break
    # Build the window of ``count`` weeks ending at (y, w), newest first.
    weeks = [(y, w)]
    for _ in range(count - 1):
        y, w = _step_back(y, w)
        weeks.append((y, w))
    return weeks


def format_week_range(year, week):
    s, e = week_bounds(year, week)
    return {
        "year": year,
        "week": week,
        "weekStart": s.isoformat(),
        "weekEnd": e.isoformat(),
        "label": f"W{week}",
    }


# --------------------------------------------------------------------------
# Roster, attendance and aggregation
# --------------------------------------------------------------------------

def _active_learners():
    """The Coaches Performance roster: one dict per active learner with their
    coach, Aptem id / LMS id, name, email and group."""
    lms = get_lms_data()
    resolve = _owner_resolver(lms["coach_by_email"])
    learners = []
    rows = _fetch_dicts(
        'SELECT "ID", "FullName", "Email", "OwnerName", "Program-Status", "Group" '
        'FROM aptem_auto_extracting'
    )
    for r in rows:
        if _lower(r.get("Program-Status")) != "active" or _is_alfanar(r.get("Email")):
            continue
        owner, _ = resolve(r.get("OwnerName"), r.get("Email"))
        if _is_excluded_owner(owner):
            continue
        learners.append({
            "coach": owner,
            "aptem_id": r.get("ID"),
            "lms_id": None,
            "name": _clean(r.get("FullName")) or "Unknown Learner",
            "email": _lower(r.get("Email")),
            "group": _clean(r.get("Group")),
        })
    for x in lms["extras"]:
        if _is_excluded_owner(x["coach"]):
            continue
        learners.append({
            "coach": x["coach"],
            "aptem_id": None,
            "lms_id": x["lms_id"],
            "name": x["name"],
            "email": _lower(x["email"]),
            "group": x["programme"],
        })
    for i, l in enumerate(learners):
        l["key"] = i
    return learners


# Invisible direction marks that some register emails carry (e.g. U+202B).
_EMAIL_JUNK = "‎‏‪‫‬‭‮ "


def _norm_email(value):
    return _lower(value).strip(_EMAIL_JUNK)


def _learner_matcher(learners):
    """Return match(aptem_id, lms_id, emails) -> roster learner (or None)."""
    by_aptem = {int(l["aptem_id"]): l for l in learners if l["aptem_id"] is not None}
    by_lms = {int(l["lms_id"]): l for l in learners if l["lms_id"] is not None}
    by_email = {l["email"]: l for l in learners if l["email"]}

    def match(aptem_id, lms_id, emails):
        if aptem_id is not None and int(aptem_id) in by_aptem:
            return by_aptem[int(aptem_id)]
        if lms_id is not None and int(lms_id) in by_lms:
            return by_lms[int(lms_id)]
        for e in emails:
            hit = by_email.get(_norm_email(e))
            if hit:
                return hit
        return None
    return match


def _module_key(value):
    return " ".join(_lower(value).split())


def _attendance_sessions(learners, start, end):
    """Roster learners' sessions between ``start`` and ``end`` (inclusive), as
    (learner, session_date, module, attended) tuples, one per learner/day/module."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT \"ID\", \"Email\", date, COALESCE(NULLIF(btrim(module), ''), lecture_name), "
            '"Attendance" > 0 '
            'FROM kbc_attendance '
            'WHERE date >= %s AND date <= %s AND "Attendance" IS NOT NULL',
            (start, end),
        )
        legacy = cur.fetchall()
    with _lms_connect() as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT l.aptem_id, d.learner_profile_id, d.learner_email, l.email, '
            "d.session_date, d.module_title, d.attendance_status = 'present' "
            'FROM "Learner".learner_attendance_details d '
            'JOIN curriculum.live_session_occurrences o ON o.id = d.occurrence_id '
            'LEFT JOIN "Learner".learners l ON l.id = d.learner_profile_id '
            'WHERE d.session_date >= %s AND d.session_date <= %s '
            "AND o.status = 'completed' "
            "AND d.attendance_status IN ('present', 'absent') "
            "AND (d.is_expected OR d.attendance_status = 'present')",
            (start, end),
        )
        lms = cur.fetchall()

    match = _learner_matcher(learners)
    merged = {}

    def add(learner, d, module, ok):
        if learner is None or d is None or not _module_key(module):
            return
        key = (learner["key"], d, _module_key(module))
        prev = merged.get(key)
        merged[key] = (learner, d, prev[2] if prev else _clean(module), ok or (prev[3] if prev else False))

    for aptem_id, email, d, module, ok in legacy:
        add(match(aptem_id, None, [email]), d, module, ok)
    for aptem_id, lms_id, email, alt_email, d, module, ok in lms:
        add(match(aptem_id, lms_id, [email, alt_email]), d, module, ok)
    return list(merged.values())


def _coach_week_rows(sessions, start, end):
    """
    Per-coach aggregation for one week, counted PER LEARNER (not per session).

    A learner attended the week if they were present in any session that week.
    Per coach: ``total`` = learners who had a session that week, ``present`` =
    those who attended at least one, ``absent`` = those who attended none.

    Returns {coach: {"total", "absent", "present"}}.
    """
    attended = {}
    for learner, d, _module, ok in sessions:
        if start <= d <= end:
            k = learner["key"]
            attended[k] = (learner["coach"], attended.get(k, (None, False))[1] or ok)
    out = {}
    for coach, ok in attended.values():
        v = out.setdefault(coach, {"total": 0, "absent": 0, "present": 0})
        v["total"] += 1
        v["present" if ok else "absent"] += 1
    return out


def _active_students_per_coach(learners=None):
    """{coach: active learners on their roster}, whether or not they have an
    attendance record in any window. Used for the table's students_count and by
    the recompute_coach_summary management command."""
    out = {}
    for l in learners if learners is not None else _active_learners():
        out[l["coach"]] = out.get(l["coach"], 0) + 1
    return out


def _ratio(absent, total):
    return round((absent / total) * 100, 2) if total else 0.0


def compute_week_summary(weeks, learners=None):
    """
    For each (year, week) in ``weeks``, compute per-coach absence ratio, absent
    count, present count, learners with a session, and the company-wide ratio.

    Returns a dict keyed by "year-week" -> {
        "year", "week", "weekStart", "weekEnd",
        "company": {absent, present, total, ratio},
        "coaches": { coach: {absent, present, total, ratio, vsCompany} },
    }
    """
    learners = learners if learners is not None else _active_learners()
    bounds = [week_bounds(y, w) for y, w in weeks]
    sessions = _attendance_sessions(
        learners, min(s for s, _ in bounds), max(e for _, e in bounds),
    ) if bounds else []

    result = {}
    for (year, week), (start, end) in zip(weeks, bounds):
        per_coach = _coach_week_rows(sessions, start, end)

        comp_absent = sum(v["absent"] for v in per_coach.values())
        comp_total = sum(v["total"] for v in per_coach.values())
        comp_present = sum(v["present"] for v in per_coach.values())

        coaches = {}
        for owner, v in per_coach.items():
            # "vs Company" = this coach's share of all company absences that
            # week (coach_absent / company_absent), as a percentage. The
            # company row is therefore 100%. This matches the legacy
            # coach_summary semantics and the frontend's badge thresholds.
            vs = round((v["absent"] / comp_absent) * 100, 2) if comp_absent else 0.0
            coaches[owner] = {**v, "ratio": _ratio(v["absent"], v["total"]), "vsCompany": vs}

        result[f"{year}-{week}"] = {
            **format_week_range(year, week),
            "company": {
                "absent": comp_absent,
                "present": comp_present,
                "total": comp_total,
                "ratio": _ratio(comp_absent, comp_total),
            },
            "coaches": coaches,
        }
    return result


# --------------------------------------------------------------------------
# Public: weeks payload for the table (paged history)
# --------------------------------------------------------------------------

def _parse_week_key(key):
    """Parse a "year-week" string into (year, week), or None if invalid."""
    try:
        y, w = (int(x) for x in str(key).split("-"))
        return y, w
    except (ValueError, TypeError):
        return None


def get_attendance_weeks(count=10, before=None, after=None, today=None):
    """
    Build the table payload: a list of week columns (newest first) and, per
    coach, the per-week ratio/vsCompany plus a rolling average over the window.

    Paging (mutually exclusive):
      ``before`` -> the ``count`` weeks strictly older than this "year-week"
                    (move to the *previous*, older window).
      ``after``  -> the window of ``count`` weeks one step *newer* than this
                    "year-week" (move to the *next*, newer window), never past
                    the current week.
    """
    parsed_before = _parse_week_key(before) if before else None
    parsed_after = _parse_week_key(after) if after else None

    if parsed_before:
        weeks = weeks_before(*parsed_before, count=count)
    elif parsed_after:
        weeks = weeks_after(*parsed_after, count=count, today=today)
    else:
        weeks = recent_weeks(count, today)

    learners = _active_learners()
    summary = compute_week_summary(weeks, learners=learners)
    # students_count = every active learner on the coach's roster, whether or
    # not they have an attendance record in the displayed window. (Matches the
    # recompute_coach_summary command.)
    students = _active_students_per_coach(learners)

    week_keys = [f"{y}-{w}" for (y, w) in weeks]
    week_meta = [format_week_range(y, w) for (y, w) in weeks]

    # Every coach with active learners, plus any coach seen in the displayed weeks.
    owners = set(students)
    for key in week_keys:
        owners.update(summary[key]["coaches"].keys())

    coaches = []
    for owner in sorted(owners):
        week_cells = []
        sum_absent = 0
        sum_total = 0
        for key in week_keys:
            cell = summary[key]["coaches"].get(owner)
            if cell:
                week_cells.append({
                    "ratio": cell["ratio"],
                    "vsCompany": cell["vsCompany"],
                    "absent": cell["absent"],
                    "present": cell["present"],
                    "total": cell["total"],
                })
                sum_absent += cell["absent"]
                sum_total += cell["total"]
            else:
                week_cells.append({"ratio": 0.0, "vsCompany": 0.0, "absent": 0, "present": 0, "total": 0})
        # Window ratio is pooled (Σabsent / Σtotal over the window), matching the
        # n8n last_10_weeks_absence_ratio — not the mean of weekly ratios.
        avg = _ratio(sum_absent, sum_total)
        coaches.append({
            "coachName": owner,
            "studentsCount": students.get(owner, 0),
            "windowAvgRatio": avg,
            "weeks": week_cells,
        })

    # Company row across the window.
    company_cells = []
    comp_sum_absent = 0
    comp_sum_total = 0
    for key in week_keys:
        c = summary[key]["company"]
        company_cells.append({
            "ratio": c["ratio"],
            "vsCompany": 100.0 if c["absent"] > 0 else 0.0,
            "absent": c["absent"], "present": c["present"], "total": c["total"],
        })
        comp_sum_absent += c["absent"]
        comp_sum_total += c["total"]
    company_avg = _ratio(comp_sum_absent, comp_sum_total)

    newest = weeks[0] if weeks else None
    oldest = weeks[-1] if weeks else None
    cur_year, cur_week = latest_visible_week(today)

    # There's a newer window if the newest shown week is older than the most
    # recent completed week (the in-progress current week is never shown).
    has_newer = bool(newest) and (newest[0], newest[1]) < (cur_year, cur_week)
    # Don't page earlier than START_FROM, the first reported week.
    earliest = iso_year_week(START_FROM)
    has_older = bool(oldest) and (oldest[0], oldest[1]) > earliest

    return {
        "weeks": week_meta,
        "coaches": coaches,
        "company": {
            "coachName": "OVERALL COMPANY",
            "studentsCount": sum(students.values()),
            "windowAvgRatio": company_avg,
            "weeks": company_cells,
        },
        "oldestWeekKey": week_keys[-1] if week_keys else None,
        "newestWeekKey": week_keys[0] if week_keys else None,
        "hasOlder": has_older,
        "hasNewer": has_newer,
    }


# --------------------------------------------------------------------------
# Public: per-student drill for one coach + one week
# --------------------------------------------------------------------------

def get_attendance_drill(coach_name, year=None, week=None, today=None):
    """
    For one coach and one week, return every active student with their session
    outcomes that week: attended/absent counts and a per-session breakdown.
    """
    if year is None or week is None:
        # Default to the newest *shown* week (last completed), not the in-progress one.
        y, w = latest_visible_week(today)
        year = year if year is not None else y
        week = week if week is not None else w
    year, week = int(year), int(week)
    start, end = week_bounds(year, week)

    learners = [l for l in _active_learners() if l["coach"] == coach_name]
    sessions = sorted(_attendance_sessions(learners, start, end), key=lambda x: x[1])

    # Group by student.
    students = {}
    for learner, sdate, module, ok in sessions:
        st = students.get(learner["key"])
        if st is None:
            st = students[learner["key"]] = {
                "id": learner["aptem_id"] if learner["aptem_id"] is not None else learner["lms_id"],
                "name": learner["name"],
                "email": learner["email"],
                "group": learner["group"],
                "attended": 0,
                "absent": 0,
                "sessions": [],
            }
        st["attended" if ok else "absent"] += 1
        st["sessions"].append({
            "date": sdate.isoformat(),
            "status": "attended" if ok else "absent",
            "module": module,
        })

    def overall_status(st):
        if st["absent"] == 0:
            return "attended"
        if st["attended"] == 0:
            return "absent"
        return "partial"

    # Only learners who actually have an attendance record this week.
    learners = list(students.values())
    for st in learners:
        st["status"] = overall_status(st)

    # Sort by group, then absent-first, then name within the group.
    order = {"absent": 0, "partial": 1, "attended": 2}
    learners.sort(key=lambda s: (
        s["group"].lower() or "￿",   # blank group sorts last
        order.get(s["status"], 9),
        s["name"].lower(),
    ))

    # Per-student week figures (match the table cell): a learner with any session
    # counts once; "absent" = attended none that week (status "absent").
    expected_students = len(learners)
    absent_students = sum(1 for s in learners if s["attended"] == 0)

    # Session-level totals kept as supplementary detail.
    counted_total = sum(s["attended"] + s["absent"] for s in learners)
    absent_total = sum(s["absent"] for s in learners)

    return {
        "coach": coach_name,
        **format_week_range(year, week),
        "studentsCount": expected_students,
        "absentSessions": absent_total,
        "countedSessions": counted_total,
        # Per-student absence ratio for the week (absent learners / learners with
        # sessions), consistent with the Coach Summary table cell.
        "ratio": _ratio(absent_students, expected_students),
        "learners": learners,
    }
