type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

export function TapZones({ onPrev, onNext, onCenter }: TapZonesProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex pointer-events-none"
      style={{ top: 48, bottom: 40 }}
    >
      <div
        className="w-1/4 pointer-events-auto cursor-default"
        onClick={onPrev}
        aria-label="Previous page"
      />
      <div className="flex-1" />
      <div
        className="w-1/4 pointer-events-auto cursor-default"
        onClick={onNext}
        aria-label="Next page"
      />
    </div>
  );
}
