"""Extract every MCM / PR Teams meeting for every dashboard coach, assign a
status from attendance / recording evidence, and test the extract.

Source: the LMS's own Microsoft Graph calendar sync (the dashboard has no Graph
credentials of its own):
  "Coach".coaching_calendar_index      one row per synced calendar window
  "Coach".coaching_calendar_meeting    raw Graph events per window (subject,
                                       organizer, attendees, isCancelled, joinUrl)
  "Coach".coach_meeting_attendance     Teams attendance per participant
  "Coach".coach_meeting_attendance_reports
  "Coach".coach_meeting_artifacts      transcripts / recordings
Coach list: the dashboard caseload (LMS learners Active/Delivery, by coach_email).

Usage (from backend/):
  venv/Scripts/python.exe scripts/extract_coach_meetings.py --out <dir>
      [--start 2026-10-01] [--end 2026-10-31] [--seed 7]
      [--write [--dsn-env DATABASE_URL] [--table coach_meetings] [--allow-update]]

Without --write nothing is written to any database: meetings.csv,
other_near_miss.csv and report.md are written to --out.  --write upserts on
meeting_id; existing rows are left untouched unless --allow-update is given.
"""
import argparse
import collections
import csv
import datetime as dt
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
import psycopg  # noqa: E402
from api.lms_caseload import excluded_account, read_caseload  # noqa: E402

UTC = dt.timezone.utc
STAFF = ("@kentbusinesscollege.com", "@kentbusinesscollege.org", "@kentbusinesscollege.net")
FIELDS = ["meeting_id", "source", "coach_name", "coach_email", "learner_name", "learner_email", "meeting_type",
          "subject", "scheduled_start", "scheduled_end", "actual_start", "actual_end", "completed_at", "organizer",
          "attendees", "coach_role", "transcript_available", "recording_available", "status", "lms_status",
          "status_reason", "learner_source", "join_url", "linked_graph_ids", "linked_meeting_id", "notes"]
REQUIRED = ["meeting_id", "coach_name", "coach_email", "meeting_type", "scheduled_start", "status"]
SOURCES = ("teams", "lms_review", "lms_calendar")
# LMS review types -> MCM / PR ("Monthly Coaching Review" titles are MCMs).
LMS_TYPES = {"monthly coaching meeting": "MCM", "monthly coaching review": "MCM",
             "progress review": "PR", "progress review (+ skills radar)": "PR"}
LMS_CAL_TYPES = {"mcr": "MCM", "progress-review": "PR"}
# Not coaches, though the caseload lists them (Ahmed Lotfi: one learner on the
# "Final Test" programme).  Confirmed with the dashboard owner.
EXCLUDED_COACHES = {"ahmed.lotfi@kentbusinesscollege.com"}

# Titles: "Monthly Coaching Meeting/Review ...", "M.C.M", "MCM";
# "Progress Review ...", "Prog Review", "Progress review- Ellen".
CANCELLED_PREFIX = re.compile(r"^\s*cancell?ed\s*:\s*", re.I)
MCM = re.compile(r"\bm\.?\s?c\.?\s?m\b|\bmon?th?l[ey]\s*coach\w*\s*(meet\w*|rev\w*|sess\w*)", re.I)
PR = re.compile(r"\bprog(?:ress|ess|res|\.)?\s*-?\s*rev\w*", re.I)
NEAR = re.compile(r"\bm\.?\s?c\.?\s?[mr]\b|month|progr?|\bpr\b|review|coach", re.I)


def norm(s):
    return " ".join(re.sub(r"[^a-z0-9' -]+", " ", str(s or "").lower()).split())


def classify(subject):
    title = CANCELLED_PREFIX.sub("", subject or "")
    if MCM.search(title):
        return "MCM"
    if PR.search(title):
        return "PR"
    return "Other"


def parse_ts(v):
    if not v:
        return None
    t = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", help="default: earliest synced calendar window (all history)")
    ap.add_argument("--end", help="inclusive date; default: latest synced window (all upcoming)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dsn-env", default="DATABASE_URL")
    ap.add_argument("--table", default="coach_meetings")
    ap.add_argument("--allow-update", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(a.out, exist_ok=True)
    now = dt.datetime.now(UTC)
    problems = []  # things we could not access / determine

    with psycopg.connect(os.environ["LMS_DATABASE_URL"], connect_timeout=15) as conn, conn.cursor() as cur:
        cur.execute("SET statement_timeout = '120s'")

        def q(sql, *args):
            cur.execute(sql, args or None)
            return cur.fetchall()

        # ---- coach list (source of truth: dashboard caseload)
        caseload, _ = read_caseload(cur)
        coaches = {}
        for l in caseload:
            if l["coach_email"] not in EXCLUDED_COACHES:
                coaches.setdefault(l["coach_email"], l["coach"])
        # ---- learners for attendee / title matching
        cur.execute('SELECT id, full_name, email, secondary_email, coach_name, coach_email FROM "Learner".learners')
        cols = [c[0] for c in cur.description]
        all_learners = {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}
        learners = [l for l in all_learners.values() if not excluded_account(l) and str(l.get("full_name") or "").strip()]
        by_email = collections.defaultdict(set)
        names = {}
        for l in learners:
            name = " ".join(str(l["full_name"]).split())
            for e in (l.get("email"), l.get("secondary_email")):
                if e and e.strip():
                    by_email[e.strip().lower()].add(name)
            if len(norm(name).split()) >= 2:
                names[norm(name)] = name
        name_re = re.compile(r"\b(" + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r")\b")
        coach_name_norms = {norm(n) for n in coaches.values()}

        # ---- calendar windows and events
        windows = q('''SELECT i.owner_email, i.key, i.starts_at, i.ends_at, i.event_count, i.source_success_at,
                              (SELECT count(*) FROM "Coach".coaching_calendar_meeting m WHERE m.snapshot_id = i.key)
                         FROM "Coach".coaching_calendar_index i''')
        synced = [w for w in windows if w[5] and (w[0] or "").lower() in coaches]
        start = (dt.datetime.fromisoformat(a.start).replace(tzinfo=UTC) if a.start
                 else min(w[2] for w in synced))
        end = (dt.datetime.fromisoformat(a.end).replace(tzinfo=UTC) + dt.timedelta(days=1) if a.end
               else max(w[3] for w in synced))
        a.start_given, a.end_given = bool(a.start), bool(a.end)
        a.start, a.end = a.start or f"{start:%Y-%m-%d}", a.end or f"{end:%Y-%m-%d}"
        win_by_owner = collections.defaultdict(list)
        for w in windows:
            win_by_owner[(w[0] or "").lower()].append(w)
        events = q('''SELECT m.snapshot_id, m.event FROM "Coach".coaching_calendar_meeting m''')
        owner_of_snapshot = {w[1]: (w[0] or "").lower() for w in windows}

        # group every mailbox copy of a meeting: joinUrl + start (else subject + start)
        def group_key(ev):
            ju = ((ev.get("onlineMeeting") or {}).get("joinUrl") or "").split("?")[0]
            return (ju or norm(CANCELLED_PREFIX.sub("", ev.get("subject") or "")), (ev.get("start") or {}).get("dateTime"))

        group_ids = collections.defaultdict(set)
        for _, ev in events:
            group_ids[group_key(ev)].add(ev["id"])

        att = collections.defaultdict(list)
        for r in q('''SELECT graph_event_id, lower(coalesce(email,'')), role, attended, status, total_attendance_seconds,
                             lower(coalesce(learner_email,'')), learner_name
                        FROM "Coach".coach_meeting_attendance WHERE is_current AND graph_event_id IS NOT NULL'''):
            att[r[0]].append(r)
        reports = collections.defaultdict(list)
        for r in q('''SELECT graph_event_id, meeting_start_datetime, meeting_end_datetime
                        FROM "Coach".coach_meeting_attendance_reports WHERE graph_event_id IS NOT NULL'''):
            reports[r[0]].append(r)
        artifacts = collections.defaultdict(set)
        for gid, kind in q('''SELECT graph_event_id, artifact_type FROM "Coach".coach_meeting_artifacts
                               WHERE graph_event_id IS NOT NULL'''):
            artifacts[gid].add(kind)
        failures = q('''SELECT lower(organizer_email), operation, http_status, graph_message, count(*), max(occurred_at)
                          FROM curriculum.teams_graph_failures GROUP BY 1,2,3,4 ORDER BY 1''')
        # ---- the LMS's own review records
        lms_reviews = q('''SELECT id, learner_id, review_name, review_type, reviewer_name, planned_scheduled_date,
                                  completed_date, status, visibility_state, learner_name, learner_email
                             FROM "Learner".reviews''')
        lms_cal = q('''SELECT id, lower(owner_email), owner_name, learner_id, learner_name, lower(learner_email), event_type,
                              scheduled_date, scheduled_time, duration_minutes, target_date, status, graph_event_id,
                              review_completed_at, manager_signed_at
                         FROM "Coach".coach_calendar_event''')

    # ---- per coach extraction
    source_ids = collections.defaultdict(set)   # coach -> MCM/PR ids seen in the source
    page_fetched = collections.defaultdict(int)
    rows, near_miss, recurring = {}, [], []
    seen_ids = collections.defaultdict(set)
    for snap, ev in events:
        owner = owner_of_snapshot.get(snap)
        if owner not in coaches:
            continue
        page_fetched[owner] += 1
        s = parse_ts((ev.get("start") or {}).get("dateTime"))
        if not s or not (start <= s < end):
            continue
        subject = ev.get("subject") or ""
        kind = classify(subject)
        if kind == "Other":
            if NEAR.search(subject) and ev["id"] not in seen_ids[owner]:
                near_miss.append({"coach": coaches[owner], "subject": subject, "start": s.isoformat()})
            seen_ids[owner].add(ev["id"])
            continue
        source_ids[owner].add(ev["id"])
        if ev["id"] in rows:
            continue
        e = parse_ts((ev.get("end") or {}).get("dateTime"))
        organizer = (((ev.get("organizer") or {}).get("emailAddress") or {}).get("address") or "").lower()
        attendees = sorted({((x.get("emailAddress") or {}).get("address") or "").lower()
                            for x in ev.get("attendees") or []} - {""})
        notes = []
        # learner: external attendee matching an LMS learner email, else an exact LMS name in the title
        external = [x for x in attendees + [organizer] if x and not x.endswith(STAFF)]
        from_att = {n for x in external for n in by_email.get(x, ())}
        learner_email = next((x for x in external if x in by_email), None)
        title_hits = {names[m] for m in name_re.findall(norm(subject)) if m not in coach_name_norms}
        learner, src = None, None
        if len(from_att) == 1:
            learner, src = next(iter(from_att)), "attendee"
            if title_hits and learner not in title_hits:
                notes.append(f"title names {sorted(title_hits)} but attendee is {learner}")
        elif len(from_att) > 1:
            notes.append(f"several LMS learners invited: {sorted(from_att)}")
            learner_email = None
        elif len(title_hits) == 1:
            learner, src = next(iter(title_hits)), "title"
        elif len(title_hits) > 1:
            notes.append(f"title matches several learners: {sorted(title_hits)}")
        if not learner and not notes:
            notes.append("no LMS learner among attendees or in title" + (f" (external: {external})" if external else ""))
        # evidence from every mailbox copy of the meeting
        gids = group_ids[group_key(ev)] | {ev["id"]}
        arows = [r for g in gids for r in att.get(g, [])]
        reps = [r for g in gids for r in reports.get(g, [])]
        arts = set().union(*(artifacts.get(g, set()) for g in gids))
        learner_joined = any(r[3] and (r[2] == "learner" or (learner_email and r[1] == learner_email)
                                       or (not learner_email and r[1] and not r[1].endswith(STAFF) and r[2] != "employer"))
                             for r in arows)
        coach_joined = any(r[3] and (r[1] == owner or r[2] == "coach") for r in arows)
        cancelled = bool(ev.get("isCancelled")) or bool(CANCELLED_PREFIX.match(subject))
        if cancelled:
            status, reason = "Cancelled", "isCancelled" if ev.get("isCancelled") else "title starts Canceled:"
        elif s > now:
            status, reason = "Upcoming", "scheduled in the future"
        elif e and e > now:
            status, reason = "Unknown", "meeting in progress at extract time"
        elif learner_joined:
            status, reason = "Completed", "attendance report: learner joined"
        elif "transcript" in arts or "recording" in arts:
            status, reason = "Completed", "transcript/recording exists"
        elif coach_joined:
            status, reason = "No-show", "attendance report: coach joined, learner did not"
        elif reps or arows:
            status, reason = "Unknown", "attendance report has neither coach nor learner joining"
        else:
            status, reason = "Unknown", "no attendance report, transcript or recording synced"
        rows[ev["id"]] = {
            "meeting_id": f"teams:{ev['id']}", "source": "teams", "_gids": gids,
            "coach_name": coaches[owner], "coach_email": owner,
            "learner_name": learner, "learner_email": learner_email if learner and src == "attendee" else None,
            "meeting_type": kind, "subject": subject,
            "scheduled_start": s.isoformat(), "scheduled_end": e.isoformat() if e else None,
            "actual_start": min((r[1] for r in reps if r[1]), default=None),
            "actual_end": max((r[2] for r in reps if r[2]), default=None),
            "organizer": organizer or None, "attendees": json.dumps(attendees),
            "coach_role": "organizer" if organizer == owner else "attendee",
            "transcript_available": "yes" if "transcript" in arts else "no",
            "recording_available": "yes" if "recording" in arts else "no",
            "status": status, "status_reason": reason, "learner_source": src,
            "join_url": ((ev.get("onlineMeeting") or {}).get("joinUrl") or "").split("?")[0] or None,
            "linked_graph_ids": len(gids), "notes": "; ".join(notes) or None,
        }
        for k in ("actual_start", "actual_end"):
            if rows[ev["id"]][k]:
                rows[ev["id"]][k] = rows[ev["id"]][k].isoformat()
    teams_rows = list(rows.values())
    source_ids = {(owner, "teams"): ids for owner, ids in source_ids.items()}

    # ---- LMS review records ("Learner".reviews) and LMS-booked meetings ("Coach".coach_calendar_event)
    lms_start = dt.datetime.fromisoformat(a.start).replace(tzinfo=UTC) if a.start_given else None
    lms_end = end if a.end_given else None
    coach_by_name = {norm(n): em for em, n in coaches.items()}
    skipped = collections.Counter()      # (source, reason) -> n
    other_reviewers = collections.Counter()
    plan_slots = collections.Counter()   # (coach, type) -> unbooked "Not Scheduled" slots
    lms_rows = []

    def in_range(t):
        return t is None or ((lms_start is None or t >= lms_start) and (lms_end is None or t < lms_end))

    def learner_ok(learner_id, source):
        row = all_learners.get(learner_id)
        if row is None:
            skipped[(source, "learner not in Learner.learners")] += 1
            return None
        if excluded_account(row):
            skipped[(source, "test / staff learner account")] += 1
            return None
        return row

    for (rid, learner_id, review_name, review_type, reviewer, planned, completed, status, visibility,
         lname, lemail) in lms_reviews:
        kind = LMS_TYPES.get(" ".join(str(review_type or "").lower().split()))
        if not kind:
            continue
        em = coach_by_name.get(norm(reviewer))
        st = re.sub(r"[^a-z]", "", str(status or "").lower())
        if not em:
            other_reviewers[reviewer or "(none)"] += 1
            continue
        if st == "notscheduled":
            plan_slots[(em, kind)] += 1
            continue
        lrow = learner_ok(learner_id, "lms_review")
        if lrow is None:
            continue
        when = planned or completed
        if not in_range(when):
            skipped[("lms_review", "outside --start/--end")] += 1
            continue
        source_ids.setdefault((em, "lms_review"), set()).add(rid)
        notes = []
        if st == "completed":
            status_, reason = "Completed", "LMS review completed"
        elif st == "awaitingsignature":
            status_, reason = "Completed", "LMS review held, awaiting signature"
        elif st == "scheduled":
            status_, reason = (("Upcoming", "LMS scheduled in the future") if when and when > now
                               else ("Unknown", "LMS still Scheduled after its date (not completed)"))
        elif st == "inprogress":
            status_, reason = "Unknown", "LMS review started, not finished"
        elif st == "archived":
            status_, reason = "Unknown", "LMS review archived"
        else:
            status_, reason = "Unknown", f"unrecognised LMS status {status!r}"
        if status_ == "Completed" and not completed:
            notes.append("LMS says completed but has no completed date")
        if not when:
            notes.append("no planned or completed date in the LMS")
        if visibility == "outside_modern_list":
            notes.append("not in the LMS's current review list (outside_modern_list)")
        lms_rows.append({
            "meeting_id": f"lms_review:{rid}", "source": "lms_review", "coach_name": coaches[em], "coach_email": em,
            "learner_name": " ".join(str(lrow["full_name"]).split()),
            "learner_email": (lrow.get("email") or lemail or "").strip().lower() or None,
            "meeting_type": kind, "subject": review_name, "scheduled_start": when.isoformat() if when else None,
            "scheduled_end": None, "actual_start": None, "actual_end": None,
            "completed_at": completed.isoformat() if completed else None, "organizer": None, "attendees": None,
            "coach_role": "reviewer", "transcript_available": None, "recording_available": None,
            "status": status_, "lms_status": status, "status_reason": reason, "learner_source": "lms",
            "join_url": None, "linked_graph_ids": None, "linked_meeting_id": None,
            "notes": "; ".join(notes) or None,
        })

    london = dt.timezone.utc
    try:
        from zoneinfo import ZoneInfo
        london = ZoneInfo("Europe/London")
    except Exception:
        problems.append("Europe/London time zone unavailable: LMS booking times read as UTC")
    teams_by_gid = {g: r for r in teams_rows for g in r["_gids"]}
    for (cid, owner, owner_name, learner_id, lname, lemail, etype, sdate, stime, dur, target, status, gid,
         completed, signed) in lms_cal:
        kind = LMS_CAL_TYPES.get(etype)
        if not kind:
            continue
        if owner not in coaches:
            skipped[("lms_calendar", f"owner not a dashboard coach ({owner})")] += 1
            continue
        if status == "not-scheduled":
            skipped[("lms_calendar", "not-scheduled booking slot")] += 1
            continue
        lrow = learner_ok(learner_id, "lms_calendar")
        if lrow is None:
            continue
        s = (dt.datetime.combine(sdate, stime or dt.time(0), london).astimezone(UTC) if sdate else None)
        if not in_range(s):
            skipped[("lms_calendar", "outside --start/--end")] += 1
            continue
        source_ids.setdefault((owner, "lms_calendar"), set()).add(cid)
        notes = [] if stime else ["no booking time in the LMS"]
        if status == "cancelled":
            status_, reason = "Cancelled", "LMS booking cancelled"
        elif status == "completed":
            status_, reason = "Completed", "LMS review completed"
        elif status == "awaiting-signature":
            status_, reason = "Completed", "LMS review held, awaiting signature"
        elif status == "scheduled":
            status_, reason = (("Upcoming", "LMS scheduled in the future") if s and s > now
                               else ("Unknown", "LMS still scheduled after its date (not completed)"))
        elif status == "in-progress":
            status_, reason = "Unknown", "LMS review started, not finished"
        else:
            status_, reason = "Unknown", f"unrecognised LMS status {status!r}"
        teams = teams_by_gid.get(gid) if gid else None
        lms_rows.append({
            "meeting_id": f"lms_calendar:{cid}", "source": "lms_calendar", "coach_name": coaches[owner],
            "coach_email": owner, "learner_name": " ".join(str(lrow["full_name"]).split()),
            "learner_email": (lrow.get("email") or lemail or "").strip().lower() or None,
            "meeting_type": kind, "subject": f"{etype} (LMS booking)",
            "scheduled_start": s.isoformat() if s else None,
            "scheduled_end": (s + dt.timedelta(minutes=dur)).isoformat() if s and dur else None,
            "actual_start": None, "actual_end": None,
            "completed_at": completed.isoformat() if completed else None, "organizer": None, "attendees": None,
            "coach_role": "owner", "transcript_available": None, "recording_available": None,
            "status": status_, "lms_status": status, "status_reason": reason, "learner_source": "lms",
            "join_url": None, "linked_graph_ids": None,
            "linked_meeting_id": teams["meeting_id"] if teams else None, "notes": "; ".join(notes) or None,
        })
        if teams:
            teams.setdefault("_links", set()).add(f"lms_calendar:{cid}")
        elif gid:
            lms_rows[-1]["notes"] = "; ".join(filter(None, [lms_rows[-1]["notes"],
                                                          "Teams event not in the synced calendars"]))

    # link Teams meetings and LMS review records: same coach, learner, type and day
    by_day = collections.defaultdict(list)
    for r in lms_rows:
        if r["source"] == "lms_review" and r["scheduled_start"]:
            by_day[(r["coach_email"], norm(r["learner_name"]), r["meeting_type"], r["scheduled_start"][:10])].append(r)
    for t in teams_rows:
        if not t["learner_name"]:
            continue
        for r in by_day.get((t["coach_email"], norm(t["learner_name"]), t["meeting_type"], t["scheduled_start"][:10]), []):
            t.setdefault("_links", set()).add(r["meeting_id"])
            r["linked_meeting_id"] = t["meeting_id"]
    for t in teams_rows:
        links = sorted(t.pop("_links", ()))
        t["linked_meeting_id"] = ", ".join(links) or None
        t["lms_status"] = None
        t["completed_at"] = None
        lms_done = [r for r in lms_rows if r["meeting_id"] in links and r["status"] == "Completed"]
        if t["status"] == "Unknown" and lms_done:
            t["notes"] = "; ".join(filter(None, [t["notes"], "no Teams evidence, but the linked LMS record is completed"]))

    data = sorted(teams_rows + lms_rows, key=lambda r: (r["coach_name"], r["source"], r["scheduled_start"] or ""))
    with open(os.path.join(a.out, "meetings.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(data)
    with open(os.path.join(a.out, "other_near_miss.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["coach", "start", "subject"])
        w.writeheader()
        w.writerows(sorted(near_miss, key=lambda r: (r["coach"], r["start"])))

    # ---- optional write
    written = None
    if a.write:
        written = write_rows(os.environ[a.dsn_env], a.table, data, a.allow_update, problems)

    # ---- tests
    R = []  # (name, PASS/FAIL/REVIEW, lines)
    by_coach = collections.defaultdict(list)
    for r in data:
        by_coach[r["coach_email"]].append(r)
    order = sorted(coaches, key=coaches.get)

    # 1 coverage
    uncovered = {}
    for em in coaches:
        ws = sorted((w[2], w[3]) for w in win_by_owner.get(em, []) if w[5])
        gaps, cursor = [], start
        for ws_, we in ws:
            if ws_ > cursor:
                gaps.append((cursor, min(ws_, end)))
            cursor = max(cursor, we)
            if cursor >= end:
                break
        if cursor < end:
            gaps.append((cursor, end))
        gaps = [(g0, g1) for g0, g1 in gaps if g1 > g0 and g0 < end]
        if gaps:
            uncovered[em] = gaps
    no_cal = [coaches[c] for c in coaches if c not in win_by_owner]
    txt = [f"{len(coaches)} coaches in the coach list; all {len(coaches)} were queried in every source.",
           f"Teams calendar synced for {len(coaches) - len(no_cal)} of {len(coaches)} coaches"
           f" (window {start:%d %b %Y}–{end:%d %b %Y})."]
    if no_cal:
        txt.append(f"No Teams calendar synced at all: {', '.join(no_cal)}")
    for em, gaps in uncovered.items():
        txt.append(f"   {coaches[em]}: Teams calendar not synced " +
                   ", ".join(f"{g0:%d %b %H:%M}–{g1:%d %b %H:%M} UTC" for g0, g1 in gaps))
    for src in SOURCES:
        for kind in ("MCM", "PR"):
            zero = [coaches[c] for c in order if not any(r["source"] == src and r["meeting_type"] == kind for r in by_coach[c])]
            txt.append(f"Zero {kind} in {src}: {', '.join(zero) or 'none'}")
    R.append(("1. Coach coverage", "FAIL" if (no_cal or uncovered) else "PASS", txt))

    # 2 count reconciliation (source records vs rows in the CSV, and in the DB when --write)
    with open(os.path.join(a.out, "meetings.csv"), encoding="utf-8") as f:
        csv_counts = collections.Counter((r["coach_email"], r["source"]) for r in csv.DictReader(f))
    txt, bad = [f"{'coach':<22} " + " | ".join(f"{s:^24}" for s in SOURCES),
                f"{'':<22} " + " | ".join(f"{'source/csv' + ('/db' if written else ''):^24}" for _ in SOURCES)], False
    for em in order:
        cells = []
        for src in SOURCES:
            src_n, out_n = len(source_ids.get((em, src), ())), csv_counts.get((em, src), 0)
            db_n = written["per_coach"].get((em, src), 0) if written else None
            ok = src_n == out_n and (db_n is None or db_n == src_n)
            bad |= not ok
            cells.append(f"{src_n}/{out_n}" + (f"/{db_n}" if written else "") + ("" if ok else " MISMATCH"))
        txt.append(f"{coaches[em]:<22} " + " | ".join(f"{c:^24}" for c in cells))
    if not written:
        txt.append("Database not written (dry run): reconciliation is source vs extract file only.")
    R.append(("2. Count reconciliation", "FAIL" if bad else "PASS", txt))

    # 3 pagination / window completeness (Teams); LMS tables are read whole in one query
    txt, bad = [], False
    for em in order:
        ws = win_by_owner.get(em, [])
        declared, stored = sum(w[4] or 0 for w in ws), sum(w[6] for w in ws)
        failed = [w for w in ws if not w[5]]
        bad |= declared != stored or bool(failed)
        txt.append(f"{coaches[em]:<22} windows {len(ws):>2} | Graph count {declared:>4} | stored {stored:>4}"
                   f" | fetched {page_fetched[em]:>4}" + (f" | {len(failed)} window(s) never succeeded" if failed else "")
                   + ("" if declared == stored else "   <-- MISMATCH"))
    coach_fail = [f for f in failures if f[0] in coaches]
    for f in coach_fail:
        txt.append(f"Graph error for {coaches[f[0]]}: {f[1]} HTTP {f[2]} '{f[3]}' x{f[4]} (last {f[5]:%d %b %Y})")
    txt.append("Teams: the raw @odata.nextLink pages are not retained by the LMS sync; the check compares the event "
               "count recorded for each synced window with the events stored for it.")
    txt.append(f"LMS: \"Learner\".reviews ({len(lms_reviews)} rows) and \"Coach\".coach_calendar_event ({len(lms_cal)} rows)"
               " read whole in single queries — no pagination, no errors.")
    R.append(("3. Pagination / partial results", "FAIL" if bad or coach_fail else "PASS", txt))

    # 4 duplicates
    ids = collections.Counter(r["meeting_id"] for r in data)
    dup_ids = [k for k, n in ids.items() if n > 1]
    same_meeting = collections.defaultdict(list)
    for r in teams_rows:
        if r["join_url"]:
            same_meeting[(r["join_url"], r["scheduled_start"])].append(r)
    multi_coach = [v for v in same_meeting.values() if len({r["coach_email"] for r in v}) > 1]
    same_coach = [v for v in same_meeting.values() if len(v) > len({r["coach_email"] for r in v})]
    series = collections.defaultdict(list)
    for r in teams_rows:
        if r["join_url"]:
            series[(r["coach_email"], r["join_url"])].append(r)
    recurring = [v for v in series.values() if len({r["scheduled_start"] for r in v}) > 1]
    lms_same_day = collections.defaultdict(list)
    for r in lms_rows:
        if r["scheduled_start"]:
            lms_same_day[(r["source"], r["coach_email"], norm(r["learner_name"]), r["meeting_type"],
                          r["scheduled_start"][:10])].append(r)
    lms_dups = [v for v in lms_same_day.values() if len(v) > 1]
    txt = [f"{len(data)} rows, {len(ids)} distinct meeting_id; duplicated ids: {len(dup_ids)}",
           f"Teams: same meeting stored twice for one coach (two calendar entries, one link and time): {len(same_coach)}"]
    for v in same_coach:
        txt += [f"   {r['coach_name']}: {r['meeting_id'][-24:]} {r['scheduled_start'][:16]} '{r['subject']}'" for r in v]
    txt.append(f"Teams: same meeting in more than one coach's calendar (counted once per coach): {len(multi_coach)}")
    for v in multi_coach:
        txt.append(f"   {v[0]['scheduled_start'][:16]} '{v[0]['subject']}' -> {', '.join(sorted({r['coach_name'] for r in v}))}")
    txt.append(f"Teams: recurring series (one join link at several times; each instance is its own row): {len(recurring)}")
    for v in recurring:
        txt.append(f"   {v[0]['coach_name']}: '{v[0]['subject']}' x{len(v)}")
    txt.append(f"LMS: more than one record for the same coach, learner, type and day: {len(lms_dups)} groups "
               f"({sum(len(v) for v in lms_dups)} rows) — listed in lms_duplicates.csv")
    with open(os.path.join(a.out, "lms_duplicates.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["group", *FIELDS], extrasaction="ignore")
        w.writeheader()
        for i, v in enumerate(lms_dups, 1):
            w.writerows({"group": i, **r} for r in v)
    R.append(("4. Duplicates", "FAIL" if dup_ids or same_coach or lms_dups else "PASS", txt))

    # 5 field completeness, per source
    txt, bad = [], False
    for src in SOURCES:
        rs = [r for r in data if r["source"] == src]
        txt.append(f"-- {src} ({len(rs)} rows)")
        for k in FIELDS:
            n = sum(1 for r in rs if r.get(k) in (None, ""))
            if not n:
                continue
            if k in REQUIRED:
                bad = True
            txt.append(f"   {k:<22} {n:>5} null ({100 * n / len(rs):5.1f}%)" + ("  <-- required" if k in REQUIRED else ""))
    txt.append("(fields not listed are 100% filled)")
    R.append(("5. Field completeness", "FAIL" if bad else "PASS", txt))

    # 6 status sanity
    evidence = {"attendance report: learner joined", "transcript/recording exists",
                "LMS review completed", "LMS review held, awaiting signature"}
    bad_rows = [r for r in data if r["scheduled_start"] and (
                (r["status"] == "Upcoming" and parse_ts(r["scheduled_start"]) <= now)
                or (r["status"] == "Completed" and parse_ts(r["scheduled_start"]) > now
                    and not (r["completed_at"] and parse_ts(r["completed_at"]) <= now))
                or (r["status"] == "Completed" and r["status_reason"] not in evidence))]
    bad_rows += [r for r in data if r["completed_at"] and parse_ts(r["completed_at"]) > now]
    txt = [f"{len(bad_rows)} rows break a status rule"]
    txt += [f"   {r['meeting_id']} {r['status']} scheduled {r['scheduled_start']} completed {r['completed_at']}"
            for r in bad_rows[:40]]
    early = [r for r in data if r["status"] == "Completed" and r["scheduled_start"] and parse_ts(r["scheduled_start"]) > now]
    if early:
        txt.append(f"Note: {len(early)} LMS records are completed with a planned date still in the future"
                   " (completed early; allowed because the completion date is in the past).")
    R.append(("6. Status sanity", "FAIL" if bad_rows else "PASS", txt))

    # 7 classification audit (Teams titles; LMS records are typed by the LMS)
    rnd = random.Random(a.seed)
    sample_cls = rnd.sample(teams_rows, min(10, len(teams_rows)))
    sample_oth = rnd.sample(near_miss, min(10, len(near_miss)))
    txt = [f"(seed {a.seed})"] + [f"   {r['meeting_type']:<5} {r['subject']}" for r in sample_cls] + \
          [f"   Other {r['subject']}" for r in sample_oth]
    lms_names = collections.Counter((r["meeting_type"], r["subject"]) for r in lms_rows if r["source"] == "lms_review")
    txt.append("LMS review names per type (top 10):")
    txt += [f"   {k:<5} {n:>5}  {s}" for (k, s), n in lms_names.most_common(10)]
    R.append(("7. Classification audit", "REVIEW", txt))

    # 8 spot check: every meeting for 3 coaches, written to spot_check.csv
    picks = rnd.sample(order, min(3, len(order)))
    with open(os.path.join(a.out, "spot_check.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS, extrasaction="ignore")
        w.writeheader()
        for em in picks:
            w.writerows(by_coach[em])
    txt = [f"(seed {a.seed}) every row for these coaches is in spot_check.csv"]
    for em in picks:
        c = collections.Counter(r["source"] for r in by_coach[em])
        txt.append(f"{coaches[em]}: {len(by_coach[em])} rows ({', '.join(f'{s} {c[s]}' for s in SOURCES)})")
        txt += [f"   {r['scheduled_start'][:16]} {r['meeting_type']:<3} {r['status']:<9} {r['learner_name'] or '—':<28} {r['subject']}"
                for r in by_coach[em] if r["source"] == "teams"]
    R.append(("8. Spot check", "REVIEW", txt))

    # ---- report
    def table(rows_):
        head = ["| Coach | MCM | PR | Completed | Cancelled | No-show | Upcoming | Unknown |", "|---|---|---|---|---|---|---|---|"]
        body, tot = [], [0] * 7
        for em in order:
            rs = [r for r in rows_ if r["coach_email"] == em]
            c = collections.Counter(r["status"] for r in rs)
            vals = [sum(r["meeting_type"] == "MCM" for r in rs), sum(r["meeting_type"] == "PR" for r in rs),
                    c["Completed"], c["Cancelled"], c["No-show"], c["Upcoming"], c["Unknown"]]
            tot = [x + y for x, y in zip(tot, vals)]
            body.append(f"| {coaches[em]} | {' | '.join(map(str, vals))} |")
        return head + body + [f"| **Total** | {' | '.join(map(str, tot))} |"]

    first = min((r["scheduled_start"] for r in data if r["scheduled_start"]), default="")[:10]
    last = max((r["scheduled_start"] for r in data if r["scheduled_start"]), default="")[:10]
    out = [f"# MCM / PR extract — all history, current and upcoming ({first} to {last})",
           f"Extracted {now:%Y-%m-%d %H:%M} UTC from the LMS database.", ""]
    for src, title in (("teams", "Teams meetings (LMS Teams calendar sync)"),
                       ("lms_review", "LMS review records (\"Learner\".reviews)"),
                       ("lms_calendar", "LMS bookings (\"Coach\".coach_calendar_event)")):
        rs = [r for r in data if r["source"] == src]
        unknown = collections.Counter(r["status_reason"] for r in rs if r["status"] == "Unknown")
        out += [f"## {title}", *table(rs), "",
                "Unknown reasons: " + ("; ".join(f"{k} ({n})" for k, n in unknown.items()) or "none"), ""]
    linked_t = sum(1 for r in teams_rows if r["linked_meeting_id"])
    lms_done_no_teams = sum(1 for r in teams_rows if r["notes"] and "linked LMS record is completed" in r["notes"])
    out += ["## Teams ↔ LMS linking",
            f"- {linked_t} of {len(teams_rows)} Teams meetings are linked to an LMS record (same coach, learner, type and day, or the booking's Teams id).",
            f"- {lms_done_no_teams} Teams meetings are Unknown on Teams evidence but their linked LMS record is completed.",
            f"- Unbooked LMS plan slots (status Not Scheduled, not meetings, not extracted): "
            + ", ".join(f"{coaches[em]} {sum(n for (e, _), n in plan_slots.items() if e == em)}" for em in order), ""]
    for name, verdict, txt in R:
        out += [f"## {name}: {verdict}", "```", *txt, "```", ""]
    out += ["## Could not access / determine / left out", "```"]
    out += [f"{coaches[em]}: Teams calendar not synced for part of the window (see check 1)" for em in uncovered]
    out += [f"Graph {f[1]} failed for {coaches.get(f[0], f[0])}: HTTP {f[2]} {f[3]} x{f[4]}" for f in failures]
    out += [f"{sum(1 for r in teams_rows if not r['learner_name'])} Teams meetings with no identifiable learner (reason in notes)"]
    out += [f"{src}: {n} skipped — {why}" for (src, why), n in sorted(skipped.items())]
    out += [f"lms_review: {n} MCM/PR records by reviewers not in the coach list — {name}"
            for name, n in other_reviewers.most_common()]
    out += problems + ["```"]
    with open(os.path.join(a.out, "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("\n".join(out))


def write_rows(dsn, table, data, allow_update, problems):
    if not re.fullmatch(r"([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*", table):
        raise SystemExit("bad table name")
    cols = FIELDS
    with psycopg.connect(dsn, connect_timeout=15) as c, c.cursor() as cur:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS {table} (
            meeting_id text PRIMARY KEY, source text NOT NULL, coach_name text NOT NULL, coach_email text NOT NULL,
            learner_name text, learner_email text, meeting_type text NOT NULL, subject text,
            scheduled_start timestamptz, scheduled_end timestamptz, actual_start timestamptz,
            actual_end timestamptz, completed_at timestamptz, organizer text, attendees jsonb, coach_role text,
            transcript_available text, recording_available text, status text NOT NULL, lms_status text,
            status_reason text, learner_source text, join_url text, linked_graph_ids int,
            linked_meeting_id text, notes text,
            extracted_at timestamptz NOT NULL DEFAULT now())""")
        cur.execute(f"SELECT meeting_id FROM {table} WHERE meeting_id = ANY(%s)", ([r["meeting_id"] for r in data],))
        existing = {r[0] for r in cur.fetchall()}
        conflict = (", ".join(f"{k} = EXCLUDED.{k}" for k in cols[1:]) + ", extracted_at = now()")
        sql = (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) ON CONFLICT (meeting_id) "
               + (f"DO UPDATE SET {conflict}" if allow_update else "DO NOTHING"))
        cur.executemany(sql, [[r[k] for k in cols] for r in data])
        if existing and not allow_update:
            problems.append(f"{len(existing)} meeting_ids already in {table} were left unchanged (re-run with --allow-update to refresh)")
        cur.execute(f"SELECT coach_email, source, count(*) FROM {table} WHERE meeting_id = ANY(%s) GROUP BY 1, 2",
                    ([r["meeting_id"] for r in data],))
        per_coach = {(em, src): n for em, src, n in cur.fetchall()}
        c.commit()
    return {"per_coach": per_coach, "existing": len(existing)}


if __name__ == "__main__":
    main()
