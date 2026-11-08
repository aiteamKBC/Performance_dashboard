# Dashboard metrics: canonical LMS sources

The LMS loader uses a repeatable-read, read-only transaction so a refresh cannot
mix source revisions while it computes the metrics. A cold OTJH rebuild can take
several minutes; successful snapshots are cached for subsequent page loads.

Cards and home analytics charts consume the same `GET /api/coaches-lateness/`
response. Review counts are computed by `api/lms_reviews.py`; no Aptem review
counts are used as a fallback for these cards or charts.

## PR and MCM

Source: `"Learner".reviews` joined to `"Learner".learners`, grouped by the current
coach email. Each review counts once, including when one learner has multiple
reviews. `pr_periods` and `mcm_periods` expose required, completed and overdue
for 4w, 8w, 12w and all. Scalar card fields are aliases of these same periods.
The legacy API names `pr_bylearner` and `mcm_bylearner` are compatibility aliases,
not a separate per-learner calculation.

Rules match `coach_performance_metrics_by_coach` in the local LMS checkout:

- Population: named profiles with an enrolment, Active/Delivery programme status.
  This selector includes internal profiles hidden by the separate caseload filter.
- Types: Progress Review / Progress Review (+ Skills Radar); Monthly Coaching
  Meeting / Monthly Coaching / MCM. Other types do not count.
- Effective date: completed_date when present, otherwise planned_scheduled_date.
  Null dates and future dates do not count.
- Completed: exact case-insensitive trimmed completed / complete / finished.
- Required includes completed reviews. Overdue is incomplete AND effective date
  before today. A review due today is outstanding but not overdue.
- 4w/8w/12w are inclusive [today - 28/56/84 days, today], matching the LMS.
  All dates means dates through today; it is not a 12-week approximation.
- Today follows Europe/London, matching the LMS. Weekly PR trends use the same
  review ledger and completion aliases.

The LMS PR card rounds its percentage to an integer; other completion-rate
fields retain one decimal. Both use the identical numerator and denominator.

## Pending marking

Matches the LMS Coach Dashboard **Marking list** selector, not the narrower
coach-directory assignment counter. Source is `api/lms_marking.py`: all submission
activity types in submitted_for_tutor_review or escalated across all named owned
profiles, regardless of programme status. One stable enrolment maps to one profile
per coach, matching the LMS selector; duplicate profiles cannot multiply the count.

The previous directory-only selector excluded readings, quizzes, videos, sessions,
podcasts and slide decks. On 2026-11-08 that produced Aryan 20 instead of 35 and
Femi 3 instead of 31. That value is now separately named `assignment_pending`
in source enrichment; it never drives the dashboard Pending Marking KPI.

`pending_marking` detail rows and `pending_marking_count` come from the same queue
as the coach-card total. The metric breakdown consumes this queue directly,
including profiles outside the Active/Delivery learner table. It labels the
weighted number of submissions separately from the number of learner rows and
uses the actual oldest pending submission date, not an Aptem evidence date.
No previous-week queue snapshot exists; no historical series is displayed.

Run `python scripts/verify_marking_parity.py --lms-root PATH --output docs/marking_parity.json`
to compare every coach's total, profile identity, learner name, programme, oldest
and latest dates against the actual LMS Marking selector on one read-only snapshot.

## Engagement, OTJH and unavailable data

Engagement is the percentage of the visible caseload with a non-deleted LMS
learning-progress submission in the last 30 days. It is separate from attendance.
Cards and charts show one decimal from the same recent/total counts.

OTJH cards and charts use the same canonical LMS OTJH bands from the visible
caseload; the independent parity tool compares the underlying LMS calculations.
Referred closure has no LMS equivalent and is displayed as unavailable, not zero.

Missing authoritative review/marking data fails explicitly instead of reverting
to legacy counts or fabricating zero. The server can retain its last successful
snapshot during a failed background refresh. Source cache is 30 seconds and the
computed endpoint cache is 60 seconds; browser refresh requests can clear both.

## Verification

`api/test_lms_reviews.py` covers mixed completed/overdue reviews for one learner,
completion aliases, rolling-window boundaries, due today, future/null dates,
zero reviews, missing sources, weekly counts and the card/chart response contract.

Run `python scripts/verify_review_parity.py --lms-root PATH --output docs/review_parity.json`
from backend to compare PR 12w, MCM 4w and the separately named assignment-only counter against the actual LMS
coach-directory function on a single repeatable-read, read-only database snapshot.
The stored report identifies its date, reference checkout, totals and differences.
It verifies the available database and checkout, not deployment of this dashboard.

OTJH regressions also cover standalone extra activities, their selected reporting
month, and the correct/add/retry saved-attempt choices. The OTJH reader uses the
same complete projection selector as the current LMS, including timed saved
attempts and transferred profiles. `verify_otjh_parity.py --lms-root PATH --output
docs/otjh_parity.json` compares every returned OTJH fact on a read-only snapshot.
`--limit N` is available for diagnostic samples; the saved full report states its
actual number of checked profiles.

The separate timetable/current-week planning views continue to use their own
booking selectors; they measure scheduled meetings rather than these rolling
coach-directory review metrics.
