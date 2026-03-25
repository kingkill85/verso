type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

export function TapZones({ onPrev, onNext, onCenter }: TapZonesProps) {
  return (
    <div className="fixed inset-0 z-20 flex" style={{ top: 48, bottom: 40 }}>
      <button
        className="flex-1 cursor-default"
        onClick={onPrev}
        aria-label="Previous page"
      />
      <button
        className="flex-1 cursor-default"
        onClick={onCenter}
        aria-label="Toggle controls"
      />
      <button
        className="flex-1 cursor-default"
        onClick={onNext}
        aria-label="Next page"
      />
    </div>
  );
}
