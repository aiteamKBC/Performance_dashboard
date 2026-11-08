"""Review accuracy regressions; synthetic fixtures, no database writes."""
import unittest
from datetime import date, timedelta
from unittest.mock import patch
from .lms_reviews import aggregate_reviews, read_review_metrics


class ReviewTests(unittest.TestCase):
    today = date(2026, 11, 8)

    def test_completed_review_does_not_hide_another_overdue_review(self):
        rows = [('coach', 'Progress Review', status, self.today - timedelta(days=2))
                for status in ('Completed', 'Scheduled')]
        counts = aggregate_reviews(rows, self.today)['coach']['PR']['12w']
        self.assertEqual(counts, dict(required=2, completed=1, overdue=1))

    def test_today_is_due_but_not_overdue_and_future_is_excluded(self):
        rows = [('coach', 'MCM', 'Scheduled', self.today + timedelta(days=offset))
                for offset in (-1, 0, 1)]
        self.assertEqual(aggregate_reviews(rows, self.today)['coach']['MCM']['4w'],
                         dict(required=2, completed=0, overdue=1))

    def test_exact_lms_week_boundaries_and_completion_aliases(self):
        rows = [('coach', 'monthly coaching', status, self.today - timedelta(days=days))
                for days, status in [(28, 'COMPLETE'), (29, 'finished'), (56, 'completed'),
                                     (57, 'Scheduled'), (84, 'Scheduled'), (85, 'Scheduled')]]
        periods = aggregate_reviews(rows, self.today)['coach']['MCM']
        self.assertEqual(periods['4w'], dict(required=1, completed=1, overdue=0))
        self.assertEqual(periods['8w'], dict(required=3, completed=3, overdue=0))
        self.assertEqual(periods['12w'], dict(required=5, completed=3, overdue=2))
        self.assertEqual(periods['all'], dict(required=6, completed=3, overdue=3))

    def test_null_dates_and_other_review_types_do_not_count(self):
        self.assertEqual(aggregate_reviews([
            ('coach', 'Personal Support Plan', 'Completed', self.today),
            ('coach', 'MCM', 'Completed', None)], self.today), {})

    def test_coach_with_no_reviews_is_a_real_zero(self):
        class Cursor:
            def execute(self, sql, params):
                self.params = params
            def fetchall(self):
                return []
        cur = Cursor()
        counts = read_review_metrics(cur, [dict(id=42, coach_email='Coach@Example.test')], self.today)
        self.assertEqual(counts['coach@example.test']['PR']['12w'],
                         dict(required=0, completed=0, overdue=0))
        self.assertEqual(cur.params[0], ['coach@example.test'])


class DashboardReviewContractTests(unittest.TestCase):
    def compute(self, available=True, profiles=None):
        from . import lateness_compute as module
        periods = {key: dict(required=2, completed=1, overdue=1)
                   for key in ('4w', '8w', '12w', 'all')}
        performance = {'pr_periods': periods, 'mcm_periods': periods,
                       'pending': 5, 'pr_weeks': {'w1': 1}}
        data = dict(caseload_available=True, caseload=profiles or [dict(
            id=1, coach='Coach A', coach_email='coach@example.test', pending=99,
            last_activity=date(2026, 11, 7), otjh={})], marking_queue=[], extras=[],
            performance_by_email={'coach@example.test': performance} if available else {})
        with patch.object(module, 'get_lms_data', return_value=data), \
             patch.object(module, '_today', return_value=date(2026, 11, 8)), \
             patch.object(module, '_aggregate_aptem', return_value={}), \
             patch.object(module, '_aggregate_lms', return_value={}), \
             patch.object(module, '_owner_resolver', return_value=None), \
             patch.object(module, '_system_conflicts', return_value={}):
            return module.compute_coaches_lateness()

    def test_cards_and_charts_share_exact_counts(self):
        row = self.compute()[0]
        self.assertEqual(row['pr_required_12_weeks'], row['pr_periods']['12w']['required'])
        self.assertEqual(row['overall_pr_completed'], row['pr_periods']['12w']['completed'])
        self.assertEqual(row['mcm_required_4_weeks'], row['mcm_periods']['4w']['required'])
        self.assertEqual(row['mcm_completed_4_weeks'], row['mcm_periods']['4w']['completed'])
        self.assertEqual(row['pr_week_1_completed'], 1)
        self.assertEqual(row['pending'], 5)
        self.assertFalse(row['referred_closure_available'])

    def test_missing_source_fails_instead_of_showing_zero(self):
        from .lms_source import LmsDataUnavailable
        with self.assertRaises(LmsDataUnavailable):
            self.compute(available=False)

    def test_engagement_rounding_matches_chart_at_half_decimal(self):
        profiles = [dict(id=i, coach='Coach A', coach_email='coach@example.test',
                         pending=0, otjh={}, last_activity=date(2026, 11, 7) if i == 0 else None)
                    for i in range(16)]
        self.assertEqual(self.compute(profiles=profiles)[0]['learner_engagement'], 6.3)
