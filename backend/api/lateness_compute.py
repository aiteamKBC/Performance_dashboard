"""
Live computation of the Coaches Lateness dataset.

Replaces the dependency on the pre-aggregated `coaches_lateness` table by
computing every metric on demand from the three raw source tables:

  * aptem_auto_extracting  -> learners, OTJH status, evidence docs, engagement
  * progress_review        -> PR (progress review) required/completed by period
  * MCR                    -> MCM required/completed by period
  * LMS "Learner".learners -> coach assignments + LMS-only learners (see
                              api/lms_source.py)

The aggregation logic mirrors the original n8n "Code" nodes (see Lateness.js):
owner grouping, the EXCLUDE list, active-only filtering, @alfanar.com email
exclusion, the dd-mm-yyyy date parsing, the status classifier, and the
4/8/12-week rolling period windows.
"""

from datetime import date, datetime, timedelta
import re

from django.db import connection

from .lms_source import get_lms_data

# Owners that are not real coaching case owners (mirrors the n8n EXCLUDE sets).
EXCLUDE = {
    name.lower()
    for name in [
        "Ayman Badewi", "Ahmed Lotfi", "Alice Saunders", "Enrolment Team",
        "Ali Zaki", "Mohamed Gamal", "Charl Sevel", "Danielle Andrews",
        "Gamal Ahmed", "Ahmed Tantawy", "Esraa Yasser", "Mohamed Sabry",
        "Vin Chau", "Sarah Mohamed", "Alaa Youssef", "Mariam Beridze",
        "Nada Marey", "Nouran Abdalla", "Mahinor Hesham", "Claire Sykes",
        "API Do Not Delete", "Ahmed Hisham", "Elaf Mansour", "Ella Steven",
        "Default Owner", "Safiyah Wellsping", "Nada Ibrahim", "Amgad Badewi",
    ]
}

# Rolling period windows, expressed as calendar MONTHS back from today
# (4w ≈ 1 month, 8w ≈ 2 months, 12w ≈ 3 months). Anchored to today and rolling
# day by day: e.g. today 2026-06-26, the 4w window starts 2026-05-26.
PERIODS = (("4w", 1), ("8w", 2), ("12w", 3))

# Weekly completed-count buckets, mirroring the n8n WEEK_BUCKETS config.
# offsetDays is how many days back the (inclusive) 7-day window ends.
WEEK_BUCKETS = (("w1", 0), ("w2", 7), ("w3", 14), ("w4", 21))

# Daily evidence columns carried straight through from the Require Marking table.
EVIDENCE_DAY_KEYS = ("Today", "Yesterday", "-2", "-3", "-4", "-5", "-6", "-7")


def _clean(value):
    return str(value if value is not None else "").strip()


def _lower(value):
    return _clean(value).lower()


def _is_alfanar(email):
    return _lower(email).endswith("@alfanar.com")


def _is_excluded_owner(owner):
    return not owner or owner.lower() in EXCLUDE


_DATE_RE = re.compile(r"(\d{2})[-/](\d{2})[-/](\d{4})")


def _parse_review_date(value):
    """Parse the first dd-mm-yyyy (or dd/mm/yyyy) token from a planned-date string."""
    text = _clean(value)
    if not text:
        return None
    m = _DATE_RE.search(text)
    if not m:
        return None
    dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
    try:
        return date(int(yyyy), int(mm), int(dd))
    except ValueError:
        return None


def _classify_status(status_raw):
    """Mirror n8n classifyStatus: collapse a status string to one category."""
    text = re.sub(r"\s+", " ", _lower(status_raw)).strip()
    compact = text.replace(" ", "")
    if not text:
        return "In Progress"
    if "completed" in text:
        return "Completed"
    if "awaiting signature" in text:
        return "Awaiting Signature"
    if "notscheduled" in compact or ("not" in text and "scheduled" in text):
        return "Not Scheduled"
    if "scheduled" in text:
        return "Scheduled"
    return "In Progress"


def _extract_paren_status(value):
    """Pull the trailing '(...)' content if present, else return the whole string."""
    text = _clean(value)
    if not text:
        return ""
    m = re.search(r"\(([^)]+)\)\s*$", text)
    return m.group(1) if m else text


def _review_display_date(planned_date, status_raw, category):
    """The date to surface for a review slot in the Metric Breakdown table.

    When the review is **Completed**, the completion date is written into the
    status cell next to "Completed" (e.g. ``"Completed 29-04-2026"``); we surface
    that actual completion date. For anything not completed (Scheduled / Not
    Scheduled / In Progress / Awaiting Signature) there is no completion date, so
    the planned date is reflected instead. A Completed cell with no parseable
    date token also falls back to the planned date.
    """
    if category == "Completed":
        completed_on = _parse_review_date(status_raw)
        if completed_on:
            return completed_on
    return planned_date


def _today():
    return date.today()


def _months_back(d, n):
    """The date ``n`` calendar months before ``d``, same day-of-month, clamped to
    the last day of the target month (e.g. 2026-03-31 − 1mo → 2026-02-28)."""
    m = d.month - 1 - n
    year = d.year + m // 12
    month = m % 12 + 1
    next_first = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    last_day = (next_first - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


def _period_ranges(today):
    """Inclusive [start, end] windows for each rolling period, as calendar months
    back from today (4w → 1 month, 8w → 2 months, 12w → 3 months)."""
    return {key: (_months_back(today, months), today) for key, months in PERIODS}


def _week_ranges(today):
    """Inclusive [start, end] 7-day windows for each weekly bucket."""
    ranges = {}
    for key, offset in WEEK_BUCKETS:
        end = today - timedelta(days=offset)
        ranges[key] = (end - timedelta(days=6), end)
    return ranges


def _in_range(d, rng):
    return rng[0] <= d <= rng[1]


_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def _parse_iso_date(value):
    """Parse a leading yyyy-mm-dd token (the Require Marking LastSubDate format)."""
    text = _clean(value)
    m = _ISO_DATE_RE.match(text)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _is_personal_support_plan(planned_value):
    return "personal support plan" in _lower(planned_value)


def _fetch_dicts(sql):
    with connection.cursor() as cursor:
        cursor.execute(sql)
        columns = [c[0] for c in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


# --------------------------------------------------------------------------
# OTJH band from progress variance (mirrors the frontend utils/otjh.ts)
# --------------------------------------------------------------------------

_PH_H_RE = re.compile(r"(\d+)\s*h", re.IGNORECASE)
_PH_M_RE = re.compile(r"(\d+)\s*m", re.IGNORECASE)


def _parse_progress_hours(value):
    """Signed 'Xh Ym' progress-hours string -> decimal hours (or None)."""
    text = _clean(value)
    if not text:
        return None
    h = _PH_H_RE.search(text)
    m = _PH_M_RE.search(text)
    if not h and not m:
        cleaned = re.sub(r"[^0-9.\-]", "", text)
        try:
            return float(cleaned)
        except ValueError:
            return None
    mag = (int(h.group(1)) if h else 0) + (int(m.group(1)) if m else 0) / 60.0
    return -mag if text.lstrip().startswith("-") else mag


def _otjh_source_band(status):
    """Map raw OTJHoursStatus -> 'on_track' | 'need_attention' | 'at_risk' | None."""
    t = _lower(status).replace("-", " ").strip()
    if t in ("ontrack", "on track"):
        return "on_track"
    if t == "need attention":
        return "need_attention"
    if t in ("at risk", "atrisk"):
        return "at_risk"
    return None


def _otjh_variance_band(completed, progress_raw, status):
    """OTJH band from progress variance = progress_hours / (completed - progress_hours).

    >= -5% On Track; -5%..-15% Need Attention; worse than -15% At Risk. Falls back
    to the source OTJHoursStatus band when the variance can't be computed.
    """
    ph = _parse_progress_hours(progress_raw)
    if ph is None:
        return _otjh_source_band(status)
    target = (completed or 0) - ph
    if not target:
        return _otjh_source_band(status)
    variance = (ph / target) * 100
    if variance >= -5:
        return "on_track"
    if variance >= -15:
        return "need_attention"
    return "at_risk"


# --------------------------------------------------------------------------
# Owner resolution + review slots (shared by Aptem rows and LMS learners)
# --------------------------------------------------------------------------

def _owner_resolver(coach_by_email, source=None):
    """Return ``resolve(row_owner, email) -> (owner, reassigned)`` for Aptem rows.

    The Aptem owner is always kept, so every coach keeps exactly the Aptem
    learners they had before the LMS was added. The LMS coach is used only for
    learners Aptem leaves unassigned ("Default Owner" or another excluded /
    blank owner), who otherwise appear under no coach at all.
    ``reassigned`` tells callers the row's own owner id / phone are stale.

    ``source`` splits learners: "aptem" keeps only rows under their Aptem owner
    (identical to the pre-LMS dashboard), "lms" keeps only the rows assigned on
    the LMS. A dropped row resolves to ("", True), which no coach matches and
    aggregation skips.
    """
    def resolve(row_owner, email):
        row_owner = _clean(row_owner)
        coach = coach_by_email.get(_lower(email))
        if coach and _is_excluded_owner(row_owner) and not _is_excluded_owner(coach):
            owner, reassigned = coach, True
        else:
            owner, reassigned = row_owner, False
        if (source == "aptem" and reassigned) or (source == "lms" and not reassigned):
            return "", True
        return owner, reassigned
    return resolve


def _row_review_slots(row, date_prefix, status_prefix, count):
    """Parsed review slots of one Aptem PR/MCR row.

    Each slot: {planned, category, shown}. Personal Support Plans and slots
    with no/unparseable date are skipped.
    """
    slots = []
    for i in range(1, count + 1):
        planned_raw = row.get("%s%d" % (date_prefix, i))
        status_raw = row.get("%s%d" % (status_prefix, i))
        if not _clean(planned_raw):
            continue
        if _is_personal_support_plan(planned_raw):
            continue
        planned = _parse_review_date(planned_raw)
        if not planned:
            continue
        category = _classify_status(status_raw)
        slots.append({
            "planned": planned,
            "category": category,
            # Completed reviews reflect their completion date (from the status
            # cell); everything else reflects the planned date.
            "shown": _review_display_date(planned, status_raw, category),
        })
    return slots


def _lms_review_slots(reviews):
    """LMS review instances -> the same slot shape as _row_review_slots."""
    slots = []
    for rv in reviews:
        category = _classify_status(rv["status_raw"])
        shown = rv["completed_on"] if category == "Completed" and rv["completed_on"] else rv["planned"]
        slots.append({"planned": rv["planned"], "category": category, "shown": shown})
    return slots


def _review_learners(table, date_prefix, status_prefix, count, resolve, extras, metric,
                     has_owner_id=True):
    """Active learners with their PR (or MCM) review slots.

    Aptem rows from ``table`` (active, non-@alfanar) plus the LMS-only learners.
    Each item: {owner, owner_id, name, email, slots}.
    """
    select_cols = ['"FullName"', '"Email"', '"CaseOwner"', '"Status"']
    if has_owner_id:  # MCR has no case_owner_id column.
        select_cols.append("case_owner_id")
    for i in range(1, count + 1):
        select_cols.append('"%s%d"' % (date_prefix, i))
        select_cols.append('"%s%d"' % (status_prefix, i))
    rows = _fetch_dicts('SELECT %s FROM "%s"' % (", ".join(select_cols), table))

    out = []
    for r in rows:
        if _lower(r.get("Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("CaseOwner"), r.get("Email"))
        out.append({
            "owner": owner,
            "owner_id": None if reassigned else r.get("case_owner_id"),
            "name": _clean(r.get("FullName")) or "Unknown Learner",
            "email": _clean(r.get("Email")),
            "slots": _row_review_slots(r, date_prefix, status_prefix, count),
        })
    for x in extras:
        out.append({
            "owner": x["coach"],
            "owner_id": None,
            "name": x["name"],
            "email": x["email"],
            "slots": _lms_review_slots(x["reviews"][metric]),
        })
    return out


def _fmt_hours(value):
    """Decimal hours -> signed "Xh Ym" (the Aptem Progress-Hours / Target format)."""
    if value is None:
        return ""
    sign = "-" if value < 0 else ""
    h = int(abs(value))
    m = round((abs(value) - h) * 60)
    if m == 60:
        h, m = h + 1, 0
    return "%s%dh %dm" % (sign, h, m)


def _lms_progress_hours(x):
    return _fmt_hours(x["progress_hours"]) if x["progress_hours"] is not None else ""


# --------------------------------------------------------------------------
# Per-source aggregation
# --------------------------------------------------------------------------

def _new_learner_bucket(case_owner_id=None, phone=""):
    return {
        "caseOwnerId": case_owner_id,
        "phone": phone,
        "totalLearners": 0,
        "recentSubmitters": 0,
        "otjhOnTrack": 0,
        "otjhNeedAttention": 0,
        "otjhAtRisk": 0,
        # Variance-based OTJH bands (match the Metric Breakdown / chart).
        "otjhVarOnTrack": 0,
        "otjhVarNeedAttention": 0,
        "otjhVarAtRisk": 0,
        "evidenceTotal": 0,
    }


def _count_otjh(bucket, status, completed, progress_raw):
    """Add one learner to the source-status and variance-based OTJH buckets."""
    band = _otjh_source_band(status)
    if band == "on_track":
        bucket["otjhOnTrack"] += 1
    elif band == "need_attention":
        bucket["otjhNeedAttention"] += 1
    elif band == "at_risk":
        bucket["otjhAtRisk"] += 1

    # Variance-based band (progress-hours vs target) — same logic the
    # Metric Breakdown table and the coach-page OTJH chart use.
    var_band = _otjh_variance_band(completed, progress_raw, status)
    if var_band == "on_track":
        bucket["otjhVarOnTrack"] += 1
    elif var_band == "need_attention":
        bucket["otjhVarNeedAttention"] += 1
    elif var_band == "at_risk":
        bucket["otjhVarAtRisk"] += 1


def _aggregate_aptem(today, resolve):
    """Total learners, OTJH buckets, and evidence docs per owner (active only)."""
    rows = _fetch_dicts(
        'SELECT "OwnerName", case_owner_id, "OwnerPhone", "Email", '
        '"Program-Status", "OTJHoursStatus", "Progress-Hours", '
        '"Assignment Evidence", "LMS Evidence", "ExtraAct-Evidence", '
        '"Submitted", "Completed" '
        'FROM aptem_auto_extracting'
    )

    agg = {}
    for r in rows:
        if _lower(r.get("Program-Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("OwnerName"), r.get("Email"))
        if _is_excluded_owner(owner):
            continue

        # A re-homed row's owner id / phone belong to the old (Aptem) owner.
        row_id = None if reassigned else r.get("case_owner_id")
        row_phone = "" if reassigned else _clean(r.get("OwnerPhone"))

        bucket = agg.get(owner)
        if bucket is None:
            bucket = agg[owner] = _new_learner_bucket(row_id, row_phone)
        if bucket["caseOwnerId"] in (None, "") and row_id not in (None, ""):
            bucket["caseOwnerId"] = row_id
        if not bucket["phone"]:
            bucket["phone"] = row_phone

        bucket["totalLearners"] += 1

        # Engagement proxy: a learner who has submitted any OTJ hours.
        if (r.get("Submitted") or 0) and float(r.get("Submitted") or 0) > 0:
            bucket["recentSubmitters"] += 1

        _count_otjh(bucket, r.get("OTJHoursStatus"), float(r.get("Completed") or 0),
                    r.get("Progress-Hours"))

        bucket["evidenceTotal"] += (
            (r.get("Assignment Evidence") or 0)
            + (r.get("LMS Evidence") or 0)
            + (r.get("ExtraAct-Evidence") or 0)
        )

    return agg


def _coach_conflicts(coach_by_email):
    """Active Aptem learners whose Aptem coach and LMS coach are two different
    real coaches. The learner stays counted under the Aptem coach; the conflict
    is listed under both coaches so it can be fixed in one of the systems.

    Returns {coach: [{name, email, aptem_coach, lms_coach}, ...]}.
    """
    rows = _fetch_dicts(
        'SELECT "FullName", "Email", "OwnerName", "Program-Status" FROM aptem_auto_extracting'
    )
    out = {}
    for r in rows:
        if _lower(r.get("Program-Status")) != "active" or _is_alfanar(r.get("Email")):
            continue
        aptem_coach = _clean(r.get("OwnerName"))
        lms_coach = coach_by_email.get(_lower(r.get("Email")))
        if not lms_coach or _is_excluded_owner(aptem_coach) or _is_excluded_owner(lms_coach):
            continue
        if lms_coach.lower() == aptem_coach.lower():
            continue
        item = {
            "kind": "coach",
            "name": _clean(r.get("FullName")) or "Unknown Learner",
            "email": _clean(r.get("Email")),
            "aptem_coach": aptem_coach,
            "lms_coach": lms_coach,
        }
        out.setdefault(aptem_coach, []).append(item)
        out.setdefault(lms_coach, []).append(item)
    for items in out.values():
        items.sort(key=lambda x: x["name"])
    return out


def _status_conflicts(aptem_linked_active):
    """Aptem-linked learners that are Active / Delivery on the LMS but not Active
    on Aptem (blank extract row, On Break, or missing from the extract). They
    are not counted, since Aptem's status wins; the conflict is listed under
    the learner's coach on each system so one of the two can be corrected.

    Returns {coach: [{kind, name, email, aptem_coach, lms_coach,
    aptem_status, lms_status}, ...]}.
    """
    rows = _fetch_dicts(
        'SELECT "ID", "OwnerName", "Program-Status" FROM aptem_auto_extracting'
    )
    aptem = {int(r["ID"]): r for r in rows if r.get("ID") is not None}
    out = {}
    for x in aptem_linked_active:
        if _is_alfanar(x["email"]):
            continue
        r = aptem.get(x["aptem_id"])
        status = _clean(r.get("Program-Status")) if r else ""
        if status.lower() == "active":
            continue
        aptem_coach = _clean(r.get("OwnerName")) if r else ""
        coaches = {c for c in (aptem_coach, x["coach"]) if not _is_excluded_owner(c)}
        if not coaches:
            continue
        item = {
            "kind": "status",
            "name": x["name"],
            "email": x["email"],
            "aptem_coach": aptem_coach,
            "lms_coach": x["coach"],
            "aptem_status": status or ("Not active" if r else "Not in Aptem"),
            "lms_status": x["lifecycle"].title(),
        }
        for coach in coaches:
            out.setdefault(coach, []).append(item)
    for items in out.values():
        items.sort(key=lambda x: x["name"])
    return out


def _aggregate_lms(today, extras):
    """Learners, OTJH buckets and engagement per coach for the LMS-only learners.

    Engagement = any learning activity on the LMS in the last 30 days (the LMS
    counterpart of Require Marking's LastSubDate); the oldest such date also
    feeds the coach's "last submission" / elapsed days.
    """
    agg = {}
    for x in extras:
        owner = x["coach"]
        if _is_excluded_owner(owner):
            continue
        bucket = agg.get(owner)
        if bucket is None:
            bucket = agg[owner] = {**_new_learner_bucket(), "minDate": None}

        bucket["totalLearners"] += 1
        _count_otjh(bucket, x["otjh_status"], x["completed"] or 0, _lms_progress_hours(x))

        last = x["last_activity"]
        if last:
            if 0 <= (today - last).days <= 29:
                bucket["recentSubmitters"] += 1
            if bucket["minDate"] is None or last < bucket["minDate"]:
                bucket["minDate"] = last
    return agg


def _aggregate_marking(today, resolve):
    """Evidence + marking metrics per owner from the Require Marking table.

    Mirrors the n8n //1-evidence node: active-only, exclude @alfanar emails and
    the EXCLUDE owners, group by CaseOwner, sum evidence counts and the daily
    buckets, derive recent submitters (LastSubDate within 30 days) and the
    oldest LastSubDate / elapsed days.
    """
    day_cols = ", ".join('"%s"' % k for k in EVIDENCE_DAY_KEYS)
    rows = _fetch_dicts(
        'SELECT "CaseOwner", "CaseOwner ID", "Phone", "Email", "Status", '
        '"CountEvidencePending", "Evidence Accepted", "Evidence Reffered", '
        '"Referred Closure", "Total Evidence", "LastSubDate", %s '
        'FROM "Require Marking"' % day_cols
    )

    agg = {}
    for r in rows:
        if _lower(r.get("Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("CaseOwner"), r.get("Email"))
        if _is_excluded_owner(owner):
            continue

        row_id = None if reassigned else r.get("CaseOwner ID")
        row_phone = "" if reassigned else _clean(r.get("Phone"))

        bucket = agg.get(owner)
        if bucket is None:
            bucket = agg[owner] = {
                "caseOwnerId": row_id,
                "phone": row_phone,
                "pending": 0,
                "evidenceAccepted": 0,
                "evidenceReferred": 0,
                "referredClosure": 0,
                "totalEvidence": 0,
                "recentSubmitters": 0,
                "minDate": None,
                "days": {k: 0 for k in EVIDENCE_DAY_KEYS},
            }
        if bucket["caseOwnerId"] in (None, "") and row_id not in (None, ""):
            bucket["caseOwnerId"] = row_id
        if not bucket["phone"]:
            bucket["phone"] = row_phone

        bucket["pending"] += (r.get("CountEvidencePending") or 0)
        bucket["evidenceAccepted"] += (r.get("Evidence Accepted") or 0)
        bucket["evidenceReferred"] += (r.get("Evidence Reffered") or 0)
        bucket["referredClosure"] += (r.get("Referred Closure") or 0)
        bucket["totalEvidence"] += (r.get("Total Evidence") or 0)

        last_sub = _parse_iso_date(r.get("LastSubDate"))
        if last_sub:
            diff = (today - last_sub).days
            if 0 <= diff <= 29:
                bucket["recentSubmitters"] += 1
            if bucket["minDate"] is None or last_sub < bucket["minDate"]:
                bucket["minDate"] = last_sub

        for k in EVIDENCE_DAY_KEYS:
            bucket["days"][k] += (r.get(k) or 0)

    return agg


def _aggregate_reviews(today, learners):
    """
    Rolling-period aggregation of review slots (PR or MCM) for the learners from
    _review_learners. Returns {owner: {periods, weeks, learner}}.
    """
    ranges = _period_ranges(today)
    wranges = _week_ranges(today)
    agg = {}

    for item in learners:
        owner = item["owner"]
        if _is_excluded_owner(owner):
            continue

        bucket = agg.get(owner)
        if bucket is None:
            bucket = agg[owner] = {
                "periods": {key: {"required": 0, "completed": 0} for key, _ in PERIODS},
                "weeks": {key: 0 for key, _ in WEEK_BUCKETS},
                # Per-learner tally per window (plus "all" = every date): each
                # learner (row) counts once. "required" = learner had a review
                # due in that window; "completed" = the learner completed ANY
                # review due in that window.
                "learner": {
                    **{key: {"required": 0, "completed": 0} for key, _ in PERIODS},
                    "all": {"required": 0, "completed": 0},
                },
            }

        # Per window (and "all" dates): did this learner have any review due,
        # and did they complete any of them?
        has_any = {**{key: False for key, _ in PERIODS}, "all": False}
        has_completed = {**{key: False for key, _ in PERIODS}, "all": False}

        for slot in item["slots"]:
            planned_date = slot["planned"]
            is_completed = slot["category"] == "Completed"

            for key, _days in PERIODS:
                if not _in_range(planned_date, ranges[key]):
                    continue
                bucket["periods"][key]["required"] += 1
                if is_completed:
                    bucket["periods"][key]["completed"] += 1
                # Per-learner: had a review due in this window, and completed any.
                has_any[key] = True
                if is_completed:
                    has_completed[key] = True

            # "All dates": any review due on or before today (future-dated /
            # scheduled reviews are excluded, mirroring the windowed buckets).
            if planned_date <= today:
                has_any["all"] = True
                if is_completed:
                    has_completed["all"] = True

            if is_completed:
                for key, _offset in WEEK_BUCKETS:
                    if _in_range(planned_date, wranges[key]):
                        bucket["weeks"][key] += 1

        for key in has_any:
            if has_any[key]:
                bucket["learner"][key]["required"] += 1
                if has_completed[key]:
                    bucket["learner"][key]["completed"] += 1

    return agg


def _pr_learners(resolve, extras):
    return _review_learners("progress_review", "Review Planned Date", "Review Status", 16,
                            resolve, extras, "PR")


def _mcm_learners(resolve, extras):
    return _review_learners("MCR", "MCM", "Status", 22, resolve, extras, "MCM",
                            has_owner_id=False)


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

# ``source`` values accepted by compute_coaches_lateness.
SOURCES = ("aptem", "lms")


def compute_coaches_lateness(source=None):
    """Build the list of per-coach records consumed by the Lateness page.

    ``source`` splits learners by who assigned them to the coach: "aptem" =
    assigned on Aptem (matches Aptem's own screens), "lms" = LMS-only learners
    plus Aptem learners re-assigned on the LMS. None (default) = both — the two
    splits add up to it.
    """
    today = _today()
    empty_period = {"required": 0, "completed": 0}

    lms_data = get_lms_data()
    resolve = _owner_resolver(lms_data["coach_by_email"], source)
    extras = [] if source == "aptem" else lms_data["extras"]

    aptem = _aggregate_aptem(today, resolve)
    lms = _aggregate_lms(today, extras)
    marking = _aggregate_marking(today, resolve)
    pr = _aggregate_reviews(today, _pr_learners(resolve, extras))
    mcm = _aggregate_reviews(today, _mcm_learners(resolve, extras))
    conflicts = _coach_conflicts(lms_data["coach_by_email"])
    status_conflicts = _status_conflicts(lms_data["aptem_linked_active"])

    owners = set(aptem) | set(lms) | set(marking) | set(pr) | set(mcm)

    records = []
    for idx, owner in enumerate(sorted(owners), start=1):
        a = aptem.get(owner, {})
        x = lms.get(owner, {})
        mk = marking.get(owner, {})
        p = pr.get(owner, {})
        m = mcm.get(owner, {})

        p_periods = p.get("periods", {})
        p_weeks = p.get("weeks", {})
        m_periods = m.get("periods", {})

        total_learners = a.get("totalLearners", 0) + x.get("totalLearners", 0)
        # Recent submitters: prefer the marking source (LastSubDate within 30d),
        # falling back to the aptem engagement proxy; plus LMS-only learners
        # active on the LMS in the last 30 days.
        recent = mk.get("recentSubmitters", a.get("recentSubmitters", 0)) + x.get("recentSubmitters", 0)
        engagement = round((recent / total_learners) * 100) if total_learners else 0

        pending = mk.get("pending", 0)
        days = mk.get("days", {})
        week_total = sum(days.get(k, 0) for k in EVIDENCE_DAY_KEYS)

        min_dates = [d for d in (mk.get("minDate"), x.get("minDate")) if d]
        min_date = min(min_dates) if min_dates else None
        last_sub = min_date.isoformat() if min_date else ""
        elapsed = (today - min_date).days if min_date else 0

        p_learner = p.get("learner", {})
        m_learner = m.get("learner", {})

        pr4 = p_periods.get("4w", empty_period)
        pr8 = p_periods.get("8w", empty_period)
        # PR 12-week and MCM 4-week are counted PER LEARNER (one per learner, by
        # their most recent due review's status), not per review slot — see
        # _aggregate_reviews. The other windows stay per slot.
        pr12 = p_learner.get("12w", empty_period)
        mcm4 = m_learner.get("4w", empty_period)
        mcm8 = m_periods.get("8w", empty_period)
        mcm12 = m_periods.get("12w", empty_period)

        def rate(part):
            return round((part["completed"] / part["required"]) * 1000) / 10 if part["required"] else 0

        completion_rate = rate(pr12)

        # Per-learner required/completed for every window (4w/8w/12w/all) — used
        # by the home-page PR/MCM performance charts' time-period filter.
        def bylearner_map(learner):
            return {
                k: {
                    "required": learner.get(k, empty_period)["required"],
                    "completed": learner.get(k, empty_period)["completed"],
                }
                for k in ("4w", "8w", "12w", "all")
            }

        pr_bylearner = bylearner_map(p_learner)
        mcm_bylearner = bylearner_map(m_learner)

        case_owner_id = a.get("caseOwnerId") or mk.get("caseOwnerId")
        phone = a.get("phone") or mk.get("phone") or ""

        def otjh(key):
            return a.get(key, 0) + x.get(key, 0)

        records.append({
            "id": idx,
            "caseowner": owner,
            "case_owner_id": case_owner_id,
            "phone": phone,
            "lastsubdate": last_sub,
            "elapseddays": elapsed,

            "total_learners": total_learners,
            "lms_learners": x.get("totalLearners", 0),
            "recent_submitters": recent,
            "learner_engagement": engagement,

            "otjh_ontrack_0_field": otjh("otjhOnTrack"),
            "otjh_need_attention_20_40_field": otjh("otjhNeedAttention"),
            "otjh_at_risk_40_field": otjh("otjhAtRisk"),
            # Variance-based OTJH counts (match the Metric Breakdown / chart bands).
            "otjh_var_ontrack": otjh("otjhVarOnTrack"),
            "otjh_var_need_attention": otjh("otjhVarNeedAttention"),
            "otjh_var_at_risk": otjh("otjhVarAtRisk"),

            # Pending & marking (from Require Marking)
            "pending": pending,
            "evidence_accepted": mk.get("evidenceAccepted", 0),
            "evidence_referred": mk.get("evidenceReferred", 0),
            "referred_closure": mk.get("referredClosure", 0),
            "total_evidence": mk.get("totalEvidence", a.get("evidenceTotal", 0)),

            # Daily evidence buckets + week total
            "today": days.get("Today", 0),
            "yesterday": days.get("Yesterday", 0),
            "ev_minus_2": days.get("-2", 0),
            "ev_minus_3": days.get("-3", 0),
            "ev_minus_4": days.get("-4", 0),
            "ev_minus_5": days.get("-5", 0),
            "ev_minus_6": days.get("-6", 0),
            "ev_minus_7": days.get("-7", 0),
            "evidence_week_total": week_total,

            # PR (progress review) metrics
            "total_pr_required_for_last_4_weeks": pr4["required"],
            "pr_completed_for_last_4_weeks": pr4["completed"],
            "total_pr_required_for_last_8_weeks": pr8["required"],
            "pr_completed_for_last_8_weeks": pr8["completed"],
            "pr_required_12_weeks": pr12["required"],
            "pr_completed_12_weeks": pr12["completed"],
            "pr_completion_rate_12_weeks": completion_rate,
            # Kept for backward-compat (12-week == "overall" on this page).
            "overall_pr_required": pr12["required"],
            "overall_pr_completed": pr12["completed"],
            "overall_pr_completion_rate": completion_rate,

            # PR weekly completed counts (Last Wk / -2nd / -3rd / -4th)
            "pr_week_1_completed": p_weeks.get("w1", 0),
            "pr_week_2_completed": p_weeks.get("w2", 0),
            "pr_week_3_completed": p_weeks.get("w3", 0),
            "pr_week_4_completed": p_weeks.get("w4", 0),

            # MCM (MCR table) metrics — 4 / 8 / 12-week windows
            "mcm_required_4_weeks": mcm4["required"],
            "mcm_completed_4_weeks": mcm4["completed"],
            "mcm_completion_rate_4_weeks": rate(mcm4),
            "mcm_required_8_weeks": mcm8["required"],
            "mcm_completed_8_weeks": mcm8["completed"],
            "mcm_completion_rate_8_weeks": rate(mcm8),
            "mcm_required_12_weeks": mcm12["required"],
            "mcm_completed_12_weeks": mcm12["completed"],
            "mcm_completion_rate_12_weeks": rate(mcm12),
            # Kept for backward-compat with the existing service mapping.
            "required_mcm": mcm4["required"],
            "completed_mcm": mcm4["completed"],

            # Per-learner required/completed per window (4w/8w/12w/all) for the
            # home-page PR & MCM performance charts' time-period filter.
            "pr_bylearner": pr_bylearner,
            "mcm_bylearner": mcm_bylearner,

            # Learners whose Aptem and LMS coaches disagree (see _coach_conflicts)
            # or who are Active on the LMS but not on Aptem (_status_conflicts).
            "coach_conflicts": conflicts.get(owner, []) + status_conflicts.get(owner, []),
        })

    return records


# --------------------------------------------------------------------------
# Drill-down: the individual learners behind one coach's numbers
# --------------------------------------------------------------------------

def _owner_matches(row_owner, row_owner_id, target_name, target_id):
    """A learner belongs to the coach when the owner *name* matches.

    The numeric id is only a fallback for rows whose owner name is blank; it must
    never override a present, differing name. When a learner is reassigned, the
    new coach's name is written to their rows, but a stale ``case_owner_id`` (the
    previous coach's id) can linger. Trusting that id ahead of the name leaks the
    learner back into the old coach's drill — which is exactly how a reassigned
    learner ends up showing under both coaches. Name-first matching prevents it.
    """
    row_name = _clean(row_owner)
    if row_name:
        return row_name.lower() == _clean(target_name).lower()
    # Blank owner name on the row: fall back to the id, when both are present.
    if target_id is not None and row_owner_id is not None:
        try:
            return int(row_owner_id) == int(target_id)
        except (TypeError, ValueError):
            return False
    return False


def compute_coach_drill(coach_name=None, case_owner_id=None, source=None):
    """
    For a single coach, return the learner-level lists that make up each
    counted metric on the Lateness page. Used by the drill-down drawer.

    ``source`` ("aptem" / "lms" / None = both) narrows the learners exactly as
    in compute_coaches_lateness.
    """
    today = _today()
    ranges = _period_ranges(today)

    name = _clean(coach_name)
    cid = case_owner_id

    lms_data = get_lms_data()
    resolve = _owner_resolver(lms_data["coach_by_email"], source)
    extras = [] if source == "aptem" else [
        x for x in lms_data["extras"] if _owner_matches(x["coach"], None, name, cid)
    ]

    # ---- aptem_auto_extracting: learners, OTJH buckets -------------------
    aptem_rows = _fetch_dicts(
        'SELECT "FullName", "Email", "OwnerName", case_owner_id, '
        '"Program-Status", "OTJHoursStatus", "Submitted" '
        'FROM aptem_auto_extracting'
    )
    learners = []
    otjh_at_risk, otjh_need_attention, otjh_on_track = [], [], []
    engaged = []

    def add_learner(full, email, otjh_status, has_submitted):
        learners.append({"name": full, "email": email})
        band = _otjh_source_band(otjh_status)
        if band == "at_risk":
            otjh_at_risk.append({"name": full, "detail": "At Risk"})
        elif band == "need_attention":
            otjh_need_attention.append({"name": full, "detail": "Need Attention"})
        elif band == "on_track":
            otjh_on_track.append({"name": full, "detail": "On Track"})
        if has_submitted:
            engaged.append({"name": full})

    for r in aptem_rows:
        if _lower(r.get("Program-Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("OwnerName"), r.get("Email"))
        if not _owner_matches(owner, None if reassigned else r.get("case_owner_id"), name, cid):
            continue
        add_learner(
            _clean(r.get("FullName")) or "Unknown Learner",
            _clean(r.get("Email")),
            r.get("OTJHoursStatus"),
            bool(r.get("Submitted")) and float(r.get("Submitted") or 0) > 0,
        )
    for x in extras:
        add_learner(x["name"], x["email"], x["otjh_status"], x["last_activity"] is not None)

    # ---- Require Marking: pending evidence, referred closure ------------
    day_cols = ", ".join('"%s"' % k for k in EVIDENCE_DAY_KEYS)
    marking_rows = _fetch_dicts(
        'SELECT "FullName", "Email", "CaseOwner", "CaseOwner ID", "Status", '
        '"CountEvidencePending", "Referred Closure", "LastSubDate", %s '
        'FROM "Require Marking"' % day_cols
    )
    pending_learners, closure_learners, recent_submitters = [], [], []
    for r in marking_rows:
        if _lower(r.get("Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("CaseOwner"), r.get("Email"))
        if not _owner_matches(owner, None if reassigned else r.get("CaseOwner ID"), name, cid):
            continue
        full = _clean(r.get("FullName")) or "Unknown Learner"

        pend = r.get("CountEvidencePending") or 0
        if pend:
            pending_learners.append({"name": full, "detail": "%d pending" % pend})
        clo = r.get("Referred Closure") or 0
        if clo:
            closure_learners.append({"name": full, "detail": "%d closure" % clo})

        last_sub = _parse_iso_date(r.get("LastSubDate"))
        if last_sub and 0 <= (today - last_sub).days <= 29:
            recent_submitters.append({"name": full, "detail": last_sub.isoformat()})
    for x in extras:
        last = x["last_activity"]
        if last and 0 <= (today - last).days <= 29:
            recent_submitters.append({"name": x["name"], "detail": last.isoformat()})

    # ---- progress_review / MCR (+ LMS reviews): PR / MCM per learner ----
    pr_learners = [
        i for i in _pr_learners(resolve, extras)
        if _owner_matches(i["owner"], i["owner_id"], name, cid)
    ]
    mcm_learners = [
        i for i in _mcm_learners(resolve, extras)
        if _owner_matches(i["owner"], i["owner_id"], name, cid)
    ]
    pr_completed_4w, pr_outstanding_12w, pr_completed_12w = _review_drill(pr_learners, ranges)
    mcm_completed_4w, mcm_outstanding_12w, mcm_completed_12w = _review_drill(mcm_learners, ranges)

    def section(key, label, items):
        return {"key": key, "label": label, "count": len(items), "learners": items}

    per_learner = _compute_coach_learner_table(
        name, cid, resolve, extras, pr_learners, mcm_learners,
    )

    # Programme lookup (email -> programme, name -> programme) to enrich the
    # per-review rows, since the review tables don't carry programme.
    prog_by_email, prog_by_name = {}, {}
    for r in per_learner:
        if r.get("email"):
            prog_by_email[_lower(r["email"])] = r.get("programme", "")
        prog_by_name[_lower(r["name"])] = r.get("programme", "")

    def _programme(email, full):
        return prog_by_email.get(_lower(email)) or prog_by_name.get(_lower(full)) or ""

    # One row per PR/MCM review slot (so the filterable Metric Breakdown table
    # can show Completed/Scheduled/etc. per individual review, not just the
    # learner's latest one).
    review_rows = _review_rows(pr_learners, "PR", _programme) + _review_rows(mcm_learners, "MCM", _programme)

    return {
        "coach": name,
        "case_owner_id": cid,
        "per_learner": per_learner,
        "review_rows": review_rows,
        "sections": [
            section("learners", "Active Learners", sorted(learners, key=lambda x: x["name"])),
            section("engaged", "Engaged (has submitted)", sorted(engaged, key=lambda x: x["name"])),
            section("otjh_at_risk", "OTJH — At Risk", otjh_at_risk),
            section("otjh_need_attention", "OTJH — Need Attention", otjh_need_attention),
            section("otjh_on_track", "OTJH — On Track", otjh_on_track),
            section("pending", "Evidence Pending", pending_learners),
            section("referred_closure", "Referred Closure", closure_learners),
            section("recent_submitters", "Recent Submitters (30d)", recent_submitters),
            section("pr_completed", "PR Completed (last 4 weeks)", pr_completed_4w),
            section("pr_completed_12w", "PR Completed (last 12 weeks)", pr_completed_12w),
            section("pr_required", "PR Outstanding (last 12 weeks)", pr_outstanding_12w),
            section("mcm_completed", "MCM Completed (last 4 weeks)", mcm_completed_4w),
            section("mcm_completed_12w", "MCM Completed (last 12 weeks)", mcm_completed_12w),
            section("mcm_required", "MCM Outstanding (last 12 weeks)", mcm_outstanding_12w),
        ],
    }


def _latest_review_status(slots):
    """Most recent planned review's status category + date for a learner."""
    best = max(slots, key=lambda s: s["planned"], default=None)
    if best is None:
        return "", ""
    return best["planned"].isoformat(), best["category"]


def _compute_coach_learner_table(name, cid, resolve, extras, pr_learners, mcm_learners):
    """
    One row per active learner of the coach, joining metrics across all four
    Aptem source tables plus the LMS-only learners (keyed by learner email,
    falling back to name).
    """
    def key_of(email, full):
        e = _lower(email)
        return e if e else "name:" + _lower(full)

    rows = {}

    # Base: aptem (learners, OTJH, progress hours)
    aptem = _fetch_dicts(
        'SELECT "FullName", "Email", "OwnerName", case_owner_id, "Program-Status", '
        '"OTJHoursStatus", "Submitted", "Completed", "Planned", "Minimum", '
        '"Target", "Progress-Hours", "ProgressVariance", '
        '"Program Name" FROM aptem_auto_extracting'
    )
    for r in aptem:
        if _lower(r.get("Program-Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("OwnerName"), r.get("Email"))
        if not _owner_matches(owner, None if reassigned else r.get("case_owner_id"), name, cid):
            continue
        full = _clean(r.get("FullName")) or "Unknown Learner"
        k = key_of(r.get("Email"), full)
        rows[k] = {
            "name": full,
            "email": _clean(r.get("Email")),
            "programme": _clean(r.get("Program Name")),
            "source": "Aptem",
            "otjh_status": _clean(r.get("OTJHoursStatus")),
            "submitted": float(r.get("Submitted") or 0),
            "completed": float(r.get("Completed") or 0),
            "planned": float(r.get("Planned") or 0),
            "minimum": float(r.get("Minimum") or 0),
            # OTJH detail columns (kept as raw text — Target / Progress-Hours /
            # ProgressVariance are text in the source and may carry units/signs).
            "otjh_target": _clean(r.get("Target")),
            "otjh_progress_hours": _clean(r.get("Progress-Hours")),
            "otjh_progress_variance": _clean(r.get("ProgressVariance")),
            "pending": 0,
            "referred_closure": 0,
            "total_evidence": 0,
            "last_sub": "",
            "pr_status": "",
            "pr_date": "",
            "mcm_status": "",
            "mcm_date": "",
        }

    # LMS-only learners (already filtered to this coach). Hours are formatted
    # like the Aptem text columns so the table / OTJH chart parse them the same.
    for x in extras:
        k = key_of(x["email"], x["name"])
        pv = x["progress_variance"]
        rows[k] = {
            "name": x["name"],
            "email": x["email"],
            "programme": x["programme"],
            "source": "LMS",
            "otjh_status": x["otjh_status"],
            "submitted": x["completed"] or 0,
            "completed": x["completed"] or 0,
            "planned": x["planned"] or 0,
            "minimum": x["minimum"] or 0,
            "otjh_target": _fmt_hours(x["target"]),
            "otjh_progress_hours": _lms_progress_hours(x),
            "otjh_progress_variance": ("%.1f%%" % (pv * 100)) if pv is not None else "",
            "pending": 0,
            "referred_closure": 0,
            "total_evidence": 0,
            "last_sub": x["last_activity"].isoformat() if x["last_activity"] else "",
            "pr_status": "",
            "pr_date": "",
            "mcm_status": "",
            "mcm_date": "",
        }

    # Require Marking: evidence + last submission
    day = ", ".join('"%s"' % k for k in EVIDENCE_DAY_KEYS)
    marking = _fetch_dicts(
        'SELECT "FullName", "Email", "CaseOwner", "CaseOwner ID", "Status", '
        '"CountEvidencePending", "Referred Closure", "Total Evidence", "LastSubDate", %s '
        'FROM "Require Marking"' % day
    )
    for r in marking:
        if _lower(r.get("Status")) != "active":
            continue
        if _is_alfanar(r.get("Email")):
            continue
        owner, reassigned = resolve(r.get("CaseOwner"), r.get("Email"))
        if not _owner_matches(owner, None if reassigned else r.get("CaseOwner ID"), name, cid):
            continue
        full = _clean(r.get("FullName")) or "Unknown Learner"
        k = key_of(r.get("Email"), full)
        row = rows.get(k)
        if row is None:
            continue
        row["pending"] = r.get("CountEvidencePending") or 0
        row["referred_closure"] = r.get("Referred Closure") or 0
        row["total_evidence"] = r.get("Total Evidence") or 0
        last = _parse_iso_date(r.get("LastSubDate"))
        row["last_sub"] = last.isoformat() if last else ""

    # Latest PR / MCM status (Aptem progress_review / MCR, LMS reviews).
    for items, date_key, status_key in (
        (pr_learners, "pr_date", "pr_status"),
        (mcm_learners, "mcm_date", "mcm_status"),
    ):
        for item in items:
            row = rows.get(key_of(item["email"], item["name"]))
            if row is None:
                continue
            row[date_key], row[status_key] = _latest_review_status(item["slots"])

    return sorted(rows.values(), key=lambda x: x["name"])


def _review_drill(learners, ranges):
    """Return (completed_4w, outstanding_12w, completed_12w) learner lists.

    ``outstanding_12w`` is reviews planned in the 12-week window that are NOT
    yet Completed (i.e. the work still required). Completed reviews are surfaced
    in ``completed_12w`` instead, so a learner who has done their review no
    longer shows up under "Required". (outstanding_12w + completed_12w together
    equal the total planned in the window, which is the KPI "required" count.)
    """
    # No dedup: count each qualifying review slot, exactly as the row
    # aggregation does, so the drill totals match the numbers on the table.
    completed_4w, outstanding_window, completed_12w = [], [], []
    win_4w = ranges["4w"]
    win_long = ranges["12w"]

    for item in learners:
        full = item["name"]
        for slot in item["slots"]:
            planned = slot["planned"]
            category = slot["category"]
            is_done = category == "Completed"
            iso = planned.isoformat()

            if _in_range(planned, win_long):
                if is_done:
                    completed_12w.append({"name": full, "detail": iso})
                else:
                    # Show why it's still outstanding (Scheduled / In Progress / …).
                    outstanding_window.append({"name": full, "detail": "%s · %s" % (iso, category)})
            if is_done and _in_range(planned, win_4w):
                completed_4w.append({"name": full, "detail": iso})

    completed_4w.sort(key=lambda x: x["name"])
    outstanding_window.sort(key=lambda x: x["name"])
    completed_12w.sort(key=lambda x: x["name"])
    return completed_4w, outstanding_window, completed_12w


def _review_rows(learners, metric, programme_fn):
    """
    One row per individual PR/MCM review slot for the coach's active learners.

    Each row: {name, email, programme, metric, status, date}. ``status`` is the
    classified category (Completed / Scheduled / Awaiting Signature /
    Not Scheduled / In Progress).
    """
    out = []
    for item in learners:
        for slot in item["slots"]:
            out.append({
                "name": item["name"],
                "email": item["email"],
                "programme": programme_fn(item["email"], item["name"]),
                "metric": metric,
                "status": slot["category"],
                "date": slot["shown"].isoformat(),
            })
    out.sort(key=lambda x: (x["name"], x["date"]))
    return out
