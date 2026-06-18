from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CoachesLatenessViewSet, CoachSummaryViewSet, KPIsListView, CoachDrillView,
    AttendanceWeeksView, AttendanceDrillView,
)

router = DefaultRouter()
router.register(r'coaches-lateness', CoachesLatenessViewSet, basename='coaches-lateness')
router.register(r'coach-summary', CoachSummaryViewSet, basename='coach-summary')

urlpatterns = [
    path('', include(router.urls)),
    path('kpis/', KPIsListView.as_view(), name='kpis'),
    path('coach-drill/', CoachDrillView.as_view(), name='coach-drill'),
    path('attendance-weeks/', AttendanceWeeksView.as_view(), name='attendance-weeks'),
    path('attendance-drill/', AttendanceDrillView.as_view(), name='attendance-drill'),
]
