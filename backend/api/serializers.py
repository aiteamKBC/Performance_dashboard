from rest_framework import serializers
from .models import CoachesLateness, CoachSummary

class CoachesLatenessSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoachesLateness
        fields = '__all__'


class CoachSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = CoachSummary
        fields = '__all__'
