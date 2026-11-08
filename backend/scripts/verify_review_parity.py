"""Read-only comparison against the actual LMS coach-directory function.
Usage: python scripts/verify_review_parity.py --lms-root PATH
"""
import argparse
import ast
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
import psycopg
from api.lms_caseload import read_caseload
from api.lms_reviews import read_review_metrics, REVIEW_TYPES
from api.lateness_compute import _is_excluded_owner
from api.lms_source import _coach_performance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lms-root', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    today = datetime.now(ZoneInfo('Europe/London')).date()
    source = args.lms_root / 'backend/coach_api/views.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'coach_performance_metrics_by_coach')
    node.decorator_list = []
    with psycopg.connect(os.environ['LMS_DATABASE_URL'], connect_timeout=15) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        conn.execute("SET LOCAL statement_timeout = '60s'")
        with conn.cursor() as cur:
            caseload, queue = read_caseload(cur)
            caseload = [p for p in caseload if not _is_excluded_owner(p['coach'])]
            actual = read_review_metrics(cur, caseload, today)
            card_metrics = _coach_performance(cur, list(actual), caseload, today)
        ns = dict(date=date, timedelta=timedelta,
            timezone=SimpleNamespace(localdate=lambda: today),
            CoachDashboardSnapshot=SimpleNamespace(_meta=SimpleNamespace(db_table='Coach"."coach_dashboard_snapshot')),
            router=SimpleNamespace(db_for_read=lambda _: 'lms'), connections={'lms': conn},
            REVIEW_TYPES={'progress-review': [k for k,v in REVIEW_TYPES.items() if v == 'PR'],
                          'monthly-coaching': [k for k,v in REVIEW_TYPES.items() if v == 'MCM']},
            ASSIGNMENT_ACTIVITY_TYPES=('assignment', 'extra_activity'))
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), ns)
        expected = ns['coach_performance_metrics_by_coach'](set(actual), today=today)
        pending_comparison = []
        for email in actual:
            dashboard_pending = card_metrics[email]['assignment_pending']
            lms_pending = expected.get(email, {}).get('pendingMarking')
            if dashboard_pending != lms_pending:
                pending_comparison.append(dict(coach=email, dashboard=dashboard_pending, lms=lms_pending))
        differences = []
        totals = {family: dict(required=0, completed=0, overdue=0) for family in ('PR','MCM')}
        for email, periods in actual.items():
            for family, window, reference_key in [('PR','12w','progressReviews'), ('MCM','4w','monthlyCoaching')]:
                counts = periods[family][window]
                reference = expected.get(email, {}).get(reference_key)
                if counts != reference:
                    differences.append(dict(coach=email, metric=family, dashboard=counts, lms=reference))
                for key in counts:
                    totals[family][key] += counts[key]
        report = dict(as_of=today.isoformat(), timezone='Europe/London', coaches=len(actual),
            profiles=len(caseload), matched_coaches=len(actual)-len({d['coach'] for d in differences}),
            totals=totals, pending_marking_total=sum(v['pending'] for v in card_metrics.values()),
            directory_assignment_pending_total=sum(v['assignment_pending'] for v in card_metrics.values()),
            differences=differences, directory_assignment_pending_differences=pending_comparison,
            reference=str(source), read_only=True)
        output = json.dumps(report, indent=2)
        print(output)
        if args.output:
            args.output.write_text(output + '\n', encoding='utf-8')
        return bool(differences or pending_comparison)

if __name__ == '__main__':
    raise SystemExit(main())
