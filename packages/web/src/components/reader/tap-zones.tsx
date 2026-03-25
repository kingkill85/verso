import { useRef } from "react";

type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

/**
 * Invisible tap zones for page navigation.
 * Uses pointerdown/pointerup timing to distinguish taps from text selection.
 * Only fires navigation on quick taps (<200ms, <10px movement).
 */
export function TapZones({ onPrev, onNext, onCenter }: TapZonesProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex"
      style={{ top: 48, bottom: 40, pointerEvents: "none" }}
    >
      <TapZone className="w-1/4" onTap={onPrev} label="Previous page" />
      <div className="flex-1" />
      <TapZone className="w-1/4" onTap={onNext} label="Next page" />
    </div>
  );
}

function TapZone({ className, onTap, label }: { className: string; onTap: () => void; label: string }) {
  const downRef = useRef<{ time: number; x: number; y: number } | null>(null);

  return (
    <div
      className={className}
      style={{ pointerEvents: "auto" }}
      aria-label={label}
      onPointerDown={(e) => {
        downRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!downRef.current) return;
        const dt = Date.now() - downRef.current.time;
        const dx = Math.abs(e.clientX - downRef.current.x);
        const dy = Math.abs(e.clientY - downRef.current.y);
        downRef.current = null;
        // Quick tap with little movement = navigation
        // Longer press or drag = text selection, ignore
        if (dt < 200 && dx < 10 && dy < 10) {
          onTap();
        }
      }}
    />
  );
}
