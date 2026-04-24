package kinds

// Consumer uses symbols from kinds.go — exercises cross-file
// references for the probe.

// NewSquare builds a Square from its component parts.
func NewSquare(w, h float64, corner string) *Square {
	r := NewRectangle(w, h)
	return &Square{
		Rectangle: *r,
		corner:    corner,
	}
}

// MakeIntStack demonstrates instantiation of a generic type.
func MakeIntStack() *Stack[int] {
	return &Stack[int]{}
}

// DoubleAll demonstrates calling a generic function with an inferred
// type parameter.
func DoubleAll(items []int) []int {
	return Map(items, func(x int) int { return x * 2 })
}

// UseRectangle exercises value-receiver method + field access.
func UseRectangle() float64 {
	r := NewRectangle(2, 3)
	_ = r.Perimeter()
	return r.Area()
}
