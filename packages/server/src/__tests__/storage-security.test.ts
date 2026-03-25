import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageService } from "../services/storage.js";
import type { Config } from "../config.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("StorageService security", () => {
  let storage: StorageService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "verso-test-"));
    storage = new StorageService({ STORAGE_PATH: tempDir } as Config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("rejects path traversal via ../", async () => {
    await expect(storage.put("../../etc/passwd", Buffer.from("x"))).rejects.toThrow(
      "Path traversal detected"
    );
  });

  it("rejects path traversal via get", async () => {
    await expect(storage.get("../../../etc/hosts")).rejects.toThrow(
      "Path traversal detected"
    );
  });

  it("rejects absolute paths", async () => {
    await expect(storage.get("/etc/passwd")).rejects.toThrow(
      "Path traversal detected"
    );
  });

  it("allows normal nested paths", async () => {
    await storage.put("books/abc/book.epub", Buffer.from("test"));
    const data = await storage.get("books/abc/book.epub");
    expect(data.toString()).toBe("test");
  });
});
