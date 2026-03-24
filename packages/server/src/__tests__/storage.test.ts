import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageService } from "../services/storage.js";
import type { Config } from "../config.js";

describe("StorageService", () => {
  let storage: StorageService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "verso-storage-test-"));
    storage = new StorageService({ STORAGE_PATH: tempDir } as Config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("put + get", () => {
    it("writes and reads back data", async () => {
      const data = Buffer.from("hello world");
      await storage.put("test/file.txt", data);
      const result = await storage.get("test/file.txt");
      expect(result.toString()).toBe("hello world");
    });

    it("creates nested directories", async () => {
      const data = Buffer.from("nested");
      await storage.put("a/b/c/deep.txt", data);
      const result = await storage.get("a/b/c/deep.txt");
      expect(result.toString()).toBe("nested");
    });
  });

  describe("exists", () => {
    it("returns true after put", async () => {
      await storage.put("file.txt", Buffer.from("x"));
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns false for missing file", async () => {
      expect(await storage.exists("nonexistent.txt")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes the file", async () => {
      await storage.put("file.txt", Buffer.from("x"));
      await storage.delete("file.txt");
      expect(await storage.exists("file.txt")).toBe(false);
    });

    it("does not throw for missing file", async () => {
      await expect(storage.delete("nonexistent.txt")).resolves.toBeUndefined();
    });
  });

  describe("size", () => {
    it("returns correct byte count", async () => {
      const data = Buffer.from("12345");
      await storage.put("file.txt", data);
      const size = await storage.size("file.txt");
      expect(size).toBe(5);
    });
  });

  describe("stream", () => {
    it("returns a readable stream", async () => {
      await storage.put("file.txt", Buffer.from("stream content"));
      const readable = storage.stream("file.txt");
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        chunks.push(chunk as Buffer);
      }
      expect(Buffer.concat(chunks).toString()).toBe("stream content");
    });
  });

  describe("fullPath", () => {
    it("returns the joined path", () => {
      const result = storage.fullPath("books/test.epub");
      expect(result).toBe(join(tempDir, "books/test.epub"));
    });
  });
});
