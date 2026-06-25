# Coach Performance Metrics — Complete Calculation Specification

> **Purpose of this document.** This is a self-contained, implementation-grade
> specification of **every per-coach metric** the Performance Dashboard computes:
> **PR** (Progress Review), **MCM/MCR** (Monthly Coaching Meeting), **OTJH**
> (On-the-Job Hours risk), **Marking / Evidence**, **Attendance / Absence**, and
> **Learner Engagement**. It documents the source tables, the exact filters, the
> date-parsing and status-classification rules, the time windows, the formulas,
> the drill-downs, and the display thresholds — enough to rebuild the logic in a
> different stack without reading the original code.
>
> Everything here is derived from the live computation modules
> (`api/lateness_compute.py`, `api/attendance_compute.py`) and the frontend
> service/components. All PR/MCM/OTJH/Marking numbers are **computed live on each
> request** from raw source tables — there is no pre-aggregated cache. Attendance
> has both a live path and an overwrite job that materialises `coach_summary`.

---

## Table of contents

1. [System & data sources](#1-system--data-sources)
2. [The coach (case owner) as the unit of aggregation](#2-the-coach-case-owner-as-the-unit-of-aggregation)
3. [Global building blocks (shared by all metrics)](#3-global-building-blocks-shared-by-all-metrics)
4. [Source tables — columns used](#4-source-tables--columns-used)
5. [PR — Progress Review](#5-pr--progress-review)
6. [MCM — Monthly Coaching Meeting (MCR table)](#6-mcm--monthly-coaching-meeting-mcr-table)
7. [OTJH — On-the-Job Hours risk](#7-otjh--on-the-job-hours-risk)
8. [Marking & Evidence](#8-marking--evidence)
9. [Attendance / Absence](#9-attendance--absence)
10. [Learner Engagement & other derived coach fields](#10-learner-engagement--other-derived-coach-fields)
11. [The full per-coach record (output contract)](#11-the-full-per-coach-record-output-contract)
12. [Drill-downs (learner-level breakdowns)](#12-drill-downs-learner-level-breakdowns)
13. [Display thresholds & colour bands](#13-display-thresholds--colour-bands)
14. [API endpoints](#14-api-endpoints)
15. [Reference pseudocode](#15-reference-pseudocode)
16. [Gotchas & invariants](#16-gotchas--invariants)

---

## 1. System & data sources

There are **two physical databases**:

| Logical name | Env var | Engine | Holds |
|--------------|---------|--------|-------|
| **default** | `DATABASE_URL` | Postgres (Neon) | The "Aptem extract" and review tables: `aptem_auto_extracting`, `Require Marking`, `progress_review`, `MCR`, plus the legacy aggregate tables `coaches_lateness`, `coach_summary`, `Test KPIs`. |
| **KBC** | `kbc_main_database_url` | Postgres | The attendance system: `kbc_attendance` (one row per student per session) and `kbc_users_data` (the student roster, including each student's coach). |

> **Why two DBs matter:** PR / MCM / OTJH / Marking all come from the **default**
> DB. Attendance/Absence comes from the **KBC** DB and is joined student→coach
> through `kbc_users_data."OwnerName"`. They never share a query.

All metrics are bucketed **per coach**. The "coach" is the learner's **case owner
/ owner name** (a person's full name string, e.g. `"Jane Smith"`), optionally
disambiguated by a numeric `case_owner_id`.

---

## 2. The coach (case owner) as the unit of aggregation

Every source row carries an owner. The owner field name differs per table:

| Table | Owner name column | Owner id column |
|-------|-------------------|-----------------|
| `aptem_auto_extracting` | `OwnerName` | `case_owner_id` |
| `Require Marking` | `CaseOwner` | `CaseOwner ID` |
| `progress_review` | `CaseOwner` | `case_owner_id` |
| `MCR` | `CaseOwner` | **(none — name only)** |
| `kbc_users_data` | `OwnerName` | (student `ID` links to attendance) |

A coach's headline numbers are the **sum / aggregate over all their active
learners' rows**. For drill-downs (one coach), each row must additionally match
the target coach via [`_owner_matches`](#owner-matching).

---

## 3. Global building blocks (shared by all metrics)

These rules are applied **identically** across PR, MCM, OTJH and Marking. Get
these right first — most of the logic is here.

### 3.1 "Today"

`today = server local date` (`date.today()`). All rolling windows are anchored to
it. Numbers therefore shift as the calendar advances even if source data is
unchanged. (Attendance uses the same `today` for its week math.)

### 3.2 String cleaning

- `clean(x)` → `str(x or "").strip()` (None becomes empty string).
- `lower(x)` → `clean(x).lower()`.

### 3.3 Row-level filters (a learner row is **dropped entirely** unless ALL pass)

1. **Active only.** The row's program/learner status must be `active`
   (case-insensitive). The status column is `Program-Status` on
   `aptem_auto_extracting` / `kbc_users_data`, and `Status` on
   `Require Marking` / `progress_review` / `MCR`.
2. **No Alfanar.** `Email` must **not** end with `@alfanar.com`.
3. **Owner is a real coach.** The owner name must be non-blank and **not** in the
   `EXCLUDE` set (non-coaching owners — enrolment team, admins, system accounts).

#### The EXCLUDE set (compared case-insensitively)

```
Ayman Badewi, Ahmed Lotfi, Alice Saunders, Enrolment Team, Ali Zaki,
Mohamed Gamal, Charl Sevel, Danielle Andrews, Gamal Ahmed, Ahmed Tantawy,
Esraa Yasser, Mohamed Sabry, Vin Chau, Sarah Mohamed, Alaa Youssef,
Mariam Beridze, Nada Marey, Nouran Abdalla, Mahinor Hesham, Claire Sykes,
API Do Not Delete, Ahmed Hisham, Elaf Mansour, Ella Steven, Default Owner,
Safiyah Wellsping, Nada Ibrahim, Amgad Badewi
```

> The attendance path does **not** apply the EXCLUDE set — it groups by
> `kbc_users_data."OwnerName"` and only filters out null/blank owners. EXCLUDE is
> a PR/MCM/OTJH/Marking concept. (A real rebuild may want to apply EXCLUDE to
> attendance too for consistency; the current system does not.)

### 3.4 Owner matching (drill-down only) <a name="owner-matching"></a>

For a single-coach view, a row belongs to the coach if **either**:
- both sides have an id and `int(row_owner_id) == int(target_id)`, **or**
- `lower(clean(row_owner_name)) == lower(clean(target_name))`.

Because `MCR` has no id column, MCM matching is **name-only** — an exact
CaseOwner name is required for MCM drill matches.

### 3.5 Date parsing

Two distinct parsers because the source formats differ:

- **Review dates** (`progress_review`, `MCR`) are free text like
  `"29-04-2026"`, `"29/04/2026"`, sometimes with extra words. Parser:
  **find the first `dd-mm-yyyy` or `dd/mm/yyyy` token** via regex
  `(\d{2})[-/](\d{2})[-/](\d{4})`, interpret as **day, month, year**. If no
  token, or it isn't a valid calendar date → the slot is **skipped**.
- **Submission dates** (`Require Marking."LastSubDate"`) are ISO-ish, leading
  `yyyy-mm-dd` token via regex `^(\d{4})-(\d{2})-(\d{2})`. Invalid → `None`.

### 3.6 Status classification (PR & MCM) <a name="status-classification"></a>

Raw review status text is collapsed to exactly one category. Algorithm
(`classify_status`): lowercase, collapse whitespace; let `compact` = text with
all spaces removed; then **in order**:

| Test (first match wins) | Category |
|--------------------------|----------|
| text is empty | `In Progress` |
| contains `completed` | `Completed` |
| contains `awaiting signature` | `In Progress` |
| `notscheduled` in compact, **or** (`not` in text **and** `scheduled` in text) | `Not Scheduled` |
| contains `scheduled` | `Scheduled` |
| anything else | `In Progress` |

**Only `Completed` counts as done.** `Scheduled`, `Not Scheduled`, and
`In Progress` are all "outstanding".

### 3.7 Personal Support Plan exclusion

A review slot whose **planned-date cell** contains the substring
`"personal support plan"` (case-insensitive) is **excluded from all PR/MCM
counts**. These are not coaching reviews.

### 3.8 Time windows

#### Rolling periods (inclusive, anchored at today, looking back)

| Key | Length | Range |
|-----|--------|-------|
| `4w` | 28 days | `[today − 27, today]` |
| `8w` | 56 days | `[today − 55, today]` |
| `12w` | 84 days | `[today − 83, today]` |

A slot counts toward a window iff its **planned date** is within the range
(inclusive both ends).

#### Weekly buckets (the per-week "completed" trend, PR only)

Four 7-day windows ending 0 / 7 / 14 / 21 days back:

| Key | Window (inclusive) |
|-----|--------------------|
| `w1` | `[today − 6, today]` |
| `w2` | `[today − 13, today − 7]` |
| `w3` | `[today − 20, today − 14]` |
| `w4` | `[today − 27, today − 21]` |

---

## 4. Source tables — columns used

Only the columns the metrics read are listed. Quoted names preserve exact casing
and spaces (Postgres identifiers are case/space sensitive here).

### `aptem_auto_extracting` (default DB) — learners, OTJH, hours
`FullName`, `Email`, `OwnerName`, `case_owner_id`, `OwnerPhone`,
`Program-Status`, `Program Name`, `OTJHoursStatus`,
`Submitted`, `Completed`, `Planned`, `Minimum`,
`Assignment Evidence`, `LMS Evidence`, `ExtraAct-Evidence`.

### `Require Marking` (default DB) — evidence & marking
`FullName`, `Email`, `CaseOwner`, `CaseOwner ID`, `Phone`, `Status`,
`CountEvidencePending`, `Evidence Accepted`, `Evidence Reffered` *(sic — misspelled in DB)*,
`Referred Closure`, `Total Evidence`, `LastSubDate`,
and the daily evidence columns: `Today`, `Yesterday`, `-2`, `-3`, `-4`, `-5`, `-6`, `-7`.

### `progress_review` (default DB) — PR
`FullName`, `Email`, `CaseOwner`, `case_owner_id`, `Status`,
and **16 slot pairs**: `Review Planned Date1..16` + `Review Status1..16`.

### `MCR` (default DB) — MCM
`FullName`, `Email`, `CaseOwner`, `Status`,
and **22 slot pairs**: `MCM1..22` + `Status1..22`. **No `case_owner_id`.**

### `kbc_attendance` (KBC DB) — attendance
`ID` (student id), `date` (session date), `Attendance` (1 = present, 0 = absent;
other values are anomalies and ignored), `module`.

### `kbc_users_data` (KBC DB) — student roster
`ID`, `FullName`, `Email`, `OwnerName` (the coach), `Program-Status`.

---

## 5. PR — Progress Review

**Source:** `progress_review` (default DB). **Slots:** 16. **Date prefix:**
`Review Planned Date`. **Status prefix:** `Review Status`.

### 5.1 What a "slot" is

Each learner row holds up to 16 planned reviews. Slot *i* = the pair
(`Review Planned Date{i}`, `Review Status{i}`). A planned review with a real date
and a status.

### 5.2 Per-slot qualification (a slot is counted only if ALL pass)

1. Row passes the [row-level filters](#33-row-level-filters-a-learner-row-is-dropped-entirely-unless-all-pass) (active, not Alfanar, owner is a real coach).
2. The planned-date cell is non-empty.
3. It is **not** a Personal Support Plan.
4. The planned date **parses** to a real date.

### 5.3 Counting (per coach)

For each qualifying slot, classify its status, then:

- For each rolling period (`4w`, `8w`, `12w`): if the planned date is in the
  window → `period.required += 1`; if the status is `Completed` →
  `period.completed += 1`.
- If `Completed`: for each weekly bucket (`w1..w4`) whose window contains the
  planned date → `weeks[wK] += 1`.

So **`required` includes the completed ones** — it is "everything that was due in
the window". **`outstanding = required − completed`.**

### 5.4 PR outputs (per coach)

| Output | Definition |
|--------|------------|
| `total_pr_required_for_last_4_weeks` | slots due in 4w |
| `pr_completed_for_last_4_weeks` | completed slots due in 4w |
| `total_pr_required_for_last_8_weeks` | slots due in 8w |
| `pr_completed_for_last_8_weeks` | completed slots due in 8w |
| `pr_required_12_weeks` / `overall_pr_required` | slots due in 12w |
| `pr_completed_12_weeks` / `overall_pr_completed` | completed slots due in 12w |
| `pr_completion_rate_12_weeks` / `overall_pr_completion_rate` | completion rate over 12w (see below) |
| `pr_week_1..4_completed` | completed counts in weekly buckets w1..w4 |

**Completion rate** = `round((completed / required) * 1000) / 10` → a percentage
to **one decimal place**; `0` when `required == 0`.
Example: 27 completed / 37 required → `73.0`.

**"Behind" (computed on the frontend)** = `max(required − completed, 0)`.
Behind-rate = `round((behind / required) * 1000) / 10`, `0` when required is 0.

> The "overall" PR fields are **aliases of the 12-week numbers** kept for
> backward compatibility with the legacy `coaches_lateness` table shape.

---

## 6. MCM — Monthly Coaching Meeting (MCR table)

**Source:** `MCR` (default DB). **Slots:** 22. **Date prefix:** `MCM`.
**Status prefix:** `Status`.

MCM uses the **exact same engine** as PR (`_aggregate_reviews`), just different
table/prefixes/slot count. All the qualification, classification, PSP exclusion,
window, and rate rules from [§5](#5--pr--progress-review) apply unchanged.

### Differences from PR

- **22 slots**, columns `MCM1..22` and `Status1..22`.
- **No `case_owner_id`** column → owner matching for MCM is **name-only**.
- The dashboard surfaces MCM at **4w / 8w / 12w** (PR also exposes weekly buckets;
  MCM does not).

### MCM outputs (per coach)

| Output | Definition |
|--------|------------|
| `mcm_required_4_weeks`, `mcm_completed_4_weeks`, `mcm_completion_rate_4_weeks` | 4-week required / completed / rate |
| `mcm_required_8_weeks`, `mcm_completed_8_weeks`, `mcm_completion_rate_8_weeks` | 8-week |
| `mcm_required_12_weeks`, `mcm_completed_12_weeks`, `mcm_completion_rate_12_weeks` | 12-week |
| `required_mcm` / `completed_mcm` | aliases of the **4-week** numbers (legacy) |

Behind counts/rates for MCM are computed on the frontend exactly like PR.

---

## 7. OTJH — On-the-Job Hours risk

**Source:** `aptem_auto_extracting` (default DB), column `OTJHoursStatus`.

> **Key fact:** the OTJH *risk band* is **already classified upstream** (in
> Aptem / the n8n pipeline) and stored as a string in `OTJHoursStatus`. The
> dashboard does **not** recompute the percentage — it only **buckets the
> string** into three tiers and counts learners per tier per coach.

### 7.1 Band classification

Normalise: `lower(OTJHoursStatus)`, replace `-` with space, strip. Then:

| Normalised value | Tier |
|------------------|------|
| `ontrack` or `on track` | **On Track** |
| `need attention` | **Need Attention** |
| `at risk` or `atrisk` | **At Risk** |
| anything else | (uncounted) |

### 7.2 Per-coach counts (active, non-Alfanar, real-coach learners only)

- `otjh_ontrack_0_field` = # On Track learners
- `otjh_need_attention_20_40_field` = # Need Attention learners
- `otjh_at_risk_40_field` = # At Risk learners

### 7.3 What the tiers *mean* (the upstream criteria the bands encode)

The frontend documents the intended thresholds (the deficit between expected and
delivered OTJ hours):

| Tier | Label shown | Meaning |
|------|-------------|---------|
| On Track | `OTJH < 10%` | Learner progressing at expected pace. |
| Need Attention | `OTJH 11–25%` | Requires a coaching check-in this week. |
| At Risk | `OTJH > 25%` | Immediate intervention recommended. |

> The numeric inputs that *produce* the band live in `aptem_auto_extracting` as
> `Submitted`, `Completed`, `Planned`, `Minimum` hours. The dashboard carries
> those per-learner (in the drill table) but **does not** itself derive the band
> from them — it trusts `OTJHoursStatus`. **If you rebuild OTJH from scratch**,
> the band is the % shortfall of on-the-job hours against the expected/planned
> hours at this point in the programme; reproduce the upstream rule, or keep
> consuming the pre-classified `OTJHoursStatus`.

### 7.4 Company-level distribution (KPI panel)

Sum each tier across all coaches; `pct = round(tier / total * 100)` where
`total = onTrack + needAttention + atRisk`.

---

## 8. Marking & Evidence

**Primary source:** `Require Marking` (default DB). A secondary evidence total can
fall back to `aptem_auto_extracting`'s evidence columns.

### 8.1 Per-coach aggregation (active, non-Alfanar, real-coach rows only)

Summed over the coach's learner rows:

| Output | Source column | Notes |
|--------|---------------|-------|
| `pending` | `CountEvidencePending` | evidence awaiting marking |
| `evidence_accepted` | `Evidence Accepted` | |
| `evidence_referred` | `Evidence Reffered` *(DB misspelling)* | |
| `referred_closure` | `Referred Closure` | |
| `total_evidence` | `Total Evidence` | falls back to aptem `Assignment Evidence + LMS Evidence + ExtraAct-Evidence` if marking total absent |
| daily buckets | `Today`,`Yesterday`,`-2`..`-7` | summed per coach |
| `evidence_week_total` | — | sum of the 8 daily buckets |

### 8.2 Recent submitters & last submission

For each row, parse `LastSubDate` (ISO). Then:
- **Recent submitter** if `0 ≤ (today − LastSubDate) ≤ 29` days → increments the
  coach's `recentSubmitters`.
- Track the **oldest** `LastSubDate` across the coach's learners → `minDate`.
  - `lastsubdate` (coach field) = `minDate` ISO string (oldest activity).
  - `elapseddays` = `(today − minDate).days` (how stale the *least* recent
    submitter is), `0` if none.

> `recentSubmitters` prefers the marking source (LastSubDate within 30d); if the
> coach has no marking rows, it falls back to the aptem "has submitted any hours"
> proxy.

### 8.3 Referred-closure rate (frontend)

`referredClosurePct = round(referredClosure / evidenceReferred * 10000) / 100`
(percentage, 2 dp), `0` when `evidenceReferred == 0`.

### 8.4 Evidence acceptance/referral mix (KPI panel, frontend)

`acceptedPct = round(totalAccepted / totalEvidence * 100)`;
`referredPct = round(totalReferred / totalEvidence * 100)`.

### 8.5 "Marking Progress Weekly" — known gap

The legacy `coaches_lateness` table had a `Marking Progress Weekly` (week-over-week
change in pending). The **live** computation has no prior-week pending snapshot,
so the frontend sets `markingProgressWeekly = 0` and `lastWeekPending = pending`
(0 % week-over-week). **To rebuild this properly you must persist a weekly
snapshot of `pending` per coach** and diff against it.

---

## 9. Attendance / Absence

**Source:** `kbc_attendance` ⋈ `kbc_users_data` (KBC DB). One attendance row =
one student in one session. `Attendance` ∈ {1 = present, 0 = absent}; any other
value is ignored ("anomalous").

### 9.1 The week scheme — **day-of-year, NOT ISO week**

This is deliberately *not* ISO weeks, so weeks are stable year over year:

```
week_number(d) = floor((day_of_year(d) − 1) / 7) + 1
   week 1 = Jan 1–7, week 2 = Jan 8–14, …, week N = days [(N−1)*7+1 .. N*7]
```

`week_bounds(year, week)`: `start = Jan 1 + (week−1)*7 days`, `end = start + 6
days`, but the **final partial week is clamped to Dec 31** (so the last week of a
year may be shorter than 7 days). Walking backward/forward across a year boundary
uses the previous/next year's Dec-31 week index as the wrap point.

### 9.2 Per (coach, week) aggregation

Join attendance to the roster on `kbc_attendance."ID" = kbc_users_data."ID"`,
restricted to the week's `[start, end]` date range and **active learners**
(`lower(Program-Status) = 'active'`) with a non-blank `OwnerName`. Group by owner:

- `counted` = rows where `Attendance IN (0,1)`
- `absent` = rows where `Attendance = 0`
- `present` = rows where `Attendance = 1`

### 9.3 The two ratios

**Absence ratio** (the headline) =
`round(absent / counted * 100, 2)`, `0.0` when `counted == 0`.
This is the share of *that coach's counted session-rows* that were absences.

**vs Company** =
`round(coach_absent / company_absent * 100, 2)`, `0.0` when company has no
absences. It is the coach's **share of all company absences that week**, so the
company row is by definition `100%`. (It is *not* a ratio-of-ratios.)

> Note both ratios are **session-row weighted**, not per-student — a student with
> 5 sessions contributes 5 rows. A student counts only if they have at least one
> counted session that week.

### 9.4 Company row

`company_absent / company_present / company_total` = sums across all coaches that
week; `company_ratio = round(company_absent / company_total * 100, 2)`.

### 9.5 Window average

For a multi-week table window, a coach's `windowAvgRatio` =
`round(mean(per-week absence ratios over weeks present in the window), 2)`.
(Weeks where the coach has no rows contribute `0.0` cells in the table but are
excluded from the average — the average is over weeks where the coach actually
had ratios.)

### 9.6 `students_count`

Distinct active learners per coach: `COUNT(DISTINCT u."ID")` where
`Program-Status = 'active'` and `OwnerName` non-blank.

### 9.7 Paging the week window

- default: most recent `count` weeks (default 10), newest first.
- `before = "year-week"`: the `count` weeks strictly **older** than that key.
- `after = "year-week"`: the window of `count` weeks one step **newer**, never
  past the current week.
- `hasNewer` = newest shown week < current week; `hasOlder` = oldest shown week >
  earliest week that has any attendance data.

### 9.8 Per-student attendance drill (one coach, one week)

Left-join the roster to attendance for the week so students with **no session
row** still appear. Per student count `attended` / `absent` and list each session
(`date`, `status`, `module`). Overall student status:

| Condition | Status |
|-----------|--------|
| `attended + absent == 0` | `no-session` |
| `absent == 0` | `attended` |
| `attended == 0` | `absent` |
| otherwise | `partial` |

Sort: absent → partial → attended → no-session, then name.

### 9.9 The `coach_summary` overwrite job

`recompute_coach_summary` (management command) computes the latest **10**
year-weeks live and **overwrites** the `coach_summary` table (DELETE + INSERT in
one transaction). Column layout: `week_1_*` = **most recent** week, … `week_10_*`
= oldest; per week it stores `week_{i}_absence_ratio` and `week{i}/ company` (the
vs-company figure). It also writes `students_count`, `last_10_weeks_absence_ratio`
(the window average), and an `OVERALL COMPANY` row (vs-company = 100 for every
week). Run: `python manage.py recompute_coach_summary [--weeks N]`.

> The dashboard's Coach Summary page can read either the live endpoint
> (`attendance-weeks`) or the materialised `coach_summary` table; the job exists
> to keep the table in sync for consumers that read it directly.

---

## 10. Learner Engagement & other derived coach fields

- **`total_learners`** = count of the coach's active, non-Alfanar learners in
  `aptem_auto_extracting`.
- **`recent_submitters`** = see [§8.2](#82-recent-submitters--last-submission).
- **`learner_engagement`** (%) = `round(recent_submitters / total_learners * 100)`,
  `0` when `total_learners == 0`.

---

## 11. The full per-coach record (output contract)

`compute_coaches_lateness()` returns one object per coach (the union of owners
seen across aptem / marking / PR / MCM, sorted by name). Fields:

```jsonc
{
  "id": 1,                          // 1-based index in the sorted list
  "caseowner": "Jane Smith",        // coach display name
  "case_owner_id": 123,             // from aptem or marking, may be null
  "phone": "…",
  "lastsubdate": "2026-03-01",      // OLDEST LastSubDate among learners ("" if none)
  "elapseddays": 113,               // today − lastsubdate

  // Roster & engagement
  "total_learners": 42,
  "recent_submitters": 30,
  "learner_engagement": 71,         // %

  // OTJH tier counts
  "otjh_ontrack_0_field": 30,
  "otjh_need_attention_20_40_field": 8,
  "otjh_at_risk_40_field": 4,

  // Marking / evidence
  "pending": 12,
  "evidence_accepted": 120,
  "evidence_referred": 18,
  "referred_closure": 5,
  "total_evidence": 143,
  "today": 2, "yesterday": 3,
  "ev_minus_2": 1, "ev_minus_3": 0, "ev_minus_4": 4,
  "ev_minus_5": 2, "ev_minus_6": 1, "ev_minus_7": 0,
  "evidence_week_total": 13,

  // PR (progress_review)
  "total_pr_required_for_last_4_weeks": 9,
  "pr_completed_for_last_4_weeks": 7,
  "total_pr_required_for_last_8_weeks": 20,
  "pr_completed_for_last_8_weeks": 15,
  "pr_required_12_weeks": 37,
  "pr_completed_12_weeks": 27,
  "pr_completion_rate_12_weeks": 73.0,
  "overall_pr_required": 37,         // alias of 12w
  "overall_pr_completed": 27,        // alias of 12w
  "overall_pr_completion_rate": 73.0,// alias of 12w
  "pr_week_1_completed": 3, "pr_week_2_completed": 2,
  "pr_week_3_completed": 1, "pr_week_4_completed": 1,

  // MCM (MCR)
  "mcm_required_4_weeks": 5,  "mcm_completed_4_weeks": 4,  "mcm_completion_rate_4_weeks": 80.0,
  "mcm_required_8_weeks": 11, "mcm_completed_8_weeks": 9,  "mcm_completion_rate_8_weeks": 81.8,
  "mcm_required_12_weeks": 18,"mcm_completed_12_weeks": 14,"mcm_completion_rate_12_weeks": 77.8,
  "required_mcm": 5, "completed_mcm": 4    // aliases of 4w
}
```

Fields the **frontend derives** (not in the API payload): `prBehind*`,
`prBehindRate*`, `mcmBehind*`, `mcmBehindRate*`, `referredClosurePct`,
`learnerEngagement` (recomputed if absent). See [§13](#13-display-thresholds--colour-bands).

---

## 12. Drill-downs (learner-level breakdowns)

`compute_coach_drill(coach_name, case_owner_id)` returns, for one coach:

### 12.1 Sections (lists of learners)

| Section key | Label | Definition |
|-------------|-------|------------|
| `learners` | Active Learners | all active learners of the coach |
| `engaged` | Engaged (has submitted) | `Submitted > 0` |
| `otjh_at_risk` / `otjh_need_attention` / `otjh_on_track` | OTJH tiers | per [§7.1](#71-band-classification) |
| `pending` | Evidence Pending | `CountEvidencePending > 0` (detail `"N pending"`) |
| `referred_closure` | Referred Closure | `Referred Closure > 0` (detail `"N closure"`) |
| `recent_submitters` | Recent Submitters (30d) | `LastSubDate` within 0–29 days |
| `pr_completed` | PR Completed (last 4 weeks) | completed PR slots in 4w |
| `pr_completed_12w` | PR Completed (last 12 weeks) | completed PR slots in 12w |
| `pr_required` | PR **Outstanding** (last 12 weeks) | PR slots in 12w **not** completed (detail `"<date> · <status>"`) |
| `mcm_completed` | MCM Completed (last 4 weeks) | completed MCM slots in 4w |
| `mcm_completed_12w` | MCM Completed (last 12 weeks) | completed MCM slots in 12w |
| `mcm_required` | MCM **Outstanding** (last 12 weeks) | MCM slots in 12w not completed |

> **Invariant:** `outstanding_12w + completed_12w = total planned in 12w =` the
> KPI "required" count. The `*_required` section keys are kept for frontend
> compatibility even though they now hold **Outstanding** (non-completed) items —
> a completed review is deliberately *not* shown as "required".

### 12.2 Per-learner table

One row per active learner, joined across all four default-DB tables by **email**
(falling back to `name:<lowercased name>` when email is blank). Columns:
`name, email, programme, otjh_status, submitted, completed, planned, minimum,
pending, referred_closure, total_evidence, last_sub, pr_status, pr_date,
mcm_status, mcm_date`. `pr_status`/`pr_date` (and MCM) come from
**`_latest_review_status`** — the status+date of the learner's **most recent
planned** PR/MCM slot.

### 12.3 Per-review rows (filterable Metric Breakdown)

`review_rows` = **one row per individual PR/MCM slot** for the coach's active
learners (`{name, email, programme, metric: "PR"|"MCM", status, date}`). PSP and
unparseable-date slots skipped. This lets the UI filter by status (Completed /
Scheduled / Not Scheduled / In Progress) and by period (4w/8w/12w/all) per review,
not just per learner.

---

## 13. Display thresholds & colour bands

These are **presentation rules** in the frontend (not part of the core
computation), included so a new UI can match behaviour.

### Absence ratio badge (Coach Summary)
| Ratio | Band |
|-------|------|
| `0` or `< 15` | success (green) |
| `< 25` | warning (amber) |
| `≥ 25` | danger (red) |

### vs-Company badge
`100` → muted "—"; `≤ 5` green; `≤ 15` amber; `> 15` red.

### Coach card stat tones (`tone(value, good, warn, invert)`)
- **non-inverted** (higher = better): `< warn` red, `< good` amber, else green.
- **inverted** (higher = worse): `≥ warn` red, `≥ good` amber, else green.

| Card stat | good | warn | invert |
|-----------|------|------|--------|
| Engagement % | 85 | 70 | no |
| PR Rate % | 90 | 70 | no |
| OTJH At Risk (count) | 4 | 7 | yes |
| Pending (count) | 12 | 20 | yes |

### OTJH tier panel
On Track green / Need Attention amber / At Risk red; labels `< 10%`, `11–25%`,
`> 25%`.

### Status pill colours (Metric Breakdown)
`Completed`/`On Track` green `#16A34A`; `Scheduled` cyan `#0891B2`;
`In Progress` indigo `#4F46E5`; `Not Scheduled`/`At Risk` red `#DC2626`;
`Need Attention` amber `#D97706`.

### Metric-breakdown window tag (`windowTag`, relative to today)
`< 0` → "Upcoming"; `≤ 27` → "4w"; `≤ 55` → "8w"; `≤ 83` → "12w"; else "Older".

---

## 14. API endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/coaches-lateness/` | `compute_coaches_lateness()` — all coach records (PR/MCM/OTJH/Marking/engagement). |
| `GET /api/coach-drill/?coach=<name>&case_owner_id=<id>` | `compute_coach_drill()` — sections + per-learner table + per-review rows. |
| `GET /api/attendance-weeks/?count=&before=&after=` | Weekly absence table (coaches + company + paging flags). |
| `GET /api/attendance-drill/?coach=&year=&week=` | Per-student attendance for one coach/week. |
| `GET /api/coach-summary/` | The materialised `coach_summary` table (10-week absence). |
| `GET /api/kpis/` | Raw `Test KPIs` table passthrough (legacy). |

---

## 15. Reference pseudocode

### 15.1 Review aggregation (PR and MCM share this)

```python
def aggregate_reviews(rows, date_prefix, status_prefix, count, today):
    periods = {"4w": 28, "8w": 56, "12w": 84}
    ranges  = {k: (today - days_delta(n-1), today) for k, n in periods.items()}
    weeks   = {f"w{i+1}": window_ending(today, offset=7*i) for i in range(4)}  # w1..w4
    agg = {}  # owner -> {"periods": {...}, "weeks": {...}}

    for r in rows:
        if lower(r.status) != "active":            continue
        if email_ends_with(r.email, "@alfanar.com"): continue
        owner = clean(r.owner)
        if not owner or owner.lower() in EXCLUDE:   continue
        b = agg.setdefault(owner, fresh_bucket())

        for i in 1..count:
            planned_raw = r[f"{date_prefix}{i}"]
            status_raw  = r[f"{status_prefix}{i}"]
            if not clean(planned_raw):              continue
            if "personal support plan" in lower(planned_raw): continue
            d = parse_ddmmyyyy(planned_raw)
            if d is None:                           continue

            done = classify_status(status_raw) == "Completed"
            for k, rng in ranges.items():
                if in_range(d, rng):
                    b["periods"][k]["required"] += 1
                    if done: b["periods"][k]["completed"] += 1
            if done:
                for k, rng in weeks.items():
                    if in_range(d, rng): b["weeks"][k] += 1
    return agg

def rate(part):
    return round(part["completed"] / part["required"] * 1000) / 10 if part["required"] else 0
```

### 15.2 Per (coach, week) absence (SQL shape)

```sql
SELECT u."OwnerName" AS owner,
       COUNT(*) FILTER (WHERE a."Attendance" IN (1,0)) AS counted,
       COUNT(*) FILTER (WHERE a."Attendance" = 0)      AS absent,
       COUNT(*) FILTER (WHERE a."Attendance" = 1)      AS present
FROM kbc_attendance a
JOIN kbc_users_data u ON u."ID" = a."ID"
WHERE a.date BETWEEN :start AND :end
  AND lower(u."Program-Status") = 'active'
  AND u."OwnerName" IS NOT NULL AND u."OwnerName" <> ''
GROUP BY u."OwnerName";
-- absence_ratio = round(absent/counted*100, 2)
-- vs_company    = round(coach_absent/company_absent*100, 2)
```

---

## 16. Gotchas & invariants

1. **`required` includes completed.** "Required" = everything due in the window;
   `outstanding = required − completed`. The drill's "Outstanding" lists exclude
   completed reviews, so they look smaller than the KPI "required" — by design.
2. **Only `Completed` is done.** `Scheduled`, `Not Scheduled`, `In Progress`,
   empty, and "awaiting signature" are all outstanding.
3. **MCR has no `case_owner_id`** → MCM owner matching is **name-only**; an exact
   `CaseOwner` string is required, or MCM rows won't attribute to the coach.
4. **Personal Support Plans are excluded** from every PR/MCM count.
5. **Dates are free text.** First `dd-mm-yyyy`/`dd/mm/yyyy` token wins; rows with
   unparseable dates are silently skipped (PR/MCM). Submission dates are
   `yyyy-mm-dd`.
6. **Everything (except `coach_summary`) is live.** Numbers move as `today`
   advances and as source tables update; there is no caching/write-back for
   PR/MCM/OTJH/Marking.
7. **OTJH band is pre-classified upstream** in `OTJHoursStatus`; the dashboard
   only buckets the string. The numeric inputs (`Submitted/Completed/Planned/
   Minimum`) exist in the source but the dashboard does not derive the band.
8. **`Evidence Reffered` is misspelled in the DB** — keep the misspelling in
   queries.
9. **Marking Progress Weekly is not truly computed** (no prior snapshot) — it is
   forced to 0; persist a weekly `pending` snapshot to implement it.
10. **Attendance weeks are day-of-year, not ISO.** Week 1 = Jan 1–7 always; the
    last week of the year may be short (clamped to Dec 31).
11. **Attendance ratios are session-row weighted**, not per-student.
12. **EXCLUDE applies to PR/MCM/OTJH/Marking, not to attendance.**
13. **The "2026 attendance" caveat:** because weeks are day-of-year and anchored
    to the server's `today`, attendance windows depend on the server clock — a
    wrong server year shifts every week bucket. Validate `today` in any rebuild.

---

*Generated from the live computation modules (`api/lateness_compute.py`,
`api/attendance_compute.py`, `recompute_coach_summary.py`) and the frontend
service/components. If the code changes, re-derive — this document mirrors the
implementation, it does not govern it.*
