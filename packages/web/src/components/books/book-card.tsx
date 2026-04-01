import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { BookCover } from "./book-cover";
import { useReadingProgress } from "@/hooks/use-reading-progress";

type BookCardProps = {
  id: string;
  title: string;
  author: string;
  coverPath?: string | null;
};

export function BookCard({ id, title, author, coverPath }: BookCardProps) {
  const { getProgress } = useReadingProgress();
  const progress = getProgress(id);
  const isFinished = !!progress?.finishedAt;
  const isReading = !isFinished && (progress?.percentage ?? 0) > 0;

  return (
    <Link
      to="/books/$id"
      params={{ id }}
      className="group block transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="w-fit">
        <div className="relative">
          <BookCover
            bookId={id}
            title={title}
            author={author}
            coverPath={coverPath}
            size="lg"
          />
          {/* Finished badge */}
          {isFinished && (
            <div
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
              style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            >
              <Check size={12} strokeWidth={3} color="white" />
            </div>
          )}
        </div>
        {/* Progress bar — below cover, same width */}
        {isReading && (
          <div
            className="h-1 rounded-full mt-1"
            style={{ backgroundColor: "rgba(128,128,128,0.2)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${progress!.percentage}%`, backgroundColor: "var(--warm)" }}
            />
          </div>
        )}
      </div>
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
