/**
 * CRUD for the git signal tables (ADR-11).
 *
 * `git_commits` holds one row per commit. `git_file_commits` is the
 * file-pivoted index — derived on import from each commit's embedded
 * `files` array, re-exported by joining back on the commit.
 *
 * The public API follows the "full replace" discipline from ADR-11:
 * every extraction run clears the tables and re-inserts. No
 * incremental-merge path, no "append commits newer than SHA X" —
 * simpler and side-steps rewritten-history edge cases.
 */

import type { GitCommit } from "../extraction/git-extractor.js";

import type { DatabaseInstance } from "./db.js";

export interface StoredGitCommit {
  sha: string;
  date: string;
  message: string;
  authorEmail: string;
  files: string[];
}

/**
 * Atomically replace the git tables with the given commits. The files
 * array on each commit populates `git_file_commits` — the file-pivoted
 * index is derived, not stored on the atlas side.
 */
export function replaceGitCommits(
  db: DatabaseInstance,
  commits: readonly GitCommit[],
): void {
  const tx = db.transaction(() => {
    db.exec("DELETE FROM git_file_commits; DELETE FROM git_commits;");
    const insertCommit = db.prepare(
      "INSERT INTO git_commits (sha, date, message, author_email) " +
        "VALUES (?, ?, ?, ?)",
    );
    const insertFile = db.prepare(
      "INSERT OR IGNORE INTO git_file_commits (file_path, commit_sha) " +
        "VALUES (?, ?)",
    );
    for (const c of commits) {
      insertCommit.run(c.sha, c.date, c.message, c.authorEmail);
      for (const file of c.files) {
        insertFile.run(file, c.sha);
      }
    }
  });
  tx();
}

/**
 * List every stored commit, newest-first, with its files reconstructed
 * by joining `git_file_commits`. Used by atlas export.
 */
export function listAllGitCommits(db: DatabaseInstance): StoredGitCommit[] {
  const rows = db
    .prepare(
      "SELECT sha, date, message, author_email FROM git_commits " +
        "ORDER BY date DESC, sha ASC",
    )
    .all() as {
    sha: string;
    date: string;
    message: string;
    author_email: string;
  }[];

  const fileStmt = db.prepare(
    "SELECT file_path FROM git_file_commits " +
      "WHERE commit_sha = ? ORDER BY file_path ASC",
  );

  return rows.map((row) => {
    const files = (fileStmt.all(row.sha) as { file_path: string }[]).map(
      (r) => r.file_path,
    );
    return {
      sha: row.sha,
      date: row.date,
      message: row.message,
      authorEmail: row.author_email,
      files,
    };
  });
}

/**
 * Return the most recent `limit` commits that touched `filePath`,
 * newest-first. Used to populate the `git.recentCommits` bundle field.
 */
export function listCommitsForFile(
  db: DatabaseInstance,
  filePath: string,
  limit: number,
): StoredGitCommit[] {
  const rows = db
    .prepare(
      "SELECT c.sha, c.date, c.message, c.author_email " +
        "FROM git_file_commits gfc " +
        "JOIN git_commits c ON c.sha = gfc.commit_sha " +
        "WHERE gfc.file_path = ? " +
        "ORDER BY c.date DESC, c.sha ASC " +
        "LIMIT ?",
    )
    .all(filePath, limit) as {
    sha: string;
    date: string;
    message: string;
    author_email: string;
  }[];
  // `files` isn't needed for the bundle's recent-commits view — returning
  // empty arrays keeps the shape consistent without paying for the join.
  return rows.map((row) => ({
    sha: row.sha,
    date: row.date,
    message: row.message,
    authorEmail: row.author_email,
    files: [],
  }));
}

/**
 * Count how many commits in the stored window touched `filePath`.
 * Used to compute hot/cold against `config.git.recentCommits`.
 */
export function countCommitsForFile(
  db: DatabaseInstance,
  filePath: string,
): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM git_file_commits WHERE file_path = ?",
    )
    .get(filePath) as { n: number };
  return row.n;
}

export interface CoChangeResult {
  filePath: string;
  coCommitCount: number;
}

/**
 * Return files that share commits with `filePath`, ranked by shared
 * commit count descending. Self-join on `git_file_commits`:
 * commits that touched both files count as co-change events.
 *
 * Excludes `filePath` itself. Ties broken by file path alphabetical
 * for determinism.
 */
export function findCoChangeFiles(
  db: DatabaseInstance,
  filePath: string,
  limit: number,
): CoChangeResult[] {
  const rows = db
    .prepare(
      "SELECT gfc2.file_path AS other_file, COUNT(*) AS co_count " +
        "FROM git_file_commits gfc1 " +
        "JOIN git_file_commits gfc2 " +
        "  ON gfc1.commit_sha = gfc2.commit_sha " +
        " AND gfc1.file_path != gfc2.file_path " +
        "WHERE gfc1.file_path = ? " +
        "GROUP BY gfc2.file_path " +
        "ORDER BY co_count DESC, gfc2.file_path ASC " +
        "LIMIT ?",
    )
    .all(filePath, limit) as { other_file: string; co_count: number }[];
  return rows.map((r) => ({
    filePath: r.other_file,
    coCommitCount: r.co_count,
  }));
}

/** Used by pipeline tests / full resets. */
export function clearGitCommits(db: DatabaseInstance): void {
  db.exec("DELETE FROM git_file_commits; DELETE FROM git_commits;");
}
