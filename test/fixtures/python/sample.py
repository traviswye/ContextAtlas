"""Diverse Python fixture for Pyright probe.

Covers the cases ADR-13 needs to decide on:
- Classes (single + multiple inheritance)
- typing.Protocol
- abc.ABC
- Dataclasses, overloads
- @property, @classmethod, @staticmethod
- Type aliases in all three syntactic forms
- Nested classes, module-level constants
- Standalone functions
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Protocol, TypeAlias, overload, runtime_checkable


# ----- Type aliases (three forms) ----------------------------------------

# Form 1: bare assignment (implicit type alias)
UserIdV1 = str

# Form 2: PEP 613 explicit annotation
UserIdV2: TypeAlias = str

# Form 3: PEP 695 `type` statement (Python 3.12+)
# (Pyright supports this even on older runtimes via --pythonversion.)
type UserIdV3 = str


# ----- Base class ---------------------------------------------------------


class Shape:
    """Base class with single-inheritance descendants in this file and
    multi-file descendants in subclasses.py."""

    def area(self) -> float:
        raise NotImplementedError


class Polygon(Shape):
    def __init__(self, sides: int) -> None:
        self._sides = sides


class Triangle(Polygon):
    def __init__(self) -> None:
        super().__init__(3)


# ----- Multiple inheritance ----------------------------------------------


class Serializable:
    def to_json(self) -> str:
        return "{}"


class LoggingMixin:
    def log(self, message: str) -> None:
        print(message)


class Widget(Shape, Serializable, LoggingMixin):
    """Class with three base classes — probes multi-base extends parsing."""


# ----- Protocol and ABC --------------------------------------------------


@runtime_checkable
class Drawable(Protocol):
    """typing.Protocol — structural subtype; behaves like interface."""

    def draw(self) -> None:
        ...


class Renderable(ABC):
    """abc.ABC — nominal abstract class."""

    @abstractmethod
    def render(self) -> str:
        ...


class Canvas(Drawable, Renderable):
    """Implements Drawable protocol and extends Renderable ABC."""

    def draw(self) -> None:
        pass

    def render(self) -> str:
        return ""


# ----- Property / classmethod / staticmethod -----------------------------


class Counter:
    def __init__(self) -> None:
        self._count = 0

    @property
    def count(self) -> int:
        return self._count

    @count.setter
    def count(self, value: int) -> None:
        self._count = value

    @classmethod
    def zero(cls) -> "Counter":
        return cls()

    @staticmethod
    def is_zero(value: int) -> bool:
        return value == 0


# ----- Dataclass ----------------------------------------------------------


@dataclass
class Point:
    x: float
    y: float


# ----- Overloaded function -----------------------------------------------


@overload
def parse(value: int) -> int: ...
@overload
def parse(value: str) -> str: ...
def parse(value: int | str) -> int | str:
    """Three overload entries in source; probes how Pyright reports them
    in documentSymbol (one entry? three? labeled how?)."""
    return value


# ----- Nested class ------------------------------------------------------


class Outer:
    class Inner:
        def hello(self) -> str:
            return "inner"


# ----- Module-level constants + standalone function ----------------------


DEFAULT_RETRIES: int = 3


def greet(name: str) -> str:
    return f"Hello, {name}"
