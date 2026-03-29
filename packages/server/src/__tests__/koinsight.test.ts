import { describe, it, expect } from "vitest";
import {
  koinsightDeviceInput,
  koinsightImportInput,
} from "@verso/shared";

describe("koinsight validators", () => {
  it("validates device registration", () => {
    const result = koinsightDeviceInput.safeParse({
      version: "0.3.0",
      id: "kindle-001",
      model: "Kindle Paperwhite",
    });
    expect(result.success).toBe(true);
  });

  it("validates import input", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [{ md5: "abc123", title: "Book", authors: "Author", pages: 200 }],
      stats: [{ md5: "abc123", page: 1, start_time: 1700000000, duration: 60, total_pages: 200 }],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates import with annotations", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [],
      stats: [],
      annotations: {
        abc123: [
          { chapter: "Ch 1", text: "highlighted text", page: 5, type: "highlight" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
