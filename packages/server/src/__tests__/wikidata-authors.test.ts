import { describe, it, expect, vi, afterEach } from "vitest";
import { searchWikidata, fetchWikipediaSummaries } from "../services/wikidata-authors.js";

describe("wikidata-authors", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  afterEach(() => {
    fetchSpy.mockReset();
  });

  describe("searchWikidata", () => {
    it("finds author via Wikipedia search (fuzzy matching)", async () => {
      // Wikipedia search returns a page title
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          query: { search: [{ title: "J. K. Rowling" }] },
        }))
      );

      // Wikipedia page props returns Wikidata entity ID
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          query: {
            pages: {
              "123": { pageprops: { wikibase_item: "Q34660" } },
            },
          },
        }))
      );

      // Wikidata entity details
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          entities: {
            Q34660: {
              sitelinks: {
                enwiki: { title: "J. K. Rowling" },
                dewiki: { title: "J. K. Rowling" },
              },
              claims: {
                P569: [{ mainsnak: { datavalue: { value: { time: "+1965-07-31T00:00:00Z" } } } }],
                P18: [{ mainsnak: { datavalue: { value: "J. K. Rowling 2010.jpg" } } }],
              },
            },
          },
        }))
      );

      const result = await searchWikidata("J.K. Rowling");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q34660");
      expect(result!.birthDate).toBe("1965-07-31");
      expect(result!.deathDate).toBeNull();
      expect(result!.sitelinks.en).toBe("J. K. Rowling");
    });

    it("falls back to Wikidata search when Wikipedia returns nothing", async () => {
      // Wikipedia search returns no results
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ query: { search: [] } }))
      );

      // Wikidata entity search
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          search: [{ id: "Q42", label: "Douglas Adams" }],
        }))
      );

      // Wikidata entity details
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          entities: {
            Q42: {
              sitelinks: {
                enwiki: { title: "Douglas Adams" },
              },
              claims: {
                P569: [{ mainsnak: { datavalue: { value: { time: "+1952-03-11T00:00:00Z" } } } }],
                P570: [{ mainsnak: { datavalue: { value: { time: "+2001-05-11T00:00:00Z" } } } }],
              },
            },
          },
        }))
      );

      const result = await searchWikidata("Douglas Adams");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q42");
      expect(result!.birthDate).toBe("1952-03-11");
      expect(result!.deathDate).toBe("2001-05-11");
    });

    it("returns null when both strategies fail", async () => {
      // Wikipedia search fails
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ query: { search: [] } }))
      );

      // Wikidata search also fails
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ search: [] }))
      );

      const result = await searchWikidata("Nonexistent Author XYZ");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));
      // Wikidata fallback also errors
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));

      const result = await searchWikidata("Douglas Adams");
      expect(result).toBeNull();
    });
  });

  describe("fetchWikipediaSummaries", () => {
    it("fetches summaries for available locales", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          extract: "Douglas Adams was an English author.",
        }))
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          extract: "Douglas Adams war ein englischer Schriftsteller.",
        }))
      );

      const sitelinks = { en: "Douglas Adams", de: "Douglas Adams" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.locale === "en")?.description).toBe(
        "Douglas Adams was an English author."
      );
      expect(result.find((r) => r.locale === "de")?.description).toBe(
        "Douglas Adams war ein englischer Schriftsteller."
      );
    });

    it("cleans IPA pronunciation and honorary titles from extracts", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          extract: 'Joanne K. Rowling [ˌd͡ʒəʊˈæn ˈkeɪ ˈrəʊlɪŋ], CH, OBE ist eine britische Schriftstellerin.',
        }))
      );

      const sitelinks = { de: "J. K. Rowling" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe(
        "Joanne K. Rowling ist eine britische Schriftstellerin."
      );
    });

    it("skips locales that return errors", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ extract: "English bio." }))
      );
      fetchSpy.mockResolvedValueOnce(
        new Response("Not found", { status: 404 })
      );

      const sitelinks = { en: "Douglas Adams", de: "Nonexistent" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(1);
      expect(result[0].locale).toBe("en");
    });

    it("returns empty array when all fetches fail", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));

      const sitelinks = { en: "Test" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(0);
    });
  });
});
