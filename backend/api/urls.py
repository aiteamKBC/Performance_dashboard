from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CoachesLatenessViewSet, CoachSummaryViewSet, KPIsListView

router = DefaultRouter()
router.register(r'coaches-lateness', CoachesLatenessViewSet, basename='coaches-lateness')
router.register(r'coach-summary', CoachSummaryViewSet, basename='coach-summary')

urlpatterns = [
    path('', include(router.urls)),
    path('kpis/', KPIsListView.as_view(), name='kpis'),
]
