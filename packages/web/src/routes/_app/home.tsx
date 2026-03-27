import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { ContinueReadingRow } from "@/components/books/continue-reading-row";
import { BookCover } from "@/components/books/book-cover";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const booksQuery = trpc.books.list.useQuery({ sort: "recent", limit: 10 });
  const shelvesQuery = trpc.shelves.list.useQuery();

  const allShelves = shelvesQuery.data ?? [];
  const userShelves = allShelves.filter((s) => !s.isDefault);
  const defaultShelves = allShelves.filter((s) => s.isDefault);
  const finishedShelf = defaultShelves.find((s) => s.name === "Finished");

  const recentBooks = booksQuery.data?.books ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1
          className="font-display text-[26px] font-bold"
          style={{ color: "var(--text)" }}
        >
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
        </h1>
        <p
          className="text-sm mt-0.5"
          style={{ color: "var(--text-dim)" }}
        >
          Your personal reading dashboard
        </p>
      </div>

      {/* Continue Reading */}
      <ContinueReadingRow />

      {/* Recently Added */}
      {recentBooks.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="font-display text-base font-bold"
              style={{ color: "var(--text)" }}
            >
              Recently Added
            </h2>
            <Link
              to="/library"
              className="text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--warm)" }}
            >
              View all
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
            {recentBooks.map((book) => (
              <Link
                key={book.id}
                to="/books/$id"
                params={{ id: book.id }}
                className="shrink-0 group transition-transform duration-200 hover:-translate-y-1"
                style={{ width: 120 }}
              >
                <BookCover
                  bookId={book.id}
                  title={book.title}
                  author={book.author}
                  coverPath={book.coverPath}
                  size="lg"
                />
                <div className="mt-2 min-w-0">
                  <p
                    className="font-display text-xs font-semibold leading-tight line-clamp-2"
                    style={{ color: "var(--text)" }}
                  >
                    {book.title}
                  </p>
                  <p
                    className="font-display italic text-[11px] mt-0.5 line-clamp-1"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {book.author}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Your Shelves */}
      {allShelves.length > 0 && (
        <div className="mb-8">
          <h2
            className="font-display text-base font-bold mb-3"
            style={{ color: "var(--text)" }}
          >
            Your Shelves
          </h2>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            }}
          >
            {[...defaultShelves, ...userShelves].map((shelf) => (
              <Link
                key={shelf.id}
                to="/shelves/$id"
                params={{ id: shelf.id }}
                className="rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5"
                style={{ backgroundColor: "var(--card)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{shelf.emoji ?? "📁"}</span>
                  <span
                    className="font-display text-sm font-semibold truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {shelf.name}
                  </span>
                </div>
                <p
                  className="text-xs"
                  style={{ color: "var(--text-dim)" }}
                >
                  {shelf.bookCount} {shelf.bookCount === 1 ? "book" : "books"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recently Finished */}
      {finishedShelf && finishedShelf.bookCount > 0 && (
        <div className="mb-8">
          <h2
            className="font-display text-base font-bold mb-3"
            style={{ color: "var(--text)" }}
          >
            Recently Finished
          </h2>
          <Link
            to="/shelves/$id"
            params={{ id: finishedShelf.id }}
            className="inline-flex items-center gap-3 rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--card)" }}
          >
            <span className="text-2xl">✅</span>
            <div>
              <p
                className="font-display text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {finishedShelf.bookCount} finished {finishedShelf.bookCount === 1 ? "book" : "books"}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--text-dim)" }}
              >
                View your completed reads
              </p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
