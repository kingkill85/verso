import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookOpenIcon } from "@/components/icons";

interface ReadingLogItem {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  coverPath: string | null;
  durationMinutes: number;
  startedAt: string;
}

interface ReadingLogProps {
  items: ReadingLogItem[];
  hasMore: boolean;
  onLoadMore: () => void;
}

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ReadingLog({ items, hasMore, onLoadMore }: ReadingLogProps) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--card)" }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {t("stats.readingLog")}
        </p>
      </div>

      {items.length === 0 ? (
        <div
          className="flex items-center justify-center py-8"
          style={{ color: "var(--text-faint)", fontSize: 13 }}
        >
          {t("stats.noSessions")}
        </div>
      ) : (
        <>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((item) => (
              <Link
                key={item.id}
                to="/books/$id"
                params={{ id: item.bookId }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-80"
              >
                {/* Cover thumbnail */}
                <div
                  className="flex-shrink-0 rounded overflow-hidden"
                  style={{ width: 32, height: 44, backgroundColor: "var(--border)" }}
                >
                  {item.coverPath ? (
                    <img
                      src={`/api/covers/${item.bookId}`}
                      alt={item.bookTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[10px]"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <BookOpenIcon size={14} />
                    </div>
                  )}
                </div>

                {/* Book info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {item.bookTitle}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {item.bookAuthor}
                  </p>
                </div>

                {/* Duration + date */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--warm)" }}
                  >
                    {formatDuration(item.durationMinutes)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                    {formatRelativeDate(item.startedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {hasMore && (
            <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={onLoadMore}
                className="w-full text-sm py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: "var(--text-dim)" }}
              >
                {t("stats.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
