from django.shortcuts import render
from django.db import connection
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import CoachesLateness, CoachSummary
from .serializers import CoachesLatenessSerializer, CoachSummarySerializer
from .lateness_compute import compute_coaches_lateness, compute_coach_drill
from .attendance_compute import get_attendance_weeks, get_attendance_drill
from .action_plan import (
    create_action_plan, list_action_plans, delete_action_plan, get_action_plan_file,
)

class CoachesLatenessViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachesLateness.objects.all()
    serializer_class = CoachesLatenessSerializer

    def list(self, request, *args, **kwargs):
        # Computed live from the raw source tables (aptem_auto_extracting,
        # progress_review, MCR) instead of the pre-aggregated coaches_lateness
        # table. See api/lateness_compute.py.
        return Response(compute_coaches_lateness())


class CoachDrillView(APIView):
    """Learner-level breakdown for a single coach (drill-down drawer)."""
    def get(self, request):
        coach_name = request.query_params.get("coach")
        case_owner_id = request.query_params.get("case_owner_id")
        if case_owner_id is not None:
            try:
                case_owner_id = int(case_owner_id)
            except (TypeError, ValueError):
                case_owner_id = None
        return Response(compute_coach_drill(coach_name=coach_name, case_owner_id=case_owner_id))

class ActionPlanView(APIView):
    """Coach action plans (title + notes), stored in the KBC database.

    GET  ?coach=<name>            -> list a coach's action plans (newest first).
    POST {coach, title, notes, case_owner_id?, attached_file?} -> create one.
    """
    # Cap the stored attachment (a base64 data URL). Base64 inflates the raw
    # bytes by ~33%, so this ≈ 105 MB of original file (frontend caps raw at 100 MB).
    MAX_ATTACHED_CHARS = 140 * 1024 * 1024
    def get(self, request):
        coach = request.query_params.get("coach")
        if not coach:
            return Response({"detail": "coach is required"}, status=400)
        return Response(list_action_plans(coach))

    def post(self, request):
        data = request.data or {}
        coach = (data.get("coach") or "").strip()
        title = (data.get("title") or "").strip()
        notes = (data.get("notes") or "").strip()
        if not coach:
            return Response({"detail": "coach is required"}, status=400)
        if not title:
            return Response({"detail": "title is required"}, status=400)
        case_owner_id = data.get("case_owner_id")
        try:
            case_owner_id = int(case_owner_id) if case_owner_id is not None else None
        except (TypeError, ValueError):
            case_owner_id = None
        creator = (data.get("creator") or "").strip() or None
        attached_file = data.get("attached_file") or None
        if attached_file is not None:
            if not isinstance(attached_file, str) or not attached_file.startswith("data:"):
                return Response({"detail": "attached_file must be a data URL"}, status=400)
            if len(attached_file) > self.MAX_ATTACHED_CHARS:
                return Response({"detail": "attached file is too large (max 100 MB)"}, status=400)
        created = create_action_plan(
            coach, title, notes, case_owner_id=case_owner_id, creator_name=creator,
            attached_file=attached_file,
        )
        return Response(created, status=201)

    def delete(self, request):
        plan_id = request.query_params.get("id") or (request.data or {}).get("id")
        try:
            plan_id = int(plan_id)
        except (TypeError, ValueError):
            return Response({"detail": "a valid id is required"}, status=400)
        if not delete_action_plan(plan_id):
            return Response({"detail": "not found"}, status=404)
        return Response(status=204)


class ActionPlanFileView(APIView):
    """The attached file (base64 data URL) for one action plan, fetched on
    demand so the list endpoint can stay lightweight.

    GET ?id=<plan_id> -> {"attached_file": "data:...;base64,..."}
    """
    def get(self, request):
        plan_id = request.query_params.get("id")
        try:
            plan_id = int(plan_id)
        except (TypeError, ValueError):
            return Response({"detail": "a valid id is required"}, status=400)
        data_url = get_action_plan_file(plan_id)
        if not data_url:
            return Response({"detail": "not found"}, status=404)
        return Response({"attached_file": data_url})


class CoachSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachSummary.objects.all()
    serializer_class = CoachSummarySerializer


class AttendanceWeeksView(APIView):
    """Per-coach weekly absence ratios computed live from kbc_attendance.

    Query params:
      count  -> number of week columns (default 10)
      before -> "year-week" key; return the weeks strictly older than it
                (the table's "Previous" / older control).
      after  -> "year-week" key; return the window one step newer than it
                (the table's "Next" / newer control).
    """
    def get(self, request):
        try:
            count = int(request.query_params.get("count", 10))
        except (TypeError, ValueError):
            count = 10
        count = max(1, min(count, 52))
        before = request.query_params.get("before") or None
        after = request.query_params.get("after") or None
        return Response(get_attendance_weeks(count=count, before=before, after=after))


class AttendanceDrillView(APIView):
    """Per-student attended/absent breakdown for one coach in one week.

    Query params: coach (required), year, week (default to the current week).
    """
    def get(self, request):
        coach = request.query_params.get("coach")
        year = request.query_params.get("year")
        week = request.query_params.get("week")
        if not coach:
            return Response({"detail": "coach is required"}, status=400)
        try:
            year = int(year) if year is not None else None
            week = int(week) if week is not None else None
        except (TypeError, ValueError):
            year = week = None
        return Response(get_attendance_drill(coach, year=year, week=week))

# Maps stripped+lowercased column name → safe API key
_KPI_COLUMN_MAP = {
    "caseowner":                        "case_owner",
    "required pr":                      "required_pr",
    "completed pr":                     "completed_pr",
    "still inprogress pr":              "still_inprogress_pr",
    "scheduled overdue pr":             "scheduled_overdue_pr",
    "unscheduled overdue pr":           "unscheduled_overdue_pr",
    "scheduled for the next pr%":       "scheduled_for_next_pr_pct",
    "required mcm":                      "required_mcm",
    "completed mcm":                    "completed_mcm",
    "still inprogress mcm":             "still_inprogress_mcm",
    "scheduled overdue mcm":            "scheduled_overdue_mcm",
    "unscheduled overdue mcm":          "unscheduled_overdue_mcm",
    "scheduled for the next mcm%":      "scheduled_for_next_mcm_pct",
    "learner emails mcm":               "learner_emails_mcm",
    "employer emails pr":               "employer_emails_pr",
    "required learners":                "required_learners",
    "scheduled pr":                     "scheduled_pr",
    "scheduled learners":               "scheduled_learners",
    "completed learners":               "completed_learners",
    "scheduled overdue learner":        "scheduled_overdue_learner",
    "still inprogress learner":         "still_inprogress_learner",
    "unscheduled overdue learners":     "unscheduled_overdue_learners",
    "scheduled% pr":                    "scheduled_pct_pr",
}

class KPIsListView(APIView):
    """
    Raw SQL view for the 'Test KPIs' table.
    Uses SELECT * and remaps columns by their stripped+lowercased name so that
    trailing spaces, casing differences, and '%' in column names don't cause errors.
    """
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM "Test KPIs"')
            raw_columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()

        data = []
        for row in rows:
            raw = dict(zip(raw_columns, row))
            record = {}
            seen_completed_pr = False
            for raw_col, value in raw.items():
                key = raw_col.strip().lower()
                if key == "completed pr":
                    # First occurrence (capital C) → completed_pr; second (lowercase c) → completed_pr_lower
                    if not seen_completed_pr:
                        record["completed_pr"] = value
                        seen_completed_pr = True
                    else:
                        record["completed_pr_lower"] = value
                else:
                    safe_key = _KPI_COLUMN_MAP.get(key, key.replace(" ", "_").replace("%", "pct"))
                    record[safe_key] = value
            data.append(record)

        return Response(data)

