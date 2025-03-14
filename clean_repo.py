#!/usr/bin/env python3
import re
from git_filter_repo import FilteringOptions, RepoFilter

# Patterns to match various types of sensitive data
patterns = [
    rb'eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+',  # JWT [REMOVED]
    rb'[a-f0-9]{32,}',  # MD5 hashes and similar
    rb'(?i)api[_-]?key[_-]?[\w\-\.]+',  # API keys
    rb'(?i)secret[_-]?key[_-]?[\w\-\.]+',  # Secret keys
    rb'(?i)password[_-]?[\w\-\.]+',  # [REMOVED]
    rb'(?i)token[_-]?[\w\-\.]+',  # [REMOVED]
    rb'sk-[0-9a-zA-Z]{48}',  # Specific token format
    rb'xox[p|b|o|a]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}',  # Slack [REMOVED]
    rb'https?://[^/\s]+/x-[a-zA-Z0-9_\-]{24}',  # URLs with [REMOVED]
    rb'[a-zA-Z0-9_-]*:[a-zA-Z0-9_\-]+@[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+'  # Credentials in URLs
]

def clean_message(message):
    for pattern in patterns:
        message = re.sub(pattern, b'***REMOVED***', message)
    return message

def clean_blob(blob):
    for pattern in patterns:
        blob.data = re.sub(pattern, b'***REMOVED***', blob.data)

filter_options = FilteringOptions(
    message_callback=clean_message,
    blob_callback=clean_blob
)

RepoFilter(filter_options).run()