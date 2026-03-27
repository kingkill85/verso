import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { trpc } from "@/trpc";
import { SummaryCards } from "@/components/stats/summary-cards";
import { DailyChart } from "@/components/stats/daily-chart";
import { DistributionChart } from "@/components/stats/distribution-chart";
import { ReadingLog } from "@/components/stats/reading-log";

export const Route = createFileRoute("/_app/stats")({
  component: StatsPage,
});

type Range = "week" | "month" | "year" | "all";

const RANGES: { value: Range; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
];

function StatsPage() {
  const [range, setRange] = useState<Range>("month");

  const overviewQuery = trpc.stats.overview.useQuery({ range });
  const dailyQuery = trpc.stats.dailyReading.useQuery({ range });
  const distributionQuery = trpc.stats.distribution.useQuery({ range });
  const readingLogQuery = trpc.stats.readingLog.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const overview = overviewQuery.data;
  const dailyData = dailyQuery.data ?? [];
  const distributionData = distributionQuery.data ?? [];

  const allLogItems = readingLogQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const hasMore = readingLogQuery.data?.pages.at(-1)?.nextCursor !== undefined;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="font-display text-[26px] font-bold"
          style={{ color: "var(--text)" }}
        >
          Reading Stats
        </h1>
      </div>

      {/* Range selector */}
      <div
        className="inline-flex gap-1 p-1 rounded-xl mb-6"
        style={{ backgroundColor: "var(--card)" }}
      >
        {RANGES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setRange(value)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={
              range === value
                ? { backgroundColor: "var(--warm)", color: "#fff" }
                : { color: "var(--text-dim)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {overview ? (
        <div className="mb-6">
          <SummaryCards {...overview} />
        </div>
      ) : (
        <div className="mb-6">
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-5"
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-4 h-20 animate-pulse"
                style={{ backgroundColor: "var(--card)" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Daily chart */}
      <div className="mb-6">
        <DailyChart data={dailyData} range={range} />
      </div>

      {/* Distribution + Reading log */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <DistributionChart data={distributionData} />
        </div>
        <div className="md:col-span-2">
          <ReadingLog
            items={allLogItems}
            hasMore={hasMore}
            onLoadMore={() => readingLogQuery.fetchNextPage()}
          />
        </div>
      </div>
    </div>
  );
}
