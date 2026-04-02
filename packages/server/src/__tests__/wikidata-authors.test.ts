import { describe, it, expect, vi, afterEach } from "vitest";
import { searchWikidata, fetchWikipediaSummaries } from "../services/wikidata-authors.js";

describe("wikidata-authors", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  afterEach(() => {
    fetchSpy.mockReset();
  });

  describe("searchWikidata", () => {
    it("finds author via Wikipedia search (fuzzy matching)", async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = input.toString();

        // English Wikipedia search returns a page title
        if (url.includes("en.wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({
            query: { search: [{ title: "J. K. Rowling" }] },
          }));
        }

        // English Wikipedia page props returns Wikidata entity ID
        if (url.includes("en.wikipedia.org") && url.includes("prop=pageprops")) {
          return new Response(JSON.stringify({
            query: {
              pages: {
                "123": { pageprops: { wikibase_item: "Q34660" } },
              },
            },
          }));
        }

        // Wikidata entity details
        if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              Q34660: {
                sitelinks: {
                  enwiki: { title: "J. K. Rowling" },
                  dewiki: { title: "J. K. Rowling" },
                },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                  P569: [{ mainsnak: { datavalue: { value: { time: "+1965-07-31T00:00:00Z" } } } }],
                  P18: [{ mainsnak: { datavalue: { value: "J. K. Rowling 2010.jpg" } } }],
                },
              },
            },
          }));
        }

        return new Response("Not found", { status: 404 });
      });

      const result = await searchWikidata("J.K. Rowling");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q34660");
      expect(result!.birthDate).toBe("1965-07-31");
      expect(result!.deathDate).toBeNull();
      expect(result!.sitelinks.en).toBe("J. K. Rowling");
    });

    it("finds author via non-English Wikipedia when English has no match", async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = input.toString();

        // English Wikipedia search returns nothing
        if (url.includes("en.wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({ query: { search: [] } }));
        }

        // German Wikipedia search finds the author
        if (url.includes("de.wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({
            query: { search: [{ title: "Katja Gloger" }] },
          }));
        }

        // German Wikipedia page props
        if (url.includes("de.wikipedia.org") && url.includes("prop=pageprops")) {
          return new Response(JSON.stringify({
            query: {
              pages: {
                "456": { pageprops: { wikibase_item: "Q1735122" } },
              },
            },
          }));
        }

        // Wikidata entity details
        if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              Q1735122: {
                sitelinks: {
                  dewiki: { title: "Katja Gloger" },
                },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                  P569: [{ mainsnak: { datavalue: { value: { time: "+1960-01-01T00:00:00Z" } } } }],
                },
              },
            },
          }));
        }

        return new Response(JSON.stringify({ query: { search: [] } }));
      });

      const result = await searchWikidata("Katja Gloger");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q1735122");
      expect(result!.sitelinks.de).toBe("Katja Gloger");
    });

    it("skips title mismatches from full-text search results", async () => {
      // Simulates the Georg Mascolo case: English Wikipedia returns
      // "Abdallah bin Laden" because Mascolo is mentioned in the article body
      fetchSpy.mockImplementation(async (input) => {
        const url = input.toString();

        // English Wikipedia returns a wrong article (full-text match)
        if (url.includes("en.wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({
            query: { search: [{ title: "Abdallah bin Laden" }] },
          }));
        }

        // German Wikipedia returns the correct article
        if (url.includes("de.wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({
            query: { search: [{ title: "Georg Mascolo" }] },
          }));
        }

        // German Wikipedia page props
        if (url.includes("de.wikipedia.org") && url.includes("prop=pageprops")) {
          return new Response(JSON.stringify({
            query: {
              pages: {
                "101": { pageprops: { wikibase_item: "Q1515066" } },
              },
            },
          }));
        }

        // Wikidata entity details
        if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              Q1515066: {
                sitelinks: { dewiki: { title: "Georg Mascolo" } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                  P569: [{ mainsnak: { datavalue: { value: { time: "+1964-10-26T00:00:00Z" } } } }],
                },
              },
            },
          }));
        }

        return new Response(JSON.stringify({ query: { search: [] } }));
      });

      const result = await searchWikidata("Georg Mascolo");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q1515066");
      expect(result!.sitelinks.de).toBe("Georg Mascolo");
    });

    it("falls back to Wikidata search when all Wikipedias return nothing", async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = input.toString();

        // All Wikipedia searches return nothing
        if (url.includes("wikipedia.org") && url.includes("list=search")) {
          return new Response(JSON.stringify({ query: { search: [] } }));
        }

        // English Wikidata entity search finds it
        if (url.includes("wikidata.org") && url.includes("wbsearchentities") && url.includes("language=en")) {
          return new Response(JSON.stringify({
            search: [{ id: "Q42", label: "Douglas Adams" }],
          }));
        }

        // Wikidata entity details
        if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              Q42: {
                sitelinks: {
                  enwiki: { title: "Douglas Adams" },
                },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                  P569: [{ mainsnak: { datavalue: { value: { time: "+1952-03-11T00:00:00Z" } } } }],
                  P570: [{ mainsnak: { datavalue: { value: { time: "+2001-05-11T00:00:00Z" } } } }],
                },
              },
            },
          }));
        }

        return new Response(JSON.stringify({ search: [] }));
      });

      const result = await searchWikidata("Douglas Adams");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q42");
      expect(result!.birthDate).toBe("1952-03-11");
      expect(result!.deathDate).toBe("2001-05-11");
    });

    it("returns null when both strategies fail across all locales", async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = input.toString();

        if (url.includes("wikipedia.org")) {
          return new Response(JSON.stringify({ query: { search: [] } }));
        }
        if (url.includes("wikidata.org") && url.includes("wbsearchentities")) {
          return new Response(JSON.stringify({ search: [] }));
        }

        return new Response("Not found", { status: 404 });
      });

      const result = await searchWikidata("Nonexistent Author XYZ");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));

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
