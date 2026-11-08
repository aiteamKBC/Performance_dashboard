"""Compare against a reviewed LMS checkout on one read-only database snapshot.

Usage: python scripts/verify_otjh_parity.py --lms-root PATH_TO_LMS
Only selected read functions are loaded with explicit dependencies. This does
not start Django, import app hooks, run migrations, or alter database records.
"""
import argparse
import ast
from collections import defaultdict
from contextlib import nullcontext
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import json
import math
from pathlib import Path
import re
import sys
import time
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import psycopg
from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.lms_otjh import read_otjh


class RemoveImports(ast.NodeTransformer):
    def visit_Import(self, node):
        return None

    def visit_ImportFrom(self, node):
        return None


def load(root, file, names, namespace):
    path = root / file
    tree = ast.parse(path.read_text(encoding='utf-8-sig'))
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names.split()]
    assert {n.name for n in selected} == set(names.split()), (file, names)
    module = RemoveImports().visit(ast.Module(body=selected, type_ignores=[]))
    exec(compile(ast.fix_missing_locations(module), str(path), 'exec'), namespace)


def reference(root, connection, query):
    ns = dict(json=json, math=math, re=re, date=date, datetime=datetime,
              Decimal=Decimal, InvalidOperation=InvalidOperation, ZoneInfo=ZoneInfo,
              SimpleNamespace=SimpleNamespace, defaultdict=defaultdict, deepcopy=deepcopy,
              isfinite=math.isfinite, UK=ZoneInfo('Europe/London'), query=query,
              GRADED_PROGRESS_KINDS=frozenset({'quiz'}),
              projection_stage=lambda name: nullcontext(), ServiceError=Exception,
              journal_sources=SimpleNamespace(enabled=lambda: False),
              canonical=SimpleNamespace(query=query), connections={'enrolment': connection},
              connection=SimpleNamespace(vendor='postgresql'),
              timezone=SimpleNamespace(is_aware=lambda value: value.tzinfo is not None),
              # KSB exclusions never affect hours; omit that unrelated enrichment.
              _ksb_not_excluded=lambda alias='k': 'TRUE',
              FAMILY_BY_SOURCE_TYPE={'monthly coaching meeting': 'MCM', 'monthly coaching': 'MCM',
                  'mcm': 'MCM', 'progress review': 'PR', 'progress review (+ skills radar)': 'PR_SKILLS_RADAR',
                  'personal support plan': 'PSP'},
              ReviewSource=lambda kind, aptem_id=None: SimpleNamespace(kind=kind, aptem_id=aptem_id))
    specs = {
        'learner_api/active_users.py': '_s _number _reported_minutes _progress_text otjh_progress_dedupe_key _selected_timer_seconds _manual_claimed_seconds _progress_record_minutes dedupe_otjh_progress_records _component_expected_hours_lookup completed_hours_value_from_progress',
        'learner_api/subject_timing.py': 'measured_seconds',
        'learner_api/extra_activity_month.py': 'valid_activity_month',
        'learner_api/progress_rules.py': '_kind progress_counts_as_achieved',
        'learner_api/retake_timing.py': 'choice combine_seconds selected_attempt metadata stamp attempt_order native_key native_choices measured_choice',
        'learner_api/current_learning.py': 'instant actual_time_seconds is_unsynchronised_direct_save project_current source_payload_metadata source_reference merge_attempts measured_attempt_record merge_submissions attempts_relation_exists current_records subject_attempt_rows',
        'learner_api/canonical_learning.py': 'recorded_source_key _validated_profile is_legacy_record counts_as_actual is_time_estimated counts_as_completed entries_for progress_records_with_completion allocations completion_reporting_instant recorded_seconds point_ratio metrics_from_records otjh_summary_bulk',
        'learner_api/canonical_hours.py': 'full_hour_projection_ids extra_activity_hour_records pending_hour_records',
        'learner_api/monthly_log_sources.py': 'decoded number',
        'learner_api/progress_transfer_policy.py': 'is_old_record record_courses frozen_records',
        'learner_api/progress_transfer_store.py': 'decode read_state',
        'learner_api/student_activity_access.py': 'student_activity_available',
        'learner_api/review_history.py': '_normalise_status _json_value _parse_imported_datetime _iso_date _iso_time _review_data_sections _field_value _serialize_review',
        'coach_api/review_sources.py': 'resolve_review_source',
        'coach_api/migrated_reviews.py': 'programme_key review_family',
        'coach_api/migrated_otjh.py': 'policy hours_for frozen_hours table day source_rows overlays_for planned_meetings planned_hours_bulk',
        'coach_api/selectors/otjh.py': 'learner_programme_window',
        'coach_api/views.py': 'to_decimal to_number parse_date_value apply_otjh_to_date_metrics',
    }
    for file, names in specs.items():
        load(root, file, names, ns)
    ratio_ns = {}
    load(root, 'learner_api/ksb_points.py', 'point_ratio', ratio_ns)
    ns['shared_ratio'] = ratio_ns['point_ratio']
    ns['CHOICES'] = frozenset({'keep', 'new', 'correct', 'add', 'retry'})
    ns['REQUESTS'] = '"Learner".progress_transfer_requests'
    ns['ITEMS'] = '"Learner".progress_transfer_items'

    class Templates:
        def filter(self, **kwargs):
            return [SimpleNamespace(**r) for r in query('''SELECT id AS pk,programme_key,
                review_family,name,definition_json FROM "Coach".coach_migrated_review_template WHERE is_active''')]

    class Overlays:
        def filter(self, **kwargs):
            ids = kwargs['learner_id__in']
            class Rows:
                def values(self, *fields):
                    columns = []
                    for field in fields:
                        if '__' in field:
                            column, key = field.split('__')
                            columns.append(f'{column}->\'{key}\' AS "{field}"')
                        else:
                            columns.append(field)
                    return query('SELECT ' + ','.join(columns) +
                                 ' FROM "Coach".coach_imported_review_instance WHERE learner_id=ANY(%s)', [ids])
            return Rows()
    ns['MigratedReviewTemplate'] = SimpleNamespace(objects=Templates())
    ns['ImportedReviewInstance'] = SimpleNamespace(objects=Overlays())
    return ns


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lms-root', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--limit', type=int, default=0, help='Optional diagnostic sample size')
    args = parser.parse_args()
    env = dotenv_values(Path(__file__).resolve().parents[1] / '.env')
    dsn = env.get('LMS_DATABASE_URL') or env.get('Database_url')
    with psycopg.connect(dsn, connect_timeout=15,
                         options='-c default_transaction_read_only=on') as connection:
        connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        connection.execute("SET LOCAL statement_timeout='60s'")
        def query(sql, params=()):
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                names = [c[0] for c in cursor.description]
                return [dict(zip(names, row)) for row in cursor.fetchall()]

        # Report slow reads without exposing parameters or learner evidence.
        from api.lms_otjh import Reader
        original_query = Reader.query
        def timed_query(self, sql, params=()):
            started = time.monotonic()
            rows = original_query(self, sql, params)
            elapsed = time.monotonic() - started
            if elapsed > 2:
                print('Slow read:', sql.strip().splitlines()[0][:60], round(elapsed, 2), 's', flush=True)
            return rows
        Reader.query = timed_query

        profiles = query('''SELECT l.id,l.enrolment_id,l.start_date,l.end_date,
            u."Start_date" AS source_start,u."End_date" AS source_end,
            u."Learner_start_date" AS source_learner_start,u."Learner_end_date" AS source_learner_end,
            u."Apprenticeship_End_date" AS source_apprenticeship_end,
            u."Practical_period_end_date" AS source_practical_end
            FROM "Learner".learners l LEFT JOIN enrolment."Created_users" u ON u.id=l.enrolment_id
            WHERE lower(l.lifecycle_status) IN ('active','delivery')''')
        if args.limit:
            profiles = profiles[:args.limit]
        today = datetime.now(ZoneInfo('Europe/London')).date()
        with connection.cursor() as cursor:
            actual = read_otjh(cursor, [p['id'] for p in profiles], today=today)
        print('Performance read complete:', len(actual), flush=True)
        ref = reference(args.lms_root / 'backend', connection, query)
        expected = ref['otjh_summary_bulk']([p['enrolment_id'] for p in profiles])
        differences = []
        for p in profiles:
            facts = expected.get(p['enrolment_id']) or {}
            if facts.get('profile_id') != p['id']:
                facts = {}
            source = SimpleNamespace(start_date=p['source_start'], end_date=p['source_end'],
                learner_start_date=p['source_learner_start'], learner_end_date=p['source_learner_end'],
                apprenticeship_end_date=p['source_apprenticeship_end'], practical_period_end_date=p['source_practical_end'])
            start, end = ref['learner_programme_window'](SimpleNamespace(**p), source)
            result = ref['apply_otjh_to_date_metrics']({'otjhCompleted': facts.get('actual'),
                'otjhPlanned': facts.get('planned'), 'otjhProgrammeStartDate': start, 'plannedEndDate': end}, today=today)
            fields = {'completed': facts.get('actual'), 'planned': facts.get('planned'),
                'target': result['otjhTargetAsOfToday'], 'progress_percent': result['otjhProgressAsOfToday'],
                'shortfall_hours': result['otjhShortfallHours'], 'progress_hours': result['otjhDeltaHours'],
                'otjh_status': result['otjhRagStatus'].replace('-', ' ').title()}
            for key, value in fields.items():
                if actual[p['id']][key] != value:
                    differences.append({'profile_id': p['id'], 'field': key,
                                        'performance': actual[p['id']][key], 'lms': value})
        report = json.dumps({'profiles_checked': len(profiles), 'as_of': str(today),
                             'differences': differences, 'read_only': True}, default=str)
        print(report)
        if args.output:
            args.output.write_text(report + '\n', encoding='utf-8')
        return bool(differences)


if __name__ == '__main__':
    raise SystemExit(main())
