import { describe, it, expect } from "vitest";
import { normalizeLanguage, LANGUAGE_DISPLAY_NAMES } from "@verso/shared";

describe("normalizeLanguage", () => {
  it("passes through ISO 639-1 codes unchanged", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("de")).toBe("de");
    expect(normalizeLanguage("fr")).toBe("fr");
  });

  it("normalizes ISO 639-2/B codes", () => {
    expect(normalizeLanguage("eng")).toBe("en");
    expect(normalizeLanguage("ger")).toBe("de");
    expect(normalizeLanguage("fre")).toBe("fr");
    expect(normalizeLanguage("spa")).toBe("es");
    expect(normalizeLanguage("dut")).toBe("nl");
    expect(normalizeLanguage("chi")).toBe("zh");
    expect(normalizeLanguage("cze")).toBe("cs");
    expect(normalizeLanguage("rum")).toBe("ro");
    expect(normalizeLanguage("gre")).toBe("el");
    expect(normalizeLanguage("may")).toBe("ms");
    expect(normalizeLanguage("slo")).toBe("sk");
  });

  it("normalizes ISO 639-2/T codes", () => {
    expect(normalizeLanguage("deu")).toBe("de");
    expect(normalizeLanguage("fra")).toBe("fr");
    expect(normalizeLanguage("ces")).toBe("cs");
    expect(normalizeLanguage("ron")).toBe("ro");
    expect(normalizeLanguage("ell")).toBe("el");
    expect(normalizeLanguage("msa")).toBe("ms");
    expect(normalizeLanguage("slk")).toBe("sk");
  });

  it("normalizes full language names (case-insensitive)", () => {
    expect(normalizeLanguage("English")).toBe("en");
    expect(normalizeLanguage("german")).toBe("de");
    expect(normalizeLanguage("FRENCH")).toBe("fr");
    expect(normalizeLanguage("Spanish")).toBe("es");
    expect(normalizeLanguage("Japanese")).toBe("ja");
  });

  it("strips BCP-47 region tags", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("pt-BR")).toBe("pt");
    expect(normalizeLanguage("zh-TW")).toBe("zh");
    expect(normalizeLanguage("en-GB")).toBe("en");
  });

  it("handles case-insensitive three-letter codes", () => {
    expect(normalizeLanguage("ENG")).toBe("en");
    expect(normalizeLanguage("Ger")).toBe("de");
    expect(normalizeLanguage("DEU")).toBe("de");
  });

  it("returns unknown input as-is", () => {
    expect(normalizeLanguage("xyz")).toBe("xyz");
    expect(normalizeLanguage("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeLanguage("  en  ")).toBe("en");
    expect(normalizeLanguage(" eng ")).toBe("en");
  });
});

describe("LANGUAGE_DISPLAY_NAMES", () => {
  it("contains common languages", () => {
    expect(LANGUAGE_DISPLAY_NAMES["en"]).toBe("English");
    expect(LANGUAGE_DISPLAY_NAMES["de"]).toBe("German");
    expect(LANGUAGE_DISPLAY_NAMES["fr"]).toBe("French");
    expect(LANGUAGE_DISPLAY_NAMES["ja"]).toBe("Japanese");
  });
});
