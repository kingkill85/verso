import { Link } from "@tanstack/react-router";
import { BookCover } from "./book-cover";

type BookCardProps = {
  id: string;
  title: string;
  author: string;
  coverPath?: string | null;
};

export function BookCard({ id, title, author, coverPath }: BookCardProps) {
  return (
    <Link
      to="/books/$id"
      params={{ id }}
      className="group block transition-transform duration-200 hover:-translate-y-1"
    >
      <BookCover
        bookId={id}
        title={title}
        author={author}
        coverPath={coverPath}
        size="lg"
      />
      <div className="mt-2 min-w-0">
        <p
          className="font-display text-sm font-semibold leading-tight line-clamp-2"
          style={{ color: "var(--text)" }}
        >
          {title}
        </p>
        <p
          className="font-display italic text-xs mt-0.5 line-clamp-1"
          style={{ color: "var(--text-dim)" }}
        >
          {author}
        </p>
      </div>
    </Link>
  );
}
