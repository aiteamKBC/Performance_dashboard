"""
Coach action plans, stored in the KBC main database (kbc_main_database_url).

A simple per-coach note: a title and free-text notes. These map onto the existing
``Performance_dashboard_action_plan`` table in the KBC database (accessed via
psycopg directly, not the Django ORM):

    id                  integer, GENERATED ALWAYS AS IDENTITY (auto)
    "Coach ID"          text
    "Coach name"        text
    "Action_plan_title" text
    "Action_Notes"      text
    "Creator name"      text
    "saved date"        text   (set server-side to today's date on insert)
"""

from datetime import date

from .attendance_compute import _connect

# Quoted to preserve the exact (mixed-case) name in Postgres.
TABLE = '"Performance_dashboard_action_plan"'

# Created only if the table is absent (e.g. a fresh environment); the live KBC
# table already exists, so this is a no-op there.
_DDL = (
    'CREATE TABLE IF NOT EXISTS %s ('
    '  id SERIAL PRIMARY KEY,'
    '  "Coach ID" TEXT,'
    '  "Coach name" TEXT,'
    '  "Action_plan_title" TEXT,'
    '  "Action_Notes" TEXT,'
    '  "Creator name" TEXT,'
    '  "saved date" TEXT'
    ')' % TABLE
)

# id is identity (never inserted); the text columns below are written.
_SELECT_COLS = (
    'id, "Coach ID", "Coach name", "Action_plan_title", "Action_Notes", '
    '"Creator name", "saved date"'
)


def _row_to_dict(row):
    return {
        "id": row[0],
        "case_owner_id": row[1],
        "coach_name": row[2],
        "title": row[3],
        "notes": row[4],
        "creator_name": row[5],
        "saved_date": row[6],
    }


def create_action_plan(coach_name, title, notes="", case_owner_id=None, creator_name=None):
    """Insert one action plan and return it as a dict. The saved date is set
    server-side to today; the creator name comes from the request."""
    coach_id = str(case_owner_id) if case_owner_id is not None else None
    saved_date = date.today().isoformat()
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(_DDL)
            cur.execute(
                'INSERT INTO %s ("Coach ID", "Coach name", "Action_plan_title", '
                '"Action_Notes", "Creator name", "saved date") '
                'VALUES (%%s, %%s, %%s, %%s, %%s, %%s) RETURNING %s' % (TABLE, _SELECT_COLS),
                (coach_id, coach_name, title, notes, creator_name, saved_date),
            )
            row = cur.fetchone()
        conn.commit()
        return _row_to_dict(row)
    finally:
        conn.close()


def delete_action_plan(plan_id):
    """Delete one action plan by id. Returns the number of rows removed (0/1)."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(_DDL)
            cur.execute('DELETE FROM %s WHERE id = %%s' % TABLE, (plan_id,))
            deleted = cur.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


def list_action_plans(coach_name):
    """All action plans for a coach, newest first (by identity id)."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(_DDL)
            cur.execute(
                'SELECT %s FROM %s WHERE "Coach name" = %%s ORDER BY id DESC'
                % (_SELECT_COLS, TABLE),
                (coach_name,),
            )
            rows = cur.fetchall()
        conn.commit()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()
