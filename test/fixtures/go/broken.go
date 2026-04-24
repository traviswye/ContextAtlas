// Deliberately broken fixture for diagnostics conformance testing.
// The anonymous function body below returns a value despite the
// function's signature declaring no return type — gopls surfaces
// this as a type error isolated to this file's analysis. Keeping
// the error inside an anonymous function body (assigned to the
// blank identifier `_`) isolates it from the rest of `package
// kinds` so other files' diagnostics stay clean — `go build` will
// fail at the package level but per-file diagnostics from gopls
// scope to the offending expression.

package kinds

var _ = func() {
	return "wrong"
}
