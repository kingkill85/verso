import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ReadingStatsCard() {
  const { t } = useTranslation();
  const statsQuery = trpc.stats.overview.useQuery({ range: "month" });
  const booksQuery = trpc.books.list.useQuery({ sort: "recent", limit: 1 });

  const stats = statsQuery.data;
  const totalBooks = booksQuery.data?.total ?? 0;

  if (!stats) return null;

  // Hide the card if there's no reading activity
  const hasActivity = stats.currentStreak > 0 || stats.booksFinished > 0 || stats.timeReadMinutes > 0;
  if (!hasActivity) return null;

  const items: { value: string; label: string }[] = [];

  if (stats.currentStreak > 0) {
    items.push({ value: String(stats.currentStreak), label: t("home.streak") });
  }
  if (stats.booksFinished > 0) {
    items.push({ value: String(stats.booksFinished), label: t("home.finishedThisMonth") });
  }
  if (stats.timeReadMinutes > 0) {
    items.push({ value: formatTime(stats.timeReadMinutes), label: t("home.timeReadThisMonth") });
  }
  // Always show library count when card is visible
  items.push({ value: String(totalBooks), label: t("home.booksInLibrary") });

  return (
    <div className="mb-6 md:mb-8">
      <div className="rounded-xl p-4 md:p-5" style={{ backgroundColor: "var(--card)" }}>
        {/* Mobile: 2x2 grid */}
        <div className="grid grid-cols-2 gap-3 text-center md:hidden">
          {items.map((item) => (
            <div key={item.label}>
              <div
                className="text-xl font-bold"
                style={{ color: "var(--warm)" }}
              >
                {item.value}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: "var(--text-dim)" }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
        {/* Desktop: single row with dividers */}
        <div className="hidden md:flex items-center text-center">
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && (
                <div
                  className="w-px h-8 shrink-0"
                  style={{ backgroundColor: "var(--border)" }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div
                  className="text-2xl font-bold"
                  style={{ color: "var(--warm)" }}
                >
                  {item.value}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {item.label}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
