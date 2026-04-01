/**
 * ISO 639-1 display names for human-readable language rendering.
 */
export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  pl: "Polish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  cs: "Czech",
  tr: "Turkish",
  hu: "Hungarian",
  ro: "Romanian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  ca: "Catalan",
  hr: "Croatian",
  sr: "Serbian",
  sk: "Slovak",
  sl: "Slovenian",
  bg: "Bulgarian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  ga: "Irish",
  is: "Icelandic",
  mt: "Maltese",
  sq: "Albanian",
  mk: "Macedonian",
  bs: "Bosnian",
  cy: "Welsh",
  gl: "Galician",
  eu: "Basque",
  af: "Afrikaans",
  sw: "Swahili",
  la: "Latin",
  eo: "Esperanto",
};

/**
 * Maps ISO 639-2 (both /B and /T variants) and full language names
 * to ISO 639-1 two-letter codes.
 */
const CODE_MAP: Record<string, string> = {
  // ISO 639-2/B and /T codes
  eng: "en", deu: "de", ger: "de", fra: "fr", fre: "fr",
  spa: "es", ita: "it", por: "pt", nld: "nl", dut: "nl",
  jpn: "ja", kor: "ko", zho: "zh", chi: "zh",
  rus: "ru", ara: "ar", hin: "hi", pol: "pl",
  swe: "sv", nor: "no", dan: "da", fin: "fi",
  ces: "cs", cze: "cs", tur: "tr", hun: "hu",
  ron: "ro", rum: "ro", ell: "el", gre: "el",
  heb: "he", tha: "th", vie: "vi", ind: "id",
  msa: "ms", may: "ms", ukr: "uk", cat: "ca",
  hrv: "hr", srp: "sr", slk: "sk", slo: "sk",
  slv: "sl", bul: "bg", lit: "lt", lav: "lv",
  est: "et", gle: "ga", isl: "is", mlt: "mt",
  sqi: "sq", alb: "sq", mkd: "mk", mac: "mk",
  bos: "bs", cym: "cy", wel: "cy", glg: "gl",
  eus: "eu", baq: "eu", afr: "af", swa: "sw",
  lat: "la", epo: "eo",
};

// Build a reverse map from full language names to codes
const NAME_MAP: Record<string, string> = {};
for (const [code, name] of Object.entries(LANGUAGE_DISPLAY_NAMES)) {
  NAME_MAP[name.toLowerCase()] = code;
}

/**
 * Normalize a language string to an ISO 639-1 two-letter code.
 *
 * Handles: ISO 639-2/B, ISO 639-2/T, full language names (case-insensitive),
 * and BCP-47 tags (strips region). Unknown inputs are returned as-is.
 */
export function normalizeLanguage(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();

  // Check if already a known ISO 639-1 code
  if (lower.length === 2 && LANGUAGE_DISPLAY_NAMES[lower]) {
    return lower;
  }

  // Check ISO 639-2 three-letter codes
  if (CODE_MAP[lower]) {
    return CODE_MAP[lower];
  }

  // Check full language names
  if (NAME_MAP[lower]) {
    return NAME_MAP[lower];
  }

  // Handle BCP-47 tags like "en-US", "pt-BR"
  const bcp47Match = lower.match(/^([a-z]{2})-[a-z]{2,}$/);
  if (bcp47Match) {
    return bcp47Match[1];
  }

  // Unknown — return as-is
  return trimmed;
}
