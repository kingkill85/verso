import { Link } from "@tanstack/react-router";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function ContinueReadingRow() {
  const query = trpc.books.currentlyReading.useQuery();
  const shelvesQuery = trpc.shelves.list.useQuery();

  if (!query.data?.length) return null;

  const currentlyReadingShelf = shelvesQuery.data?.find(
    (s) => s.name === "Currently Reading" && s.isDefault
  );

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="font-display text-base font-bold"
          style={{ color: "var(--text)" }}
        >
          Continue Reading
        </h2>
        {currentlyReadingShelf && (
          <Link
            to="/shelves/$id"
            params={{ id: currentlyReadingShelf.id }}
            className="text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--warm)" }}
          >
            See all
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 220 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author}
              coverPath={item.coverPath}
              size="sm"
            />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p
                className="font-display text-xs font-semibold leading-tight line-clamp-1"
                style={{ color: "var(--text)" }}
              >
                {item.title}
              </p>
              <p
                className="text-[11px] mt-0.5 line-clamp-1"
                style={{ color: "var(--text-dim)" }}
              >
                {item.author}
              </p>
              <div className="mt-2">
                <div
                  className="h-[3px] rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--progress-bg)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: "var(--warm)",
                    }}
                  />
                </div>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: "var(--text-faint)" }}
                >
                  {Math.round(item.percentage)}%
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
