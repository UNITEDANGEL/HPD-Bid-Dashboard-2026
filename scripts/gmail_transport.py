"""Retry truncated Gmail responses without accepting partial attachment data."""
from http.client import IncompleteRead
import time
from googleapiclient.http import HttpRequest


class GmailRequest(HttpRequest):
    def execute(self, http=None, num_retries=0):
        for attempt in range(num_retries + 1):
            try:
                return super().execute(http=http, num_retries=num_retries)
            except IncompleteRead:
                if attempt == num_retries:
                    raise
                time.sleep(2 ** attempt)
