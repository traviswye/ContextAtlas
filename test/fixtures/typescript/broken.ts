// Deliberately broken fixture for diagnostics testing.
// Assigns a number to a string — tsserver should report a type error.
export const wrong: string = 42 as unknown as number as unknown as string;
export const alsoWrong: number = "not a number" as unknown as string as unknown as number;
// Reference an undefined symbol to force a diagnostic.
export const ref = nonExistentSymbol;
