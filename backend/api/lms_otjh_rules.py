"""Read-only LMS OTJH projection rules, vendored from LMS_v2 (2026-11-08).

These are the dependency-free functions used by canonical_learning.otjh_summary_bulk.
Keep behaviour in step with that source; see test_lms_otjh.py and
scripts/verify_otjh_parity.py for offline regressions and live comparison.
No Django startup, database writes, authored-hour substitution or external checkout
is required at runtime.
"""
import json
import math
import re
from copy import deepcopy
from datetime import date, datetime
from math import isfinite
from zoneinfo import ZoneInfo

GRADED_PROGRESS_KINDS = frozenset({'quiz'})


# From learner_api/active_users.py

def _s(value):
    return "" if value is None else str(value).strip()

def _number(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None

def _reported_minutes(value):
    text = _s(value)
    if not text:
        return 0.0
    if ":" in text:
        try:
            minutes, seconds, *_ = [float(part) for part in text.split(":")]
            return minutes + seconds / 60
        except (TypeError, ValueError):
            return 0.0
    lower_text = text.lower()
    hour_matches = [float(amount) for amount in re.findall(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", lower_text)]
    minute_matches = [float(amount) for amount in re.findall(r"(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b", lower_text)]
    if hour_matches or minute_matches:
        return sum(hour_matches) * 60 + sum(minute_matches)

    match = re.search(r"\d+(?:\.\d+)?", lower_text)
    if not match:
        return 0.0
    value = float(match.group(0))
    # Small bare numbers are learner-entered hours ("2" => 2h). Larger bare
    # values usually come from component duration fields stored as minutes.
    return value if value > 24 else value * 60

def _progress_text(record, *fields):
    for field in fields:
        value = _s(record.get(field))
        if value:
            return value
    return ""

def otjh_progress_dedupe_key(record, index=0):
    if not isinstance(record, dict):
        return f"entry:{index}"

    kind = _s(record.get("kind")).lower()
    quiz_id = _s(record.get("quizId"))
    if quiz_id and kind == "quiz_reading":
        return f"quiz-reading:{quiz_id}:{record.get('attempt') or index}"
    if quiz_id:
        return f"quiz:{quiz_id}"

    component_id = _s(record.get("componentId"))
    if component_id:
        return f"component:{component_id}"

    title = _progress_text(record, "title", "quizName", "componentTitle", "component")
    module = _progress_text(record, "moduleTitle", "module")
    week = _progress_text(record, "weekTitle", "week")
    if title:
        return "|".join(part for part in ("legacy", kind, module, week, title) if part)

    ksbs = ",".join(sorted(_s(code).upper() for code in record.get("ksbs") or [] if _s(code)))
    reported_time = _s(record.get("reportedTime")).lower()
    if kind or reported_time or ksbs:
        return "|".join(part for part in ("legacy", kind, reported_time, ksbs) if part)

    return f"entry:{index}"

def _selected_timer_seconds(record):
    """An explicit Timer choice keeps its saved duration, including resumed time.

    Older saves can retain unrelated reflection text in reported_time. The
    selected duration is claimed_seconds; verified_seconds is separate evidence
    capped to the signed session, which may cover only the resumed portion.
    """
    source = _progress_text(record, "timeTrackingSource", "time_tracking_source").lower()
    if not source.endswith(":timer") or "import" in source:
        return None
    seconds = _number(record.get("claimedSeconds") if record.get("claimedSeconds") is not None
                      else record.get("claimed_seconds"))
    return seconds if seconds is not None and 0 <= seconds < float("inf") else None

def _manual_claimed_seconds(record):
    claimed = _number(
        record.get("claimedSeconds") if record.get("claimedSeconds") is not None
        else record.get("claimed_seconds")
    )
    if claimed is None or claimed < 0:
        return None
    verified = _number(
        record.get("verifiedSeconds") if record.get("verifiedSeconds") is not None
        else record.get("verified_seconds")
    )
    source = _progress_text(record, "timeTrackingSource", "time_tracking_source").lower()
    explicitly_manual = source.endswith(":input") or "manual_input" in source
    inferred_manual = "import" not in source and verified is not None and claimed > verified + 2
    return claimed if explicitly_manual or inferred_manual else None

def _progress_record_minutes(record):
    """Comparable OTJ value for choosing the best attempt of one activity."""
    timer_seconds = _selected_timer_seconds(record)
    if timer_seconds is not None:
        return timer_seconds / 60

    manual_seconds = _manual_claimed_seconds(record)
    if manual_seconds is not None:
        return manual_seconds / 60

    reported_time = _progress_text(record, "reportedTime", "reported_time")
    if reported_time:
        return max(_reported_minutes(reported_time), 0)

    verified_seconds = _number(
        record.get("verifiedSeconds") if record.get("verifiedSeconds") is not None
        else record.get("verified_seconds")
    )
    if verified_seconds is not None:
        return max(verified_seconds, 0) / 60

    expected_hours = _number(record.get("expectedOtjh") or record.get("expected_otjh"))
    return max(expected_hours or 0, 0) * 60

def dedupe_otjh_progress_records(progress):
    if not isinstance(progress, list):
        return []
    positions = {}
    unique = []
    for index, record in enumerate(progress):
        if not isinstance(record, dict):
            continue
        key = otjh_progress_dedupe_key(record, index)
        position = positions.get(key)
        if position is None:
            positions[key] = len(unique)
            unique.append(record)
            continue

        current = unique[position]
        candidate_minutes = _progress_record_minutes(record)
        current_minutes = _progress_record_minutes(current)
        candidate_is_newer = _progress_text(record, "submittedAt", "submitted_at") > _progress_text(
            current, "submittedAt", "submitted_at"
        )
        if candidate_minutes > current_minutes or (
            candidate_minutes == current_minutes and candidate_is_newer
        ):
            unique[position] = record
    return unique

def _component_expected_hours_lookup(components):
    lookup = {}
    if not isinstance(components, list):
        return lookup

    for item in components:
        if not isinstance(item, dict):
            continue
        nested_weeks = item.get("weeks")
        if isinstance(nested_weeks, list):
            for week in nested_weeks:
                for component in (week.get("components") or []) if isinstance(week, dict) else []:
                    component_id = _s(component.get("componentId") or component.get("id"))
                    expected = _number(component.get("expectedOtjh") or component.get("expected_otjh"))
                    if component_id and expected is not None:
                        lookup[component_id] = expected
            continue

        component_id = _s(item.get("componentId") or item.get("id"))
        expected = _number(item.get("expectedOtjh") or item.get("expected_otjh"))
        if component_id and expected is not None:
            lookup[component_id] = expected
    return lookup

def completed_hours_value_from_progress(progress, components=None):
    """Unrounded hours the learner has declared, for exact OTJ roll-ups.

    An explicit Timer choice uses its saved `claimedSeconds`. Otherwise a
    learner-entered Time spent value (`claimedSeconds` with input provenance)
    is authoritative, followed by the reflection's `reportedTime`. The verified
    session timer is used only when neither input was supplied.

    Rows predating time tracking carry no verified time at all; those still
    fall back to the authored hours, because dropping them would silently zero
    historical activity rather than measure it.
    """
    if not isinstance(progress, list):
        return 0.0
    expected_hours_by_component = _component_expected_hours_lookup(components)
    hours = 0.0
    for record in dedupe_otjh_progress_records(progress):
        component_id = _s(record.get("componentId"))
        timer_seconds = _selected_timer_seconds(record)
        if timer_seconds is not None:
            hours += timer_seconds / 3600
            continue
        manual_seconds = _manual_claimed_seconds(record)
        if manual_seconds is not None:
            hours += manual_seconds / 3600
            continue
        reported_time = _progress_text(record, "reportedTime", "reported_time")
        if reported_time:
            hours += _reported_minutes(reported_time) / 60
            continue
        verified_seconds = _number(
            record.get("verifiedSeconds") if record.get("verifiedSeconds") is not None
            else record.get("verified_seconds")
        )
        if verified_seconds is not None:
            hours += max(verified_seconds, 0) / 3600
            continue
        record_expected = _number(record.get("expectedOtjh") or record.get("expected_otjh"))
        if record_expected is not None:
            hours += record_expected
            continue
        expected_hours = expected_hours_by_component.get(component_id)
        if expected_hours is not None:
            hours += expected_hours
    return hours

# From learner_api/progress_rules.py

def _kind(value):
    return str(value or '').strip().lower()

def progress_counts_as_achieved(kind=None, passed=None):
    """Does this progress row contribute to achieved KSB progress?

    ``passed is False`` never counts, whatever the kind. A graded kind must
    have passed outright — a ``NULL`` there is an attempt that was never
    resolved, not a completion.
    """
    if passed is False:
        return False
    if _kind(kind) in GRADED_PROGRESS_KINDS:
        return passed is True
    return True

# From learner_api/retake_timing.py

def metadata(record):
    value = record.get('source_payload') or {}
    value = json.loads(value) if isinstance(value, str) else value
    return value if isinstance(value, dict) else {}

def stamp(value):
    if not value:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    uk = ZoneInfo('Europe/London')
    return (value if value.tzinfo else value.replace(tzinfo=uk)).astimezone(uk)

def native_key(record):
    if record.get('kind') == 'quiz_reading':
        return None
    if record.get('quiz_ref'):
        return (record.get('learner_id'), str(record['quiz_ref']))
    if record.get('component_ref'):
        return (record.get('learner_id'), 'component', str(record['component_ref']))
    return None

def native_choices(baseline, candidates):
    groups = {}
    for record in candidates:
        key = native_key(record)
        if key:
            groups.setdefault(key, []).append(record)
    replacements = {}
    for key, rows in groups.items():
        if any((row.get('component_type') == 'assignment' for row in rows)):
            continue
        if not any((metadata(row).get('retakeTimeChoice') for row in rows)):
            continue
        eligible = [row for row in sorted(rows, key=lambda item: attempt_order(item.get('submitted_at'), item['id'])) if row.get('accepted') is True and row.get('passed') is not False and (row.get('actual_seconds') is not None)]
        explicit = any((metadata(row).get('retakeTimeChoice') in ('keep', 'new', 'correct', 'add', 'retry') for row in eligible))
        if not explicit or not eligible:
            continue
        selected, seconds = selected_attempt([{**row, 'seconds': row['actual_seconds'], 'mode': metadata(row).get('retakeTimeChoice')} for row in eligible], default='retry' if any((metadata(row).get('retakeTimeChoice') in ('correct', 'add', 'retry') for row in eligible)) else 'latest')
        latest = eligible[-1]
        end = stamp(selected.get('declared_completed_at') or selected.get('reporting_ended_at') or selected.get('submitted_at'))
        start = stamp(selected.get('started_at') or selected.get('reporting_started_at'))
        label = selected.get('reporting_timestamp_label') or ''
        if end:
            label = end.strftime('%H:%M:%S')
            if start and start.date() == end.date() and (start.timestamp() < end.timestamp()):
                label = f'{start:%H:%M:%S} - {end:%H:%M:%S}'
            else:
                start = None
        replacements[key] = {**latest, 'actual_seconds': seconds, 'reporting_month': end.strftime('%Y-%m') if end else selected.get('reporting_month'), 'reporting_started_at': start, 'reporting_ended_at': end, 'reporting_timestamp_label': label, 'retake_timing_applied': True, 'completion_reporting_date': end.date().isoformat() if end else None, 'retake_superseded_ids': [str(row['id']) for row in rows if row['id'] != latest['id']]}
    return [row for row in baseline if native_key(row) not in replacements] + list(replacements.values())

def measured_choice(candidates, has_accepted_history=False):
    """Keep the currently selected successful local attempt across later retakes."""
    selected = None
    replace_history = False
    for row in sorted(candidates, key=lambda item: attempt_order(item['timing'].get('submittedAt'), item['id'])):
        mode = row['timing'].get('retakeTimeChoice')
        if mode in ('keep', 'new'):
            if mode == 'new':
                selected, replace_history = (row, True)
            elif selected is None and (not has_accepted_history):
                selected = row
        else:
            selected = row
    return (selected, replace_history)

# From learner_api/current_learning.py

def instant(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value.astimezone(ZoneInfo('Europe/London')) if value else None

def actual_time_seconds(value):
    """Return saved reflection time as seconds without changing its source value.

    Native reflection saves use decimal hours. Older submissions may contain a
    legacy ``MM:SS`` clock, while imported records can contain ``HH:MM:SS``.
    Invalid or empty values remain unavailable.
    """
    if value in (None, ''):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if ':' in text:
            parts = text.split(':')
            if len(parts) == 2:
                minutes, seconds = (int(part) for part in parts)
                if minutes < 0 or not 0 <= seconds < 60:
                    return None
                return minutes * 60 + seconds
            if len(parts) == 3:
                hours_text, minutes_text, seconds_text = parts
                if not hours_text.isdigit() or not minutes_text.isdigit():
                    return None
                hours = int(hours_text)
                minutes = int(minutes_text)
                seconds = float(seconds_text)
                if not 0 <= minutes < 60 or not isfinite(seconds) or (not 0 <= seconds < 60):
                    return None
                return hours * 3600 + minutes * 60 + seconds
            return None
        hours = float(text)
        return hours * 3600 if isfinite(hours) and hours >= 0 else None
    except (TypeError, ValueError):
        return None

def is_unsynchronised_direct_save(record):
    """A current LMS save that no sync or reconciliation has given seconds yet.

    Imported/normalised seconds (including zero) and reporting segments remain
    authoritative, so those rows are never unsynchronised.
    """
    return record.get('component_link_source') in {'direct', 'quiz_ref'} and (not record.get('source_system')) and (record.get('actual_seconds') is None) and (not record.get('segments'))

def project_current(records, markings):
    """Project unsynchronised direct saves using the existing time/pass rules.

    Planned duration is never substituted for recorded time.
    """
    result, native, candidates = ([], {}, [])
    retained = {source_reference(p) for p in records if p.get('source_system')}
    manual_keys = {(p.get('learner_id'), p.get('component_ref')) for p in records if p.get('actual_basis') == 'staff:module-progress' and p.get('actual_seconds') is not None and p.get('component_ref')}
    for original in records:
        p = dict(original)
        if not is_unsynchronised_direct_save(p):
            result.append(p)
            candidates.append(p)
            continue
        if p.get('kind') == 'activity_event' or not p.get('submitted_at'):
            continue
        if (p.get('learner_id'), p.get('component_ref')) in manual_keys:
            continue
        if f"progress:{p['id']}" in retained:
            continue
        at = instant(p['submitted_at'])
        accepted = progress_counts_as_achieved(p.get('kind'), p.get('passed'))
        timing = {k: v for k, v in p.items() if k not in {'expected_otjh', 'expectedOtjh'}}
        seconds = completed_hours_value_from_progress([timing]) * 3600
        component = p.get('component_ref')
        marking = markings.get(str(component))
        if p.get('component_type') == 'assignment':
            accepted = bool(marking and marking.get('status') in {'accepted', 'partial'})
            marked_seconds = actual_time_seconds(marking.get('actual_time_hours')) if marking else None
            if marked_seconds is not None:
                seconds = marked_seconds
        p.update(accepted=accepted, completed=accepted, actual_seconds=seconds, reporting_month=at.strftime('%Y-%m'), reporting_started_at=at, reporting_ended_at=at, activity_status='Completed' if accepted else 'Submitted')
        candidates.append(p)
        if p.get('quiz_ref') and p.get('kind') == 'quiz_reading':
            key = ('quiz-reading', p['id'])
        else:
            key = ('quiz', p['quiz_ref']) if p.get('quiz_ref') else ('component', component) if component else ('entry', p['id'])
        key = (p.get('learner_id'), *key)
        previous = native.get(key)
        if previous is None or (accepted, seconds, attempt_order(p['submitted_at'], p['id'])) > (previous['accepted'], previous['actual_seconds'], attempt_order(previous['submitted_at'], previous['id'])):
            native[key] = p
    return native_choices(result + list(native.values()), candidates)

def source_payload_metadata(value):
    """Read keyed lineage metadata without changing non-object saved payloads."""
    if isinstance(value, str):
        value = json.loads(value)
    return value if isinstance(value, dict) else {}

def source_reference(record):
    return source_payload_metadata(record.get('source_payload')).get('original_source_ref')

def merge_attempts(records, attempts):
    """Project completion and independently verified local time beside history."""
    result = [dict(p) for p in records]
    superseded = set()
    by_route = {}
    for index, p in enumerate(result):
        source_ref = source_reference(p)
        routes, typed_courses = (set(), set())
        for link in [*(p.get('sources') or []), *(p.get('historical_components') or [])]:
            if link.get('source_system') == 'old_lms':
                course = str(link.get('source_course_ref'))
                typed_courses.add(course)
                activity = link.get('source_activity_id')
                if isinstance(activity, str):
                    if activity.startswith('material:'):
                        routes.add(f'la:{course}:{activity[9:]}')
                    elif activity.startswith('quiz:'):
                        routes.add(f'subject:quiz:{course}:{activity[5:]}')
        if isinstance(source_ref, str):
            parts = source_ref.split(':')
            course = parts[1] if len(parts) == 3 and parts[0] == 'la' else parts[2] if len(parts) == 4 and parts[:2] == ['subject', 'quiz'] else None
            if course is not None and course not in typed_courses:
                routes.add(source_ref)
        for route in routes:
            by_route.setdefault(route, []).append(index)
    for attempt in attempts:
        catalogue_kind = attempt.get('catalogue_kind', 'material')
        ref = f"{('la' if catalogue_kind == 'material' else 'subject:quiz')}:{attempt['group_id']}:{attempt['activity_id']}"
        route = {'source_system': 'old_lms', 'source_course_ref': str(attempt['group_id']), 'source_activity_id': f"{catalogue_kind}:{attempt['activity_id']}"}
        matches = [result[index] for index in by_route.get(ref, ())]
        has_progress_record = bool(matches)
        if not matches:
            at = instant(attempt['submitted_at'])
            record_id = f"subject:{attempt['group_id']}:{attempt['activity_id']}" if catalogue_kind == 'material' else f"subject:quiz:{attempt['group_id']}:{attempt['activity_id']}"
            matches = [{'id': record_id, 'component_title': attempt.get('title'), 'kind': 'quiz', 'accepted': False, 'actual_seconds': None, 'ksbs': [], 'sources': [route], 'segments': [], 'source_payload': {'original_source_ref': ref}, 'reporting_month': at.strftime('%Y-%m'), 'reporting_started_at': at}]
            result.extend(matches)
            by_route.setdefault(ref, []).append(len(result) - 1)
        for p in matches:
            p['completed'] = bool(p.get('completed', p.get('accepted')) or attempt['completed'])
            if attempt.get('best_percent') is not None:
                maximum = p.get('total_score')
                old = float(p['achieved_score']) / float(maximum) * 100 if maximum and p.get('achieved_score') is not None else None
                p['achieved_score'] = max(float(attempt['best_percent']), old) if old is not None else float(attempt['best_percent'])
                p['total_score'] = 100
        measured = measured_attempt_record(attempt, route, has_accepted_history=any((p.get('accepted') is True and p.get('actual_seconds') is not None for p in matches)))
        if measured and (not any((str(p['id']) == measured['id'] for p in result))):
            if measured.pop('retake_replace_existing', False):
                measured['retake_superseded_ids'] = [str(p['id']) for p in matches if p.get('id')]
                measured['ksbs'] = sorted({code for old in matches for code in old.get('ksbs', [])})
                measured['achieved_score'] = attempt.get('best_percent')
                measured['total_score'] = 100
                for field in ('module_ref', 'module_title', 'group_ref', 'group_title'):
                    measured[field] = next((old[field] for old in matches if old.get(field)), None)
                superseded.update((str(old['id']) for old in matches))
                measured['hours_only'] = False
            else:
                measured['hours_only'] = has_progress_record
            result.append(measured)
    return [record for record in result if str(record['id']) not in superseded]

def measured_attempt_record(attempt, route, *, has_accepted_history=False):
    """One selected completed local duration per placement, as for native saves.

    Untimed historical attempts contribute no hours. Keep this row separate
    from audited source time, and give retries/re-reads a stable identity.
    """
    candidates = []
    saved_attempts = attempt.get('timed_attempts') or []
    if isinstance(saved_attempts, str):
        saved_attempts = json.loads(saved_attempts)
    for saved in saved_attempts:
        timing = saved.get('timing') or {}
        seconds = measured_seconds(timing)
        if saved.get('completed') is True and seconds is not None:
            candidates.append(saved)
    if not candidates:
        return None
    saved, replace_history = measured_choice(candidates, has_accepted_history)
    if saved is None:
        return None
    timing = saved['timing']
    at = instant(timing.get('declaredCompletedAt') or timing.get('submittedAt'))
    if at is None:
        return None
    ident = f"subject:timing:{attempt['group_id']}:{attempt.get('catalogue_kind', 'material')}:{attempt['activity_id']}"
    return {'id': ident, 'component_title': attempt.get('title'), 'kind': 'quiz' if attempt.get('catalogue_kind') == 'quiz' else 'component', 'accepted': True, 'completed': True, 'actual_seconds': measured_seconds(timing), 'actual_basis': 'legacy_activity_manual_time' if timing.get('timeEntrySource') == 'input' else 'legacy_activity_verified_timer', 'ksbs': [], 'sources': [route], 'segments': [], 'retake_replace_existing': replace_history, 'reporting_month': at.strftime('%Y-%m'), 'reporting_started_at': at, 'reporting_ended_at': at, 'source_payload': {'original_source_ref': ident, 'subject_attempt_id': str(saved['id']), 'studyTime': timing}}

def merge_submissions(records, submissions):
    result = list(records)
    ids = {str(p['id']) for p in records}
    components = {str(p.get('component_ref')) for p in records if p.get('component_ref')}
    retained = {source_reference(p) for p in records}
    for s in submissions:
        if s.get('imported') or f"reflection:{s['id']}" in retained or str(s.get('progress_entry_id')) in ids or (s.get('component_ref') and str(s['component_ref']) in components):
            continue
        at = instant(s.get('submitted_at'))
        if at is None or s.get('status') == 'draft':
            continue
        accepted = s.get('status') in {'accepted', 'partial'}
        codes = s.get('ksb_codes') or []
        if isinstance(codes, str):
            codes = json.loads(codes)
        selected_month = s.get('activity_month') if s['activity_type'] == 'extra_activity' else None
        month = selected_month if valid_activity_month(selected_month) else at.strftime('%Y-%m')
        result.append({'id': f"reflection:{s['id']}", 'component_title': s.get('activity_title'), 'component_ref': s.get('component_ref'), 'module_title': s.get('module_title'), 'kind': s['activity_type'], 'accepted': accepted, 'completed': accepted, 'actual_seconds': actual_time_seconds(s.get('actual_time_hours')), 'reporting_month': month, 'reporting_started_at': at, 'activity_status': s.get('status'), 'ksbs': codes, 'sources': [], 'segments': [], 'source_payload': {'original_source_ref': f"reflection:{s['id']}"}})
        if s['activity_type'] == 'extra_activity':
            result[-1].update(actual_basis='extra_activity_input', expected_otjh=0)
    return result

# From learner_api/canonical_learning.py

def progress_records_with_completion(records, current):
    """Enrich completion while preserving stored hours and historical dates.

    Counts, acceptance, seconds and reporting months belong to progress entries.
    Newer attempts may still supply completion and scores for those same entries.
    Standalone extra activities use their saved coach decision and entered time;
    they have no curriculum plan or separate progress save. Other submissions
    cannot introduce additional accepted-hour records on a read.
    Server-measured, persisted legacy attempts are separate timed evidence;
    their stable placement IDs prevent retries from duplicating those hours.
    Untimed persisted course completions also survive, but never become OTJ
    reporting rows or accepted hours.

    The exception is a stored direct LMS save that nothing has given seconds
    yet: its projected time and decision are the only record of that learning,
    so they fill the empty ledger fields rather than leaving it at zero hours.
    """
    by_id = {str(record['id']): record for record in current}
    superseded = {str(ident) for record in current for ident in record.get('retake_superseded_ids', [])}
    result = []
    for record in records:
        if str(record['id']) in superseded:
            continue
        latest = by_id.get(str(record['id']), {})
        fields = ('completed', 'achieved_score', 'total_score')
        if is_unsynchronised_direct_save(record) or latest.get('retake_timing_applied'):
            fields += ('accepted', 'actual_seconds', 'activity_status', 'reporting_month', 'reporting_started_at', 'reporting_ended_at', 'reporting_timestamp_label', 'retake_timing_applied', 'completion_reporting_date')
        result.append({**record, **{key: latest[key] for key in fields if key in latest}})
    existing = {str(record['id']) for record in records}
    timed_routes = {recorded_source_key(source) for record in current if record.get('actual_basis') in {'legacy_activity_verified_timer', 'legacy_activity_manual_time'} for source in record.get('sources', [])}
    for record in current:
        ident = str(record['id'])
        if ident in existing:
            continue
        basis = record.get('actual_basis')
        if basis in {'legacy_activity_verified_timer', 'legacy_activity_manual_time', 'extra_activity_input'}:
            result.append({**record, 'hours_only': True} if basis == 'extra_activity_input' else record)
        else:
            match = re.fullmatch('subject:(quiz:)?([1-9]\\d*):([1-9]\\d*)', ident)
            if not match or record.get('completed') is not True or record.get('accepted') is not False or (record.get('actual_seconds') is not None):
                continue
            route = (match[2], ('quiz:' if match[1] else 'material:') + match[3])
            if route in timed_routes or not any((source.get('source_system') == 'old_lms' and recorded_source_key(source) == route for source in record.get('sources', []))):
                continue
            result.append({**record, 'completion_only': True})
        existing.add(ident)
    return result

# From learner_api/progress_transfer_policy.py

def is_old_record(record):
    # Locally saved legacy attempts have a synthetic subject id, not a ledger
    # source_system. They must be frozen too, without freezing native saves.
    return record.get('source_system') == 'old_lms' or (
        not record.get('source_system') and str(record.get('id', '')).startswith('subject:'))

def record_courses(record):
    refs = {str(item.get('source_course_ref') or '')
            for bucket in ('sources', 'historical_components')
            for item in record.get(bucket, [])
            if item.get('source_system') == 'old_lms'}
    refs.update(str(item.get('group_id') or '') for item in record.get('journal_routes', [])
                if item.get('source_system') == 'old_lms')
    payload = record.get('source_payload') or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            payload = {}
    original = payload.get('original_source_ref') if isinstance(payload, dict) else None
    if isinstance(original, str):
        parts = original.split(':')
        if len(parts) == 3 and parts[0] == 'la':
            refs.add(parts[1])
        elif len(parts) == 4 and parts[:2] == ['subject', 'quiz']:
            refs.add(parts[2])
    return refs - {''}

def frozen_records(records, state, *, entry_ids=None):
    """Keep the request's old facts even when a later import changes the source.

    Current-LMS rows and other courses are untouched. Snapshots retain their
    original record identity, reporting dates and seconds; no credit row is added.
    """
    courses = {item['courseRef'].removeprefix('legacy:') for item in state.get('items', [])}
    snapshots = {str(record['id']): record for record in state.get('records', [])}
    allowed = None if entry_ids is None else {str(value) for value in entry_ids}
    result, seen = [], set()
    for record in records:
        key = str(record['id'])
        if key in snapshots:
            result.append(deepcopy(snapshots[key]))
            seen.add(key)
        elif is_old_record(record) and record_courses(record) & courses:
            continue
        else:
            result.append(record)
    result.extend(deepcopy(record) for key, record in snapshots.items()
                  if key not in seen and (allowed is None or key in allowed))
    return result

# From learner_api/monthly_log_sources.py

def decoded(value, fallback=None):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return fallback
    return value if value is not None else fallback

def number(value):
    try:
        value = float(value or 0)
        return max(0, value) if math.isfinite(value) else 0
    except (ValueError, TypeError):
        return 0

# From coach_api/views.py

def parse_date_value(value):
    if not value:
        return None
    if isinstance(value, (date, datetime)):
        return value

    text = str(value).strip()
    if not text:
        return None

    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt)
        except ValueError:
            continue
    return None



def choice(value, *, activity=False):
    allowed = ('keep', 'new', 'correct', 'add', 'retry') if activity else ('keep', 'new')
    if value is not None and value not in allowed:
        raise ValueError('Choose whether to keep the current time or use the new attempt time.')
    return value

def combine_seconds(previous, current, mode):
    if mode == 'add':
        return previous + current
    if mode == 'retry':
        return max(previous, current)
    if mode == 'keep':
        return previous
    return current

def selected_attempt(rows, *, default='latest'):
    """Rows are chronological, eligible attempts with seconds/mode fields.

    Legacy keep/new selections can retain their saved date policy. Ordinary
    retries use the larger duration, including unlabelled native attempts.
    """
    selected, seconds = (None, 0)
    prefix = []
    for row in rows:
        if row.get('mode') in ('correct', 'add', 'retry'):
            break
        prefix.append(row)
    fallback = 'latest' if default == 'retry' and any((row.get('mode') in ('keep', 'new') for row in prefix)) else default
    for row in rows:
        mode, current = (row.get('mode') or fallback, row['seconds'])
        if mode in ('correct', 'add', 'retry'):
            fallback = 'retry'
        if selected is None:
            selected, seconds = (row, current)
        elif mode == 'keep' or (mode == 'retry' and seconds >= current):
            continue
        else:
            seconds = combine_seconds(seconds, current, mode)
            selected = row
    return (selected, seconds)

def attempt_order(submitted_at, ident):
    """Order saved attempts by the real submission instant, then their stable ID."""
    ident = str(ident)
    submitted = stamp(submitted_at)
    return (submitted.astimezone(ZoneInfo('UTC')) if submitted else datetime.min.replace(tzinfo=ZoneInfo('UTC')), (0, int(ident)) if ident.isdigit() else (1, ident))

def measured_seconds(value):
    """Use a saved manual selection or verified timer, never untimed history."""
    if not isinstance(value, dict) or value.get('version') != 1:
        return None
    seconds = value.get('verifiedSeconds')
    if isinstance(seconds, bool) or not isinstance(seconds, int) or seconds < 0:
        return None
    if value.get('timeEntrySource') == 'input':
        seconds = value.get('selectedSeconds')
        if isinstance(seconds, bool) or not isinstance(seconds, int) or seconds < 0:
            return None
    return seconds

def valid_activity_month(value):
    if not isinstance(value, str) or len(value) != 7:
        return False
    try:
        date.fromisoformat(value + '-01')
    except ValueError:
        return False
    return True

def recorded_source_key(source):
    """Resolve a course-qualified legacy identity only inside its stored route.

    Older imports used one global material/quiz key per learner. A component
    reused by two courses needs distinct source rows, while catalogue IDs and
    learner-facing material links retain the original typed component ID.
    """
    course = str(source.get('source_course_ref') or '')
    reference = str(source.get('source_activity_id') or '')
    if reference.startswith('course:'):
        match = re.fullmatch('course:([1-9]\\d*):((?:material|quiz):[1-9]\\d*)', reference)
        if not match or source.get('source_system') != 'old_lms' or match[1] != course:
            return None
        reference = match[2]
    return (course, reference)
