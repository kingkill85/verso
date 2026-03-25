type FilterChipsProps = {
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  label: string;
};

export function FilterChips({ options, selected, onSelect, label }: FilterChipsProps) {
  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      {options.map((option) => {
        const isActive = selected === option;
        return (
          <button
            key={option}
            onClick={() => onSelect(isActive ? null : option)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive ? "var(--warm-glow)" : "var(--card)",
              color: isActive ? "var(--warm)" : "var(--text-dim)",
              border: "1px solid",
              borderColor: isActive ? "var(--warm)" : "var(--border)",
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
