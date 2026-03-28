import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";
import { FilterChips } from "@/components/shelves/filter-chips";

export const Route = createFileRoute("/_app/search")({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();
  const { q } = Route.useSearch();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const searchQuery = trpc.books.search.useQuery(
    {
      query: q,
      genre: selectedGenre ?? undefined,
      format: (selectedFormat?.toLowerCase() as "epub" | "pdf" | "mobi") ?? undefined,
    },
    { enabled: q.length > 0 },
  );

  const books = searchQuery.data?.books ?? [];

  // Extract unique genres and formats from results for filter chips
  const genres = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      if (b.genre) set.add(b.genre);
    });
    return Array.from(set).sort();
  }, [books]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      if (b.fileFormat) set.add(b.fileFormat.toUpperCase());
    });
    return Array.from(set).sort();
  }, [books]);

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: "var(--text-dim)" }}>
        <p className="font-display text-lg">{t("search.searchLibrary")}</p>
        <p className="text-sm mt-1">{t("search.typeQuery")}</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-bold" style={{ color: "var(--text)" }}>
          {t("search.results")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
          {searchQuery.isLoading
            ? t("search.searching")
            : t("search.resultsFor", { count: searchQuery.data?.total ?? 0, query: q })}
        </p>
      </div>

      {(genres.length > 0 || formats.length > 0) && (
        <div className="flex flex-col gap-3 mb-6">
          <FilterChips options={genres} selected={selectedGenre} onSelect={setSelectedGenre} label={t("search.genre")} />
          <FilterChips options={formats} selected={selectedFormat} onSelect={setSelectedFormat} label={t("search.format")} />
        </div>
      )}

      {searchQuery.isLoading ? (
        <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
          <p className="text-sm">{t("search.searching")}</p>
        </div>
      ) : (
        <BookGrid books={books} />
      )}
    </div>
  );
}
