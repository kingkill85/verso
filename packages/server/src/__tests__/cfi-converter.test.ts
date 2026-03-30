import { describe, it, expect } from "vitest";
import { parseHTML } from "linkedom";
import { CfiConverter, extractSpineIndex } from "../services/cfi-converter.js";

const SAMPLE_HTML = `
<html>
<body>
  <div>
    <h1>Chapter Title</h1>
    <p>First paragraph with <em>emphasized</em> text.</p>
    <p>Second paragraph.</p>
    <p>Third paragraph with <strong>bold</strong> and <em>italic</em> words.</p>
  </div>
  <div>
    <p>Another section first paragraph.</p>
    <p>Another section second paragraph.</p>
  </div>
</body>
</html>
`;

function makeConverter(spineIndex = 5) {
  const { document } = parseHTML(SAMPLE_HTML);
  return new CfiConverter(document, spineIndex);
}

describe("extractSpineIndex", () => {
  it("extracts from CFI", () => {
    expect(extractSpineIndex("epubcfi(/6/12!/4/2/4)")).toBe(5);
  });

  it("extracts from XPointer", () => {
    expect(extractSpineIndex("/body/DocFragment[6]/body/div/p[2]")).toBe(5);
  });

  it("throws for invalid format", () => {
    expect(() => extractSpineIndex("garbage")).toThrow("Unsupported format");
  });
});

describe("CfiConverter", () => {
  describe("xPointerToCfi", () => {
    it("converts simple element path", () => {
      const converter = makeConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/h1");
      expect(cfi).toMatch(/^epubcfi\(\/6\/12!\/4\/2\/2\)$/);
    });

    it("converts element with text offset", () => {
      const converter = makeConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/p[1]/text().5");
      expect(cfi).toContain("/1:5");
      expect(cfi).toMatch(/^epubcfi\(/);
    });
  });

  describe("cfiToXPointer", () => {
    it("converts simple CFI to XPointer", () => {
      const converter = makeConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/2)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("h1");
    });

    it("converts CFI with text offset", () => {
      const converter = makeConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/4/1:5)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("text().5");
    });

    it("throws for mismatched spine index", () => {
      const converter = makeConverter(5);
      expect(() => converter.cfiToXPointer("epubcfi(/6/4!/4/2)")).toThrow("does not match");
    });
  });

  describe("round-trip", () => {
    it("XPointer → CFI → XPointer preserves element path", () => {
      const converter = makeConverter(5);
      const original = "/body/DocFragment[6]/body/div/h1";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("CFI → XPointer → CFI preserves path", () => {
      const converter = makeConverter(5);
      const original = "epubcfi(/6/12!/4/2/2)";
      const xp = converter.cfiToXPointer(original);
      const roundTripped = converter.xPointerToCfi(xp);
      expect(roundTripped).toBe(original);
    });
  });
});
