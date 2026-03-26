import { useEffect, useRef } from "react";

type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * No overlay — attaches click listener to the reader container.
 * Text selection works everywhere. Quick taps navigate based on position.
 */
export function TapZones({ onPrev, onNext, onCenter, containerRef }: TapZonesProps) {
  const downRef = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      downRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (!downRef.current) return;
      const dt = Date.now() - downRef.current.time;
      const dx = Math.abs(e.clientX - downRef.current.x);
      const dy = Math.abs(e.clientY - downRef.current.y);
      downRef.current = null;

      if (dt >= 300 || dx >= 10 || dy >= 10) return;

      // Don't navigate if text is selected
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;

      // Also check iframe selection
      const iframe = el.querySelector("iframe");
      if (iframe?.contentWindow) {
        const iframeSel = iframe.contentWindow.getSelection();
        if (iframeSel && iframeSel.toString().trim().length > 0) return;
      }

      const rect = el.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;

      if (relX < 0.25) {
        onPrev();
      } else if (relX > 0.75) {
        onNext();
      } else {
        onCenter();
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [containerRef, onPrev, onNext, onCenter]);

  // No DOM rendered — purely event-based
  return null;
}
