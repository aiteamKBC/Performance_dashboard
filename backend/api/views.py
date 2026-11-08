import logging
import threading
import time

from django.shortcuts import render
from django.db import connection, connections
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import CoachesLateness, CoachSummary
from .serializers import CoachesLatenessSerializer, CoachSummarySerializer
from .lateness_compute import SOURCES, clear_fetch_cache, compute_coaches_lateness, compute_coach_drill
from .attendance_compute import get_attendance_weeks, get_attendance_drill
from .lms_source import LmsDataUnavailable, clear_lms_cache
from .action_plan import (
    create_action_plan, list_action_plans, delete_action_plan, get_action_plan_file,
)

log = logging.getLogger(__name__)


# The coaches endpoint aggregates several large source tables. Keep the
# computed response briefly so refreshes and multiple browser tabs do not all
# repeat the same expensive work. The LMS source already has its own shorter
# cache; this cache covers the complete response returned to the dashboard.
COACHES_LATENESS_CACHE_SECONDS = 60
_coaches_lateness_cache = {}
_coaches_lateness_cache_lock = threading.Lock()


def _get_cached_coaches_lateness(source):
    cache_key = source or "all"
    cached = _coaches_lateness_cache.get(cache_key)
    if cached:
        # Never make a page wait for a recompute once there is a result: serve
        # it and refresh in the background when it is out of date.
        if time.monotonic() - cached[0] >= COACHES_LATENESS_CACHE_SECONDS:
            _recompute_in_background(source)
        return cached[1]

    # Hold the lock while computing so simultaneous page loads collapse into a
    # single database calculation instead of creating a request stampede.
    with _coaches_lateness_cache_lock:
        cached = _coaches_lateness_cache.get(cache_key)
        if cached:
            return cached[1]
        result = compute_coaches_lateness(source=source)
        _coaches_lateness_cache[cache_key] = (time.monotonic(), result)
        return result


def _recompute_in_background(source):
    if not _coaches_lateness_cache_lock.acquire(blocking=False):
        return  # a computation is already running

    def run():
        try:
            result = compute_coaches_lateness(source=source)
            _coaches_lateness_cache[source or "all"] = (time.monotonic(), result)
        except Exception:
            log.exception("Background refresh of the coaches dashboard failed.")
        finally:
            _coaches_lateness_cache_lock.release()
            connections.close_all()

    threading.Thread(target=run, name="coaches-cache-refresh", daemon=True).start()


def warm_caches():
    """Compute the coaches dashboard in the background at server start, so the
    first visitor does not wait for the LMS and Aptem reads."""
    _recompute_in_background(None)


def _clear_coaches_lateness_cache():
    with _coaches_lateness_cache_lock:
        _coaches_lateness_cache.clear()
    clear_lms_cache()
    clear_fetch_cache()

class CoachesLatenessViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachesLateness.objects.all()
    serializer_class = CoachesLatenessSerializer

    def list(self, request, *args, **kwargs):
        # Computed live from the raw source tables (aptem_auto_extracting,
        # progress_review, MCR) instead of the pre-aggregated coaches_lateness
        # table. See api/lateness_compute.py.
        # ?source=aptem | lms narrows to one learner source (default: both).
        source = request.query_params.get("source")
        if source not in SOURCES:
            source = None
        try:
            if request.query_params.get("refresh") in {"1", "true", "yes"}:
                _clear_coaches_lateness_cache()
            return Response(_get_cached_coaches_lateness(source))
        except LmsDataUnavailable as exc:
            return Response({"detail": str(exc)}, status=503)


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
        source = request.query_params.get("source")
        if source not in SOURCES:
            source = None
        try:
            return Response(compute_coach_drill(
                coach_name=coach_name, case_owner_id=case_owner_id, source=source,
            ))
        except LmsDataUnavailable as exc:
            return Response({"detail": str(exc)}, status=503)

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
        # A manual refresh must also invalidate the short-lived LMS caseload
        # cache; otherwise the attendance roster can lag behind Performance.
        if request.query_params.get("refresh") in {"1", "true", "yes"}:
            clear_lms_cache()
        response = Response(get_attendance_weeks(count=count, before=before, after=after))
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response["Pragma"] = "no-cache"
        return response


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

