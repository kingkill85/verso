import type { ReaderSettings } from "@/hooks/use-epub-reader";

type SettingsPanelProps = {
  settings: ReaderSettings;
  open: boolean;
  onClose: () => void;
  onUpdate: (partial: Partial<ReaderSettings>) => void;
};

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex-1 px-2 py-2 rounded-md text-xs transition-colors"
              style={{
                backgroundColor: active ? "var(--warm-glow)" : "transparent",
                border: `1px solid ${active ? "var(--warm)" : "var(--border)"}`,
                color: active ? "var(--warm)" : "var(--text-dim)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, open, onClose, onUpdate }: SettingsPanelProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        className="fixed inset-y-0 right-0 w-72 z-50 overflow-y-auto transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="p-4">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.5px] mb-5"
            style={{ color: "var(--text-faint)" }}
          >
            Reader Settings
          </p>

          {/* Font Size */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              Font Size
            </p>
            <div className="flex items-center gap-3">
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>A</span>
              <input
                type="range"
                min={12}
                max={28}
                value={settings.fontSize}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="flex-1 accent-[var(--warm)]"
              />
              <span className="text-[17px]" style={{ color: "var(--text-faint)" }}>A</span>
            </div>
          </div>

          <ToggleGroup
            label="Font"
            options={[
              { value: "serif" as const, label: "Serif" },
              { value: "sans-serif" as const, label: "Sans" },
              { value: "dyslexic" as const, label: "Dyslexic" },
            ]}
            value={settings.fontFamily}
            onChange={(v) => onUpdate({ fontFamily: v })}
          />

          <ToggleGroup
            label="Line Spacing"
            options={[
              { value: "compact" as const, label: "Compact" },
              { value: "normal" as const, label: "Normal" },
              { value: "relaxed" as const, label: "Relaxed" },
            ]}
            value={settings.lineSpacing}
            onChange={(v) => onUpdate({ lineSpacing: v })}
          />

          <ToggleGroup
            label="Margins"
            options={[
              { value: "narrow" as const, label: "Narrow" },
              { value: "normal" as const, label: "Normal" },
              { value: "wide" as const, label: "Wide" },
            ]}
            value={settings.margins}
            onChange={(v) => onUpdate({ margins: v })}
          />

          {/* Theme */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              Theme
            </p>
            <div className="flex gap-1.5">
              {([
                { value: "light" as const, label: "Light", bg: "#f6f1ea", fg: "#2a2520" },
                { value: "dark" as const, label: "Dark", bg: "#12110f", fg: "#e8e2d8" },
                { value: "sepia" as const, label: "Sepia", bg: "#f4ecd8", fg: "#5b4636" },
              ]).map((t) => {
                const active = t.value === settings.theme;
                return (
                  <button
                    key={t.value}
                    onClick={() => onUpdate({ theme: t.value })}
                    className="flex-1 px-2 py-2 rounded-md text-xs transition-colors"
                    style={{
                      backgroundColor: t.bg,
                      border: `1px solid ${active ? "var(--warm)" : "var(--border)"}`,
                      color: t.fg,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <ToggleGroup
            label="View Mode"
            options={[
              { value: "paginated" as const, label: "Paginated" },
              { value: "scrolled" as const, label: "Scrolling" },
            ]}
            value={settings.flow}
            onChange={(v) => onUpdate({ flow: v })}
          />
        </div>
      </div>
    </>
  );
}
