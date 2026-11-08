"""Canonical LMS review counts shared by cards and charts (one count per review).

Matches the LMS coach directory: completed_date wins over planned_scheduled_date,
inclusive rolling week windows, and only incomplete reviews before today overdue.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

PERIOD_WEEKS = {'4w': 4, '8w': 8, '12w': 12, 'all': None}
REVIEW_TYPES = {
    'progress review': 'PR', 'progress review (+ skills radar)': 'PR',
    'monthly coaching meeting': 'MCM', 'monthly coaching': 'MCM', 'mcm': 'MCM',
}
COMPLETED = {'completed', 'complete', 'finished'}


def empty_periods():
    return {key: {'required': 0, 'completed': 0, 'overdue': 0} for key in PERIOD_WEEKS}


def aggregate_reviews(rows, as_of):
    result = {}
    for owner, review_type, status, review_date in rows:
        family = REVIEW_TYPES.get(str(review_type or '').strip().lower())
        if not family or review_date is None:
            continue
        completed = str(status or '').strip().lower() in COMPLETED
        periods = result.setdefault(owner, {'PR': empty_periods(), 'MCM': empty_periods()})[family]
        for key, weeks in PERIOD_WEEKS.items():
            if review_date > as_of or (weeks and review_date < as_of - timedelta(weeks=weeks)):
                continue
            periods[key]['required'] += 1
            periods[key]['completed'] += int(completed)
            periods[key]['overdue'] += int(not completed and review_date < as_of)
    return result


def read_review_metrics(cursor, caseload, as_of=None):
    as_of = as_of or datetime.now(ZoneInfo('Europe/London')).date()
    owners = {p['id']: p['coach_email'].strip().lower() for p in caseload}
    result = {owner: {'PR': empty_periods(), 'MCM': empty_periods()} for owner in owners.values()}
    if not owners:
        return result
    # Match the LMS coach-directory review population exactly. Its review
    # selector includes every named Active/Delivery profile with an enrolment,
    # including internal accounts hidden by the separate caseload display.
    cursor.execute('''SELECT lower(trim(l.coach_email)), r.review_type, r.status,
        coalesce(r.completed_date, r.planned_scheduled_date)::date
        FROM "Learner".learners l JOIN "Learner".reviews r ON r.learner_id = l.id
        WHERE lower(trim(l.coach_email)) = ANY(%s)
        AND l.enrolment_id IS NOT NULL AND nullif(trim(l.full_name), '') IS NOT NULL
        AND regexp_replace(lower(coalesce(l.programme_status, '')), '[^a-z0-9]', '', 'g')
            IN ('active', 'delivery')
        AND lower(trim(r.review_type)) = ANY(%s)''', [sorted(result), list(REVIEW_TYPES)])
    rows = cursor.fetchall()
    result.update(aggregate_reviews(rows, as_of))
    for periods in result.values():
        periods['pr_weeks'] = {f'w{i + 1}': 0 for i in range(4)}
    for owner, kind, status, day in rows:
        if (REVIEW_TYPES.get(str(kind or '').strip().lower()) == 'PR'
                and str(status or '').strip().lower() in COMPLETED and day is not None):
            days_ago = (as_of - day).days
            if 0 <= days_ago < 28:
                result[owner]['pr_weeks'][f'w{days_ago // 7 + 1}'] += 1
    return result
