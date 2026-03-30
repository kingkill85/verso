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
 */
export async function convertPosition(
  epubFilePath: string,
  position: string,
  from: "cfi" | "xpointer",
): Promise<string> {
  const spineIndex = extractSpineIndex(position);
  const epub = await openEpub(epubFilePath);

  // Get spine chapter ID at the given index
  const spineItem = epub.flow[spineIndex];
  if (!spineItem?.id) {
    throw new Error(`No spine item at index ${spineIndex}`);
  }

  const html = await getChapterRaw(epub, spineItem.id);
  const { document } = parseHTML(html);
  const converter = new CfiConverter(document, spineIndex);

  if (from === "xpointer") {
    return converter.xPointerToCfi(position);
  } else {
    return converter.cfiToXPointer(position);
  }
}
