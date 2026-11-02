"""Population and marking regressions; synthetic fixtures, no database access."""
import unittest
from api.lms_caseload import build_caseload, visible_status
from api.lateness_compute import _lms_owned_learner_table


class CaseloadTests(unittest.TestCase):
    def learner(self, identity, status='Active', **fields):
        return dict(id=identity, enrolment_id=identity + 100, full_name=f'Learner {identity}',
                    email=f'learner{identity}@example.test', coach_name='Coach A',
                    coach_email='coach-a@example.test', programme_status=status,
                    programme='Programme', **fields)

    def test_total_includes_only_active_and_delivery(self):
        statuses = ['Active'] * 38 + ['Delivery', 'On Break', 'Ready to Enrol', 'On maternity break']
        statuses += ['Onboarding', 'Withdrawn', 'Completed', 'Entered EPA', 'EPA']
        visible, queue = build_caseload([self.learner(i, s) for i, s in enumerate(statuses)], {})
        self.assertEqual(len(visible), 39)
        self.assertEqual(queue, [])

    def test_status_normalisation_matches_lms(self):
        for status in ['Onboarding - initial', 'Entered_EPA', 'COMPLETED', 'Withdrawn']:
            self.assertFalse(visible_status(status))
        for status in ['Active', 'Delivery']:
            self.assertTrue(visible_status(status))
        for status in ['On Break', 'Ready-to-Enrol', None]:
            self.assertFalse(visible_status(status))

    def test_pending_counts_items_by_enrolment_and_owner_not_old_name(self):
        profiles = [self.learner(1), self.learner(2),
                    {**self.learner(3), 'coach_email': 'coach-b@example.test', 'coach_name': 'Coach B'}]
        visible, queue = build_caseload(profiles, {'101': {'pending_count': 3}, '103': {'pending_count': 2}})
        self.assertEqual([(r['coach'], r['pending']) for r in queue], [('Coach A', 3), ('Coach B', 2)])
        self.assertEqual(visible[1]['pending'], 0)

    def test_same_email_does_not_merge_distinct_profiles(self):
        first = self.learner(1)
        second = {**self.learner(2), 'email': first['email']}
        visible, queue = build_caseload([first, second, first], {'101': {'pending_count': 1}})
        rows = _lms_owned_learner_table(visible, [{'email': first['email'], 'pending': 99, 'total_evidence': 99}])
        self.assertEqual([r['lms_id'] for r in rows], [1, 2])
        self.assertEqual([r['pending'] for r in rows], [1, 0])
        self.assertEqual([r['total_evidence'] for r in rows], [0, 0])

    def test_zero_lms_queue_overrides_old_aptem_marking(self):
        visible, queue = build_caseload([self.learner(1)], {})
        rows = _lms_owned_learner_table(visible, [{'email': visible[0]['email'], 'pending': 12}])
        self.assertEqual(rows[0]['pending'], 0)
        self.assertEqual(queue, [])

    def test_synthetic_test_rewan_mwada_and_qa_accounts_are_excluded(self):
        profiles = [
            self.learner(1),
            {**self.learner(2), 'full_name': 'Test learner'},
            {**self.learner(3), 'full_name': 'Rewan'},
            {**self.learner(4), 'full_name': 'Mwada QA'},
            {**self.learner(5), 'full_name': 'KBC Android QA'},
        ]
        visible, queue = build_caseload(profiles, {})
        self.assertEqual([row['id'] for row in visible], [1])
        self.assertEqual(queue, [])

    def test_lifecycle_must_also_be_active_or_delivery(self):
        profiles = [self.learner(1, lifecycle_status='active'),
                    self.learner(2, 'Delivery', lifecycle_status='enteredepa'),
                    self.learner(3, lifecycle_status='withdrawn'),
                    self.learner(4, lifecycle_status='readytoenrol')]
        visible, _ = build_caseload(profiles, {})
        self.assertEqual([row['id'] for row in visible], [1])

    def test_named_test_learners_and_staff_accounts_are_excluded(self):
        profiles = [
            self.learner(1),
            {**self.learner(2), 'full_name': 'Rukshana test learner'},
            {**self.learner(3), 'full_name': 'ME L4 Oct 26 (Test)'},
            {**self.learner(4), 'full_name': 'Khaled first learning session'},
            {**self.learner(5), 'email': 'someone@kentbusinesscollege.com'},
        ]
        visible, _ = build_caseload(profiles, {})
        self.assertEqual([row['id'] for row in visible], [1])

    def test_learner_without_lms_coach_falls_back_to_known_coach(self):
        profiles = [self.learner(1), {**self.learner(2), 'coach_email': None, 'coach_name': None}]
        visible, _ = build_caseload(profiles, {}, lambda row: 'Coach A' if row['id'] == 2 else None)
        self.assertEqual([(row['id'], row['coach']) for row in visible], [(1, 'Coach A'), (2, 'Coach A')])

    def test_queue_is_not_duplicated_by_multiple_profiles_for_one_enrolment(self):
        a = self.learner(1)
        b = {**self.learner(2), 'enrolment_id': a['enrolment_id']}
        visible, queue = build_caseload([a, b], {'101': {'pending_count': 3}})
        self.assertEqual(len(visible), 2)
        self.assertEqual(sum(row['pending'] for row in queue), 3)


if __name__ == '__main__':
    unittest.main()
