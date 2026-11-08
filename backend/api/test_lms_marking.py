"""Stable identity and complete queue regressions; no database writes."""
import unittest
from datetime import datetime, timezone
from .lms_marking import read_marking_queue


class Cursor:
    def __init__(self, profiles, queue):
        self.results = iter([profiles, queue])
        self.description = [(key,) for key in ('id', 'enrolment_id', 'full_name', 'email',
                            'programme', 'programme_status', 'coach_email')]

    def execute(self, sql, params):
        pass

    def fetchall(self):
        return next(self.results)


class MarkingTests(unittest.TestCase):
    def profile(self, identity, enrolment=100, status='Active', owner='coach@example.test'):
        return (identity, enrolment, f'Learner {identity}', f'l{identity}@example.test',
                'Programme', status, owner)

    def test_duplicate_profile_does_not_multiply_submission_count(self):
        cursor = Cursor([self.profile(1), self.profile(2)], [('100', 'Saved Name', 3, None, None)])
        rows = read_marking_queue(cursor, ['coach@example.test'])['coach@example.test']
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['lms_id'], rows[0]['pending_count']), (2, 3))
        self.assertEqual(rows[0]['name'], 'Saved Name')

    def test_pending_queue_includes_inactive_profile_and_actual_submission_date(self):
        stamp = datetime(2026, 11, 1, 9, tzinfo=timezone.utc)
        cursor = Cursor([self.profile(1, status='Withdrawn')], [('100', '', 4, stamp, stamp)])
        rows = read_marking_queue(cursor, ['coach@example.test'])['coach@example.test']
        self.assertEqual(rows[0]['programme_status'], 'Withdrawn')
        self.assertEqual(rows[0]['oldest_pending'], stamp.isoformat())
        self.assertEqual(rows[0]['pending_count'], 4)
        self.assertEqual(rows[0]['name'], 'Learner 1')

    def test_owner_without_queue_has_real_empty_list(self):
        cursor = Cursor([self.profile(1)], [])
        self.assertEqual(read_marking_queue(cursor, ['coach@example.test']), {'coach@example.test': []})
