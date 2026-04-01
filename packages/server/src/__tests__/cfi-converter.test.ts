import { describe, it, expect } from "vitest";
import { parseHTML } from "linkedom";
import { CfiConverter, extractSpineIndex } from "../services/cfi-converter.js";

// Simple structure: body > div > (h1, p, p, p) + div > (p, p)
const SIMPLE_HTML = `
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

// Flat structure: body > many <p> (like Langoliers, Wolfsmond, tot.)
const FLAT_HTML = `<html><body>
${Array.from({ length: 20 }, (_, i) => `  <p>Paragraph ${i + 1} with some text content here for testing.</p>`).join("\n")}
</body></html>`;

// Deep flat structure: body > 110+ <p> (like Der Turm)
const DEEP_FLAT_HTML = `<html><body>
${Array.from({ length: 110 }, (_, i) => `  <p>Paragraph ${i + 1} with some content here for testing purposes.</p>`).join("\n")}
</body></html>`;

// Nested div structure: body > div > div > p (like Heimatschutz)
const NESTED_DIV_HTML = `<html><body>
  <div id="chapter" class="cover">
    <div class="inner">
      <p>Caption one about an image.</p>
      <p>Caption two with more text for offset testing purposes.</p>
    </div>
  </div>
</body></html>`;

// Multi-nested: body > div > div > div > p (deeper nesting, possible in Calibre-converted EPUBs)
const DEEP_NESTED_HTML = `<html><body>
  <div class="wrapper">
    <div class="chapter">
      <div class="section">
        <p>First paragraph in deeply nested structure.</p>
        <p>Second paragraph in deeply nested structure.</p>
        <p>Third paragraph in deeply nested structure.</p>
      </div>
      <div class="section">
        <p>Fourth paragraph in next section.</p>
        <p>Fifth paragraph in next section.</p>
      </div>
    </div>
  </div>
</body></html>`;

// Mixed inline elements: p with em, strong, span (tests text offset across inlines)
const INLINE_HTML = `<html><body>
  <p>Plain text <em>emphasized</em> and <strong>bold <span>nested</span> text</strong> end.</p>
  <p>Another paragraph with <em>more <strong>complex</strong> inlines</em> here.</p>
</body></html>`;

// Single-child chapters: body > div > (single p) — image-heavy books like Heimatschutz photo pages
const SINGLE_CHILD_HTML = `<html><body>
  <div class="image-page">
    <p><img src="photo.jpg" alt="Photo description"/></p>
  </div>
</body></html>`;

function makeConverter(html: string, spineIndex: number) {
  const { document } = parseHTML(html);
  return new CfiConverter(document, spineIndex);
}

function makeSimpleConverter(spineIndex = 5) {
  return makeConverter(SIMPLE_HTML, spineIndex);
}

describe("extractSpineIndex", () => {
  it("extracts from CFI", () => {
    expect(extractSpineIndex("epubcfi(/6/12!/4/2/4)")).toBe(5);
  });

  it("extracts from range CFI", () => {
    expect(extractSpineIndex("epubcfi(/6/14!/4,/2,/20/1:636)")).toBe(6);
  });

  it("extracts from XPointer", () => {
    expect(extractSpineIndex("/body/DocFragment[6]/body/div/p[2]")).toBe(5);
  });

  it("extracts from XPointer with text offset", () => {
    expect(extractSpineIndex("/body/DocFragment[10]/body/p[5]/text().42")).toBe(9);
  });

  it("throws for invalid format", () => {
    expect(() => extractSpineIndex("garbage")).toThrow("Unsupported format");
  });
});

describe("CfiConverter", () => {
  // ─── xPointerToCfi ───────────────────────────────────────────

  describe("xPointerToCfi", () => {
    it("converts simple element path", () => {
      const converter = makeSimpleConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/h1");
      expect(cfi).toBe("epubcfi(/6/12!/4/2/2)");
    });

    it("converts element with text offset", () => {
      const converter = makeSimpleConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/p[1]/text().5");
      expect(cfi).toContain("/1:5");
      expect(cfi).toMatch(/^epubcfi\(/);
    });

    it("converts flat structure (body > p)", () => {
      const converter = makeConverter(FLAT_HTML, 6);
      const cfi = converter.xPointerToCfi("/body/DocFragment[7]/body/p[10]");
      expect(cfi).toBe("epubcfi(/6/14!/4/20)");
    });

    it("converts nested div path (Heimatschutz-style)", () => {
      const converter = makeConverter(NESTED_DIV_HTML, 7);
      const cfi = converter.xPointerToCfi("/body/DocFragment[8]/body/div/div/p[2]");
      expect(cfi).toBe("epubcfi(/6/16!/4/2/2/4)");
    });

    it("converts deeply nested path", () => {
      const converter = makeConverter(DEEP_NESTED_HTML, 3);
      const cfi = converter.xPointerToCfi("/body/DocFragment[4]/body/div/div/div/p[3]");
      expect(cfi).toBe("epubcfi(/6/8!/4/2/2/2/6)");
    });

    it("converts XPointer targeting body directly", () => {
      const converter = makeSimpleConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body");
      expect(cfi).toBe("epubcfi(/6/12!/4)");
    });
  });

  // ─── cfiToXPointer (simple / non-range) ──────────────────────

  describe("cfiToXPointer", () => {
    it("converts simple CFI to XPointer", () => {
      const converter = makeSimpleConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/2)");
      expect(xp).toBe("/body/DocFragment[6]/body/div/h1");
    });

    it("converts CFI with text offset", () => {
      const converter = makeSimpleConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/4/1:5)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("text().5");
    });

    it("throws for mismatched spine index", () => {
      const converter = makeSimpleConverter(5);
      expect(() => converter.cfiToXPointer("epubcfi(/6/4!/4/2)")).toThrow("does not match");
    });

    it("converts flat structure CFI", () => {
      const converter = makeConverter(FLAT_HTML, 6);
      const xp = converter.cfiToXPointer("epubcfi(/6/14!/4/20)");
      expect(xp).toBe("/body/DocFragment[7]/body/p[10]");
    });

    it("converts nested div CFI (Heimatschutz-style)", () => {
      const converter = makeConverter(NESTED_DIV_HTML, 7);
      const xp = converter.cfiToXPointer("epubcfi(/6/16!/4/2/2/4)");
      expect(xp).toBe("/body/DocFragment[8]/body/div/div/p[2]");
    });

    it("converts deeply nested CFI", () => {
      const converter = makeConverter(DEEP_NESTED_HTML, 3);
      const xp = converter.cfiToXPointer("epubcfi(/6/8!/4/2/2/2/6)");
      expect(xp).toBe("/body/DocFragment[4]/body/div/div/div/p[3]");
    });

    it("handles out-of-bounds CFI step gracefully", () => {
      const converter = makeConverter(SINGLE_CHILD_HTML, 2);
      // Step /99 is way beyond the child count — should return closest resolved element
      const xp = converter.cfiToXPointer("epubcfi(/6/6!/4/2)");
      expect(xp).toContain("/body/DocFragment[3]/body");
    });
  });

  // ─── Range CFI (comma-separated: parent,start,end) ──────────

  describe("range CFI", () => {
    it("resolves range CFI in flat structure (Langoliers-style: body > p)", () => {
      // epubcfi(/6/14!/4,/2,/20/1:10) → parent=/4, end=/20/1:10 → /4/20/1:10
      const converter = makeConverter(FLAT_HTML, 6);
      const xp = converter.cfiToXPointer("epubcfi(/6/14!/4,/2,/20/1:10)");
      expect(xp).toContain("/body/DocFragment[7]/body");
      expect(xp).toContain("p[10]");
      expect(xp).toContain("text().10");
    });

    it("resolves range CFI in flat structure (Wolfsmond-style)", () => {
      // epubcfi(/6/14!/4,/2,/22/1:15) → parent=/4, end=/22/1:15 → /4/22/1:15
      const converter = makeConverter(FLAT_HTML, 6);
      const xp = converter.cfiToXPointer("epubcfi(/6/14!/4,/2,/22/1:15)");
      expect(xp).toContain("/body/DocFragment[7]/body");
      expect(xp).toContain("p[11]");
      expect(xp).toContain("text().15");
    });

    it("resolves range CFI in deep flat structure (Der Turm-style: body > 100+ p)", () => {
      // epubcfi(/6/16!/4,/192,/216/1:20) → parent=/4, end=/216/1:20 → /4/216/1:20
      const converter = makeConverter(DEEP_FLAT_HTML, 7);
      const xp = converter.cfiToXPointer("epubcfi(/6/16!/4,/192,/216/1:20)");
      expect(xp).toContain("/body/DocFragment[8]/body");
      expect(xp).toContain("p[108]");
      expect(xp).toContain("text().20");
    });

    it("resolves range CFI in nested div structure (Heimatschutz-style)", () => {
      // epubcfi(/6/16!/4,/2,/2/2/4/1:10) → parent=/4, end=/2/2/4/1:10 → /4/2/2/4/1:10
      // body > div > div > 2nd p > text offset 10
      const converter = makeConverter(NESTED_DIV_HTML, 7);
      const xp = converter.cfiToXPointer("epubcfi(/6/16!/4,/2,/2/2/4/1:10)");
      expect(xp).toContain("/body/DocFragment[8]/body");
      expect(xp).toContain("p[2]");
      expect(xp).toContain("text().10");
    });

    it("resolves range CFI in deeply nested structure", () => {
      // epubcfi(/6/8!/4,/2,/2/2/2/6/1:20) → parent=/4, end=/2/2/2/6/1:20 → /4/2/2/2/6/1:20
      const converter = makeConverter(DEEP_NESTED_HTML, 3);
      const xp = converter.cfiToXPointer("epubcfi(/6/8!/4,/2,/2/2/2/6/1:20)");
      expect(xp).toContain("/body/DocFragment[4]/body");
      expect(xp).toContain("p[3]");
      expect(xp).toContain("text().20");
    });

    it("resolves range CFI with assertion in end path", () => {
      const converter = makeConverter(FLAT_HTML, 6);
      // CFI with id assertion: /4[body]/10[some-id]/1:5
      const xp = converter.cfiToXPointer("epubcfi(/6/14!/4,/2,/10[some-id]/1:5)");
      expect(xp).toContain("/body/DocFragment[7]/body");
      expect(xp).toContain("p[5]");
      expect(xp).toContain("text().5");
    });

    it("non-range CFI still works (no commas)", () => {
      const converter = makeSimpleConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/2)");
      expect(xp).toBe("/body/DocFragment[6]/body/div/h1");
    });

    it("resolves range CFI with odd text-node step (Heimatschutz web reader style)", () => {
      // Real-world CFI: /4/2[id]/2,/34/1:810,/40/3:17
      // After range resolution: /4/2/2/40/3:17
      // The /3 is an odd step (text node reference) — must not be walked as an element
      const converter = makeConverter(NESTED_DIV_HTML, 7);
      const xp = converter.cfiToXPointer("epubcfi(/6/16!/4/2/2,/2/1:0,/4/3:17)");
      expect(xp).toContain("/body/DocFragment[8]/body");
      expect(xp).toContain("text().17");
    });
  });

  // ─── Text offset handling across inline elements ─────────────

  describe("text offset with inline elements", () => {
    it("resolves text offset walking through inline spans", () => {
      const converter = makeConverter(INLINE_HTML, 5);
      // Navigate to 1st <p> (CFI /4/2), then text offset past "Plain text " (11 chars)
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/1:15)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("p");
      expect(xp).toContain("text().");
    });

    it("produces text offset in XPointer for nested inline content", () => {
      const converter = makeConverter(INLINE_HTML, 5);
      // Navigate to 2nd <p> (CFI /4/4), with a text offset
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/4/1:5)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("p[2]");
      expect(xp).toContain("text().5");
    });
  });

  // ─── Round-trip tests ────────────────────────────────────────

  describe("round-trip", () => {
    it("XPointer → CFI → XPointer preserves element path (simple)", () => {
      const converter = makeSimpleConverter(5);
      const original = "/body/DocFragment[6]/body/div/h1";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("CFI → XPointer → CFI preserves path (simple)", () => {
      const converter = makeSimpleConverter(5);
      const original = "epubcfi(/6/12!/4/2/2)";
      const xp = converter.cfiToXPointer(original);
      const roundTripped = converter.xPointerToCfi(xp);
      expect(roundTripped).toBe(original);
    });

    it("XPointer → CFI → XPointer for flat structure", () => {
      const converter = makeConverter(FLAT_HTML, 6);
      const original = "/body/DocFragment[7]/body/p[10]";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("XPointer → CFI → XPointer for nested div structure", () => {
      const converter = makeConverter(NESTED_DIV_HTML, 7);
      const original = "/body/DocFragment[8]/body/div/div/p[2]";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("XPointer → CFI → XPointer for deeply nested structure", () => {
      const converter = makeConverter(DEEP_NESTED_HTML, 3);
      const original = "/body/DocFragment[4]/body/div/div/div/p[3]";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("XPointer → CFI → XPointer for deep flat with high index", () => {
      const converter = makeConverter(DEEP_FLAT_HTML, 7);
      const original = "/body/DocFragment[8]/body/p[95]";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });
  });
});
