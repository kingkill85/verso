import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAuthor, fetchAuthorMetadata } from "../services/openlibrary-authors.js";

describe("openlibrary-authors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchAuthor", () => {
    it("returns the first matching author key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          numFound: 1,
          docs: [{ key: "OL34184A", name: "Frank Herbert" }],
        }))
      );

      const result = await searchAuthor("Frank Herbert");
      expect(result).toBe("OL34184A");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("openlibrary.org/search/authors.json?q=Frank+Herbert")
      );
    });

    it("returns null when no results", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ numFound: 0, docs: [] }))
      );

      const result = await searchAuthor("Nonexistent Author");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));

      const result = await searchAuthor("Frank Herbert");
      expect(result).toBeNull();
    });
  });

  describe("fetchAuthorMetadata", () => {
    it("returns description and photo URL for a valid key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          name: "Frank Herbert",
          bio: "American science fiction author.",
          birth_date: "8 October 1920",
          photos: [12345],
        }))
      );

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result).not.toBeNull();
      expect(result!.description).toBe("American science fiction author.");
      expect(result!.birthDate).toBe("8 October 1920");
      expect(result!.photoUrl).toContain("covers.openlibrary.org/a/olid/OL34184A-M.jpg");
    });

    it("handles bio as object with value property", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          name: "Frank Herbert",
          bio: { type: "/type/text", value: "Author of Dune." },
          photos: [],
        }))
      );

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result!.description).toBe("Author of Dune.");
    });

    it("returns null on fetch error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("fail"));

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result).toBeNull();
    });
  });
});
