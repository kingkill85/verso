import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl-promise";
import yazl from "yazl";
import { EPub } from "epub2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EpubMetadataUpdate = {
  title?: string | null;
  author?: string | null;
  description?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  year?: number | null;
  language?: string | null;
  genre?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
  coverImageBuffer?: Buffer;
  coverMimeType?: string;
  removeCover?: boolean;
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

  // Match dc:tag OR tag with dc namespace attribute
  const rePrefixed = new RegExp(
    `<dc:${tag}[^>]*>[\\s\\S]*?</dc:${tag}>`,
    "i",
  );
  const reNs = new RegExp(
    `<${tag}\\s+xmlns="http://purl\\.org/dc/elements/1\\.1/"[^>]*>[\\s\\S]*?</${tag}>`,
    "i",
  );

  if (rePrefixed.test(xml)) {
    return xml.replace(rePrefixed, `<dc:${tag}${attrStr}>${escaped}</dc:${tag}>`);
  }
  if (reNs.test(xml)) {
    return xml.replace(reNs, `<dc:${tag}${attrStr}>${escaped}</dc:${tag}>`);
  }

  // Insert before </metadata>
  return xml.replace(
    /<\/metadata>/i,
    `    <dc:${tag}${attrStr}>${escaped}</dc:${tag}>\n  </metadata>`,
  );
}

/**
 * Remove a `<dc:tag>…</dc:tag>` entirely.
 */
function removeDcTag(xml: string, tag: string): string {
  // Remove dc:tag prefix form
  const rePrefixed = new RegExp(
    `\\s*<dc:${tag}[^>]*>[\\s\\S]*?</dc:${tag}>`,
    "gi",
  );
  // Remove tag with dc namespace attribute form
  const reNs = new RegExp(
    `\\s*<${tag}\\s+xmlns="http://purl\\.org/dc/elements/1\\.1/"[^>]*>[\\s\\S]*?</${tag}>`,
    "gi",
  );
  return xml.replace(rePrefixed, "").replace(reNs, "");
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

  if ("title" in updates) {
    xml = updates.title ? replaceOrInsertDcTag(xml, "title", updates.title) : removeDcTag(xml, "title");
  }
  if ("author" in updates) {
    xml = updates.author ? replaceOrInsertDcTag(xml, "creator", updates.author) : removeDcTag(xml, "creator");
  }
  if ("description" in updates) {
    xml = updates.description ? replaceOrInsertDcTag(xml, "description", updates.description) : removeDcTag(xml, "description");
  }
  if ("publisher" in updates) {
    xml = updates.publisher ? replaceOrInsertDcTag(xml, "publisher", updates.publisher) : removeDcTag(xml, "publisher");
  }
  if ("language" in updates) {
    xml = updates.language ? replaceOrInsertDcTag(xml, "language", updates.language) : removeDcTag(xml, "language");
  }
  if ("year" in updates) {
    xml = updates.year ? replaceOrInsertDcTag(xml, "date", String(updates.year)) : removeDcTag(xml, "date");
  }
  if ("genre" in updates) {
    xml = updates.genre ? replaceOrInsertDcTag(xml, "subject", updates.genre) : removeDcTag(xml, "subject");
  }
  if ("isbn" in updates) {
    const isbnRe =
      /<dc:identifier[^>]*opf:scheme="ISBN"[^>]*>[^<]*<\/dc:identifier>/i;
    if (updates.isbn) {
      if (isbnRe.test(xml)) {
        xml = xml.replace(
          isbnRe,
          `<dc:identifier opf:scheme="ISBN">${escapeXml(updates.isbn)}</dc:identifier>`,
        );
      } else {
        xml = xml.replace(
          /<\/metadata>/i,
          `    <dc:identifier opf:scheme="ISBN">${escapeXml(updates.isbn)}</dc:identifier>\n  </metadata>`,
        );
      }
    } else {
      xml = xml.replace(new RegExp(`\\s*${isbnRe.source}`, "i"), "");
    }
  }

  // Series: Calibre-style meta tags
  if ("series" in updates) {
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
    xml = setEpub3Series(xml, updates.series ?? "", updates.seriesIndex ?? undefined);
  } else if ("seriesIndex" in updates && updates.seriesIndex != null) {
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

  // Remove cover references from OPF
  if (updates.removeCover) {
    // Remove <meta name="cover" content="..."/>
    xml = xml.replace(/\s*<meta\s+name="cover"\s+content="[^"]*"\s*\/?>/gi, "");
    // Remove properties="cover-image" from manifest items
    xml = xml.replace(/\s+properties="[^"]*cover-image[^"]*"/gi, "");
    // Remove the cover image manifest <item> entirely
    xml = xml.replace(/\s*<item[^>]+id="[^"]*cover-image[^"]*"[^>]*\/>/gi, "");
    xml = xml.replace(/\s*<item[^>]+id="[^"]*cover-image[^"]*"[^>]*>[^<]*<\/item>/gi, "");
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

  // Strategy 3: manifest item with id containing "cover" and image media type
  const coverItemMatch = opfXml.match(
    /<item[^>]+id="[^"]*cover[^"]*"[^>]+media-type="image\/[^"]*"[^>]+href="([^"]+)"/i,
  );
  if (coverItemMatch) {
    return opfDir ? `${opfDir}/${coverItemMatch[1]}` : coverItemMatch[1];
  }
  // Also try href before media-type
  const coverItemMatch2 = opfXml.match(
    /<item[^>]+href="([^"]*cover[^"]*\.(jpe?g|png|gif))"[^>]*/i,
  );
  if (coverItemMatch2) {
    return opfDir ? `${opfDir}/${coverItemMatch2[1]}` : coverItemMatch2[1];
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

    // Use epub2 to reliably find the cover image path (same as upload parser)
    let coverPath: string | undefined;
    if (updates.coverImageBuffer || updates.removeCover) {
      try {
        const epub = await EPub.createAsync(filePath);
        const coverId = epub.metadata.cover;
        if (coverId && epub.manifest[coverId]) {
          const item = epub.manifest[coverId] as Record<string, string>;
          coverPath = item.href;
          // epub2 prepends the OPF dir to href already
        }
      } catch {
        // Fallback to regex if epub2 fails
        coverPath = findCoverImageHref(originalOpf, opfDir);
      }
    }

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
      } else if (isCover && updates.removeCover) {
        // Skip — remove cover image from EPUB
        continue;
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
