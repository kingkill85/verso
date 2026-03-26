import { useEffect, useRef } from "react";
import type { Rendition } from "epubjs";

type TapZonesProps = {
  renditionRef: React.RefObject<Rendition | null>;
  isLoaded: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

/**
 * No overlay. Registers a click handler inside the epub.js rendition
 * (iframe content). Text selection is never blocked.
 * Only navigates on clicks with no active text selection.
 */
export function TapZones({ renditionRef, isLoaded, onPrev, onNext, onCenter }: TapZonesProps) {
  const callbacksRef = useRef({ onPrev, onNext, onCenter });
  callbacksRef.current = { onPrev, onNext, onCenter };

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const handler = (e: MouseEvent) => {
      // Don't navigate if text is selected
      const win = (e.view || window) as Window;
      const sel = win.getSelection?.();
      if (sel && sel.toString().trim().length > 0) return;

      // Get click position relative to the viewport
      const viewWidth = win.innerWidth;
      const relX = e.clientX / viewWidth;

      if (relX < 0.25) {
        callbacksRef.current.onPrev();
      } else if (relX > 0.75) {
        callbacksRef.current.onNext();
      } else {
        callbacksRef.current.onCenter();
      }
    };

    rendition.on("click", handler);
    return () => {
      rendition.off("click", handler);
    };
  }, [renditionRef, isLoaded]);

  return null;
}
