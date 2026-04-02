import { createHash } from "node:crypto";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_BASE = "https://upload.wikimedia.org/wikipedia/commons";

const APP_LOCALES = ["en", "de", "es", "fr", "it", "nl", "pt", "zh", "ja", "ko"] as const;

export type WikidataResult = {
  entityId: string;
  birthDate: string | null;
  deathDate: string | null;
  imageFilename: string | null;
  sitelinks: Record<string, string>; // locale → article title
};

/**
 * Search for an author using Wikipedia's search first (better fuzzy matching
 * for abbreviated names like "J.K. Rowling"), then fall back to Wikidata
 * entity search.
 */
export async function searchWikidata(name: string): Promise<WikidataResult | null> {
  // Strategy 1: Wikipedia search → resolve to Wikidata entity
  const viaWikipedia = await searchViaWikipedia(name);
  if (viaWikipedia) return viaWikipedia;

  // Strategy 2: Direct Wikidata entity search
  return searchViaWikidata(name);
}

/**
 * Search Wikipedia across all app locales (en first, then de, es, fr, …).
 * For each locale, find the best article match, resolve its Wikidata entity,
 * and verify it's a human. Returns on the first valid hit.
 */
async function searchViaWikipedia(name: string): Promise<WikidataResult | null> {
  for (const locale of APP_LOCALES) {
    try {
      const searchParams = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: name,
        srlimit: "1",
        format: "json",
      });
      const searchRes = await fetch(`https://${locale}.wikipedia.org/w/api.php?${searchParams}`);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      const pageTitle = searchData.query?.search?.[0]?.title;
      if (!pageTitle) continue;

      // Skip results where the page title doesn't match the search name.
      // Wikipedia's search does full-text matching, so "Georg Mascolo" can
      // return "Abdallah bin Laden" because Mascolo is mentioned in the body.
      if (!titleMatchesName(pageTitle, name)) continue;

      // Get the Wikidata entity ID from the Wikipedia page
      const propsParams = new URLSearchParams({
        action: "query",
        titles: pageTitle,
        prop: "pageprops",
        ppprop: "wikibase_item",
        format: "json",
      });
      const propsRes = await fetch(`https://${locale}.wikipedia.org/w/api.php?${propsParams}`);
      if (!propsRes.ok) continue;
      const propsData = await propsRes.json();
      const pages = propsData.query?.pages;
      if (!pages) continue;
      const page = Object.values(pages)[0] as any;
      const entityId = page?.pageprops?.wikibase_item;
      if (!entityId) continue;

      // Fetch entity details — returns null if not a human (P31 ≠ Q5)
      const result = await fetchEntityDetails(entityId);
      if (result) return result;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Direct Wikidata entity search across all app locales.
 * Tries each language until a valid human entity is found.
 */
async function searchViaWikidata(name: string): Promise<WikidataResult | null> {
  for (const locale of APP_LOCALES) {
    try {
      const searchParams = new URLSearchParams({
        action: "wbsearchentities",
        search: name,
        language: locale,
        type: "item",
        limit: "1",
        format: "json",
      });
      const searchRes = await fetch(`${WIKIDATA_API}?${searchParams}`);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      if (!searchData.search?.length) continue;

      const result = await fetchEntityDetails(searchData.search[0].id);
      if (result) return result;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch full entity details (sitelinks, birth date, image) from Wikidata.
 */
async function fetchEntityDetails(entityId: string): Promise<WikidataResult | null> {
  try {
    const entityParams = new URLSearchParams({
      action: "wbgetentities",
      ids: entityId,
      props: "sitelinks|claims",
      format: "json",
    });
    const entityRes = await fetch(`${WIKIDATA_API}?${entityParams}`);
    if (!entityRes.ok) return null;
    const entityData = await entityRes.json();
    const entity = entityData.entities?.[entityId];
    if (!entity) return null;

    // Verify the entity is a human (P31 = Q5) to avoid matching places, books, etc.
    const instanceOf = entity.claims?.P31?.[0]?.mainsnak?.datavalue?.value?.id;
    if (instanceOf !== "Q5") return null;

    // Extract sitelinks for our app locales
    const sitelinks: Record<string, string> = {};
    for (const locale of APP_LOCALES) {
      const wikiKey = `${locale}wiki`;
      if (entity.sitelinks?.[wikiKey]) {
        sitelinks[locale] = entity.sitelinks[wikiKey].title;
      }
    }

    // Extract birth date (P569)
    let birthDate: string | null = null;
    const birthClaim = entity.claims?.P569?.[0];
    if (birthClaim?.mainsnak?.datavalue?.value?.time) {
      const raw = birthClaim.mainsnak.datavalue.value.time; // e.g. "+1952-03-11T00:00:00Z"
      const match = raw.match(/\+?(\d{4}-\d{2}-\d{2})/);
      if (match) birthDate = match[1];
    }

    // Extract death date (P570)
    let deathDate: string | null = null;
    const deathClaim = entity.claims?.P570?.[0];
    if (deathClaim?.mainsnak?.datavalue?.value?.time) {
      const raw = deathClaim.mainsnak.datavalue.value.time;
      const match = raw.match(/\+?(\d{4}-\d{2}-\d{2})/);
      if (match) deathDate = match[1];
    }

    // Extract image filename (P18)
    let imageFilename: string | null = null;
    const imageClaim = entity.claims?.P18?.[0];
    if (imageClaim?.mainsnak?.datavalue?.value) {
      imageFilename = imageClaim.mainsnak.datavalue.value;
    }

    return { entityId, birthDate, deathDate, imageFilename, sitelinks };
  } catch {
    return null;
  }
}

export function getCommonsImageUrl(filename: string): string {
  const normalized = filename.replace(/ /g, "_");
  const md5 = createMd5Hash(normalized);
  return `${COMMONS_BASE}/${md5[0]}/${md5[0]}${md5[1]}/${encodeURIComponent(normalized)}`;
}

function createMd5Hash(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

/**
 * Check whether a Wikipedia page title plausibly matches the author name.
 * Wikipedia search does full-text matching, so searching "Georg Mascolo" can
 * return an article that merely mentions him. We require that the last name
 * appears in the title (case-insensitive) to filter out false positives.
 */
function titleMatchesName(pageTitle: string, searchName: string): boolean {
  const titleLower = pageTitle.toLowerCase();
  const nameParts = searchName.toLowerCase().split(/\s+/).filter(Boolean);
  // Check that the last name (last word) appears in the title
  const lastName = nameParts[nameParts.length - 1];
  return titleLower.includes(lastName);
}

/**
 * Clean up Wikipedia extract text:
 * - Remove IPA pronunciation brackets like [ˌd͡ʒəʊˈæn ˈkeɪ ˈrəʊlɪŋ]
 * - Remove phonetic transcription in slashes like /ˈroʊlɪŋ/
 * - Remove honorary titles/abbreviations after the name (CH, OBE, CBE, etc.)
 * - Remove birth name parentheticals like "(née Smith)"
 * - Collapse multiple spaces
 */
function cleanExtract(text: string): string {
  return text
    // Remove IPA in square brackets (including nested)
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    // Remove phonetic in slashes
    .replace(/\s*\/[^/]*\/\s*/g, " ")
    // Remove parenthetical pronunciations like (pronounced ...)
    .replace(/\s*\(pronounced[^)]*\)\s*/g, " ")
    // Remove sequences of honorary abbreviations (CH, OBE, CBE, DBE, KBE, FRS, etc.)
    .replace(/(?:,\s*(?:CH|OBE|CBE|DBE|KBE|MBE|FRS|FRSL|OM|PC|QC|KC|DL|JP|MP|FBA|FRCS|FRCP)\b)+/gi, "")
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    // Remove space before punctuation
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

export async function fetchWikipediaSummaries(
  sitelinks: Record<string, string>,
): Promise<{ locale: string; description: string }[]> {
  const results: { locale: string; description: string }[] = [];

  for (const [locale, title] of Object.entries(sitelinks)) {
    try {
      const url = `https://${locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.extract) {
        results.push({ locale, description: cleanExtract(data.extract) });
      }
    } catch {
      continue;
    }

    // Rate limit: 1s between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
