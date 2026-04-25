from django.shortcuts import render
from django.db import connection
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import CoachesLateness, CoachSummary
from .serializers import CoachesLatenessSerializer, CoachSummarySerializer

class CoachesLatenessViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachesLateness.objects.all()
    serializer_class = CoachesLatenessSerializer

class CoachSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachSummary.objects.all()
    serializer_class = CoachSummarySerializer

# Maps stripped+lowercased column name → safe API key
_KPI_COLUMN_MAP = {
    "caseowner":                        "case_owner",
    "required pr":                      "required_pr",
    "completed pr":                     "completed_pr",
    "still inprogress pr":              "still_inprogress_pr",
    "scheduled overdue pr":             "scheduled_overdue_pr",
    "unscheduled overdue pr":           "unscheduled_overdue_pr",
    "scheduled for the next pr%":       "scheduled_for_next_pr_pct",
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

