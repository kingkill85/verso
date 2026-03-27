import { useRef, useEffect, useCallback } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TICK_INTERVAL_MS = 10_000; // 10 seconds
const MAX_DELTA_S = 60; // cap delta to prevent runaway after sleep

export function useReadingTimer() {
  const accumulatedSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    if (pausedRef.current || lastTickRef.current === null) return;
    const now = performance.now();
    const deltaS = Math.min((now - lastTickRef.current) / 1000, MAX_DELTA_S);
    accumulatedSecondsRef.current += deltaS;
    lastTickRef.current = now;
  }, []);

  const pause = useCallback(() => {
    tick();
    pausedRef.current = true;
    lastTickRef.current = null;
  }, [tick]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    lastTickRef.current = performance.now();
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (pausedRef.current) resume();
    idleTimerRef.current = setTimeout(pause, IDLE_TIMEOUT_MS);
  }, [pause, resume]);

  const consumeMinutes = useCallback(() => {
    tick();
    const minutes = Math.round((accumulatedSecondsRef.current / 60) * 10) / 10;
    accumulatedSecondsRef.current = 0;
    return minutes;
  }, [tick]);

  useEffect(() => {
    // Start tracking
    resume();
    resetIdleTimer();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pause();
      } else {
        resume();
        resetIdleTimer();
      }
    };

    const handleActivity = () => {
      resetIdleTimer();
    };

    const intervalId = setInterval(tick, TICK_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });

    return () => {
      clearInterval(intervalId);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [tick, pause, resume, resetIdleTimer]);

  return { consumeMinutes };
}
