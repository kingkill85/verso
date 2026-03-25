export function SourceBadge({ source }: { source: "google" | "openlibrary" }) {
  const isGoogle = source === "google";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: isGoogle ? "rgba(66,133,244,0.15)" : "rgba(34,197,94,0.15)",
        color: isGoogle ? "#4285F4" : "#22c55e",
      }}
    >
      {isGoogle ? "Google" : "Open Library"}
    </span>
  );
}
