"""Cross-file subclasses of `sample.py` types.

Critical for probe T1: does `textDocument/implementation` on Shape /
Polygon / Renderable in sample.py return the subclass locations in
THIS file? If yes, TypeScriptAdapter's `usedByTypes` model ports
directly. If no, the inventory-walk fallback (O2 option-a) is required.
"""

from __future__ import annotations

from sample import Polygon, Renderable, Shape


class Circle(Shape):
    def __init__(self, radius: float) -> None:
        self._radius = radius

    def area(self) -> float:
        return 3.14 * self._radius * self._radius


class Rectangle(Polygon):
    def __init__(self, w: float, h: float) -> None:
        super().__init__(4)
        self._w = w
        self._h = h


class Report(Renderable):
    def render(self) -> str:
        return "Report"
