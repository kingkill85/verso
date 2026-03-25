import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc";

type UseProgressSyncOptions = {
  bookId: string;
  percentage: number;
  cfiPosition: string | null;
  enabled: boolean;
};

const DEBOUNCE_MS = 30_000; // 30 seconds

export function useProgressSync({
  bookId,
  percentage,
  cfiPosition,
  enabled,
}: UseProgressSyncOptions) {
  const syncMutation = trpc.progress.sync.useMutation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<{ percentage: number; cfi: string | null }>({
    percentage: 0,
    cfi: null,
  });

  const doSync = useCallback(() => {
    if (!enabled || percentage === 0) return;
    if (
      percentage === lastSyncedRef.current.percentage &&
      cfiPosition === lastSyncedRef.current.cfi
    ) return;

    lastSyncedRef.current = { percentage, cfi: cfiPosition };
    syncMutation.mutate({
      bookId,
      percentage,
      ...(cfiPosition ? { cfiPosition } : {}),
    });
  }, [bookId, percentage, cfiPosition, enabled, syncMutation]);

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
      if (lastSyncedRef.current.percentage !== percentage || lastSyncedRef.current.cfi !== cfiPosition) {
        if (enabled && percentage > 0) {
          const token = localStorage.getItem("verso-access-token");
          fetch("/trpc/progress.sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              json: { bookId, percentage, ...(cfiPosition ? { cfiPosition } : {}) },
            }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [bookId, percentage, cfiPosition, enabled]);

  return { syncNow };
}
