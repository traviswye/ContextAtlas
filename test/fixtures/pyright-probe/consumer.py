"""Reference sites for probe T2: findReferences coverage.

Uses a handful of symbols from sample.py so references-request results
on those symbols are non-empty.
"""

from sample import Counter, Point, Triangle, greet


def demo() -> None:
    counter = Counter.zero()
    counter.count = 5
    print(counter.count)

    point = Point(x=1.0, y=2.0)
    print(point.x, point.y)

    tri = Triangle()
    print(tri.area())

    print(greet("world"))
