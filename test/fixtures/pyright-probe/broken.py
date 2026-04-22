"""Deliberate type errors for probe T6 (diagnostics)."""

from __future__ import annotations


def add(a: int, b: int) -> int:
    return a + b


# Pyright should flag this: str not assignable to int.
WRONG = add("one", 2)


def needs_int(value: int) -> None:
    pass


# Missing type: should flag "Argument missing for parameter 'value'".
needs_int()
