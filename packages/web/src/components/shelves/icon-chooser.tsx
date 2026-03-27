import { SHELF_ICONS } from "@/components/icons";

const ICON_ENTRIES = Object.entries(SHELF_ICONS);

export function IconChooser({
  value,
  onChange,
}: {
  value: string;
  onChange: (iconKey: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ICON_ENTRIES.map(([key, IconComponent]) => {
        const isSelected = value === `icon:${key}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(`icon:${key}`)}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
            style={{
              backgroundColor: isSelected ? "var(--warm)" : "var(--bg)",
              color: isSelected ? "white" : "var(--text-dim)",
              border: isSelected ? "none" : "1px solid var(--border)",
            }}
            title={key}
          >
            <IconComponent size={18} />
          </button>
        );
      })}
    </div>
  );
}
