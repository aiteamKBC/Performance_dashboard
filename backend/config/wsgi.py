"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()

# Fill the dashboard caches in the background so the first page load after a
# (re)start doesn't wait for the LMS and Aptem reads.
from api.views import warm_caches  # noqa: E402

warm_caches()
