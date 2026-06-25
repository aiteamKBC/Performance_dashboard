# PR & MCM Data — Sources and Computation

This document describes how the **Progress Review (PR)** and **Monthly Coaching
Meeting (MCM)** metrics on the dashboard are sourced and computed. Both are
derived **live** (computed on each request) from raw source tables — there is no
pre-aggregated PR/MCM table that the dashboard reads.

All logic lives in [`api/lateness_compute.py`](../api/lateness_compute.py).

---

## 1. Source tables

Both PR and MCM come from the **default** database (`DATABASE_URL` → `neondb`),
not the KBC attendance database. They are "wide" review tables: one row per
learner, with many repeated columns holding successive review slots.

| Metric | Table | Date columns | Status columns | Slots (`count`) |
|--------|-------|--------------|----------------|-----------------|
| **PR** | `progress_review` | `Review Planned Date1` … `Review Planned Date16` | `Review Status1` … `Review Status16` | 16 |
| **MCM** | `MCR` | `MCM1` … `MCM22` | `Status1` … `Status22` | 22 |

Shared identity / filter columns on both tables: `FullName`, `Email`,
`CaseOwner`, `Status` (learner program status). `progress_review` also has
`case_owner_id`; **`MCR` does not** — MCM owner-matching falls back to name only.

Each "slot" `i` is a planned review: `<date_prefix>i` holds the planned date
(as a `dd-mm-yyyy` / `dd/mm/yyyy` string, sometimes with extra text) and
`<status_prefix>i` holds its status text.

---

## 2. Row-level filters (applied to every learner row)

A learner row is skipped entirely unless all of these pass:

- `Status` (program status) is `active` (case-insensitive).
- `Email` does **not** end in `@alfanar.com` (`_is_alfanar`).
- `CaseOwner` is not in the `EXCLUDE` set (non-coaching owners — enrolment team,
  admins, etc.) and is not blank (`_is_excluded_owner`).

For drill-downs (single coach), the owner is additionally matched via
`_owner_matches`: match on `case_owner_id` when both sides have one, otherwise
case-insensitive name match.

---

## 3. Slot-level filters (applied to each review slot `i`)

Within a kept row, each slot is only counted if:

- The planned-date cell is non-empty.
- It is **not** a "personal support plan" (`_is_personal_support_plan` — these
  are excluded from PR/MCM counts).
- The planned date parses to a real date (`_parse_review_date`, first
  `dd-mm-yyyy` token found in the string).

---

## 4. Status classification

Raw status text is collapsed to one category by `_classify_status`:

| Category | Matched when the (lowercased) status text… |
|----------|---------------------------------------------|
| `Completed` | contains `completed` |
| `Awaiting Signature` | contains `awaiting signature` |
| `In Progress` | is empty, or matches nothing else below |
| `Not Scheduled` | contains `notscheduled` / both `not` and `scheduled` |
| `Scheduled` | contains `scheduled` (and not "not scheduled") |

Only `Completed` counts as done. Everything else is "outstanding".

---

## 5. Time windows

`today` = server date (`date.today()`). Windows are **inclusive** and anchored
at today, looking backward:

**Rolling periods** (`PERIODS`, used for required/completed counts):

| Key | Length | Range |
|-----|--------|-------|
| `4w` | 28 days | `[today-27, today]` |
| `8w` | 56 days | `[today-55, today]` |
| `12w` | 84 days | `[today-83, today]` |

**Weekly buckets** (`WEEK_BUCKETS`, used for the per-week "completed" trend):
four 7-day windows ending 0, 7, 14, 21 days back (`w1`…`w4`).

A slot counts toward a window only if its **planned date** falls inside that
window's range (`_in_range`).

---

## 6. Aggregate counts (the dashboard table & KPI cards)

`_aggregate_reviews(table, date_prefix, status_prefix, count)` produces, per
coach (owner):

- `periods[key].required` — number of qualifying slots whose planned date is in
  the window. **Includes completed ones** — it's "everything that was due".
- `periods[key].completed` — the subset of those that are `Completed`.
- `weeks[wK]` — count of `Completed` slots planned in each weekly bucket.

So on the dashboard, a card like **"PR 12-Week: 27 / 37 completed"** means: 37
reviews were planned/due in the last 12 weeks, 27 of them are completed,
**10 are still outstanding**.

Completion rate = `completed / required` (0 when required is 0). These feed the
coach rows in `compute_coaches_lateness()` and the per-coach detail KPIs.

> Note: the KPI uses 4w / 8w / 12w PR windows and 4w / 8w / 12w MCM windows.
> Backward-compat keys (`overall_pr_*`) alias the 12-week PR numbers.

---

## 7. Drill-down lists (the "Learner Breakdown" drawer)

`_review_drill(...)` returns three learner lists per review type, used to build
the drawer sections. **Key behaviour: a completed review is NOT shown as
required.**

| Returned list | Meaning |
|---------------|---------|
| `completed_4w` | `Completed` slots planned in the **4-week** window |
| `completed_12w` | `Completed` slots planned in the **12-week** window |
| `outstanding_12w` | slots planned in the **12-week** window that are **not** `Completed` |

By construction: **`outstanding_12w` + `completed_12w` = total planned in 12w
= the KPI "required" count.** Each outstanding entry's detail is
`"<planned-date> · <status>"` (e.g. `2026-04-29 · In Progress`) so you can see
why it's still open.

### Drawer sections produced (in `compute_coach_drill`)

| Section key | Label | Source |
|-------------|-------|--------|
| `pr_completed` | PR Completed (last 4 weeks) | `pr_completed_4w` |
| `pr_completed_12w` | PR Completed (last 12 weeks) | `pr_completed_12w` |
| `pr_required` | PR Outstanding (last 12 weeks) | `pr_outstanding_12w` |
| `mcm_completed` | MCM Completed (last 4 weeks) | `mcm_completed_4w` |
| `mcm_completed_12w` | MCM Completed (last 12 weeks) | `mcm_completed_12w` |
| `mcm_required` | MCM Outstanding (last 12 weeks) | `mcm_outstanding_12w` |

The section keys `pr_required` / `mcm_required` are kept for frontend
compatibility even though the label now reads "Outstanding".

---

## 8. The per-learner table

`_compute_coach_learner_table()` builds one row per active learner of a coach,
joining across all four source tables keyed by email (falling back to name).
For PR and MCM it uses `_latest_review_status()` — the status + date of the
**most recent planned** review slot for that learner — shown as the
`pr_status` / `pr_date` / `mcm_status` / `mcm_date` columns in the drawer's
learner table.

---

## 9. Endpoints

| Endpoint | View | Returns |
|----------|------|---------|
| `GET /api/coaches-lateness/` | `CoachesLatenessViewSet` | `compute_coaches_lateness()` — all coach rows incl. PR/MCM aggregates |
| `GET /api/coach-drill/?coach=&case_owner_id=` | `CoachDrillView` | `compute_coach_drill()` — the drill sections above + per-learner table |

---

## 10. Gotchas / things to remember

- **Why is "Required" sometimes lower than the KPI's required number?** It isn't
  a bug — the drawer's "Outstanding" list deliberately excludes completed
  reviews; add the matching "Completed (12 weeks)" section back to reconcile.
- **MCR has no `case_owner_id`** — MCM owner matching is name-only, so an exact
  `CaseOwner` name is required for MCM drill matches.
- **Personal Support Plans are excluded** from all PR/MCM counts.
- **Dates are parsed from free text** — the first `dd-mm-yyyy` token wins; rows
  with unparseable dates are silently skipped.
- All numbers are **live** — they shift as `today` moves and as the source
  tables update. There is no caching or write-back for PR/MCM.
