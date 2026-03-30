import { useEffect, useRef } from "react";

type TapZonesProps = {
  viewRef: React.RefObject<any>;
  isLoaded: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

export function TapZones({ viewRef, isLoaded, onPrev, onNext, onCenter }: TapZonesProps) {
  const callbacksRef = useRef({ onPrev, onNext, onCenter });
  callbacksRef.current = { onPrev, onNext, onCenter };

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isLoaded) return;

    const handleLoad = ({ detail: { doc } }: any) => {
      doc.addEventListener("click", (e: MouseEvent) => {
        const sel = doc.getSelection?.();
        if (sel && sel.toString().trim().length > 0) return;

        const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();
        const absoluteX = (iframeRect?.left ?? 0) + e.clientX;
        const pageWidth = window.innerWidth;
        const relX = absoluteX / pageWidth;

        if (relX < 0.25) {
          callbacksRef.current.onPrev();
        } else if (relX > 0.75) {
          callbacksRef.current.onNext();
        } else {
          callbacksRef.current.onCenter();
        }
      });
    };

    view.addEventListener("load", handleLoad);
    return () => view.removeEventListener("load", handleLoad);
  }, [viewRef, isLoaded]);

  return null;
}
