// Package kinds is a contextatlas probe fixture covering Go-specific
// pathology the gopls-probe exercises (see scripts/gopls-probe.ts).
//
// Symbols here are intentionally varied: structs + methods with both
// receiver kinds, interfaces with embedding, generics, type aliases
// vs type definitions, iota const blocks, exported vs unexported.
package kinds

import (
	"fmt"
	"io"
)

// ---------------------------------------------------------------------------
// Package-level constants
// ---------------------------------------------------------------------------

// DefaultTimeout is an exported plain const.
const DefaultTimeout = 30

// maxRetries is unexported — case-sensitivity boundary.
const maxRetries = 3

// Const block with iota.
const (
	StatusReady = iota
	StatusRunning
	StatusDone
)

// ---------------------------------------------------------------------------
// Package-level variables
// ---------------------------------------------------------------------------

// Exported var, typed by an interface.
var DefaultRenderer Renderer = &ShapeRenderer{}

// Unexported var.
var logger io.Writer

// ---------------------------------------------------------------------------
// Type definition vs type alias
// ---------------------------------------------------------------------------

// UserID is a distinct type (type definition).
type UserID int64

// NodeID is a type alias (same underlying type).
type NodeID = UserID

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

// Shape is a simple interface.
type Shape interface {
	Area() float64
	Perimeter() float64
}

// Renderer embeds Shape — interface embedding pathology.
type Renderer interface {
	Shape
	Render() string
}

// ---------------------------------------------------------------------------
// Structs with methods
// ---------------------------------------------------------------------------

// Rectangle has exported and unexported fields.
type Rectangle struct {
	Width  float64
	Height float64
	name   string // unexported
}

// Square embeds Rectangle (anonymous field).
type Square struct {
	Rectangle
	corner string
}

// Area is a pointer-receiver method.
func (r *Rectangle) Area() float64 {
	return r.Width * r.Height
}

// Perimeter is a value-receiver method.
func (r Rectangle) Perimeter() float64 {
	return 2 * (r.Width + r.Height)
}

// Render uses the embedded Rectangle's fields.
func (s *Square) Render() string {
	return fmt.Sprintf("Square<%s>", s.name)
}

// ShapeRenderer implements the full Renderer interface.
type ShapeRenderer struct{}

func (sr *ShapeRenderer) Area() float64 {
	return 0
}

func (sr *ShapeRenderer) Perimeter() float64 {
	return 0
}

func (sr *ShapeRenderer) Render() string {
	return "generic"
}

// ---------------------------------------------------------------------------
// Generics (Go 1.18+)
// ---------------------------------------------------------------------------

// Stack is a generic type with a single type parameter.
type Stack[T any] struct {
	items []T
}

// Push is a method on a generic receiver.
func (s *Stack[T]) Push(item T) {
	s.items = append(s.items, item)
}

// Pop is a method on a generic receiver with a zero-value fallback.
func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	n := len(s.items) - 1
	item := s.items[n]
	s.items = s.items[:n]
	return item, true
}

// Map is a generic function with two type parameters.
func Map[T, U any](items []T, fn func(T) U) []U {
	out := make([]U, len(items))
	for i, it := range items {
		out[i] = fn(it)
	}
	return out
}

// Sum is a generic function with a union constraint.
func Sum[T int | float64](items []T) T {
	var total T
	for _, it := range items {
		total += it
	}
	return total
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

// NewRectangle is an exported constructor.
func NewRectangle(w, h float64) *Rectangle {
	return &Rectangle{Width: w, Height: h}
}

// normalize is unexported.
func normalize(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}
