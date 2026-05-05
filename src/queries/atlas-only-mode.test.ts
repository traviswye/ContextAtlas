import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { detectAtlasOnlyAvailable } from "./atlas-only-mode.js";

describe("detectAtlasOnlyAvailable", () => {
  let tmpDir: string;
  let atlasPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "a4-atlas-test-"));
    atlasPath = path.join(tmpDir, "atlas.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns extracted_at_sha when atlas.json exists + SHA matches HEAD", async () => {
    const headSha = "a".repeat(40);
    await writeFile(
      atlasPath,
      JSON.stringify({ extracted_at_sha: headSha }),
      "utf8",
    );

    const result = await detectAtlasOnlyAvailable(atlasPath, headSha);
    expect(result).toBe(headSha);
  });

  it("returns null when atlas.json absent", async () => {
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "a".repeat(40),
    );
    expect(result).toBeNull();
  });

  it("returns null when atlas.json not valid JSON", async () => {
    await writeFile(atlasPath, "not json", "utf8");
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "a".repeat(40),
    );
    expect(result).toBeNull();
  });

  it("returns null when extracted_at_sha missing from atlas.json", async () => {
    await writeFile(
      atlasPath,
      JSON.stringify({ version: "1.3" }),
      "utf8",
    );
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "a".repeat(40),
    );
    expect(result).toBeNull();
  });

  it("returns null when extracted_at_sha is empty string", async () => {
    await writeFile(
      atlasPath,
      JSON.stringify({ extracted_at_sha: "" }),
      "utf8",
    );
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "a".repeat(40),
    );
    expect(result).toBeNull();
  });

  it("returns null when extracted_at_sha is non-string", async () => {
    await writeFile(
      atlasPath,
      JSON.stringify({ extracted_at_sha: 12345 }),
      "utf8",
    );
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "a".repeat(40),
    );
    expect(result).toBeNull();
  });

  it("returns null when extracted_at_sha mismatches headSha", async () => {
    await writeFile(
      atlasPath,
      JSON.stringify({ extracted_at_sha: "a".repeat(40) }),
      "utf8",
    );
    const result = await detectAtlasOnlyAvailable(
      atlasPath,
      "b".repeat(40),
    );
    expect(result).toBeNull();
  });
});
