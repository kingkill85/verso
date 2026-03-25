import { describe, it, expect } from "vitest";
import {
  stripHtml,
  extractYear,
  extractIsbn,
  extractSeries,
  type ParsedMetadata,
} from "../services/epub-parser.js";

describe("epub-parser utilities", () => {
  describe("stripHtml", () => {
    it("removes HTML tags", () => {
      expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    it("decodes HTML entities", () => {
      expect(stripHtml("Tom &amp; Jerry &lt;3&gt;")).toBe("Tom & Jerry <3>");
    });

    it("handles &nbsp; and collapses whitespace", () => {
      expect(stripHtml("Hello&nbsp;&nbsp;world")).toBe("Hello world");
    });

    it("returns empty string for empty input", () => {
      expect(stripHtml("")).toBe("");
    });

    it("handles plain text without tags", () => {
      expect(stripHtml("Just a plain description")).toBe(
        "Just a plain description"
      );
    });

    it("decodes &quot; and &#39;", () => {
      expect(stripHtml("&quot;Hello&#39;s&quot;")).toBe(`"Hello's"`);
    });
  });

  describe("extractYear", () => {
    it("parses ISO date string", () => {
      expect(extractYear("2023-05-15")).toBe(2023);
    });

    it("parses plain 4-digit year", () => {
      expect(extractYear("1925")).toBe(1925);
    });

    it("parses year from partial date", () => {
      expect(extractYear("circa 1984")).toBe(1984);
    });

    it("returns undefined for empty string", () => {
      expect(extractYear("")).toBeUndefined();
    });

    it("returns undefined for nonsense", () => {
      expect(extractYear("not a date")).toBeUndefined();
    });

    it("handles ISO date with time", () => {
      expect(extractYear("2020-01-01T00:00:00Z")).toBe(2020);
    });
  });

  describe("extractIsbn", () => {
    it("returns ISBN from direct field", () => {
      expect(extractIsbn({ ISBN: "9780123456789" })).toBe("9780123456789");
    });

    it("finds ISBN-13 in string values", () => {
      expect(
        extractIsbn({ identifier: "urn:isbn:9780123456789" })
      ).toBe("9780123456789");
    });

    it("finds ISBN-10 in string values", () => {
      expect(extractIsbn({ identifier: "ISBN: 0-123-45678-9" })).toBe(
        "0123456789"
      );
    });

    it("returns undefined when no ISBN present", () => {
      expect(extractIsbn({ title: "A Book" })).toBeUndefined();
    });

    it("prefers direct ISBN field over scanned values", () => {
      expect(
        extractIsbn({ ISBN: "1111111111111", other: "9780123456789" })
      ).toBe("1111111111111");
    });

    it("trims whitespace from ISBN", () => {
      expect(extractIsbn({ ISBN: "  9780123456789  " })).toBe("9780123456789");
    });
  });

  describe("extractSeries", () => {
    it("extracts calibre series", () => {
      const result = extractSeries({
        "calibre:series": "The Lord of the Rings",
        "calibre:series_index": "2",
      });
      expect(result.series).toBe("The Lord of the Rings");
      expect(result.seriesIndex).toBe(2);
    });

    it("extracts from metadata.series (epub2 shorthand)", () => {
      const result = extractSeries({
        series: "Discworld",
        "calibre:series_index": "5",
      });
      expect(result.series).toBe("Discworld");
      expect(result.seriesIndex).toBe(5);
    });

    it("extracts EPUB3 belongs-to-collection", () => {
      const result = extractSeries({
        "belongs-to-collection": "Harry Potter",
        "group-position": "3",
      });
      expect(result.series).toBe("Harry Potter");
      expect(result.seriesIndex).toBe(3);
    });

    it("prefers calibre over EPUB3", () => {
      const result = extractSeries({
        "calibre:series": "Calibre Series",
        "calibre:series_index": "1",
        "belongs-to-collection": "EPUB3 Series",
        "group-position": "2",
      });
      expect(result.series).toBe("Calibre Series");
      expect(result.seriesIndex).toBe(1);
    });

    it("returns empty when no series data", () => {
      const result = extractSeries({ title: "Standalone Book" });
      expect(result.series).toBeUndefined();
      expect(result.seriesIndex).toBeUndefined();
    });

    it("handles fractional series index", () => {
      const result = extractSeries({
        "calibre:series": "Series",
        "calibre:series_index": "1.5",
      });
      expect(result.seriesIndex).toBe(1.5);
    });

    it("ignores empty series strings", () => {
      const result = extractSeries({
        "calibre:series": "  ",
      });
      expect(result.series).toBeUndefined();
    });
  });

  describe("ParsedMetadata type", () => {
    it("includes series and seriesIndex fields", () => {
      const metadata: ParsedMetadata = {
        title: "Test Book",
        author: "Test Author",
        series: "Test Series",
        seriesIndex: 1,
      };
      expect(metadata.series).toBe("Test Series");
      expect(metadata.seriesIndex).toBe(1);
    });

    it("series fields are optional", () => {
      const metadata: ParsedMetadata = {
        title: "Test Book",
        author: "Test Author",
      };
      expect(metadata.series).toBeUndefined();
      expect(metadata.seriesIndex).toBeUndefined();
    });
  });
});
