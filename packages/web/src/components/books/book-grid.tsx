import { useTranslation } from "react-i18next";
import { BookCard } from "./book-card";

type BookGridBook = {
  id: string;
  title: string;
  author: string;
  coverPath?: string | null;
};

type BookGridProps = {
  books: BookGridBook[];
};

export function BookGrid({ books }: BookGridProps) {
  const { t } = useTranslation();

  if (books.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center"
        style={{ color: "var(--text-dim)" }}
      >
        <p className="font-display text-lg">{t("library.noBooksYet")}</p>
        <p className="text-sm mt-1">{t("library.uploadToStart")}</p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-[22px]"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
      }}
    >
      {books.map((book, index) => (
        <div
          key={book.id}
          className="animate-in fade-in"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <BookCard
            id={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
          />
        </div>
      ))}
    </div>
  );
}
