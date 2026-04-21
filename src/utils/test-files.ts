/**
 * Test-file detection by filename pattern. Single source of truth so
 * bundles, impact analysis, and any future test-bucketing logic agree
 * on what counts as a test file.
 *
 * MVP patterns (per CLAUDE.md's test-file convention note):
 *   TypeScript: *.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx
 *   Python:     test_*.py, *_test.py
 *   Any language: anything whose path contains a `/tests/` segment
 *
 * Adapter-reported signals (tsserver's isTestFile, etc.) are more
 * authoritative but are not exposed through the current adapter
 * interface; adding that is a post-MVP refinement if benchmarks show
 * filename matching misclassifies.
 */

const TYPESCRIPT_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const PYTHON_TEST_FILE_PREFIX = /(^|\/)test_[^/]*\.py$/i;
const PYTHON_TEST_FILE_SUFFIX = /_test\.py$/i;
const TESTS_DIR_SEGMENT = /(^|\/)tests\//i;

export function isTestFile(path: string): boolean {
  if (!path) return false;
  // Normalize backslashes so the Windows case works without every caller
  // remembering to pre-normalize.
  const p = path.replace(/\\/g, "/");

  if (TESTS_DIR_SEGMENT.test(p)) return true;
  if (TYPESCRIPT_TEST_FILE.test(p)) return true;
  if (PYTHON_TEST_FILE_PREFIX.test(p)) return true;
  if (PYTHON_TEST_FILE_SUFFIX.test(p)) return true;

  return false;
}
