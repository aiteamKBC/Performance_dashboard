"""The LMS Coach Dashboard marking selector, shared by totals and detail rows."""


def read_marking_queue(cursor, coach_emails):
    emails = sorted({str(email or '').strip().lower() for email in coach_emails} - {''})
    result = {email: [] for email in emails}
    if not emails:
        return result
    cursor.execute('''SELECT id, enrolment_id, full_name, email, programme,
        programme_status, lower(trim(coach_email)) AS coach_email
        FROM "Learner".learners
        WHERE lower(trim(coach_email)) = ANY(%s)
          AND nullif(trim(full_name), '') IS NOT NULL
        ORDER BY full_name, id''', [emails])
    columns = [column[0] for column in cursor.description]
    profiles = [dict(zip(columns, row)) for row in cursor.fetchall()]
    by_owner = {email: {} for email in emails}
    for profile in profiles:
        if profile['enrolment_id']:
            # Same stable enrolment mapping and ordered last-profile winner as
            # dashboard_marking_projection; never multiply one submission by joins.
            by_owner[profile['coach_email']][str(profile['enrolment_id'])] = profile
    enrolments = sorted({identity for rows in by_owner.values() for identity in rows})
    if not enrolments:
        return result
    cursor.execute('''SELECT learner_id, MIN(learner_name), COUNT(*),
        MIN(submitted_at), MAX(submitted_at)
        FROM "Learner".learning_reflection_submissions
        WHERE learner_id = ANY(%s)
          AND status IN ('submitted_for_tutor_review', 'escalated')
        GROUP BY learner_id ORDER BY MIN(submitted_at), learner_id''', [enrolments])
    submissions = cursor.fetchall()
    for owner, owned in by_owner.items():
        for enrolment, name, count, oldest, latest in submissions:
            profile = owned.get(str(enrolment))
            if profile is None:
                continue
            result[owner].append({
                'lms_id': profile['id'], 'enrolment_id': str(enrolment),
                'name': name or profile['full_name'] or 'Learner',
                'email': profile['email'] or '', 'programme': profile['programme'] or '--',
                'programme_status': profile['programme_status'] or '',
                'pending_count': int(count),
                'oldest_pending': oldest.isoformat() if oldest else None,
                'latest_pending': latest.isoformat() if latest else None,
                'detail': f'{count} pending',
            })
    return result
