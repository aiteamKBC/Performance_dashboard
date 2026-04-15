from django.shortcuts import render
from rest_framework import viewsets
from .models import CoachesLateness, CoachSummary
from .serializers import CoachesLatenessSerializer, CoachSummarySerializer

class CoachesLatenessViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachesLateness.objects.all()
    serializer_class = CoachesLatenessSerializer

class CoachSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CoachSummary.objects.all()
    serializer_class = CoachSummarySerializer

