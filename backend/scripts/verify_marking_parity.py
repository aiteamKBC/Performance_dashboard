"""Compare the complete pending queue with the actual LMS Marking selector.
All reads run on a single repeatable-read, read-only snapshot.
"""
import argparse
import ast
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
import psycopg
from api.lms_marking import read_marking_queue
from api.lms_caseload import read_caseload
from api.lateness_compute import _is_excluded_owner
from api.lms_source import _coach_performance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lms-root', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    source = args.lms_root / 'backend/coach_api/selectors/dashboard/marking.py'
    tree = ast.parse(source.read_text(encoding='utf-8-sig'))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'dashboard_marking_projection')
    differences, coaches = [], []
    with psycopg.connect(os.environ['LMS_DATABASE_URL'], connect_timeout=15) as connection:
        connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        connection.execute("SET LOCAL statement_timeout='60s'")
        with connection.cursor() as cursor:
            visible, _ = read_caseload(cursor)
            emails = {p['coach_email']: p['coach'] for p in visible if not _is_excluded_owner(p['coach'])}
            actual = read_marking_queue(cursor, emails)
            cards = _coach_performance(cursor, emails, visible)
            cursor.execute('''SELECT id, enrolment_id, full_name, programme, lower(trim(coach_email)) AS coach_email
                FROM "Learner".learners WHERE lower(trim(coach_email))=ANY(%s)
                  AND nullif(trim(full_name),'') IS NOT NULL ORDER BY full_name,id''', [list(emails)])
            columns = [c[0] for c in cursor.description]
            profiles = [dict(zip(columns, row)) for row in cursor.fetchall()]
        namespace = dict(connections={'enrolment': connection}, CoachDashboardContext=SimpleNamespace)
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), namespace)
        for email, name in sorted(emails.items()):
            owned = [SimpleNamespace(**p) for p in profiles if p['coach_email'] == email]
            context = SimpleNamespace(rows=owned, enrolment_ids=[str(p.enrolment_id) for p in owned if p.enrolment_id])
            reference = namespace['dashboard_marking_projection'](context)
            expected = sorted([(r['learnerId'], r['learner'], r['programme'], r['pendingEvidence'], r['submittedAt'], r['lastSubmissionIso'])
                               for r in reference['items']])
            result = sorted([(str(r['lms_id']), r['name'], r['programme'], r['pending_count'], r['oldest_pending'], r['latest_pending'])
                             for r in actual[email]])
            count = sum(row['pending_count'] for row in actual[email])
            if result != expected or cards[email]['pending'] != reference['summary']['pendingItems']:
                differences.append(dict(coach=name, total=count, reference_total=reference['summary']['pendingItems'], rows_match=result == expected))
            coaches.append(dict(coach=name, pending=count, learners=len(result)))
    report = dict(as_of=datetime.now(ZoneInfo('Europe/London')).isoformat(), read_only=True,
                  reference=str(source), coaches=coaches, total_pending=sum(c['pending'] for c in coaches),
                  differences=differences, compared_fields=['profile identity', 'learner name', 'programme', 'pending count', 'oldest date', 'latest date'])
    output = json.dumps(report, indent=2)
    print(output)
    if args.output:
        args.output.write_text(output + '\n', encoding='utf-8')
    return bool(differences)

if __name__ == '__main__':
    raise SystemExit(main())
