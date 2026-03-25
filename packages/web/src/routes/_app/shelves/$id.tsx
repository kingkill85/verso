import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";

export const Route = createFileRoute("/_app/shelves/$id")({
  component: ShelfDetailPage,
});

function ShelfDetailPage() {
  const { id } = Route.useParams();
  const shelfQuery = trpc.shelves.byId.useQuery({ id });
  const [search, setSearch] = useState("");

  const filteredBooks = useMemo(() => {
    if (!shelfQuery.data?.books) return [];
    if (!search.trim()) return shelfQuery.data.books;
    const term = search.toLowerCase();
    return shelfQuery.data.books.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        (b.author && b.author.toLowerCase().includes(term))
    );
  }, [shelfQuery.data?.books, search]);

  if (shelfQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
        <p className="text-sm">Loading shelf...</p>
      </div>
    );
  }

  if (shelfQuery.error || !shelfQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>
          Shelf not found
        </p>
        <Link to="/" className="text-sm mt-2" style={{ color: "var(--warm)" }}>
          Back to library
        </Link>
      </div>
    );
  }

  const shelf = shelfQuery.data;
  const books = shelf.books ?? [];
  const showSearch = books.length > 5;

  return (
    <div className="animate-in fade-in">
      <Link
        to="/"
        className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: "var(--text-dim)" }}
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to library
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{shelf.emoji ?? "📁"}</span>
          <h1 className="font-display text-[26px] font-bold" style={{ color: "var(--text)" }}>
            {shelf.name}
          </h1>
          {shelf.isSmart && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] italic font-medium"
              style={{ backgroundColor: "var(--card)", color: "var(--text-dim)" }}
            >
              Smart shelf
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
          {books.length} {books.length === 1 ? "book" : "books"}
        </p>
        {shelf.description && (
          <p className="text-sm mt-1 italic" style={{ color: "var(--text-faint)" }}>
            {shelf.description}
          </p>
        )}
      </div>

      {showSearch && (
        <div className="mb-6 max-w-md">
          <input
            type="text"
            placeholder="Filter books..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
      )}

      <BookGrid books={filteredBooks} />
    </div>
  );
}
