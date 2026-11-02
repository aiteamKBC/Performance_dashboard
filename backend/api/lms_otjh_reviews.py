"""LMS migrated-review plan allowance; earned review hours stay in the ledger."""
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from zoneinfo import ZoneInfo
import json

from .lms_otjh_rules import _s

FAMILY_BY_SOURCE_TYPE = {
    'monthly coaching meeting': 'MCM', 'monthly coaching': 'MCM', 'mcm': 'MCM',
    'progress review': 'PR', 'progress review (+ skills radar)': 'PR_SKILLS_RADAR',
    'personal support plan': 'PSP',
}


def programme_key(programme_id, programme_name):
    """Prefer the stable LMS programme id; isolate exact-name legacy fallback."""
    stable = str(programme_id or "").strip()
    if stable:
        return f"id:{stable}"
    name = " ".join(str(programme_name or "").split()).casefold()
    return f"name:{name}" if name else None

def review_family(source_type):
    return FAMILY_BY_SOURCE_TYPE.get(str(source_type or "").strip().casefold())

def _normalise_status(value):
    normalised = _s(value).strip().lower().replace(" ", "-").replace("_", "-")
    # Aptem has emitted both workflow wording (Finished/Complete/Planned) and
    # the platform status wording over different exports. Keep one vocabulary
    # for the Planned/Finished tabs in the learner UI.
    return {
        "finished": "completed",
        "complete": "completed",
        "planned": "not-scheduled",
        "not-booked": "not-scheduled",
        "inprogress": "in-progress",
        "awaitingsignature": "awaiting-signature",
    }.get(normalised, normalised) or "unknown"

def _json_value(value, expected_type, fallback):
    if isinstance(value, expected_type):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except (TypeError, ValueError):
            return fallback
        return decoded if isinstance(decoded, expected_type) else fallback
    return fallback

def _parse_imported_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = _s(value).strip()
    if not text:
        return None
    for pattern in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d %b %Y at %H:%M",
        "%d %B %Y at %H:%M",
        "%d %b %Y",
        "%d %B %Y",
    ):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return None

def _iso_date(value):
    parsed = _parse_imported_datetime(value)
    return parsed.date().isoformat() if parsed else None

def policy(definition):
    value = definition.get("otjh", {"expectedHours": 0, "countsTowardsOtjh": False})
    if not isinstance(value, dict) or set(value) != {"expectedHours", "countsTowardsOtjh"}:
        raise ValueError("OTJH settings need expectedHours and countsTowardsOtjh only.")
    if type(value["countsTowardsOtjh"]) is not bool or isinstance(value["expectedHours"], bool):
        raise ValueError("OTJH requires a numeric hours value and a true/false counting setting.")
    try:
        hours = Decimal(str(value["expectedHours"]))
    except (InvalidOperation, ValueError):
        raise ValueError("Expected OTJH must be a number.") from None
    if not hours.is_finite() or not 0 <= hours <= Decimal("999999.99") or hours != hours.quantize(Decimal("0.01")):
        raise ValueError("Expected OTJH must be non-negative with at most two decimal places (maximum 999999.99).")
    return {"expectedHours": float(hours), "countsTowardsOtjh": value["countsTowardsOtjh"]}

def hours_for(definition):
    settings = policy(definition)
    return settings["expectedHours"] if settings["countsTowardsOtjh"] else 0.0

def frozen_hours(overlay):
    credit = (overlay.meeting_intelligence or {}).get("otjhCredit")
    if credit:
        return credit["hours"]
    if (overlay.meeting_intelligence or {}).get("reopenCompletedAt"):
        return 0.0
    return hours_for(overlay.template_snapshot) if overlay.status == "awaiting-signature" else 0.0


def day(value):
    if isinstance(value, datetime):
        return value.astimezone(ZoneInfo('Europe/London')).date() if value.tzinfo else value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10]) if value else None


def _serialize_review(row, sections):
    # Only the scheduling fields read by migrated_otjh.planned_meetings.
    data = _json_value(row.get('review_data'), dict, {})
    metadata = _json_value(data.get('source_metadata'), dict, {})
    return {'aptemReviewId': _s(row.get('aptem_review_id')), 'type': _s(row.get('review_type')),
            'plannedDate': _iso_date(row.get('planned_scheduled_date') or metadata.get('Planned / Scheduled Date')),
            'completedDate': _iso_date(row.get('completed_date') or metadata.get('Completed Date')),
            'status': _normalise_status(row.get('status') or metadata.get('Status'))}


def planned_hours_bulk(owners, query):
    def positive_id(value):
        try:
            return int(str(value).strip()) if int(str(value).strip()) > 0 else None
        except (ValueError, TypeError):
            return None

    eligible = []
    for owner in owners:
        account, profile = positive_id(owner.get('account_aptem_id')), positive_id(owner.get('aptem_id'))
        if (account or profile) and not (account and profile and account != profile) and owner.get('start_date') and owner.get('end_date'):
            eligible.append(owner)
    if not eligible:
        return {}
    templates = [SimpleNamespace(**t) for t in query('''SELECT id AS pk,programme_key,review_family,
        name,definition_json FROM "Coach".coach_migrated_review_template WHERE is_active IS TRUE''')]
    by_slot = {(t.programme_key, t.review_family): t for t in templates}
    ids = [o['id'] for o in eligible]
    by_owner = defaultdict(dict)
    for row in query('''SELECT learner_id,source_review_id,status,migrated_template_id,
        jsonb_build_object('name',template_snapshot->'name','otjh',template_snapshot->'otjh') AS template_snapshot,
        jsonb_build_object('otjhCredit',meeting_intelligence->'otjhCredit',
            'reopenCompletedAt',meeting_intelligence->'reopenCompletedAt') AS meeting_intelligence
        FROM "Coach".coach_imported_review_instance WHERE learner_id=ANY(%s)''', [ids]):
        # The LMS omits absent otjh settings so policy() supplies its default.
        if row['template_snapshot'].get('otjh') is None:
            row['template_snapshot'].pop('otjh', None)
        by_owner[row['learner_id']][row['source_review_id']] = SimpleNamespace(**row)
    if not any(hours_for(t.definition_json) for t in templates) and not any(
            frozen_hours(o) for group in by_owner.values() for o in group.values()):
        return {}
    sources = defaultdict(list)
    for row in query('''SELECT id,learner_id,aptem_review_id,review_type,planned_scheduled_date,
        completed_date,status,review_data->>'aptem_learner_id' AS source_learner_id,
        jsonb_build_object('source_metadata',jsonb_build_object(
            'Planned / Scheduled Date',review_data #>> '{source_metadata,Planned / Scheduled Date}',
            'Completed Date',review_data #>> '{source_metadata,Completed Date}',
            'Status',review_data #>> '{source_metadata,Status}')) AS review_data
        FROM "Learner".reviews WHERE learner_id=ANY(%s) ORDER BY id''', [ids]):
        sources[row['learner_id']].append(row)
    result = {}
    for owner in eligible:
        key = programme_key(owner.get('programme_id'), owner.get('programme'))
        assigned = {family: by_slot.get((key, family)) or by_slot.get(('', family))
                    for family in ('MCM', 'PR', 'PR_SKILLS_RADAR')}
        rows = planned_meetings(SimpleNamespace(**owner), day(owner['start_date']), day(owner['end_date']),
                                templates=assigned, overlays=by_owner[owner['id']], rows=sources[owner['id']])
        result[owner['enrolment_id']] = round(sum(row['hours'] for row in rows), 2)
    return result

def planned_meetings(profile, window_start, window_end, *, templates, overlays, rows):
    """Project real imported occurrences; no Native recurrence generation."""

    if not any(t and hours_for(t.definition_json) for t in templates.values()) and not any(
            frozen_hours(o) for o in overlays.values()):
        return []
    # Select only scheduling metadata; never pull answers/evidence for a total.
    grouped, seen = {}, set()
    for row in rows:
        if str(row.get("source_learner_id") or "").strip() not in {"", str(profile.aptem_id)}:
            continue
        review = _serialize_review(row, {})
        reference = review["aptemReviewId"]
        family = review_family(review["type"])
        if not reference or reference in seen or family not in {"MCM", "PR", "PR_SKILLS_RADAR"}:
            continue
        seen.add(reference)
        overlay = overlays.get(row["id"])
        credit = (overlay.meeting_intelligence or {}).get("otjhCredit") if overlay else None
        if review["status"] == "cancelled" or ((review["status"] == "completed" or review["completedDate"]) and not credit):
            continue
        was_completed = overlay and (overlay.status == "completed" or (overlay.meeting_intelligence or {}).get("reopenCompletedAt"))
        if was_completed and not credit:
            continue
        template = templates[family]
        frozen = overlay and (was_completed or overlay.status == "awaiting-signature")
        definition = overlay.template_snapshot if frozen else template.definition_json if template else {}
        hours = credit["hours"] if credit else hours_for(definition)
        target = day(review["plannedDate"])
        if hours <= 0 or not target or not window_start <= target <= window_end:
            continue
        identity = (family, hours, overlay.migrated_template_id if frozen else template.pk if template else None)
        item = grouped.setdefault(identity, {"reviewTemplateId": f"aptem:{identity[2]}",
            "name": definition.get("name", family) if frozen else template.name if template else family,
            "hoursEach": hours, "occurrences": 0, "hours": 0, "recurrenceLabel": "Imported review dates",
            "startDate": target.isoformat(), "endDate": target.isoformat(), "reviewSource": "aptem"})
        item["occurrences"] += 1
        item["hours"] = round(item["occurrences"] * hours, 2)
        item["startDate"] = min(item["startDate"], target.isoformat())
        item["endDate"] = max(item["endDate"], target.isoformat())
    return list(grouped.values())

