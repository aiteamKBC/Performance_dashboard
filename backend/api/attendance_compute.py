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

Weeks use a fixed day-of-year scheme so they are stable year over year:

    week 1 = Jan 1-7, week 2 = Jan 8-14, ... week N = days [ (N-1)*7+1 .. N*7 ]

The absence ratio for a (coach, week) is::

    absent_session_rows / counted_session_rows   (counted = Attendance in (0,1))

expressed as a percentage. "vs company" is the coach's share of all company
absences that week (coach_absent / company_absent), as a percentage, so the
company-wide row is 100%.
"""

from datetime import date, timedelta
import os

import psycopg

# Only these Attendance values are meaningful; anything else is ignored.
PRESENT = 1
ABSENT = 0


def _kbc_dsn():
    dsn = os.environ.get("kbc_main_database_url")
    if not dsn:
        raise RuntimeError("kbc_main_database_url is not configured in the environment.")
    return dsn


def _connect():
    return psycopg.connect(_kbc_dsn())


# --------------------------------------------------------------------------
# Year-week helpers (day-of-year based, NOT ISO week)
# --------------------------------------------------------------------------

def year_week_of(d):
    """Day-of-year week number: week 1 = Jan 1-7, week 2 = Jan 8-14, ..."""
    doy = d.timetuple().tm_yday  # 1..366
    return (doy - 1) // 7 + 1


def week_bounds(year, week):
    """Inclusive [start, end] dates for a (year, week). Week 53 may be short."""
    start = date(year, 1, 1) + timedelta(days=(week - 1) * 7)
    end = start + timedelta(days=6)
    # Clamp the final partial week to Dec 31 of the same year.
    last = date(year, 12, 31)
    if end > last:
        end = last
    return start, end


def current_year_week(today=None):
    today = today or date.today()
    return today.year, year_week_of(today)


def recent_weeks(count=10, today=None):
    """
    Return a list of (year, week) tuples for the most recent ``count`` weeks,
    newest first, walking backwards across year boundaries.
    """
    year, week = current_year_week(today)
    weeks = []
    for _ in range(count):
        weeks.append((year, week))
        week -= 1
        if week < 1:
            year -= 1
            # Last week index of the previous year (Dec 31's week).
            week = year_week_of(date(year, 12, 31))
    return weeks


def _step_back(year, week):
    """The (year, week) immediately older than the given one."""
    w = week - 1
    y = year
    if w < 1:
        y -= 1
        w = year_week_of(date(y, 12, 31))
    return y, w


def _step_forward(year, week):
    """The (year, week) immediately newer than the given one."""
    last = year_week_of(date(year, 12, 31))
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
    newest first. Never returns weeks in the future (beyond the current week).
    The newest week of the returned window is (year, week) + count steps forward,
    clamped to the current week.
    """
    cur_year, cur_week = current_year_week(today)
    # Walk forward ``count`` steps from the anchor to find this window's newest.
    y, w = year, week
    for _ in range(count):
        y, w = _step_forward(y, w)
        # Clamp: don't go past the current week.
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

def _coach_week_rows(conn, start, end):
    """
    Per-coach aggregation for a single date window: counted rows, absent, present.
    Active learners only. Returns {owner: {"total", "absent", "present"}}.
    """
    sql = """
        SELECT u."OwnerName" AS owner,
               COUNT(*) FILTER (WHERE a."Attendance" IN (%(present)s, %(absent)s)) AS counted,
               COUNT(*) FILTER (WHERE a."Attendance" = %(absent)s)                 AS absent,
               COUNT(*) FILTER (WHERE a."Attendance" = %(present)s)                AS present
        FROM kbc_attendance a
        JOIN kbc_users_data u ON u."ID" = a."ID"
        WHERE a.date >= %(start)s AND a.date <= %(end)s
          AND lower(u."Program-Status") = 'active'
          AND u."OwnerName" IS NOT NULL AND u."OwnerName" <> ''
        GROUP BY u."OwnerName"
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"present": PRESENT, "absent": ABSENT, "start": start, "end": end})
        out = {}
        for owner, counted, absent, present in cur.fetchall():
            out[owner] = {
                "total": int(counted or 0),
                "absent": int(absent or 0),
                "present": int(present or 0),
            }
    return out


def _active_students_per_coach(conn):
    """{owner: count of distinct active learners}. Mirrors students_count."""
    sql = """
        SELECT u."OwnerName" AS owner, COUNT(DISTINCT u."ID") AS n
        FROM kbc_users_data u
        WHERE lower(u."Program-Status") = 'active'
          AND u."OwnerName" IS NOT NULL AND u."OwnerName" <> ''
        GROUP BY u."OwnerName"
    """
    with conn.cursor() as cur:
        cur.execute(sql)
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
        return (d.year, year_week_of(d)) if d else None
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
        students = _active_students_per_coach(conn)

    week_keys = [f"{y}-{w}" for (y, w) in weeks]
    week_meta = [format_week_range(y, w) for (y, w) in weeks]

    # Every coach seen in any of these weeks, plus everyone with active learners.
    owners = set(students)
    for key in week_keys:
        owners.update(summary[key]["coaches"].keys())

    coaches = []
    for owner in sorted(owners):
        week_cells = []
        ratios = []
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
                ratios.append(cell["ratio"])
            else:
                week_cells.append({"ratio": 0.0, "vsCompany": 0.0, "absent": 0, "present": 0, "total": 0})
        avg = round(sum(ratios) / len(ratios), 2) if ratios else 0.0
        coaches.append({
            "coachName": owner,
            "studentsCount": students.get(owner, 0),
            "windowAvgRatio": avg,
            "weeks": week_cells,
        })

    # Company row across the window.
    company_cells = []
    company_ratios = []
    for key in week_keys:
        c = summary[key]["company"]
        company_cells.append({
            "ratio": c["ratio"], "vsCompany": 100.0,
            "absent": c["absent"], "present": c["present"], "total": c["total"],
        })
        company_ratios.append(c["ratio"])
    company_avg = round(sum(company_ratios) / len(company_ratios), 2) if company_ratios else 0.0

    newest = weeks[0] if weeks else None
    oldest = weeks[-1] if weeks else None
    cur_year, cur_week = current_year_week(today)

    # There's a newer window if the newest shown week is older than the current week.
    has_newer = bool(newest) and (newest[0], newest[1]) < (cur_year, cur_week)
    # There's an older window if attendance data exists before the oldest shown week.
    earliest = _earliest_data_week()
    has_older = bool(oldest and earliest) and (oldest[0], oldest[1]) > earliest

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
        y, w = current_year_week(today)
        year = year if year is not None else y
        week = week if week is not None else w
    year, week = int(year), int(week)
    start, end = week_bounds(year, week)

    sql = """
        SELECT u."ID"            AS id,
               u."FullName"      AS name,
               u."Email"         AS email,
               a.date            AS session_date,
               a."Attendance"    AS attendance,
               a.module          AS module
        FROM kbc_users_data u
        LEFT JOIN kbc_attendance a
               ON a."ID" = u."ID"
              AND a.date >= %(start)s AND a.date <= %(end)s
        WHERE lower(u."Program-Status") = 'active'
          AND u."OwnerName" = %(coach)s
        ORDER BY u."FullName", a.date
    """
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(sql, {"coach": coach_name, "start": start, "end": end})
        rows = cur.fetchall()

    # Group by student.
    students = {}
    for sid, name, email, sdate, attendance, module in rows:
        key = sid
        st = students.get(key)
        if st is None:
            st = students[key] = {
                "id": sid,
                "name": (name or "Unknown Learner").strip(),
                "email": (email or "").strip(),
                "attended": 0,
                "absent": 0,
                "sessions": [],
            }
        if attendance is None or sdate is None:
            continue  # student had no session row this week
        if attendance == PRESENT:
            st["attended"] += 1
            status = "attended"
        elif attendance == ABSENT:
            st["absent"] += 1
            status = "absent"
        else:
            continue  # anomalous value
        st["sessions"].append({
            "date": sdate.isoformat(),
            "status": status,
            "module": (module or "").strip(),
        })

    def overall_status(st):
        counted = st["attended"] + st["absent"]
        if counted == 0:
            return "no-session"
        if st["absent"] == 0:
            return "attended"
        if st["attended"] == 0:
            return "absent"
        return "partial"

    learners = []
    for st in students.values():
        st["status"] = overall_status(st)
        learners.append(st)

    # Absent-first, then partial, then attended, then no-session; name as tiebreak.
    order = {"absent": 0, "partial": 1, "attended": 2, "no-session": 3}
    learners.sort(key=lambda s: (order.get(s["status"], 9), s["name"].lower()))

    counted_total = sum(s["attended"] + s["absent"] for s in learners)
    absent_total = sum(s["absent"] for s in learners)

    return {
        "coach": coach_name,
        **format_week_range(year, week),
        "studentsCount": len(learners),
        "absentSessions": absent_total,
        "countedSessions": counted_total,
        "ratio": _ratio(absent_total, counted_total),
        "learners": learners,
    }
