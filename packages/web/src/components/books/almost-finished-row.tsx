import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function AlmostFinishedRow() {
  const { t } = useTranslation();
  const query = trpc.books.almostFinished.useQuery();

  if (!query.data?.length) return null;

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2
          className="font-display text-sm md:text-base font-bold"
          style={{ color: "var(--text)" }}
        >
          {t("home.almostFinished")}
        </h2>
        <span className="text-[11px] md:text-xs" style={{ color: "var(--warm)" }}>
          {t("home.almostFinishedHint")}
        </span>
      </div>
      {/* Mobile */}
      <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            search={{ cfi: undefined }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 200 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author ?? undefined}
              coverPath={item.coverPath}
              size="sm"
            />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p
                className="font-display text-[11px] font-semibold leading-tight line-clamp-1"
                style={{ color: "var(--text)" }}
              >
                {item.title}
              </p>
              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {item.author}
              </p>
              <div className="mt-2">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-bg)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: "#7ab87a" }}
                  />
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {item.totalPages && item.currentPage
                    ? t("home.pagesLeft", { count: item.totalPages - item.currentPage })
                    : `${Math.round(item.percentage)}%`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            search={{ cfi: undefined }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 260 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author ?? undefined}
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
              <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {item.author}
              </p>
              <div className="mt-2">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-bg)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: "#7ab87a" }}
                  />
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {item.totalPages && item.currentPage
                    ? t("home.pagesLeft", { count: item.totalPages - item.currentPage })
                    : `${Math.round(item.percentage)}%`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
