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
    attached_file       text   (optional; a base64 data URL of an uploaded file)
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
    '  "saved date" TEXT,'
    '  attached_file TEXT'
    ')' % TABLE
)

# Ensure the attached_file column exists on pre-existing tables (the live KBC
# table predates this column; CREATE TABLE IF NOT EXISTS won't add it).
_DDL_ATTACHED = (
    'ALTER TABLE %s ADD COLUMN IF NOT EXISTS attached_file TEXT' % TABLE
)

# Light column set for lists — everything EXCEPT the (potentially huge, up to
# ~133 MB base64) attached_file blob. Instead of the blob we compute a boolean
# `has_attachment` flag server-side so the client knows to offer a download
# without paying to transfer every attachment on every list load. The blob is
# fetched on demand via get_action_plan_file().
_META_COLS = (
    'id, "Coach ID", "Coach name", "Action_plan_title", "Action_Notes", '
    '"Creator name", "saved date", (attached_file IS NOT NULL) AS has_attachment'
)


def _ensure_schema(cur):
    """Create the table if missing and backfill the attached_file column."""
    cur.execute(_DDL)
    cur.execute(_DDL_ATTACHED)


def _meta_row_to_dict(row):
    """Map a _META_COLS row (no blob; a has_attachment flag instead)."""
    return {
        "id": row[0],
        "case_owner_id": row[1],
        "coach_name": row[2],
        "title": row[3],
        "notes": row[4],
        "creator_name": row[5],
        "saved_date": row[6],
        "has_attachment": bool(row[7]),
    }


def create_action_plan(coach_name, title, notes="", case_owner_id=None,
                        creator_name=None, attached_file=None):
    """Insert one action plan and return it as a dict. The saved date is set
    server-side to today; the creator name comes from the request. An optional
    attached_file is stored verbatim (a base64 data URL of an uploaded file)."""
    coach_id = str(case_owner_id) if case_owner_id is not None else None
    saved_date = date.today().isoformat()
    conn = _connect()
    try:
        with conn.cursor() as cur:
            _ensure_schema(cur)
            cur.execute(
                'INSERT INTO %s ("Coach ID", "Coach name", "Action_plan_title", '
                '"Action_Notes", "Creator name", "saved date", attached_file) '
                'VALUES (%%s, %%s, %%s, %%s, %%s, %%s, %%s) RETURNING %s' % (TABLE, _META_COLS),
                (coach_id, coach_name, title, notes, creator_name, saved_date, attached_file),
            )
            row = cur.fetchone()
        conn.commit()
        # Returns metadata only (no blob echoed back) — keeps the response small.
        return _meta_row_to_dict(row)
    finally:
        conn.close()


def delete_action_plan(plan_id):
    """Delete one action plan by id. Returns the number of rows removed (0/1)."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            _ensure_schema(cur)
            cur.execute('DELETE FROM %s WHERE id = %%s' % TABLE, (plan_id,))
            deleted = cur.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


def list_action_plans(coach_name):
    """All action plans for a coach, newest first (by identity id). Returns
    metadata only — the attached_file blob is omitted (a has_attachment flag is
    returned instead) so large attachments aren't transferred on every load."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            _ensure_schema(cur)
            cur.execute(
                'SELECT %s FROM %s WHERE "Coach name" = %%s ORDER BY id DESC'
                % (_META_COLS, TABLE),
                (coach_name,),
            )
            rows = cur.fetchall()
        conn.commit()
        return [_meta_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_action_plan_file(plan_id):
    """Fetch just the attached_file (base64 data URL) for one plan, on demand.
    Returns the string, or None if the plan/attachment doesn't exist."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            _ensure_schema(cur)
            cur.execute(
                'SELECT attached_file FROM %s WHERE id = %%s' % TABLE, (plan_id,),
            )
            row = cur.fetchone()
        conn.commit()
        return row[0] if row else None
    finally:
        conn.close()
