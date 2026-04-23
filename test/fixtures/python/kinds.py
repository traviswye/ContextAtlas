"""Fixture for PyrightAdapter kind-mapping refinements (v0.2 Stream A #1).

Exercises three kind-mapping cases that surfaced during v0.1 httpx dogfood:
- `__all__` module list → should resolve to `variable`
- Enum class members (e.g. `CLOSED`, `UNSET`) → should resolve to `variable`
- Dunder methods (`__aenter__`, `__enter__`, etc.) → should resolve to `method`

Kept intentionally isolated from `sample.py` so existing integration tests
(findReferences, getTypeInfo, Protocol-vs-ABC routing) remain unaffected.
"""

from __future__ import annotations

from enum import Enum


__all__ = ["ConnectionState", "AsyncCtxMgr", "SyncCtxMgr"]


class ConnectionState(Enum):
    """Enum with multiple members. Each member should resolve to kind
    `variable`, not `class`, and must not be dropped entirely."""

    CLOSED = 0
    UNSET = 1
    OPEN = 2


class AsyncCtxMgr:
    """Async context manager. Dunder methods should resolve to `method`."""

    async def __aenter__(self) -> "AsyncCtxMgr":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        pass


class SyncCtxMgr:
    """Sync context manager. Dunder methods should resolve to `method`."""

    def __enter__(self) -> "SyncCtxMgr":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        pass
