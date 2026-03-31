import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function RecommendedRow() {
  const { t } = useTranslation();
  const query = trpc.books.recommended.useQuery({});

  if (!query.data?.length) return null;

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2
          className="font-display text-sm md:text-base font-bold"
          style={{ color: "var(--text)" }}
        >
          {t("home.recommendedForYou")}
        </h2>
        <span className="text-[11px] md:text-xs" style={{ color: "var(--text-dim)" }}>
          {t("home.recommendedSubtitle")}
        </span>
      </div>
      {/* Mobile */}
      <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((book) => (
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
              author={book.author ?? undefined}
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
              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {book.author}
              </p>
              {book.reason && (
                <p className="text-[9px] mt-0.5 italic line-clamp-1" style={{ color: "var(--text-faint)" }}>
                  {book.reason}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden md:flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((book) => (
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
              author={book.author ?? undefined}
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
              {book.reason && (
                <p
                  className="text-[10px] mt-0.5 italic line-clamp-1"
                  style={{ color: "var(--text-faint)" }}
                >
                  {book.reason}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
