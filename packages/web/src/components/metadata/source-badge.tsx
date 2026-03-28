const SOURCES: Record<string, { label: string; bg: string; color: string }> = {
  google: { label: "Google", bg: "rgba(66,133,244,0.15)", color: "#4285F4" },
  openlibrary: { label: "Open Library", bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  goodreads: { label: "Goodreads", bg: "rgba(136,100,56,0.15)", color: "#a07040" },
  calibre: { label: "Calibre", bg: "rgba(160,104,48,0.15)", color: "#a06830" },
  amazon: { label: "Amazon HD", bg: "rgba(255,153,0,0.15)", color: "#FF9900" },
};

export function SourceBadge({ source }: { source: string }) {
  const s = SOURCES[source];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
