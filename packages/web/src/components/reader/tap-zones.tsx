import { useRef, useState } from "react";

type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

/**
 * Overlay for tap navigation. On pointerdown, starts a timer.
 * If the pointer is held for >150ms (selection gesture), the overlay
 * hides itself so the content underneath receives the events.
 * On quick taps, it navigates.
 */
export function TapZones({ onPrev, onNext, onCenter }: TapZonesProps) {
  const [passThrough, setPassThrough] = useState(false);
  const downRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    downRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };

    // After 150ms, assume it's a selection gesture — hide overlay
    timerRef.current = setTimeout(() => {
      setPassThrough(true);
    }, 150);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If we passed through, restore overlay on next tick
    if (passThrough) {
      setTimeout(() => setPassThrough(false), 50);
      downRef.current = null;
      return;
    }

    if (!downRef.current) return;
    const dt = Date.now() - downRef.current.time;
    const dx = Math.abs(e.clientX - downRef.current.x);
    const dy = Math.abs(e.clientY - downRef.current.y);
    const startX = downRef.current.x;
    downRef.current = null;

    if (dt >= 300 || dx >= 10 || dy >= 10) return;

    // Determine zone
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = (startX - rect.left) / rect.width;

    if (relX < 0.25) {
      onPrev();
    } else if (relX > 0.75) {
      onNext();
    } else {
      onCenter();
    }
  };

  return (
    <div
      className="fixed inset-0 z-20"
      style={{
        top: 48,
        bottom: 40,
        pointerEvents: passThrough ? "none" : "auto",
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}
