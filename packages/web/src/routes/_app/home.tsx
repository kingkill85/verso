import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { ContinueReadingRow } from "@/components/books/continue-reading-row";
import { BookCover } from "@/components/books/book-cover";
import { useAuth } from "@/hooks/use-auth";
import { renderShelfIcon, translateShelfName } from "@/components/icons";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const booksQuery = trpc.books.list.useQuery({ sort: "recent", limit: 10 });
  const shelvesQuery = trpc.shelves.list.useQuery();

  const allShelves = shelvesQuery.data ?? [];
  const userShelves = allShelves.filter((s) => !s.isDefault);
  const defaultShelves = allShelves.filter((s) => s.isDefault);

  const recentBooks = booksQuery.data?.books ?? [];

  return (
    <div>
      {/* Header — responsive */}
      <div className="mb-4 md:mb-6">
        <h1
          className="font-display text-xl md:text-[26px] font-bold"
          style={{ color: "var(--text)" }}
        >
          {t("home.welcome", { name: user?.displayName ?? "" })}
        </h1>
        <p
          className="hidden md:block text-sm mt-0.5"
          style={{ color: "var(--text-dim)" }}
        >
          {t("home.dashboard")}
        </p>
      </div>

      {/* Continue Reading */}
      <ContinueReadingRow />

      {/* Recently Added — responsive cover sizes */}
      {recentBooks.length > 0 && (
        <div className="mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <h2
              className="font-display text-sm md:text-base font-bold"
              style={{ color: "var(--text)" }}
            >
              {t("home.recentlyAdded")}
            </h2>
            <Link
              to="/library"
              className="text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--warm)" }}
            >
              {t("home.viewAll")}
            </Link>
          </div>
          {/* Mobile: small covers in scroll row */}
          <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {recentBooks.map((book) => (
              <Link
                key={book.id}
                to="/books/$id"
                params={{ id: book.id }}
                className="shrink-0 group transition-transform duration-200 hover:-translate-y-1"
                style={{ width: 90 }}
              >
                <BookCover
                  bookId={book.id}
                  title={book.title}
                  author={book.author}
                  coverPath={book.coverPath}
                  size="md"
                />
                <div className="mt-1.5 min-w-0">
                  <p
                    className="text-[11px] font-medium leading-tight line-clamp-2"
                    style={{ color: "var(--text)" }}
                  >
                    {book.title}
                  </p>
                  <p
                    className="text-[10px] mt-0.5 line-clamp-1"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {book.author}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {/* Desktop: larger covers in scroll row */}
          <div className="hidden md:flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
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

      {/* Shelves — compact on mobile, cards on desktop */}
      {allShelves.length > 0 && (
        <div className="mb-6 md:mb-8">
          <h2
            className="font-display text-sm md:text-base font-bold mb-2 md:mb-3"
            style={{ color: "var(--text)" }}
          >
            {t("home.yourShelves")}
          </h2>
          {/* Mobile: compact inline list */}
          <div
            className="grid md:hidden gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
          >
            {[...defaultShelves, ...userShelves].map((shelf) => (
              <Link
                key={shelf.id}
                to="/shelves/$id"
                params={{ id: shelf.id }}
                className="rounded-lg px-3 py-2.5 flex items-center gap-2 transition-colors hover:opacity-80"
                style={{ backgroundColor: "var(--card)" }}
              >
                <span style={{ color: "var(--text-dim)" }}>{renderShelfIcon(shelf.emoji, shelf.name, 16)}</span>
                <span className="text-xs font-medium truncate flex-1" style={{ color: "var(--text)" }}>
                  {translateShelfName(shelf.name, t)}
                </span>
                {shelf.bookCount > 0 && (
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{shelf.bookCount}</span>
                )}
              </Link>
            ))}
          </div>
          {/* Desktop: nicer cards */}
          <div
            className="hidden md:grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
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
                  <span style={{ color: "var(--text-dim)" }}>{renderShelfIcon(shelf.emoji, shelf.name, 20)}</span>
                  <span className="font-display text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {translateShelfName(shelf.name, t)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {t("shelf.book", { count: shelf.bookCount })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
