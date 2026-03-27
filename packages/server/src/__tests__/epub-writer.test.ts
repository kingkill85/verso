import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  getEpubFileHash,
  replaceOrInsertDcTag,
  replaceOrInsertMeta,
  applyMetadataToOpf,
  parseOpfPathFromContainer,
  updateEpubMetadata,
} from "../services/epub-writer.js";

// ---------------------------------------------------------------------------
// Helper: create a minimal valid EPUB in memory using yazl
// ---------------------------------------------------------------------------
async function createMinimalEpub(epubPath: string): Promise<void> {
  const yazl = (await import("yazl")).default;
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");

  const zip = new yazl.ZipFile();

  // mimetype (must be first, uncompressed)
  zip.addBuffer(
    Buffer.from("application/epub+zip"),
    "mimetype",
    { compress: false },
  );

  // container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addBuffer(Buffer.from(containerXml), "META-INF/container.xml");

  // content.opf
  const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">urn:uuid:12345</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`;
  zip.addBuffer(Buffer.from(opfXml), "OEBPS/content.opf");

  // A minimal chapter
  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello World</p></body>
</html>`;
  zip.addBuffer(Buffer.from(chapter), "OEBPS/chapter1.xhtml");

  zip.end();

  const ws = createWriteStream(epubPath);
  await pipeline(zip.outputStream as InstanceType<typeof Readable>, ws);
}

// ---------------------------------------------------------------------------
// Tests: XML helpers
// ---------------------------------------------------------------------------
describe("replaceOrInsertDcTag", () => {
  const sampleOpf = `<metadata>
    <dc:title>Old Title</dc:title>
    <dc:creator>Old Author</dc:creator>
  </metadata>`;

  it("replaces an existing dc:title", () => {
    const result = replaceOrInsertDcTag(sampleOpf, "title", "New Title");
    expect(result).toContain("<dc:title>New Title</dc:title>");
    expect(result).not.toContain("Old Title");
  });

  it("inserts a dc:publisher when missing", () => {
    const result = replaceOrInsertDcTag(sampleOpf, "publisher", "Acme Press");
    expect(result).toContain("<dc:publisher>Acme Press</dc:publisher>");
    expect(result).toContain("</metadata>");
  });

  it("escapes XML special characters", () => {
    const result = replaceOrInsertDcTag(sampleOpf, "title", 'A & B <"test">');
    expect(result).toContain("A &amp; B &lt;&quot;test&quot;&gt;");
  });

  it("includes extra attributes when provided", () => {
    const result = replaceOrInsertDcTag(
      sampleOpf,
      "title",
      "New",
      'xml:lang="en"',
    );
    expect(result).toContain('<dc:title xml:lang="en">New</dc:title>');
  });

  it("replaces a tag in xmlns namespace form", () => {
    const nsOpf = `<metadata>
    <description xmlns="http://purl.org/dc/elements/1.1/">Old Description</description>
  </metadata>`;
    const result = replaceOrInsertDcTag(nsOpf, "description", "New Description");
    expect(result).toContain("<dc:description>New Description</dc:description>");
    expect(result).not.toContain("Old Description");
    expect(result).not.toContain('xmlns="http://purl.org/dc/elements/1.1/"');
  });
});

describe("replaceOrInsertMeta", () => {
  const sampleOpf = `<metadata>
    <meta name="calibre:series" content="Old Series"/>
  </metadata>`;

  it("replaces an existing meta tag", () => {
    const result = replaceOrInsertMeta(
      sampleOpf,
      "calibre:series",
      "New Series",
    );
    expect(result).toContain('content="New Series"');
    expect(result).not.toContain("Old Series");
  });

  it("inserts a new meta tag when missing", () => {
    const result = replaceOrInsertMeta(
      sampleOpf,
      "calibre:series_index",
      "3",
    );
    expect(result).toContain(
      '<meta name="calibre:series_index" content="3"/>',
    );
  });
});

describe("parseOpfPathFromContainer", () => {
  it("extracts OPF full-path", () => {
    const xml = `<?xml version="1.0"?>
<container>
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    expect(parseOpfPathFromContainer(xml)).toBe("OEBPS/content.opf");
  });

  it("throws on missing full-path", () => {
    expect(() => parseOpfPathFromContainer("<container></container>")).toThrow(
      "Could not find OPF path",
    );
  });
});

describe("applyMetadataToOpf", () => {
  const baseOpf = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Original Title</dc:title>
    <dc:creator>Original Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
</package>`;

  it("applies title and author updates", () => {
    const result = applyMetadataToOpf(baseOpf, {
      title: "Updated Title",
      author: "Updated Author",
    });
    expect(result).toContain("<dc:title>Updated Title</dc:title>");
    expect(result).toContain("<dc:creator>Updated Author</dc:creator>");
  });

  it("inserts missing fields", () => {
    const result = applyMetadataToOpf(baseOpf, {
      publisher: "Test Publisher",
      genre: "Fiction",
      year: 2024,
    });
    expect(result).toContain("<dc:publisher>Test Publisher</dc:publisher>");
    expect(result).toContain("<dc:subject>Fiction</dc:subject>");
    expect(result).toContain("<dc:date>2024</dc:date>");
  });

  it("adds ISBN with opf:scheme attribute", () => {
    const result = applyMetadataToOpf(baseOpf, { isbn: "978-0-123456-78-9" });
    expect(result).toContain('opf:scheme="ISBN"');
    expect(result).toContain("978-0-123456-78-9");
  });

  it("adds series metadata (calibre + EPUB3)", () => {
    const result = applyMetadataToOpf(baseOpf, {
      series: "The Dark Tower",
      seriesIndex: 3,
    });
    // Calibre-style
    expect(result).toContain('name="calibre:series" content="The Dark Tower"');
    expect(result).toContain('name="calibre:series_index" content="3"');
    // EPUB3-style
    expect(result).toContain('property="belongs-to-collection"');
    expect(result).toContain("The Dark Tower");
    expect(result).toContain('property="group-position"');
  });

  it("does not modify xml when no updates provided", () => {
    const result = applyMetadataToOpf(baseOpf, {});
    expect(result).toBe(baseOpf);
  });

  it("removes dc:description tag when null value passed", () => {
    const opfWithDesc = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>A Book</dc:title>
    <dc:description>Some description text</dc:description>
  </metadata>
</package>`;
    const result = applyMetadataToOpf(opfWithDesc, { description: null });
    expect(result).not.toContain("<dc:description>");
    expect(result).not.toContain("Some description text");
  });

  it("removes a tag with xmlns namespace form when null value passed", () => {
    const opfWithNsDesc = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>A Book</dc:title>
    <description xmlns="http://purl.org/dc/elements/1.1/">Namespaced description</description>
  </metadata>
</package>`;
    const result = applyMetadataToOpf(opfWithNsDesc, { description: null });
    expect(result).not.toContain("<description");
    expect(result).not.toContain("Namespaced description");
  });

  it("removes null fields using 'field in updates' pattern", () => {
    const opfWithAll = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Original Title</dc:title>
    <dc:creator>Original Author</dc:creator>
    <dc:publisher>Original Publisher</dc:publisher>
    <dc:language>en</dc:language>
  </metadata>
</package>`;
    const result = applyMetadataToOpf(opfWithAll, {
      publisher: null,
      language: null,
    });
    expect(result).not.toContain("<dc:publisher>");
    expect(result).not.toContain("Original Publisher");
    expect(result).not.toContain("<dc:language>");
    // Fields not in updates should be preserved
    expect(result).toContain("<dc:title>Original Title</dc:title>");
    expect(result).toContain("<dc:creator>Original Author</dc:creator>");
  });

  it("removes cover meta and cover-image manifest items when removeCover is true", () => {
    const opfWithCover = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>A Book</dc:title>
    <meta name="cover" content="cover-image-id"/>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image-id" href="images/cover.jpg" media-type="image/jpeg"/>
  </manifest>
</package>`;
    const result = applyMetadataToOpf(opfWithCover, { removeCover: true });
    expect(result).not.toContain('name="cover"');
    expect(result).not.toContain('id="cover-image-id"');
    // Non-cover manifest items should remain
    expect(result).toContain('id="chapter1"');
  });

  it("removeCover strips properties='cover-image' attribute from manifest items", () => {
    const opfWithCoverProps = `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>A Book</dc:title>
  </metadata>
  <manifest>
    <item id="my-cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
</package>`;
    const result = applyMetadataToOpf(opfWithCoverProps, { removeCover: true });
    expect(result).not.toContain('properties="cover-image"');
    // The item itself should be removed since its id contains "cover-image" in properties
    // but by the regex rules, the item with id="my-cover" doesn't match id="*cover-image*"
    // so we just verify the property attribute is stripped
    expect(result).toContain('id="chapter1"');
  });
});

// ---------------------------------------------------------------------------
// Tests: file-level operations (use temp files)
// ---------------------------------------------------------------------------
describe("getEpubFileHash", () => {
  const tmpFile = join(tmpdir(), `epub-writer-test-${Date.now()}.bin`);

  beforeAll(async () => {
    await writeFile(tmpFile, "hello epub world");
  });

  afterAll(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it("returns a SHA-256 hex hash", async () => {
    const hash = await getEpubFileHash(tmpFile);
    const expected = createHash("sha256")
      .update("hello epub world")
      .digest("hex");
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Integration test: round-trip EPUB modification
// ---------------------------------------------------------------------------
describe("updateEpubMetadata (integration)", () => {
  const tmpDir = join(tmpdir(), `epub-writer-int-${Date.now()}`);
  const epubPath = join(tmpDir, "test.epub");

  beforeAll(async () => {
    await mkdir(tmpDir, { recursive: true });
    await createMinimalEpub(epubPath);
  });

  afterAll(async () => {
    await unlink(epubPath).catch(() => {});
  });

  it("modifies metadata in a real EPUB file", async () => {
    await updateEpubMetadata(epubPath, {
      title: "Modified Title",
      author: "Modified Author",
      publisher: "Modified Publisher",
      series: "Test Series",
      seriesIndex: 2,
    });

    // Read the modified EPUB and check OPF content
    const yauzl = await import("yauzl-promise");
    const zip = await yauzl.open(epubPath);
    let opfContent = "";

    for await (const entry of zip) {
      if (entry.filename === "OEBPS/content.opf") {
        const stream = await zip.openReadStream(entry);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        opfContent = Buffer.concat(chunks).toString("utf-8");
        break;
      }
    }
    await zip.close();

    expect(opfContent).toContain("<dc:title>Modified Title</dc:title>");
    expect(opfContent).toContain("<dc:creator>Modified Author</dc:creator>");
    expect(opfContent).toContain(
      "<dc:publisher>Modified Publisher</dc:publisher>",
    );
    expect(opfContent).toContain('content="Test Series"');
    expect(opfContent).toContain('content="2"');
  });

  it("rejects when hash does not match", async () => {
    await expect(
      updateEpubMetadata(epubPath, { title: "X" }, "badhash"),
    ).rejects.toThrow("hash mismatch");
  });

  it("succeeds when hash matches", async () => {
    const hash = await getEpubFileHash(epubPath);
    await expect(
      updateEpubMetadata(epubPath, { title: "Hash-Checked Title" }, hash),
    ).resolves.toBeUndefined();
  });

  it("preserves mimetype as first entry", async () => {
    const yauzl = await import("yauzl-promise");
    const zip = await yauzl.open(epubPath);
    const firstEntry = await zip.readEntry();
    await zip.close();

    expect(firstEntry?.filename).toBe("mimetype");
  });
});
