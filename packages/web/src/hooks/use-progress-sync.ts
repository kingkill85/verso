import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc";

type UseProgressSyncOptions = {
  bookId: string;
  percentage: number;
  cfiPosition: string | null;
  enabled: boolean;
  getTimeMinutes?: () => number;
};

const DEBOUNCE_MS = 30_000; // 30 seconds

export function useProgressSync({
  bookId,
  percentage,
  cfiPosition,
  enabled,
  getTimeMinutes,
}: UseProgressSyncOptions) {
  const syncMutation = trpc.progress.sync.useMutation();
  const mutateRef = useRef(syncMutation.mutate);
  mutateRef.current = syncMutation.mutate;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<{ percentage: number; cfi: string | null }>({
    percentage: 0,
    cfi: null,
  });

  const getTimeRef = useRef(getTimeMinutes);
  getTimeRef.current = getTimeMinutes;

  // Keep latest values in refs so the unmount cleanup always has current data
  const latestRef = useRef({ bookId, percentage, cfiPosition, enabled });
  latestRef.current = { bookId, percentage, cfiPosition, enabled };

  const doSync = useCallback(() => {
    if (!enabled || percentage === 0) return;
    const timeSpentMinutes = getTimeRef.current ? Math.round(getTimeRef.current()) : undefined;
    if (
      percentage === lastSyncedRef.current.percentage &&
      cfiPosition === lastSyncedRef.current.cfi &&
      !timeSpentMinutes
    ) return;

    lastSyncedRef.current = { percentage, cfi: cfiPosition };
    mutateRef.current({
      bookId,
      percentage,
      ...(cfiPosition ? { cfiPosition } : {}),
      ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
    });
  }, [bookId, percentage, cfiPosition, enabled]);

  // Debounced sync on percentage/cfi change
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSync, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [percentage, cfiPosition, doSync, enabled]);

  // Immediate sync on page turn (call from parent)
  const syncNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    doSync();
  }, [doSync]);

  // Sync on unmount — use tRPC mutation via ref (SPA navigation keeps JS alive)
  useEffect(() => {
    return () => {
      const { bookId: bid, percentage: pct, cfiPosition: cfi, enabled: on } = latestRef.current;
      const timeSpentMinutes = getTimeRef.current ? Math.round(getTimeRef.current()) : undefined;
      if (lastSyncedRef.current.percentage !== pct || lastSyncedRef.current.cfi !== cfi || timeSpentMinutes) {
        if (on && pct > 0) {
          mutateRef.current({
            bookId: bid,
            percentage: pct,
            ...(cfi ? { cfiPosition: cfi } : {}),
            ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
          });
        }
      }
    };
  }, []);

  return { syncNow };
}
