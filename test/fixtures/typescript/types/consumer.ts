import { Triangle, Square, Decal, Box, Widget } from "./shapes.js";

// Purely to pull the fixture symbols into tsserver's awareness; the
// getTypeInfo tests don't rely on this file for semantics, only for
// ensuring the shapes.ts symbols are reachable from within the project.
export function exerciseShapes(): void {
  const t = new Triangle();
  const s = new Square();
  const d = new Decal();
  const w = new Widget();
  const b = new Box<Widget>();
  b.items.push(w);
  t.draw();
  s.draw();
  d.print();
}
