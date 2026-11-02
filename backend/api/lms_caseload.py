"""Coach population and pending marking, matching LMS dashboard selectors.

Counts use profile IDs, ownership uses coach_email, and queue entries use the
linked enrolment ID. Email is only a compatibility key for legacy reports.
"""
from collections import Counter, defaultdict
import re


_STAFF_DOMAINS = (
    '@kentbusinesscollege.com', '@kentbusinesscollege.org', '@kentbusinesscollege.net',
)


def excluded_account(row):
    """Synthetic/test accounts that must not enter dashboard caseloads."""
    name = str(row.get('full_name') or '').strip().lower()
    email = str(row.get('email') or '').strip().lower()
    coach = str(row.get('coach_name') or '').strip().lower()
    coach_email = str(row.get('coach_email') or '').strip().lower()
    if name.startswith(('test', 'rewan', 'mwada')):
        return True
    if email.startswith(('test', 'rewan', 'mwada')):
        return True
    if coach.startswith(('test', 'rewan', 'mwada')):
        return True
    if coach_email.startswith(('test', 'rewan', 'mwada')):
        return True
    # Test learners named after their coach ("Rukshana test learner", "Omar
    # badr Test account", "ME L4 Oct 26 (Test)") and first-session dry runs.
    if re.search(r'\btest\b', name) or re.search(r'first (learning )?session', name):
        return True
    # Staff enrolled as learners (KBC staff email as the learner's own email).
    if email.endswith(_STAFF_DOMAINS):
        return True
    # QA accounts can be named in several ways (e.g. "KBC Android QA" or
    # "QA learner-launch"); treat QA as a synthetic account marker.
    return bool(re.search(r'\bqa\b', name) or re.search(r'\bqa\b', email)
                or re.search(r'\bqa\b', coach) or re.search(r'\bqa\b', coach_email))


def visible_status(status):
    normalized = re.sub(r'[^a-z0-9]+', '', str(status or '').lower())
    # The dashboard population follows the LMS coach caseload selector exactly:
    # only learners in Active or Delivery are included.  Break, onboarding,
    # ready-to-enrol and terminal stages are intentionally excluded.
    return normalized in {'active', 'delivery'}


def visible_learner(row):
    """Active / Delivery on the programme *and* in the learner's lifecycle.
    The programme status lags behind lifecycle moves (withdrawn, entered EPA,
    on break, onboarding, ready to enrol), so both have to agree."""
    lifecycle = row.get('lifecycle_status')
    return visible_status(row.get('programme_status')) and (
        not str(lifecycle or '').strip() or visible_status(lifecycle))


def build_caseload(profiles, marking, fallback_owner=None):
    """``fallback_owner(row) -> coach name or None`` places learners the LMS
    has no coach for (e.g. under their Aptem owner)."""
    profiles = [row for row in profiles if not excluded_account(row)]
    names = defaultdict(Counter)
    for row in profiles:
        email = str(row.get('coach_email') or '').strip().lower()
        name = ' '.join(str(row.get('coach_name') or '').split())
        if email and name:
            names[email][name] += 1
    coach_names = {email: sorted(counts, key=lambda name: (-counts[name], name))[0] for email, counts in names.items()}
    coach_emails = {name.lower(): email for email, name in coach_names.items()}
    visible, queue, seen = [], {}, set()
    for row in sorted(profiles, key=lambda row: (str(row.get('full_name') or ''), row['id'])):
        if row['id'] in seen or not str(row.get('full_name') or '').strip():
            continue
        seen.add(row['id'])
        owner_email = str(row.get('coach_email') or '').strip().lower()
        if not owner_email and fallback_owner:
            owner_email = coach_emails.get(' '.join(str(fallback_owner(row) or '').split()).lower(), '')
        if not owner_email:
            continue
        owner = coach_names.get(owner_email) or owner_email
        counts = marking.get(str(row.get('enrolment_id')), {})
        item = {**row, 'coach': owner, 'coach_email': owner_email,
                'name': ' '.join(str(row['full_name']).split()),
                'pending': int(counts.get('pending_count') or 0),
                'marking_accepted': int(counts.get('accepted_count') or 0),
                'marking_referred': int(counts.get('referred_count') or 0),
                'marking_total': int(counts.get('total_count') or 0),
                'marking_days': {
                    key: int(counts.get(key) or 0)
                    for key in ('today', 'yesterday', 'minus_2', 'minus_3',
                                'minus_4', 'minus_5', 'minus_6', 'minus_7')
                },
                'oldest_pending': counts.get('oldest_pending'),
                'latest_pending': counts.get('latest_pending')}
        # The LMS marking selector uses all owned profiles, independently of
        # the All Learners display filter.
        if item['pending']:
            queue[(owner_email, str(row.get('enrolment_id')))] = item
        if visible_learner(row):
            visible.append(item)
    return visible, list(queue.values())


def read_caseload(cursor, fallback_owner=None):
    cursor.execute('''SELECT id,enrolment_id,full_name,email,secondary_email,coach_name,
        coach_email,programme,programme_status,lifecycle_status,aptem_id
        FROM "Learner".learners''')
    columns = [c[0] for c in cursor.description]
    profiles = [dict(zip(columns, row)) for row in cursor.fetchall()]
    enrolments = sorted({str(p['enrolment_id']) for p in profiles
                        if p.get('enrolment_id') and p.get('coach_email') and p.get('full_name')})
    marking = {}
    if enrolments:
        cursor.execute('''SELECT learner_id,
            COUNT(*) FILTER (WHERE status IN ('submitted_for_tutor_review','escalated')) AS pending_count,
            COUNT(*) FILTER (WHERE status IN ('accepted','partial')) AS accepted_count,
            COUNT(*) FILTER (WHERE status IN ('escalated')) AS referred_count,
            COUNT(*) FILTER (WHERE status NOT IN ('draft')) AS total_count,
            MIN(submitted_at) FILTER (WHERE status IN ('submitted_for_tutor_review','escalated')) AS oldest_pending,
            MAX(submitted_at) FILTER (WHERE status IN ('submitted_for_tutor_review','escalated')) AS latest_pending,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS today,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS yesterday,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 2) AS minus_2,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 3) AS minus_3,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 4) AS minus_4,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 5) AS minus_5,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 6) AS minus_6,
            COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 7) AS minus_7
            FROM "Learner".learning_reflection_submissions
            WHERE learner_id=ANY(%s)
            GROUP BY learner_id''', [enrolments])
        marking = {
            str(row[0]): {
                'pending_count': _pending_count(row),
                'accepted_count': row[2],
                'referred_count': row[3],
                'total_count': row[4],
                'oldest_pending': row[5],
                'latest_pending': row[6],
                'today': row[7], 'yesterday': row[8], 'minus_2': row[9],
                'minus_3': row[10], 'minus_4': row[11], 'minus_5': row[12],
                'minus_6': row[13], 'minus_7': row[14],
            }
            for row in cursor.fetchall()
        }
    return build_caseload(profiles, marking, fallback_owner)


def _pending_count(row):
    """The New LMS marking queue: only submissions awaiting tutor action."""
    # The aggregate query returns accepted, referred, total, then the pending
    # dates. The pending count itself is kept as a separate expression below
    # for clarity and compatibility with the existing queue contract.
    return row[1]
