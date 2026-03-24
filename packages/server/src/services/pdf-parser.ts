import pdf from "pdf-parse";
import { readFile } from "node:fs/promises";
import type { ParsedMetadata } from "./epub-parser.js";

export async function parsePdf(filePath: string): Promise<ParsedMetadata> {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);

  return {
    title: data.info?.Title || "Untitled",
    author: data.info?.Author || "Unknown Author",
    publisher: data.info?.Producer || undefined,
    pageCount: data.numpages || undefined,
    description: undefined,
  };
}
