/**
 * Path normalization utilities for ContextAtlas.
 *
 * ADR-01 requires a single enforcement point for path normalization. Every
 * ingest boundary (LSP responses, config reads, atlas.json imports, disk
 * scans) MUST route paths through `normalizePath()` so that a file on
 * Windows and the same file on Linux produce byte-identical symbol IDs.
 *
 * Rules (applied in order):
 *   1. Strip `file://` scheme and URL-decode if present.
 *   2. Backslashes → forward slashes.
 *   3. Collapse repeated slashes, preserving a leading `//` for UNC paths.
 *   4. Strip leading `./`.
 *   5. Strip trailing `/` (unless the path is just `/`).
 *   6. Lowercase Windows drive letters (e.g. `C:/foo` → `c:/foo`).
 *
 * Rule 6 guards against team-level ID divergence when members run from
 * differently-cased drive mounts (`C:\projects\` vs `c:\projects\`) —
 * without it, atlas.json diffs would churn on every reindex across
 * machines, defeating ADR-06's reviewable-artifact property.
 */

export function normalizePath(input: string): string {
  if (input === "") {
    throw new Error(
      "normalizePath: received empty path. Callers must supply a non-empty path.",
    );
  }

  let path = input;

  if (path.startsWith("file://")) {
    path = path.slice("file://".length);
    try {
      path = decodeURIComponent(path);
    } catch {
      // Malformed percent-escapes — leave as-is rather than fail loudly.
    }
    // Decode *first*, then drop the leading `/` before a Windows drive
    // letter: tsserver emits `file:///c%3A/foo`, which becomes `/c:/foo`
    // only after decoding. Checking before decode would miss this case.
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
  }

  const isUnc = path.startsWith("\\\\") || path.startsWith("//");

  path = path.replace(/\\/g, "/");

  if (isUnc) {
    path = "//" + path.slice(2).replace(/\/+/g, "/");
  } else {
    path = path.replace(/\/+/g, "/");
  }

  if (path.startsWith("./")) {
    path = path.slice(2);
  }

  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  if (/^[A-Za-z]:\//.test(path)) {
    path = path[0]!.toLowerCase() + path.slice(1);
  }

  return path;
}

/**
 * Convert a normalized absolute path to a `file://` URI suitable for LSP.
 * Always accepts inputs in any form normalizePath handles.
 */
export function toFileUri(absPath: string): string {
  const normalized = normalizePath(absPath);
  const encoded = encodeURI(normalized);

  if (/^[a-z]:\//i.test(encoded)) {
    return `file:///${encoded}`;
  }
  if (encoded.startsWith("//")) {
    // UNC: `//server/share/foo` → `file://server/share/foo`
    return `file:${encoded}`;
  }
  return `file://${encoded}`;
}

/**
 * Compute a repo-relative path given an absolute path and a root.
 * Both inputs are normalized first. Throws if the path is not under the
 * root — caller intent is that the file belongs to the repo.
 */
export function toRelativePath(absPath: string, rootPath: string): string {
  const normalizedAbs = normalizePath(absPath);
  const normalizedRoot = normalizePath(rootPath);

  if (normalizedAbs === normalizedRoot) {
    return "";
  }

  const rootWithSep = normalizedRoot.endsWith("/")
    ? normalizedRoot
    : normalizedRoot + "/";

  if (!normalizedAbs.startsWith(rootWithSep)) {
    throw new Error(
      `toRelativePath: path '${absPath}' is not under root '${rootPath}' ` +
        `(normalized: '${normalizedAbs}' vs '${normalizedRoot}').`,
    );
  }

  return normalizedAbs.slice(rootWithSep.length);
}
