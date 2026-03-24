export const COVER_PALETTES = [
  { bg: ["#2d1b14", "#4a2e20"], accent: "#d4a574", dark: "#1a0f0a" },
  { bg: ["#1a2332", "#2d3d52"], accent: "#8ab4d6", dark: "#0f1520" },
  { bg: ["#2a1f2d", "#463a4a"], accent: "#c4a2d0", dark: "#170f1a" },
  { bg: ["#1f2d1a", "#3a4a32"], accent: "#a2d08a", dark: "#0f1a0a" },
  { bg: ["#2d2a1a", "#4a4532"], accent: "#d0c88a", dark: "#1a170a" },
  { bg: ["#1a2d2a", "#324a46"], accent: "#8ad0c8", dark: "#0a1a17" },
  { bg: ["#2d1a1a", "#4a3232"], accent: "#d08a8a", dark: "#1a0a0a" },
  { bg: ["#1a1a2d", "#32324a"], accent: "#8a8ad0", dark: "#0a0a1a" },
  { bg: ["#2d261a", "#4a3f2e"], accent: "#d0b88a", dark: "#1a150a" },
  { bg: ["#1a2d20", "#324a3a"], accent: "#8ad0a2", dark: "#0a1a10" },
  { bg: ["#2d1a26", "#4a3240"], accent: "#d08ab8", dark: "#1a0a15" },
  { bg: ["#1a262d", "#32404a"], accent: "#8ac0d0", dark: "#0a151a" },
] as const;

export function getCoverPalette(bookId: string) {
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    hash = (hash << 5) - hash + bookId.charCodeAt(i);
    hash |= 0;
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
}
