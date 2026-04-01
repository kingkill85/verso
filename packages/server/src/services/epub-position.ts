import { EPub } from "epub2";
import { parseHTML } from "linkedom";
import { CfiConverter, extractSpineIndex } from "./cfi-converter.js";

function openEpub(filePath: string): Promise<EPub> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on("end", () => resolve(epub));
    epub.on("error", reject);
    epub.parse();
  });
}

function getChapterRaw(epub: EPub, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapterRaw(chapterId, (err, text) => {
      if (err) reject(err);
      else resolve(text ?? "");
    });
  });
}

/**
 * Convert between KOReader XPointer and EPUB CFI formats.
 * Opens the EPUB, extracts the relevant spine HTML, parses it, runs conversion.
 *
 * For XPointer→CFI: KOReader's DocFragment numbering may be off by one
 * (e.g. when Calibre adds a titlepage not counted by KOReader). If the
 * XPointer path doesn't resolve at the computed spine index, we retry
 * at spine index + 1.
 */
export async function convertPosition(
  epubFilePath: string,
  position: string,
  from: "cfi" | "xpointer",
): Promise<string> {
  const spineIndex = extractSpineIndex(position);
  const epub = await openEpub(epubFilePath);

  if (from === "xpointer") {
    // Try computed spine index first, then +1 as fallback for off-by-one
    for (const idx of [spineIndex, spineIndex + 1]) {
      const spineItem = epub.flow[idx];
      if (!spineItem?.id) continue;

      const html = await getChapterRaw(epub, spineItem.id);
      const { document } = parseHTML(html);
      const converter = new CfiConverter(document, idx);

      try {
        return converter.xPointerToCfi(position);
      } catch {
        // Path didn't resolve at this spine index — try next
      }
    }
    throw new Error(`XPointer path not found at spine ${spineIndex} or ${spineIndex + 1}`);
  }

  // CFI → XPointer: spine index is encoded in the CFI itself, no ambiguity
  const spineItem = epub.flow[spineIndex];
  if (!spineItem?.id) {
    throw new Error(`No spine item at index ${spineIndex}`);
  }

  const html = await getChapterRaw(epub, spineItem.id);
  const { document } = parseHTML(html);
  const converter = new CfiConverter(document, spineIndex);
  return converter.cfiToXPointer(position);
}
