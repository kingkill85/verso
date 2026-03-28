import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";

const execFile = promisify(execFileCb);

export type ParsedMetadata = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  language?: string;
  description?: string;
  genre?: string;
  pageCount?: number;
  tags?: string[];
  series?: string;
  seriesIndex?: number;
  coverDataUrl?: string;
};

let calibrePath: string | undefined;

function toolPath(tool: string): string {
  return calibrePath ? path.join(calibrePath, tool) : tool;
}

export async function verifyCalibreInstalled(configPath?: string): Promise<void> {
  calibrePath = configPath;

  const tools = ["ebook-convert", "ebook-meta", "fetch-ebook-metadata"] as const;
  for (const tool of tools) {
    try {
      await execFile(toolPath(tool), ["--version"], { timeout: 10_000 });
    } catch (err: any) {
      throw new Error(
        `Calibre CLI tool "${tool}" not found or failed to run. ` +
          `Ensure Calibre is installed and "${tool}" is on your PATH, ` +
          `or set CALIBRE_PATH to the directory containing the tools. ` +
          `Original error: ${err.message}`
      );
    }
  }
}

export async function convertToEpub(inputPath: string, outputPath: string): Promise<void> {
  await execFile(
    toolPath("ebook-convert"),
    [inputPath, outputPath, "--disable-font-rescaling", "--no-default-epub-cover"],
    { timeout: 120_000 }
  );
}

export async function convertToPdf(inputPath: string, outputPath: string): Promise<void> {
  await execFile(toolPath("ebook-convert"), [inputPath, outputPath], {
    timeout: 120_000,
  });
}

function parseKeyValue(stdout: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export async function extractMetadata(filePath: string): Promise<ParsedMetadata> {
  const { stdout } = await execFile(toolPath("ebook-meta"), [filePath], {
    timeout: 30_000,
  });

  const kv = parseKeyValue(stdout);

  // Strip "[Sort Name]" from author — ebook-meta outputs "Stephen King [King, Stephen]"
  const rawAuthor = kv["Author(s)"] || kv["Author"] || "Unknown";
  const cleanAuthor = rawAuthor.replace(/\s*\[.*?\]\s*/g, "").trim();

  const meta: ParsedMetadata = {
    title: kv["Title"] || "Unknown",
    author: cleanAuthor,
  };

  if (kv["Publisher"]) meta.publisher = kv["Publisher"];
  if (kv["Languages"]) meta.language = kv["Languages"];

  if (kv["Published"]) {
    const yearMatch = kv["Published"].match(/(\d{4})/);
    if (yearMatch) meta.year = parseInt(yearMatch[1], 10);
  }

  if (kv["Identifiers"]) {
    const isbnMatch = kv["Identifiers"].match(/isbn:([^\s,]+)/i);
    if (isbnMatch) meta.isbn = isbnMatch[1];
  }

  if (kv["Comments"]) meta.description = stripHtml(kv["Comments"]);

  if (kv["Tags"]) {
    meta.tags = kv["Tags"].split(",").map((t) => t.trim()).filter(Boolean);
    if (meta.tags.length > 0) meta.genre = meta.tags[0];
  }

  if (kv["Series"]) {
    const seriesMatch = kv["Series"].match(/^(.+?)(?:\s*#(\d+(?:\.\d+)?))?$/);
    if (seriesMatch) {
      meta.series = seriesMatch[1].trim();
      if (seriesMatch[2]) meta.seriesIndex = parseFloat(seriesMatch[2]);
    }
  }

  return meta;
}

export async function extractCover(filePath: string, outputPath: string): Promise<boolean> {
  try {
    await execFile(toolPath("ebook-meta"), [filePath, "--get-cover", outputPath], {
      timeout: 30_000,
    });
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

function parseFetchBlocks(output: string): ParsedMetadata[] {
  const results: ParsedMetadata[] = [];
  // Verbose output uses "---" separators, normal output uses blank lines
  // Also filter out log lines (e.g. "Running identify query", "Using plugins", "Found N results", etc.)
  const blocks = output.split(/\n-{3,}\n|\n\s*\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    // Skip log/diagnostic lines (verbose output has "Running identify", "Using plugins", "Found N results", etc.)
    if (/^(Running|Using|Found|The |Downloading|Merging|We have|It took)/m.test(block.trim())) continue;
    const kv = parseKeyValue(block);
    if (!kv["Title"]) continue;
    // Skip if title looks like a log line
    if (kv["Title"].startsWith("Running") || kv["Title"].startsWith("Using")) continue;

    const rawAuthor2 = kv["Author(s)"] || kv["Author"] || "Unknown";
    const meta: ParsedMetadata = {
      title: kv["Title"],
      author: rawAuthor2.replace(/\s*\[.*?\]\s*/g, "").trim(),
    };

    if (kv["Publisher"]) meta.publisher = kv["Publisher"];
    if (kv["Languages"]) meta.language = kv["Languages"];

    if (kv["Published"]) {
      const yearMatch = kv["Published"].match(/(\d{4})/);
      if (yearMatch) meta.year = parseInt(yearMatch[1], 10);
    }

    if (kv["Identifiers"]) {
      const isbnMatch = kv["Identifiers"].match(/isbn:([^\s,]+)/i);
      if (isbnMatch) meta.isbn = isbnMatch[1];
    }

    if (kv["Comments"]) meta.description = stripHtml(kv["Comments"]);

    if (kv["Tags"]) {
      meta.tags = kv["Tags"].split(",").map((t) => t.trim()).filter(Boolean);
      if (meta.tags.length > 0) meta.genre = meta.tags[0];
    }

    if (kv["Series"]) {
      const seriesMatch = kv["Series"].match(/^(.+?)(?:\s*#(\d+(?:\.\d+)?))?$/);
      if (seriesMatch) {
        meta.series = seriesMatch[1].trim();
        if (seriesMatch[2]) meta.seriesIndex = parseFloat(seriesMatch[2]);
      }
    }

    results.push(meta);
  }

  return results;
}

export async function searchMetadata(query: {
  title?: string;
  author?: string;
  isbn?: string;
}): Promise<ParsedMetadata[]> {
  const args: string[] = [];
  if (query.title) args.push("--title", query.title);
  if (query.author) args.push("--authors", query.author);
  if (query.isbn) args.push("--isbn", query.isbn);

  if (args.length === 0) return [];

  try {
    const { stdout } = await execFile(
      toolPath("fetch-ebook-metadata"),
      args,
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
    );
    return parseFetchBlocks(stdout);
  } catch (err) {
    console.error("Calibre searchMetadata failed:", err);
    return [];
  }
}

export async function searchCover(
  query: { title?: string; author?: string; isbn?: string },
  outputPath: string
): Promise<boolean> {
  const args: string[] = [];
  if (query.title) args.push("--title", query.title);
  if (query.author) args.push("--authors", query.author);
  if (query.isbn) args.push("--isbn", query.isbn);
  args.push("--cover", outputPath);

  if (args.length <= 2) return false;

  try {
    await execFile(toolPath("fetch-ebook-metadata"), args, { timeout: 30_000 });
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

/**
 * Write metadata to an ebook file using ebook-meta.
 */
export async function writeMetadata(filePath: string, metadata: {
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
  tags?: string[];
}): Promise<void> {
  const args: string[] = [filePath];

  if (metadata.title) args.push("--title", metadata.title);
  if (metadata.author) args.push("--authors", metadata.author);
  if (metadata.publisher) args.push("--publisher", metadata.publisher);
  if (metadata.isbn) args.push("--isbn", metadata.isbn);
  if (metadata.description) args.push("--comment", metadata.description);
  if (metadata.language) args.push("--language", metadata.language);
  if (metadata.series) {
    args.push("--series", metadata.series);
    if (metadata.seriesIndex != null) args.push("--index", String(metadata.seriesIndex));
  }
  if (metadata.tags && metadata.tags.length > 0) {
    args.push("--tags", metadata.tags.join(","));
  }
  if (metadata.genre) {
    // Add genre as a tag if not already in tags
    const existingTags = args.indexOf("--tags");
    if (existingTags === -1) {
      args.push("--tags", metadata.genre);
    }
  }

  if (args.length > 1) {
    await execFile(toolPath("ebook-meta"), args, { timeout: 30_000 });
  }
}

/**
 * Set the cover image on an ebook file.
 */
export async function writeCover(filePath: string, coverImagePath: string): Promise<void> {
  await execFile(toolPath("ebook-meta"), [filePath, "--cover", coverImagePath], { timeout: 30_000 });
}

/**
 * Compute SHA-256 hash of a file.
 */
export async function getFileHash(filePath: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
