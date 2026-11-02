"""Status of every LMS live-session meeting (curriculum.live_sessions +
curriculum.live_session_occurrences), one row per occurrence.

Usage (from backend/):
  venv/Scripts/python.exe scripts/extract_live_session_status.py --out <dir>

Read-only.  Writes live_session_status.csv and prints a summary.  Statuses are
the LMS's own; nothing is inferred.
"""
import argparse
import collections
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
import psycopg  # noqa: E402

TEST_TITLE = re.compile(r"\btest|^[a-z0-9 ,]{1,12}$|rewan|khalid|aya\b", re.I)

SQL = """
SELECT o.id, s.id, s.module_title, s.meeting_type, s.status, lower(s.organizer_email),
       o.session_number, o.scheduled_start, o.scheduled_end, s.timezone, o.status,
       o.actual_start, o.actual_end, o.participant_count, o.attendance_report_id <> '' ,
       o.last_sync_error,
       (SELECT count(*) FROM curriculum.live_session_learner_attendance a WHERE a.occurrence_id = o.id),
       (SELECT count(*) FROM curriculum.live_session_learner_attendance a WHERE a.occurrence_id = o.id
                                                                         AND a.attendance_status = 'present'),
       (SELECT count(*) FROM curriculum.live_session_artifacts r WHERE r.occurrence_id = o.id
                                                               AND r.artifact_type ILIKE '%%transcript%%') > 0,
       (SELECT count(*) FROM curriculum.live_session_artifacts r WHERE r.occurrence_id = o.id
                                                               AND r.artifact_type ILIKE '%%recording%%') > 0
  FROM curriculum.live_session_occurrences o
  LEFT JOIN curriculum.live_sessions s ON s.id = o.live_session_id
 ORDER BY o.scheduled_start, s.module_title, o.session_number
"""
FIELDS = ["occurrence_id", "live_session_id", "module_title", "session_type", "session_status", "organizer",
          "session_number", "scheduled_start", "scheduled_end", "timezone", "status", "actual_start", "actual_end",
          "participant_count", "attendance_report", "last_sync_error", "learners_recorded", "learners_present",
          "transcript_available", "recording_available", "looks_like_test"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(a.out, exist_ok=True)
    with psycopg.connect(os.environ["LMS_DATABASE_URL"], connect_timeout=15) as c, c.cursor() as cur:
        cur.execute("SET statement_timeout = '120s'")
        cur.execute(SQL)
        rows = [dict(zip(FIELDS, r)) for r in cur.fetchall()]
        cur.execute("SELECT count(*) FROM curriculum.live_session_occurrences")
        source_n = cur.fetchone()[0]
    for r in rows:
        r["looks_like_test"] = "yes" if TEST_TITLE.search(r["module_title"] or "") else "no"
        for k in ("attendance_report", "transcript_available", "recording_available"):
            r[k] = "yes" if r[k] else "no"
    path = os.path.join(a.out, "live_session_status.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(rows)

    print(f"{len(rows)} occurrences written (source table has {source_n})"
          + ("" if len(rows) == source_n else "  <-- MISMATCH"))
    orphan = sum(1 for r in rows if r["live_session_id"] is None)
    print(f"occurrences whose live session is missing: {orphan}")
    for label, keep in (("all", lambda r: True), ("excluding test-looking titles", lambda r: r["looks_like_test"] == "no")):
        sel = [r for r in rows if keep(r)]
        print(f"\nStatus ({label}, {len(sel)} rows):", dict(collections.Counter(r["status"] for r in sel)))
    real = [r for r in rows if r["looks_like_test"] == "no"]
    print("\nPer session (excluding test-looking titles):")
    print(f"  {'module':<48} {'organizer':<42} {'done':>5} {'canc':>5} {'sched':>6}  first..last")
    by = collections.defaultdict(list)
    for r in real:
        by[(r["module_title"], r["organizer"])].append(r)
    for (title, org), rs in sorted(by.items(), key=lambda kv: kv[1][0]["scheduled_start"]):
        c = collections.Counter(r["status"] for r in rs)
        print(f"  {str(title)[:48]:<48} {str(org)[:42]:<42} {c['completed']:>5} {c['cancelled']:>5} {c['scheduled']:>6}"
              f"  {rs[0]['scheduled_start']:%Y-%m-%d}..{rs[-1]['scheduled_start']:%Y-%m-%d}")
    odd = [r for r in rows if r["status"] == "scheduled" and r["scheduled_end"] and r["actual_start"] is None
           and str(r["scheduled_end"]) < str(__import__("datetime").datetime.now())]
    print(f"\nPast occurrences still 'scheduled' in the LMS (not closed): {len(odd)}")
    done_no_evidence = [r for r in rows if r["status"] == "completed" and r["attendance_report"] == "no"
                        and r["learners_recorded"] == 0]
    print(f"'completed' with no attendance report or learner attendance: {len(done_no_evidence)}")
    print(f"\nCSV: {path}")


if __name__ == "__main__":
    main()
