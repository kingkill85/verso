import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";

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

  // Sync on unmount — use fetch with keepalive for reliability
  useEffect(() => {
    return () => {
      const timeSpentMinutes = getTimeRef.current ? Math.round(getTimeRef.current()) : undefined;
      if (lastSyncedRef.current.percentage !== percentage || lastSyncedRef.current.cfi !== cfiPosition || timeSpentMinutes) {
        if (enabled && percentage > 0) {
          const token = getAccessToken();
          fetch("/trpc/progress.sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              json: {
                bookId,
                percentage,
                ...(cfiPosition ? { cfiPosition } : {}),
                ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
              },
            }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [bookId, percentage, cfiPosition, enabled]);

  return { syncNow };
}
