"""
Attendance computation from the KBC main database (kbc_main_database_url).

The dashboard's absence figures are derived from the ``kbc_attendance`` table,
which holds one row per student per session:

    ID            -> student id (links to kbc_users_data."ID")
    date          -> session date
    Attendance    -> 1 = attended, 0 = absent (other values are anomalies)

A student's coach is the ``OwnerName`` on their ``kbc_users_data`` row. We count
only *active* learners (``Program-Status = 'active'``), matching the original
coach_summary methodology.

Weeks use the ISO-8601 week scheme (weeks run Monday-Sunday):

    each week runs Monday-Sunday; the week number and year are the ISO
    calendar values, e.g. ISO 2026-W26 = Mon 22 Jun - Sun 28 Jun 2026.

The absence ratio for a (coach, week) is::

    absent_session_rows / counted_session_rows   (counted = Attendance in (0,1))

expressed as a percentage. "vs company" is the coach's share of all company
absences that week (coach_absent / company_absent), as a percentage, so the
company-wide row is 100%.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import os

import psycopg

# Attendance is per session row: a value > 0 means the learner attended that
# session. Per (coach, learner, week) we keep the MAX, so a learner counts as
# "present" for the week if they attended ANY session, and "absent" only if they
# missed every session they had that week. (Mirrors the n8n Attendence.js logic.)

# Reporting timezone — "today" (and therefore the visible week window) is
# anchored to this zone, matching the n8n node.
TIMEZONE = "Africa/Cairo"

# The earliest week the report covers (a Monday). Weeks before this are hidden.
START_FROM = date(2026, 3, 9)

# Learner groups excluded from absence reporting (compared case-insensitively).
EXCLUDED_GROUPS = [
    "pcp - november 2025 (alfanar)",
    "me level 4 - january 2025",
]


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
# Core SQL aggregation
# --------------------------------------------------------------------------

# Shared WHERE fragment: active learners, real owner, not an excluded group.
_LEARNER_FILTER = (
    "lower(u.\"Program-Status\") = 'active' "
    "AND u.\"OwnerName\" IS NOT NULL AND u.\"OwnerName\" <> '' "
    "AND NOT (lower(coalesce(u.\"Group\", '')) = ANY(%(excluded)s))"
)


def _coach_week_rows(conn, start, end):
    """
    Per-coach aggregation for one week, counted PER LEARNER (not per session row).

    For each (owner, learner) in the week we take MAX(attended) — attended = 1 if
    the learner was present (Attendance > 0) in any session that week. Then per
    owner: ``total`` = learners who had a session that week, ``present`` = those
    who attended at least one, ``absent`` = those who attended none.

    Returns {owner: {"total", "absent", "present"}}.
    """
    sql = """
        SELECT owner,
               COUNT(*)                          AS total,
               COUNT(*) FILTER (WHERE attended = 0) AS absent,
               COUNT(*) FILTER (WHERE attended = 1) AS present
        FROM (
            SELECT u."OwnerName" AS owner,
                   a."ID"        AS sid,
                   MAX(CASE WHEN a."Attendance" > 0 THEN 1 ELSE 0 END) AS attended
            FROM kbc_attendance a
            JOIN kbc_users_data u ON u."ID" = a."ID"
            WHERE a.date >= %(start)s AND a.date <= %(end)s
              AND {filter}
            GROUP BY u."OwnerName", a."ID"
        ) per_learner
        GROUP BY owner
    """.format(filter=_LEARNER_FILTER)
    with conn.cursor() as cur:
        cur.execute(sql, {"start": start, "end": end, "excluded": EXCLUDED_GROUPS})
        out = {}
        for owner, total, absent, present in cur.fetchall():
            out[owner] = {
                "total": int(total or 0),
                "absent": int(absent or 0),
                "present": int(present or 0),
            }
    return out


def _students_in_window(conn, start, end):
    """{owner: distinct learners with any attendance in [start, end]}.

    This is the ``students_count`` shown on the table — learners who actually had
    sessions in the displayed window (not the full active roster)."""
    sql = """
        SELECT u."OwnerName" AS owner, COUNT(DISTINCT a."ID") AS n
        FROM kbc_attendance a
        JOIN kbc_users_data u ON u."ID" = a."ID"
        WHERE a.date >= %(start)s AND a.date <= %(end)s
          AND {filter}
        GROUP BY u."OwnerName"
    """.format(filter=_LEARNER_FILTER)
    with conn.cursor() as cur:
        cur.execute(sql, {"start": start, "end": end, "excluded": EXCLUDED_GROUPS})
        return {owner: int(n or 0) for owner, n in cur.fetchall()}


def _active_coach_names(conn):
    """All active coaches (real owner, not an excluded group)."""
    sql = """
        SELECT DISTINCT u."OwnerName" AS owner
        FROM kbc_users_data u
        WHERE {filter}
    """.format(filter=_LEARNER_FILTER)
    with conn.cursor() as cur:
        cur.execute(sql, {"excluded": EXCLUDED_GROUPS})
        return {owner for (owner,) in cur.fetchall() if owner}


def _active_students_per_coach(conn):
    """{owner: count of distinct active learners} (full roster). Kept for the
    recompute_coach_summary management command."""
    sql = """
        SELECT u."OwnerName" AS owner, COUNT(DISTINCT u."ID") AS n
        FROM kbc_users_data u
        WHERE {filter}
        GROUP BY u."OwnerName"
    """.format(filter=_LEARNER_FILTER)
    with conn.cursor() as cur:
        cur.execute(sql, {"excluded": EXCLUDED_GROUPS})
        return {owner: int(n or 0) for owner, n in cur.fetchall()}


def _ratio(absent, total):
    return round((absent / total) * 100, 2) if total else 0.0


def _earliest_data_week(conn=None):
    """(year, week) of the oldest attendance record, or None if the table is empty."""
    own = conn is None
    conn = conn or _connect()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT MIN(date) FROM kbc_attendance')
            row = cur.fetchone()
        d = row[0] if row else None
        return iso_year_week(d) if d else None
    finally:
        if own:
            conn.close()


def compute_week_summary(weeks, conn=None):
    """
    For each (year, week) in ``weeks``, compute per-coach absence ratio, absent
    count, present count, total counted rows, and the company-wide ratio.

    Returns a dict keyed by "year-week" -> {
        "year", "week", "weekStart", "weekEnd",
        "company": {absent, present, total, ratio},
        "coaches": { owner: {absent, present, total, ratio, vsCompany} },
    }
    """
    own = conn is None
    conn = conn or _connect()
    try:
        result = {}
        for year, week in weeks:
            start, end = week_bounds(year, week)
            per_coach = _coach_week_rows(conn, start, end)

            comp_absent = sum(v["absent"] for v in per_coach.values())
            comp_total = sum(v["total"] for v in per_coach.values())
            comp_present = sum(v["present"] for v in per_coach.values())
            comp_ratio = _ratio(comp_absent, comp_total)

            coaches = {}
            for owner, v in per_coach.items():
                ratio = _ratio(v["absent"], v["total"])
                # "vs Company" = this coach's share of all company absences that
                # week (coach_absent / company_absent), as a percentage. The
                # company row is therefore 100%. This matches the legacy
                # coach_summary semantics and the frontend's badge thresholds.
                vs = round((v["absent"] / comp_absent) * 100, 2) if comp_absent else 0.0
                coaches[owner] = {
                    "absent": v["absent"],
                    "present": v["present"],
                    "total": v["total"],
                    "ratio": ratio,
                    "vsCompany": vs,
                }

            meta = format_week_range(year, week)
            result[f"{year}-{week}"] = {
                **meta,
                "company": {
                    "absent": comp_absent,
                    "present": comp_present,
                    "total": comp_total,
                    "ratio": comp_ratio,
                },
                "coaches": coaches,
            }
        return result
    finally:
        if own:
            conn.close()


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

    with _connect() as conn:
        summary = compute_week_summary(weeks, conn=conn)
        # students_count = distinct learners who actually had sessions in the
        # displayed window (not the full active roster).
        if weeks:
            win_start = week_bounds(*weeks[-1])[0]   # oldest week's Monday
            win_end = week_bounds(*weeks[0])[1]      # newest week's Sunday
            students = _students_in_window(conn, win_start, win_end)
        else:
            students = {}
        active_coaches = _active_coach_names(conn)

    week_keys = [f"{y}-{w}" for (y, w) in weeks]
    week_meta = [format_week_range(y, w) for (y, w) in weeks]

    # Every active coach, plus any coach seen in the displayed weeks.
    owners = set(active_coaches)
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

    sql = """
        SELECT u."ID"            AS id,
               u."FullName"      AS name,
               u."Email"         AS email,
               u."Group"         AS grp,
               a.date            AS session_date,
               a."Attendance"    AS attendance,
               a.module          AS module
        FROM kbc_users_data u
        LEFT JOIN kbc_attendance a
               ON a."ID" = u."ID"
              AND a.date >= %(start)s AND a.date <= %(end)s
        WHERE lower(u."Program-Status") = 'active'
          AND u."OwnerName" = %(coach)s
          AND NOT (lower(coalesce(u."Group", '')) = ANY(%(excluded)s))
        ORDER BY u."FullName", a.date
    """
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(sql, {"coach": coach_name, "start": start, "end": end, "excluded": EXCLUDED_GROUPS})
        rows = cur.fetchall()

    # Group by student. A session counts as "attended" when Attendance > 0;
    # 0 or null is an absence (mirrors the n8n toNum01 rule).
    students = {}
    for sid, name, email, grp, sdate, attendance, module in rows:
        key = sid
        st = students.get(key)
        if st is None:
            st = students[key] = {
                "id": sid,
                "name": (name or "Unknown Learner").strip(),
                "email": (email or "").strip(),
                "group": (grp or "").strip(),
                "attended": 0,
                "absent": 0,
                "sessions": [],
            }
        if sdate is None:
            continue  # student had no session row this week
        if attendance is not None and attendance > 0:
            st["attended"] += 1
            status = "attended"
        else:
            st["absent"] += 1
            status = "absent"
        st["sessions"].append({
            "date": sdate.isoformat(),
            "status": status,
            "module": (module or "").strip(),
        })

    def overall_status(st):
        if st["absent"] == 0:
            return "attended"
        if st["attended"] == 0:
            return "absent"
        return "partial"

    # Only learners who actually have an attendance record this week.
    learners = [st for st in students.values() if (st["attended"] + st["absent"]) > 0]
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
