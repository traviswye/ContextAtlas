// Package renderer holds cross-package implementers of interfaces
// declared in the parent `kinds` package. Used by the gopls-probe
// T1b cross-package implementation case.
package renderer

import "contextatlas/probe/fixtures/kinds"

// Circle is a cross-package implementer of kinds.Shape.
type Circle struct {
	Radius float64
}

func (c *Circle) Area() float64 {
	return 3.14159 * c.Radius * c.Radius
}

func (c *Circle) Perimeter() float64 {
	return 2 * 3.14159 * c.Radius
}

// Compile-time interface satisfaction check — if gopls cross-package
// resolution works, it can see this line and will list Circle as an
// implementer of kinds.Shape.
var _ kinds.Shape = (*Circle)(nil)

// FancyRenderer implements kinds.Renderer (Shape methods + Render).
type FancyRenderer struct {
	Label string
}

func (f *FancyRenderer) Area() float64 {
	return 0
}

func (f *FancyRenderer) Perimeter() float64 {
	return 0
}

func (f *FancyRenderer) Render() string {
	return "fancy: " + f.Label
}

var _ kinds.Renderer = (*FancyRenderer)(nil)
