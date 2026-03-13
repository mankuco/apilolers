"""
Centralized Riot API key management.

Both riot_api.py and riot_tournament.py use get_api_key() instead of
reading os.getenv at import time. This allows:
  1. Setting the key via env var RIOT_API_KEY before server start
  2. Updating the key at runtime via set_api_key() (from the API)
"""

from __future__ import annotations
import os
from typing import Optional

_runtime_key: Optional[str] = None


def get_api_key() -> str:
    """Return current API key: runtime override > env var > empty."""
    if _runtime_key:
        return _runtime_key
    return os.getenv("RIOT_API_KEY", "")


def set_api_key(key: str):
    """Update the API key at runtime (no restart needed)."""
    global _runtime_key
    _runtime_key = key.strip()


def has_api_key() -> bool:
    return bool(get_api_key())
