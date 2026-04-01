import { useMemo } from "react";
import { trpc } from "@/trpc";

type ProgressEntry = {
  percentage: number;
  finishedAt: string | null;
};

export function useReadingProgress() {
  const query = trpc.progress.allForUser.useQuery(undefined, {
    staleTime: 30_000,
  });

  const progressMap = useMemo(() => {
    const map = new Map<string, ProgressEntry>();
    for (const row of query.data ?? []) {
      map.set(row.bookId, { percentage: row.percentage, finishedAt: row.finishedAt });
    }
    return map;
  }, [query.data]);

  return {
    getProgress: (bookId: string): ProgressEntry | null => progressMap.get(bookId) ?? null,
  };
}
