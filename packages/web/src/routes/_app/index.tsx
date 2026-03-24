import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";

export const Route = createFileRoute("/_app/")({
  component: LibraryPage,
});

function LibraryPage() {
  const booksQuery = trpc.books.list.useQuery({
    sort: "recent",
    limit: 50,
  });

  const bookCount = booksQuery.data?.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1
          className="font-display text-[26px] font-bold"
          style={{ color: "var(--text)" }}
        >
          Library
        </h1>
        {bookCount > 0 && (
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--text-dim)" }}
          >
            {bookCount} {bookCount === 1 ? "book" : "books"}
          </p>
        )}
      </div>

      {booksQuery.isLoading ? (
        <div
          className="flex items-center justify-center py-20"
          style={{ color: "var(--text-dim)" }}
        >
          <p className="text-sm">Loading your library...</p>
        </div>
      ) : (
        <BookGrid books={booksQuery.data?.books ?? []} />
      )}
    </div>
  );
}
