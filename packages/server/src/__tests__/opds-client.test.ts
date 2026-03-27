import { describe, it, expect } from "vitest";
import { parseOpdsCatalog } from "../services/opds-client.js";

const NAVIGATION_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Test Library</title>
  <entry>
    <title>Popular</title>
    <link rel="subsection" href="/opds/popular" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">Most popular books</content>
  </entry>
  <entry>
    <title>Recent</title>
    <link rel="subsection" href="/opds/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">Recently added</content>
  </entry>
</feed>`;

const ACQUISITION_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>All Books</title>
  <entry>
    <id>book-1</id>
    <title>Dune</title>
    <author><name>Frank Herbert</name></author>
    <summary>A science fiction masterpiece</summary>
    <link rel="http://opds-spec.org/acquisition" href="/download/book-1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/image" href="/covers/book-1.jpg" type="image/jpeg"/>
  </entry>
  <entry>
    <id>book-2</id>
    <title>Neuromancer</title>
    <author><name>William Gibson</name></author>
    <link rel="http://opds-spec.org/acquisition" href="/download/book-2.epub" type="application/epub+zip"/>
  </entry>
  <link rel="next" href="/opds/all?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
</feed>`;

describe("OPDS client", () => {
  describe("parseOpdsCatalog", () => {
    it("parses navigation feed into navigation entries", () => {
      const result = parseOpdsCatalog(NAVIGATION_FEED);
      expect(result.type).toBe("navigation");
      expect(result.title).toBe("Test Library");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toEqual({
        title: "Popular",
        href: "/opds/popular",
        description: "Most popular books",
      });
    });

    it("parses acquisition feed into book entries", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.type).toBe("acquisition");
      expect(result.entries).toHaveLength(2);

      const dune = result.entries[0];
      expect(dune.id).toBe("book-1");
      expect(dune.title).toBe("Dune");
      expect(dune.author).toBe("Frank Herbert");
      expect(dune.summary).toBe("A science fiction masterpiece");
      expect(dune.acquisitionUrl).toBe("/download/book-1.epub");
      expect(dune.coverUrl).toBe("/covers/book-1.jpg");
      expect(dune.format).toBe("epub");
    });

    it("extracts next page link", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.nextUrl).toBe("/opds/all?page=2");
    });

    it("handles entry without cover", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.entries[1].coverUrl).toBeUndefined();
    });
  });
});
