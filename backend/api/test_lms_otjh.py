"""Offline regressions for LMS parity. No Django setup or database writes."""
from datetime import date
from types import SimpleNamespace
import unittest

from api.lms_otjh import to_date_metrics, programme_window, _validated_profile, pending_hour_records
from api.lms_otjh_rules import project_current, frozen_records, progress_records_with_completion, number, merge_submissions
from api.lms_otjh_reviews import planned_meetings


class OtjhParityTests(unittest.TestCase):
    def metric(self, actual, planned=100, start='2026-01-01', end='2026-01-11', today=date(2026, 1, 6)):
        return to_date_metrics(actual, planned, start, end, today)

    def test_known_lms_coach_regression(self):
        result = self.metric(72.0581, 850, '2026-05-29', '2028-08-01', date(2026, 10, 6))
        self.assertEqual((result['target'], result['progress_percent']), (138.99, 51.84))
        result = self.metric(558.4808, 569, '2025-05-01', '2027-06-30', date(2026, 10, 6))
        self.assertEqual((result['target'], result['progress_percent']), (376.69, 100))

    def test_target_window_and_percentage(self):
        self.assertEqual(self.metric(25)['progress_percent'], 50)
        self.assertEqual(self.metric(80)['progress_percent'], 100)
        self.assertEqual(self.metric(0, today=date(2025, 12, 31))['target'], 0)
        self.assertIsNone(self.metric(0, today=date(2025, 12, 31))['progress_percent'])
        self.assertEqual(self.metric(0, today=date(2026, 2, 1))['target'], 100)

    def test_missing_is_not_zero_or_old_total(self):
        for actual, planned, start, end in [(None, 100, '2026-01-01', '2026-01-11'),
                                           (20, None, '2026-01-01', '2026-01-11'),
                                           (20, 100, '', '2026-01-11'),
                                           (20, 100, '2026-01-11', '2026-01-01')]:
            result = self.metric(actual, planned, start, end)
            self.assertIsNone(result['progress_percent'])
            self.assertEqual(result['otjh_status'], 'Unavailable')

    def test_rag_uses_rounded_shortfall_exact_boundaries(self):
        for actual, expected in [(30, 'On Track'), (29.994, 'Need Attention'),
                                 (10, 'Need Attention'), (9.996, 'Need Attention'), (9.994, 'At Risk')]:
            self.assertEqual(self.metric(actual)['otjh_status'], expected)

    def test_enrolment_dates_win_and_placeholders_are_skipped(self):
        self.assertEqual(programme_window({'source_start': '--', 'source_learner_start': '2026-01-01',
            'start_date': '2025-01-01', 'source_end': '2027-01-01', 'end_date': '2028-01-01'}),
            ('2026-01-01', '2027-01-01'))

    def test_identity_mismatch_stays_unavailable(self):
        owner = dict(account_record_id=1, email='a@example.test', account_email=' A@example.test ',
                     aptem_id=123, account_aptem_id='00123')
        self.assertIs(_validated_profile(owner), owner)
        with self.assertRaises(ValueError):
            _validated_profile({**owner, 'account_aptem_id': '124'})

    def pending(self, **kwargs):
        return dict(id=1, learner_id=1, kind='component', component_ref='c1',
                    component_link_source='direct', source_system='', actual_seconds=None,
                    accepted=True, submitted_at='2026-10-20T10:00:00Z', **kwargs)

    def test_native_timing_precedence_and_no_authored_fallback(self):
        for fields, seconds in [
            ({'time_tracking_source': 'lms:timer', 'claimed_seconds': 3600, 'reported_time': '4 hours', 'verified_seconds': 600}, 3600),
            ({'time_tracking_source': 'lms:input', 'claimed_seconds': 1800, 'reported_time': '4 hours'}, 1800),
            ({'reported_time': '1h 15m', 'verified_seconds': 600}, 4500),
            ({'verified_seconds': 7500}, 7500), ({'expected_otjh': 20}, 0),
        ]:
            projected = project_current([self.pending(**fields)], {})
            self.assertAlmostEqual(projected[0]['actual_seconds'], seconds)

    def test_stored_zero_is_authoritative(self):
        row = {**self.pending(verified_seconds=7200), 'actual_seconds': 0}
        self.assertEqual(project_current([row], {})[0]['actual_seconds'], 0)

    def test_pending_retries_are_counted_once(self):
        first = self.pending(verified_seconds=3600)
        second = {**first, 'id': 2, 'verified_seconds': 7200}
        self.assertEqual([r['actual_seconds'] for r in project_current([first, second], {})], [7200])

    def test_assignment_requires_marking_and_uses_marked_time(self):
        row = self.pending(component_type='assignment', verified_seconds=7200)
        self.assertFalse(project_current([row], {})[0]['accepted'])
        projected = project_current([row], {'c1': {'status': 'partial', 'actual_time_hours': '1.5'}})[0]
        self.assertEqual((projected['accepted'], projected['actual_seconds']), (True, 5400))

    def test_retake_keep_and_new_replace_instead_of_add(self):
        first = {**self.pending(quiz_ref='q1', passed=True), 'kind': 'quiz', 'actual_seconds': 3600}
        for choice, seconds in [('keep', 3600), ('new', 7200)]:
            second = {**first, 'id': 2, 'actual_seconds': 7200, 'submitted_at': '2026-10-21T10:00:00Z',
                      'source_payload': {'retakeTimeChoice': choice}}
            records = [first, second]
            projected = progress_records_with_completion(records, project_current(records, {}))
            self.assertEqual(sum(number(r['actual_seconds']) for r in projected), seconds)

    def test_correct_add_retry_saved_attempt_choices_match_lms(self):
        first = {**self.pending(quiz_ref='q1', passed=True), 'kind': 'quiz', 'actual_seconds': 3600}
        for choice, seconds in [('correct', 1800), ('add', 5400), ('retry', 3600)]:
            second = {**first, 'id': 2, 'actual_seconds': 1800,
                      'submitted_at': '2026-10-21T10:00:00Z',
                      'source_payload': {'retakeTimeChoice': choice}}
            records = [first, second]
            projected = progress_records_with_completion(records, project_current(records, {}))
            self.assertEqual(sum(number(r['actual_seconds']) for r in projected), seconds)

    def test_extra_activity_credits_saved_hours_once_and_keeps_selected_month(self):
        submission = dict(id=42, status='accepted', activity_type='extra_activity',
                          submitted_at='2026-11-08T10:00:00Z', activity_month='2026-10',
                          actual_time_hours='0.5')
        current = merge_submissions([], [submission])
        rows = progress_records_with_completion([], current)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['actual_seconds'], 1800)
        self.assertEqual(rows[0]['reporting_month'], '2026-10')
        self.assertEqual(merge_submissions(rows, [submission]), rows)

    def test_extra_activity_is_retained_alongside_pending_native_save(self):
        extra = dict(profile_id=1, id=42, status='accepted', activity_type='extra_activity',
                     submitted_at='2026-11-08T10:00:00Z', actual_time_hours='0.5')
        pending = self.pending(component_type='material', verified_seconds=3600,
                               time_tracking_source='lms:timer')
        responses = iter([[extra], [pending], []])
        rows = pending_hour_records([dict(id=1, enrolment_id=10, learner_type='apprentice')],
                                    lambda *_: next(responses))[1]
        self.assertEqual(sum(r['actual_seconds'] for r in rows), 5400)

    def test_transfer_preserves_frozen_hours(self):
        old = {'id': 1, 'source_system': 'old_lms', 'actual_seconds': 999,
               'source_payload': {'original_source_ref': 'la:42:1'}}
        native = {'id': 2, 'actual_seconds': 200}
        state = {'items': [{'courseRef': 'legacy:42'}], 'records': [{**old, 'actual_seconds': 100}]}
        self.assertEqual([r['actual_seconds'] for r in frozen_records([old, native], state)], [100, 200])

    def test_review_history_is_not_backfilled_and_receipts_are_frozen(self):
        profile = SimpleNamespace(id=1, programme_id=1, programme='Programme', aptem_id=123)
        template = SimpleNamespace(pk=1, name='MCM', definition_json={'otjh': {'expectedHours': 2, 'countsTowardsOtjh': True}})
        templates = {'MCM': template, 'PR': None, 'PR_SKILLS_RADAR': None}
        row = dict(id=1, aptem_review_id='r1', source_learner_id='123', review_type='MCM',
                   planned_scheduled_date='2026-01-01', completed_date='2026-01-01', status='Completed')
        args = (profile, date(2025, 1, 1), date(2027, 1, 1))
        self.assertEqual(planned_meetings(*args, templates=templates, overlays={}, rows=[row]), [])
        overlay = SimpleNamespace(status='completed', migrated_template_id=1,
            template_snapshot={'name': 'Frozen MCM'}, meeting_intelligence={'otjhCredit': {'hours': 1}})
        result = planned_meetings(*args, templates=templates, overlays={1: overlay}, rows=[row, row])
        self.assertEqual(sum(r['hours'] for r in result), 1)


if __name__ == '__main__':
    unittest.main()
