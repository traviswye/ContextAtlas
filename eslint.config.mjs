// ESLint 9 flat config (v1.2 Phase 9). Until this file existed `npm run
// lint` stopped before linting anything: ESLint 9 needs eslint.config.*.
// Uses the @typescript-eslint packages already in devDependencies; no
// type-aware rules, so lint stays fast and needs no tsconfig project.
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  ...tsPlugin.configs["flat/recommended"].map((c) => ({
    ...c,
    files: ["src/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts"],
    rules: {
      // A leading underscore marks a deliberately unused binding (an
      // interface-required parameter, a destructured-away field).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];
