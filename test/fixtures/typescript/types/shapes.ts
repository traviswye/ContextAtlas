// Interface with no parents — used for single-implements assertions.
export interface Drawable {
  draw(): void;
}

export interface Printable {
  print(): void;
}

// Interface extending multiple interfaces.
export interface Auditable extends Drawable, Printable {
  audit(): string;
}

// Abstract class using Drawable as a generic constraint — must NOT
// register as a parent of Shape. Implements Drawable separately.
export abstract class Shape<T extends Drawable> implements Drawable {
  abstract draw(): void;
  payload?: T;
}

// Concrete class combining extends + implements, one of each.
export class Polygon extends Shape<Drawable> implements Printable {
  draw(): void {}
  print(): void {}
}

// Multi-level subclass — Triangle extends Polygon, not Shape directly.
export class Triangle extends Polygon {
  override draw(): void {}
}

// Sibling subclass.
export class Square extends Polygon {
  override draw(): void {}
}

// Multiple implements in a single class (clean case, no extends).
export class Decal implements Printable, Drawable {
  print(): void {}
  draw(): void {}
}

// Interface with no relationships.
export interface StandaloneMarker {
  readonly marker: true;
}

// ----- Isolated generic-constraint regression case --------------------
// Box should register zero extends and zero implements. Without proper
// generic-bracket stripping, Widget would leak into Box.extends.

export class Widget {
  value: string = "";
}

export class Box<T extends Widget> {
  items: T[] = [];
}
