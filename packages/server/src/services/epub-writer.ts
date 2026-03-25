import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl-promise";
import yazl from "yazl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EpubMetadataUpdate = {
  title?: string;
  author?: string;
  description?: string;
  publisher?: string;
  isbn?: string;
  year?: number;
  language?: string;
  genre?: string;
  series?: string;
  seriesIndex?: number;
  coverImageBuffer?: Buffer;
  coverMimeType?: string;
};

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

export async function getEpubFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// OPF XML helpers  (string / regex based – intentionally simple)
// ---------------------------------------------------------------------------

/**
 * Replace an existing `<dc:tag>…</dc:tag>` or insert one before `</metadata>`.
 */
export function replaceOrInsertDcTag(
  xml: string,
  tag: string,
  value: string,
  attrs?: string,
): string {
  // Escape value for XML
  const escaped = escapeXml(value);
  const attrStr = attrs ? ` ${attrs}` : "";

  // Match existing tag – greedy across attributes
  const re = new RegExp(
    `<dc:${tag}[^>]*>[\\s\\S]*?</dc:${tag}>`,
    "i",
  );

  if (re.test(xml)) {
    return xml.replace(re, `<dc:${tag}${attrStr}>${escaped}</dc:${tag}>`);
  }

  // Insert before </metadata>
  return xml.replace(
    /<\/metadata>/i,
    `    <dc:${tag}${attrStr}>${escaped}</dc:${tag}>\n  </metadata>`,
  );
}

/**
 * Replace an existing `<meta name="…" content="…"/>` or insert one.
 */
export function replaceOrInsertMeta(
  xml: string,
  name: string,
  content: string,
): string {
  const escaped = escapeXml(content);

  // Match: <meta name="calibre:series" content="..."/> (self-closing or not)
  const re = new RegExp(
    `<meta\\s+name="${escapeRegex(name)}"\\s+content="[^"]*"\\s*/>`,
    "i",
  );

  const replacement = `<meta name="${name}" content="${escaped}"/>`;

  if (re.test(xml)) {
    return xml.replace(re, replacement);
  }

  return xml.replace(
    /<\/metadata>/i,
    `    ${replacement}\n  </metadata>`,
  );
}

/**
 * Remove a `<meta name="…" …/>` tag entirely.
 */
function removeMeta(xml: string, name: string): string {
  const re = new RegExp(
    `\\s*<meta\\s+name="${escapeRegex(name)}"\\s+content="[^"]*"\\s*/>`,
    "gi",
  );
  return xml.replace(re, "");
}

/**
 * Handle EPUB3 `belongs-to-collection` for series info.
 * This uses `<meta property="…">` style rather than `name/content`.
 */
function setEpub3Series(xml: string, series: string, index?: number): string {
  // Remove any existing belongs-to-collection block
  let result = xml.replace(
    /\s*<meta\s+property="belongs-to-collection"[^>]*>[^<]*<\/meta>/gi,
    "",
  );
  result = result.replace(
    /\s*<meta\s+property="collection-type"[^>]*>[^<]*<\/meta>/gi,
    "",
  );
  result = result.replace(
    /\s*<meta\s+property="group-position"[^>]*>[^<]*<\/meta>/gi,
    "",
  );

  if (!series) return result;

  const escaped = escapeXml(series);
  let block = `    <meta property="belongs-to-collection" id="series-id">${escaped}</meta>\n`;
  block += `    <meta property="collection-type" refines="#series-id">series</meta>\n`;
  if (index != null) {
    block += `    <meta property="group-position" refines="#series-id">${index}</meta>\n`;
  }

  return result.replace(/<\/metadata>/i, `${block}  </metadata>`);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Apply metadata updates to OPF XML
// ---------------------------------------------------------------------------

export function applyMetadataToOpf(
  opfXml: string,
  updates: EpubMetadataUpdate,
): string {
  let xml = opfXml;

  if (updates.title != null) {
    xml = replaceOrInsertDcTag(xml, "title", updates.title);
  }
  if (updates.author != null) {
    xml = replaceOrInsertDcTag(xml, "creator", updates.author);
  }
  if (updates.description != null) {
    xml = replaceOrInsertDcTag(xml, "description", updates.description);
  }
  if (updates.publisher != null) {
    xml = replaceOrInsertDcTag(xml, "publisher", updates.publisher);
  }
  if (updates.language != null) {
    xml = replaceOrInsertDcTag(xml, "language", updates.language);
  }
  if (updates.year != null) {
    xml = replaceOrInsertDcTag(xml, "date", String(updates.year));
  }
  if (updates.genre != null) {
    xml = replaceOrInsertDcTag(xml, "subject", updates.genre);
  }
  if (updates.isbn != null) {
    // Try to replace existing ISBN identifier first
    const isbnRe =
      /<dc:identifier[^>]*opf:scheme="ISBN"[^>]*>[^<]*<\/dc:identifier>/i;
    if (isbnRe.test(xml)) {
      xml = xml.replace(
        isbnRe,
        `<dc:identifier opf:scheme="ISBN">${escapeXml(updates.isbn)}</dc:identifier>`,
      );
    } else {
      // Insert a new ISBN identifier
      xml = xml.replace(
        /<\/metadata>/i,
        `    <dc:identifier opf:scheme="ISBN">${escapeXml(updates.isbn)}</dc:identifier>\n  </metadata>`,
      );
    }
  }

  // Series: Calibre-style meta tags
  if (updates.series != null) {
    if (updates.series) {
      xml = replaceOrInsertMeta(xml, "calibre:series", updates.series);
      xml = replaceOrInsertMeta(
        xml,
        "calibre:series_index",
        String(updates.seriesIndex ?? 1),
      );
    } else {
      // Empty series → remove
      xml = removeMeta(xml, "calibre:series");
      xml = removeMeta(xml, "calibre:series_index");
    }
    // EPUB3-style series
    xml = setEpub3Series(xml, updates.series, updates.seriesIndex);
  } else if (updates.seriesIndex != null) {
    // Update index only if series meta already exists
    const seriesRe =
      /<meta\s+name="calibre:series"\s+content="[^"]*"\s*\/>/i;
    if (seriesRe.test(xml)) {
      xml = replaceOrInsertMeta(
        xml,
        "calibre:series_index",
        String(updates.seriesIndex),
      );
    }
  }

  return xml;
}

// ---------------------------------------------------------------------------
// Find OPF path from container.xml
// ---------------------------------------------------------------------------

export function parseOpfPathFromContainer(containerXml: string): string {
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match) {
    throw new Error("Could not find OPF path in container.xml");
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Find cover image href from OPF
// ---------------------------------------------------------------------------

function findCoverImageHref(
  opfXml: string,
  opfDir: string,
): string | undefined {
  // Strategy 1: <meta name="cover" content="cover-image-id"/>
  const metaMatch = opfXml.match(
    /<meta\s+name="cover"\s+content="([^"]+)"\s*\/?>/i,
  );
  if (metaMatch) {
    const coverId = metaMatch[1];
    // Find manifest item with that id
    const itemRe = new RegExp(
      `<item[^>]+id="${escapeRegex(coverId)}"[^>]+href="([^"]+)"`,
      "i",
    );
    const itemMatch = opfXml.match(itemRe);
    if (itemMatch) {
      return opfDir ? `${opfDir}/${itemMatch[1]}` : itemMatch[1];
    }
  }

  // Strategy 2: <item properties="cover-image" …/>
  const propsMatch = opfXml.match(
    /<item[^>]+properties="[^"]*cover-image[^"]*"[^>]+href="([^"]+)"/i,
  );
  if (propsMatch) {
    return opfDir ? `${opfDir}/${propsMatch[1]}` : propsMatch[1];
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Read a full entry into a buffer
// ---------------------------------------------------------------------------

async function readEntryBuffer(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Buffer> {
  const stream = await zipFile.openReadStream(entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Main: update EPUB metadata
// ---------------------------------------------------------------------------

export async function updateEpubMetadata(
  filePath: string,
  updates: EpubMetadataUpdate,
  expectedHash?: string,
): Promise<void> {
  // 1. Safety check
  if (expectedHash) {
    const currentHash = await getEpubFileHash(filePath);
    if (currentHash !== expectedHash) {
      throw new Error(
        `EPUB file hash mismatch. Expected ${expectedHash}, got ${currentHash}. ` +
          "The file may have been modified since it was last read.",
      );
    }
  }

  // 2. Open the EPUB
  const zipFile = await yauzl.open(filePath);

  try {
    // 3. Read container.xml to find OPF path
    // First pass: collect all entries so we can read them by name
    const entries: yauzl.Entry[] = [];
    for await (const entry of zipFile) {
      entries.push(entry);
    }

    // Find container.xml
    const containerEntry = entries.find(
      (e) => e.filename === "META-INF/container.xml",
    );
    if (!containerEntry) {
      throw new Error("Invalid EPUB: missing META-INF/container.xml");
    }

    const containerBuf = await readEntryBuffer(zipFile, containerEntry);
    const opfPath = parseOpfPathFromContainer(containerBuf.toString("utf-8"));

    const opfDir = opfPath.includes("/")
      ? opfPath.substring(0, opfPath.lastIndexOf("/"))
      : "";

    // Read OPF to find cover image path
    const opfEntry = entries.find((e) => e.filename === opfPath);
    if (!opfEntry) {
      throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
    }

    const opfBuf = await readEntryBuffer(zipFile, opfEntry);
    const originalOpf = opfBuf.toString("utf-8");

    const coverPath =
      updates.coverImageBuffer
        ? findCoverImageHref(originalOpf, opfDir)
        : undefined;

    // 4. Modify OPF
    const modifiedOpf = applyMetadataToOpf(originalOpf, updates);

    // 5. Rebuild ZIP
    const newZip = new yazl.ZipFile();
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    for (const entry of entries) {
      const isMimetype = entry.filename === "mimetype";
      const isOpf = entry.filename === opfPath;
      const isCover = coverPath && entry.filename === coverPath;

      const options: Partial<yazl.Options> = {
        // mimetype must be stored uncompressed per EPUB spec
        compress: isMimetype ? false : entry.isCompressed(),
        mtime: entry.getLastMod(),
      };

      if (isOpf) {
        newZip.addBuffer(Buffer.from(modifiedOpf, "utf-8"), entry.filename, options);
      } else if (isCover && updates.coverImageBuffer) {
        newZip.addBuffer(updates.coverImageBuffer, entry.filename, options);
      } else {
        // Copy unchanged
        const buf = await readEntryBuffer(zipFile, entry);
        newZip.addBuffer(buf, entry.filename, options);
      }
    }

    newZip.end();

    // Write to temp file
    const writeStream = createWriteStream(tempPath);
    await pipeline(newZip.outputStream as Readable, writeStream);

    // 6. Atomic replace
    await unlink(filePath);
    await rename(tempPath, filePath);
  } finally {
    await zipFile.close();
  }
}
