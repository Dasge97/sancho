from django.conf import settings
from django.db import models


class Invoice(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    number = models.CharField(max_length=20)
    total = models.DecimalField(max_digits=10, decimal_places=2)
