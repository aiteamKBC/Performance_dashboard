"""Every MCM / PR (and live session) on the LMS coach timetable, with its status,
for every dashboard coach, plus accuracy / completeness checks.

Sources (the same tables the LMS /coach_api/coach/timetable aggregates):
  "Coach".coach_calendar_event              bookings saved in the LMS
  "Learner".reviews                         reviews imported from Aptem
  "Coach".coach_imported_review_instance    links imported reviews to their LMS
                                            instance (newer status and owner)
  curriculum.live_sessions / live_session_occurrences   live sessions and dates
Coach list: the dashboard caseload (LMS learners Active/Delivery, by coach_email).

One meeting = one row.  An imported review that has been booked in the LMS
(booking event_key "imported-review:<review id>") is the booking's row, not a
second row.  Status precedence: LMS review instance > LMS booking > Aptem review.

Usage (from backend/):
  venv/Scripts/python.exe scripts/extract_coach_timetable.py --out <dir> [--seed 7]
      [--write [--dsn-env LMS_DATABASE_URL] [--table public.coach_meetings] [--allow-update]]
Without --write nothing is written to any database.
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
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
import psycopg  # noqa: E402
from api.lms_caseload import excluded_account, read_caseload  # noqa: E402

UTC = dt.timezone.utc
LONDON = ZoneInfo("Europe/London")
FIELDS = ["meeting_id", "source", "coach_name", "coach_email", "learner_name", "learner_email", "meeting_type",
          "title", "scheduled_start", "scheduled_end", "completed_at", "status", "lms_status", "status_source",
          "status_reason", "aptem_review_id", "booking_id", "instance_id", "live_session_id", "graph_event_id", "notes"]
REQUIRED = ["meeting_id", "coach_name", "coach_email", "meeting_type", "status"]
SOURCES = ("lms_booking", "aptem_review", "live_session")
TYPES = ("MCM", "PR", "Live session")
# "Monthly Coaching Review" counts as MCM (confirmed with the dashboard owner).
REVIEW_TYPES = {"monthly coaching meeting": "MCM", "monthly coaching review": "MCM",
                "progress review": "PR", "progress review (+ skills radar)": "PR"}
BOOKING_TYPES = {"mcr": "MCM", "progress-review": "PR"}
# Not coaches, though the caseload lists them (Ahmed Lotfi: one learner on the
# "Final Test" programme).  Confirmed with the dashboard owner.
EXCLUDED_COACHES = {"ahmed.lotfi@kentbusinesscollege.com"}
TEST_TITLE = re.compile(r"\btest", re.I)


def norm(s):
    return " ".join(re.sub(r"[^a-z0-9' -]+", " ", str(s or "").lower()).split())


def iso(t):
    return t.isoformat() if t else None


def as_utc(t, tz=UTC):
    if t is None:
        return None
    if isinstance(t, dt.date) and not isinstance(t, dt.datetime):
        t = dt.datetime.combine(t, dt.time(0))
    return (t if t.tzinfo else t.replace(tzinfo=tz)).astimezone(UTC)


def map_status(raw, when, now):
    """LMS / Aptem status -> (status, reason); None for an unbooked plan slot."""
    s = re.sub(r"[^a-z]", "", str(raw or "").lower())
    if s == "notscheduled":
        return None
    if s == "completed":
        return "Completed", "completed in the LMS"
    if s == "awaitingsignature":
        return "Completed", "held, awaiting signature"
    if s in ("cancelled", "canceled"):
        return "Cancelled", "cancelled in the LMS"
    if s == "scheduled":
        if when and when > now:
            return "Upcoming", "scheduled in the future"
        return "Unknown", "still scheduled after its date (never closed)" if when else "scheduled with no date"
    if s == "inprogress":
        return "Unknown", "started, not finished"
    if s == "archived":
        return "Unknown", "archived"
    return "Unknown", f"unrecognised status {raw!r}"


def emails(value):
    """jsonb list of emails; tolerates the LMS's occasional character-split list."""
    if not isinstance(value, list):
        return set()
    if value and all(isinstance(x, str) and len(x) == 1 for x in value[:5]):
        joined = "".join(x for x in value if isinstance(x, str) and len(x) == 1)
        try:
            value = json.loads(joined) + [x for x in value if isinstance(x, str) and len(x) > 1]
        except ValueError:
            pass
    return {str(x).strip().lower() for x in value if isinstance(x, str) and "@" in x}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dsn-env", default="LMS_DATABASE_URL")
    ap.add_argument("--table", default="public.coach_meetings")
    ap.add_argument("--allow-update", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(a.out, exist_ok=True)
    now = dt.datetime.now(UTC)

    with psycopg.connect(os.environ["LMS_DATABASE_URL"], connect_timeout=15) as conn, conn.cursor() as cur:
        cur.execute("SET statement_timeout = '120s'")

        def q(sql, *args):
            cur.execute(sql, args or None)
            return cur.fetchall()

        caseload, _ = read_caseload(cur)
        coaches = {}
        for l in caseload:
            if l["coach_email"] not in EXCLUDED_COACHES:
                coaches.setdefault(l["coach_email"], l["coach"])
        cur.execute('SELECT id, full_name, email, secondary_email, coach_name, coach_email FROM "Learner".learners')
        cols = [c[0] for c in cur.description]
        learners = {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}
        reviews = q('''SELECT id, learner_id, review_name, review_type, reviewer_name, planned_scheduled_date,
                              completed_date, status, visibility_state, aptem_review_id FROM "Learner".reviews''')
        instances = q('''SELECT id, source_review_id, lower(owner_email), learner_id, status, completed_at, event_key
                           FROM "Coach".coach_imported_review_instance''')
        bookings = q('''SELECT id, event_key, lower(owner_email), learner_id, event_type, scheduled_date, scheduled_time,
                               duration_minutes, target_date, status, review_completed_at, graph_event_id
                          FROM "Coach".coach_calendar_event''')
        sessions = {r[0]: r for r in q('''SELECT id, module_title, lower(organizer_email), presenters, co_organizers,
                                                 attendees, status, timezone FROM curriculum.live_sessions''')}
        occurrences = q('''SELECT id, live_session_id, session_number, scheduled_start, scheduled_end, status,
                                  graph_event_id FROM curriculum.live_session_occurrences''')

    coach_by_name = {norm(n): em for em, n in coaches.items()}
    # booking / instance keys are "imported-review:<Aptem review id>" (reviews.aptem_review_id)
    review_by_aptem = {str(r[9]).strip(): r for r in reviews if r[9] not in (None, "")}
    instance_by_review = {}
    dup_instances = []
    for i in instances:
        if i[1] in instance_by_review:
            dup_instances.append(i)
        instance_by_review[i[1]] = i
    left_out = collections.Counter()   # (source, reason) -> n   (accounting for every source row)
    other_owner = collections.Counter()
    plan_slots = collections.Counter()
    source_ids = collections.defaultdict(set)
    rows = []

    def learner_of(learner_id, source):
        row = learners.get(learner_id)
        if row is None:
            left_out[(source, "learner not in Learner.learners")] += 1
        elif excluded_account(row):
            left_out[(source, "test / staff learner account")] += 1
        else:
            return row
        return None

    # ---- 1. LMS bookings (incl. imported reviews that were booked)
    booked_reviews = collections.defaultdict(list)
    left_unlinked = []   # imported-review bookings whose Aptem review is not in Learner.reviews
    for (bid, key, owner, learner_id, etype, sdate, stime, dur, target, bstatus, bdone, gid) in bookings:
        m = re.fullmatch(r"imported-review:(\S+)", key or "")
        review = review_by_aptem.get(m.group(1)) if m else None
        rid = review[0] if review else None
        if m and review is None:
            left_unlinked.append((bid, key))
        inst = instance_by_review.get(rid)
        kind = BOOKING_TYPES.get(etype) or (REVIEW_TYPES.get(norm(review[3])) if review else None)
        if not kind:
            left_out[("lms_booking", f"not an MCM/PR booking ({etype})")] += 1
            continue
        if rid is not None:
            booked_reviews[rid].append(bid)
        coach = (inst[2] if inst and inst[2] else None) or owner
        if coach not in coaches:
            left_out[("lms_booking", "owner not a dashboard coach")] += 1
            other_owner[("lms_booking", coach)] += 1
            continue
        lrow = learner_of(learner_id, "lms_booking")
        if lrow is None:
            continue
        when = (dt.datetime.combine(sdate, stime or dt.time(0), LONDON).astimezone(UTC) if sdate
                else as_utc(target, LONDON))
        raw, status_src = (inst[4], "lms_review_instance") if inst else (bstatus, "lms_booking")
        mapped = map_status(raw, when, now)
        if mapped is None:
            left_out[("lms_booking", "not scheduled (plan slot)")] += 1
            plan_slots[(coach, kind)] += 1
            continue
        notes = []
        if not sdate:
            notes.append("no booked date; target date used")
        elif not stime:
            notes.append("no booking time")
        if inst and bstatus and re.sub(r"[^a-z]", "", bstatus) != re.sub(r"[^a-z]", "", str(inst[4])):
            notes.append(f"booking status {bstatus!r} differs from review instance {inst[4]!r}")
        if inst and inst[2] and inst[2] != owner:
            notes.append(f"booking owner {owner} differs from review instance owner {inst[2]}")
        completed = (inst[5] if inst else None) or bdone or (review[6] if review else None)
        source_ids[(coach, "lms_booking")].add(bid)
        rows.append({
            "meeting_id": f"booking:{bid}", "source": "lms_booking", "coach_name": coaches[coach], "coach_email": coach,
            "learner_name": " ".join(str(lrow["full_name"]).split()), "learner_email": (lrow.get("email") or "").lower() or None,
            "meeting_type": kind, "title": review[2] if review else etype,
            "scheduled_start": iso(when),
            "scheduled_end": iso(when + dt.timedelta(minutes=dur)) if when and dur and sdate else None,
            "completed_at": iso(as_utc(completed)), "status": mapped[0], "lms_status": raw, "status_source": status_src,
            "status_reason": mapped[1], "aptem_review_id": rid, "booking_id": bid,
            "instance_id": inst[0] if inst else None, "live_session_id": None, "graph_event_id": gid,
            "notes": "; ".join(notes) or None})

    # ---- 2. Aptem reviews not booked in the LMS
    for (rid, learner_id, rname, rtype, reviewer, planned, completed, rstatus, visibility, _aptem_id) in reviews:
        kind = REVIEW_TYPES.get(norm(rtype))
        if not kind:
            left_out[("aptem_review", "not an MCM/PR review")] += 1
            continue
        if rid in booked_reviews:
            left_out[("aptem_review", "booked in the LMS (counted as the booking)")] += 1
            continue
        inst = instance_by_review.get(rid)
        coach = (inst[2] if inst and inst[2] else None) or coach_by_name.get(norm(reviewer))
        if coach not in coaches:
            left_out[("aptem_review", "reviewer not a dashboard coach")] += 1
            other_owner[("aptem_review", (inst[2] if inst and inst[2] else reviewer) or "(none)")] += 1
            continue
        lrow = learner_of(learner_id, "aptem_review")
        if lrow is None:
            continue
        when = as_utc(planned) or as_utc(completed)
        raw, status_src = (inst[4], "lms_review_instance") if inst else (rstatus, "aptem_review")
        mapped = map_status(raw, when, now)
        if mapped is None:
            left_out[("aptem_review", "not scheduled (plan slot)")] += 1
            plan_slots[(coach, kind)] += 1
            continue
        notes = []
        if visibility == "outside_modern_list":
            notes.append("not in the LMS's current review list (outside_modern_list)")
        if inst and re.sub(r"[^a-z]", "", str(rstatus).lower()) != re.sub(r"[^a-z]", "", str(inst[4]).lower()):
            notes.append(f"Aptem status {rstatus!r}, LMS instance {inst[4]!r}")
        if not when:
            notes.append("no planned or completed date")
        done = (inst[5] if inst else None) or completed
        if mapped[0] == "Completed" and not done:
            notes.append("completed but no completed date")
        source_ids[(coach, "aptem_review")].add(rid)
        rows.append({
            "meeting_id": f"review:{rid}", "source": "aptem_review", "coach_name": coaches[coach], "coach_email": coach,
            "learner_name": " ".join(str(lrow["full_name"]).split()), "learner_email": (lrow.get("email") or "").lower() or None,
            "meeting_type": kind, "title": rname, "scheduled_start": iso(when), "scheduled_end": None,
            "completed_at": iso(as_utc(done)), "status": mapped[0], "lms_status": raw, "status_source": status_src,
            "status_reason": mapped[1], "aptem_review_id": rid, "booking_id": None,
            "instance_id": inst[0] if inst else None, "live_session_id": None, "graph_event_id": None,
            "notes": "; ".join(notes) or None})

    # ---- 3. live sessions: one row per occurrence per dashboard coach taking part
    for (oid, sid, number, start, end, ostatus, gid) in occurrences:
        s = sessions.get(sid)
        if s is None:
            left_out[("live_session", "session missing")] += 1
            continue
        if s[6] in ("superseded", "feedback-test"):
            left_out[("live_session", f"session {s[6]}")] += 1
            continue
        people = {s[2]} | emails(s[3]) | emails(s[4]) | emails(s[5])
        involved = sorted(p for p in people if p in coaches)
        if not involved:
            left_out[("live_session", "no dashboard coach takes part")] += 1
            continue
        when = as_utc(start, LONDON)
        mapped = map_status(ostatus, when, now) or ("Unknown", "not scheduled")
        for coach in involved:
            role = "organizer" if coach == s[2] else "presenter" if coach in emails(s[3]) else \
                "co-organizer" if coach in emails(s[4]) else "attendee"
            source_ids[(coach, "live_session")].add(oid)
            rows.append({
                "meeting_id": f"live:{oid}:{coach}", "source": "live_session", "coach_name": coaches[coach],
                "coach_email": coach, "learner_name": None, "learner_email": None, "meeting_type": "Live session",
                "title": f"{s[1]} #{number}", "scheduled_start": iso(when), "scheduled_end": iso(as_utc(end, LONDON)),
                "completed_at": None, "status": mapped[0], "lms_status": ostatus, "status_source": "live_session",
                "status_reason": mapped[1], "aptem_review_id": None, "booking_id": None, "instance_id": None,
                "live_session_id": sid, "graph_event_id": gid,
                "notes": "; ".join(filter(None, [f"coach is {role}",
                                                 "title looks like a test session" if TEST_TITLE.search(s[1] or "") else None]))})

    rows.sort(key=lambda r: (r["coach_name"], r["source"], r["scheduled_start"] or ""))
    csv_path = os.path.join(a.out, "meetings.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(rows)

    problems = []
    written = write_rows(os.environ[a.dsn_env], a.table, rows, a.allow_update, problems) if a.write else None

    # ---- checks
    R = []
    order = sorted(coaches, key=coaches.get)
    by_coach = collections.defaultdict(list)
    for r in rows:
        by_coach[r["coach_email"]].append(r)

    txt = [f"{len(coaches)} coaches in the coach list (dashboard caseload, Ahmed Lotfi excluded); all queried in every source."]
    gaps = False
    for kind in TYPES:
        zero = [coaches[c] for c in order if not any(r["meeting_type"] == kind for r in by_coach[c])]
        gaps |= bool(zero) and kind != "Live session"
        txt.append(f"Zero {kind}: {', '.join(zero) or 'none'}")
    R.append(("1. Coach coverage", "FAIL" if gaps else "PASS", txt))

    with open(csv_path, encoding="utf-8") as f:
        csv_counts = collections.Counter((r["coach_email"], r["source"]) for r in csv.DictReader(f))
    txt, bad = [f"{'coach':<20} " + " | ".join(f"{s:^20}" for s in SOURCES),
                f"{'':<20} " + " | ".join(f"{'source/csv' + ('/db' if written else ''):^20}" for _ in SOURCES)], False
    for em in order:
        cells = []
        for src in SOURCES:
            n_src = len(source_ids[(em, src)]) if src != "live_session" else \
                sum(1 for r in rows if r["coach_email"] == em and r["source"] == src)
            n_csv = csv_counts.get((em, src), 0)
            n_db = written["per"].get((em, src), 0) if written else None
            ok = n_src == n_csv and (n_db is None or n_db == n_src)
            bad |= not ok
            cells.append(f"{n_src}/{n_csv}" + (f"/{n_db}" if written else "") + ("" if ok else " MISMATCH"))
        txt.append(f"{coaches[em]:<20} " + " | ".join(f"{c:^20}" for c in cells))
    if not written:
        txt.append("Database not written (dry run): source vs extract file only.")
    R.append(("2. Count reconciliation", "FAIL" if bad else "PASS", txt))

    # every source row accounted for (included or left out with a reason)
    txt, bad = [], False
    for src, total in (("lms_booking", len(bookings)), ("aptem_review", len(reviews)), ("live_session", len(occurrences))):
        inc = len({r["booking_id"] if src == "lms_booking" else r["aptem_review_id"] if src == "aptem_review"
                   else r["meeting_id"].split(":")[1] for r in rows if r["source"] == src})
        out = sum(n for (s, _), n in left_out.items() if s == src)
        ok = inc + out == total
        bad |= not ok
        txt.append(f"{src:<13} source rows {total:>6} = included {inc:>5} + left out {out:>6}" + ("" if ok else "   <-- MISMATCH"))
        txt += [f"     left out: {why} ({n})" for (s, why), n in sorted(left_out.items()) if s == src]
    txt.append("All tables are read whole in one query each (no paging); no query errors.")
    R.append(("3. Completeness (every source row accounted for)", "FAIL" if bad else "PASS", txt))

    ids = collections.Counter(r["meeting_id"] for r in rows)
    dup_ids = [k for k, n in ids.items() if n > 1]
    multi_booked = {rid: b for rid, b in booked_reviews.items() if len(b) > 1}
    same_day = collections.defaultdict(list)
    for r in rows:
        if r["meeting_type"] != "Live session" and r["scheduled_start"]:
            same_day[(r["coach_email"], norm(r["learner_name"]), r["meeting_type"], r["scheduled_start"][:10])].append(r)
    same_day = [v for v in same_day.values() if len(v) > 1]
    with open(os.path.join(a.out, "duplicates.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["group", *FIELDS])
        w.writeheader()
        for i, v in enumerate(same_day, 1):
            w.writerows({"group": i, **r} for r in v)
    txt = [f"{len(rows)} rows, {len(ids)} distinct meeting_id; duplicated ids: {len(dup_ids)}",
           f"Aptem reviews booked more than once in the LMS: {len(multi_booked)}"
           + (f" ({', '.join(f'review {k} -> bookings {v}' for k, v in list(multi_booked.items())[:10])})" if multi_booked else ""),
           f"Review instances pointing at the same Aptem review: {len(dup_instances)}",
           f"Imported-review bookings whose Aptem review is missing from Learner.reviews: {len(left_unlinked)}"
           + (f" ({', '.join(k for _, k in left_unlinked)})" if left_unlinked else ""),
           f"Same coach, learner, type and day more than once: {len(same_day)} groups "
           f"({sum(len(v) for v in same_day)} rows) — listed in duplicates.csv"]
    R.append(("4. Duplicates", "FAIL" if dup_ids or multi_booked or same_day else "PASS", txt))

    txt, bad = [], False
    for src in SOURCES:
        rs = [r for r in rows if r["source"] == src]
        txt.append(f"-- {src} ({len(rs)} rows)")
        for k in FIELDS:
            n = sum(1 for r in rs if r.get(k) in (None, ""))
            if n:
                bad |= k in REQUIRED
                txt.append(f"   {k:<16} {n:>5} null ({100 * n / len(rs):5.1f}%)" + ("  <-- required" if k in REQUIRED else ""))
    txt.append("(fields not listed are 100% filled; scheduled_start is null only where the source has no date)")
    R.append(("5. Field completeness", "FAIL" if bad else "PASS", txt))

    def ts(v):
        return dt.datetime.fromisoformat(v) if v else None
    bad_rows = [r for r in rows if (r["status"] == "Upcoming" and (not r["scheduled_start"] or ts(r["scheduled_start"]) <= now))
                or (r["completed_at"] and ts(r["completed_at"]) > now)
                or (r["status"] == "Completed" and r["source"] != "live_session" and not r["completed_at"])]
    early = sum(1 for r in rows if r["status"] == "Completed" and r["scheduled_start"] and ts(r["scheduled_start"]) > now)
    txt = [f"{len(bad_rows)} rows break a status rule (Upcoming in the past, completed in the future, completed with no date)"]
    txt += [f"   {r['meeting_id']} {r['status']} scheduled {r['scheduled_start']} completed {r['completed_at']} ({r['coach_name']})"
            for r in bad_rows[:30]]
    if early:
        txt.append(f"Note: {early} meetings are Completed with a planned date still in the future (completed early).")
    R.append(("6. Status sanity", "FAIL" if bad_rows else "PASS", txt))

    rnd = random.Random(a.seed)
    sample = rnd.sample(rows, min(20, len(rows)))
    txt = [f"(seed {a.seed}) source | assigned type | status <- raw status | title"]
    txt += [f"   {r['source']:<12} {r['meeting_type']:<12} {r['status']:<9} <- {str(r['lms_status']):<20} {r['title']}" for r in sample]
    txt.append("Review types counted as MCM/PR: " + ", ".join(sorted(REVIEW_TYPES)) + "; booking types: " + ", ".join(BOOKING_TYPES))
    R.append(("7. Classification audit", "REVIEW", txt))

    picks = rnd.sample(order, min(3, len(order)))
    with open(os.path.join(a.out, "spot_check.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        for em in picks:
            w.writerows(by_coach[em])
    txt = [f"(seed {a.seed}) every row for these coaches is in spot_check.csv"]
    for em in picks:
        c = collections.Counter(r["source"] for r in by_coach[em])
        txt.append(f"{coaches[em]}: {len(by_coach[em])} rows ({', '.join(f'{s} {c[s]}' for s in SOURCES)})")
    R.append(("8. Spot check", "REVIEW", txt))

    def table(rs_all):
        out_ = ["| Coach | MCM | PR | Live sessions | Completed | Cancelled | Upcoming | Unknown |", "|---|---|---|---|---|---|---|---|"]
        tot = [0] * 7
        for em in order:
            rs = [r for r in rs_all if r["coach_email"] == em]
            c = collections.Counter(r["status"] for r in rs)
            vals = [sum(r["meeting_type"] == t for r in rs) for t in TYPES] + \
                   [c["Completed"], c["Cancelled"], c["Upcoming"], c["Unknown"]]
            tot = [x + y for x, y in zip(tot, vals)]
            out_.append(f"| {coaches[em]} | {' | '.join(map(str, vals))} |")
        return out_ + [f"| **Total** | {' | '.join(map(str, tot))} |"]

    dated = [r["scheduled_start"] for r in rows if r["scheduled_start"]]
    out = [f"# Coach timetable extract — all history, current and upcoming ({min(dated)[:10]} to {max(dated)[:10]})",
           f"Extracted {now:%Y-%m-%d %H:%M} UTC from the LMS (timetable sources).", "", *table(rows), ""]
    for src in SOURCES:
        unk = collections.Counter(r["status_reason"] for r in rows if r["source"] == src and r["status"] == "Unknown")
        out.append(f"- {src}: {sum(r['source'] == src for r in rows)} rows; Unknown: "
                   + ("; ".join(f"{k} ({n})" for k, n in unk.items()) or "none"))
    out += [f"- Status from: " + ", ".join(f"{k} {n}" for k, n in collections.Counter(r['status_source'] for r in rows).items()),
            "- Unbooked plan slots (Not Scheduled; not meetings, not extracted): "
            + ", ".join(f"{coaches[em]} {sum(n for (e, _), n in plan_slots.items() if e == em)}" for em in order), ""]
    for name, verdict, txt in R:
        out += [f"## {name}: {verdict}", "```", *txt, "```", ""]
    out += ["## Left out / could not determine", "```"]
    out += [f"{src}: {n} rows owned by {who} (not a dashboard coach)" for (src, who), n in other_owner.most_common()]
    out += problems + ["```"]
    with open(os.path.join(a.out, "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("\n".join(out))


def write_rows(dsn, table, rows, allow_update, problems):
    if not re.fullmatch(r"([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*", table):
        raise SystemExit("bad table name")
    with psycopg.connect(dsn, connect_timeout=15) as c, c.cursor() as cur:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS {table} (
            meeting_id text PRIMARY KEY, source text NOT NULL, coach_name text NOT NULL, coach_email text NOT NULL,
            learner_name text, learner_email text, meeting_type text NOT NULL, title text,
            scheduled_start timestamptz, scheduled_end timestamptz, completed_at timestamptz,
            status text NOT NULL, lms_status text, status_source text, status_reason text,
            aptem_review_id bigint, booking_id bigint, instance_id bigint, live_session_id text,
            graph_event_id text, notes text, extracted_at timestamptz NOT NULL DEFAULT now())""")
        ids = [r["meeting_id"] for r in rows]
        cur.execute(f"SELECT count(*) FROM {table} WHERE meeting_id = ANY(%s)", (ids,))
        existing = cur.fetchone()[0]
        update = ", ".join(f"{k} = EXCLUDED.{k}" for k in FIELDS[1:]) + ", extracted_at = now()"
        cur.executemany(
            f"INSERT INTO {table} ({', '.join(FIELDS)}) VALUES ({', '.join(['%s'] * len(FIELDS))}) "
            f"ON CONFLICT (meeting_id) DO " + (f"UPDATE SET {update}" if allow_update else "NOTHING"),
            [[r[k] for k in FIELDS] for r in rows])
        if existing and not allow_update:
            problems.append(f"{existing} meeting_ids already in {table} were left unchanged (use --allow-update to refresh)")
        cur.execute(f"SELECT coach_email, source, count(*) FROM {table} WHERE meeting_id = ANY(%s) GROUP BY 1, 2", (ids,))
        per = {(em, src): n for em, src, n in cur.fetchall()}
        c.commit()
    return {"per": per}


if __name__ == "__main__":
    main()
