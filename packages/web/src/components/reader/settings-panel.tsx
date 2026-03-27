import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
            {t("reader.readerSettings")}
          </p>

          {/* Font Size */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              {t("reader.fontSize")}
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
            label={t("reader.font")}
            options={[
              { value: "serif" as const, label: t("reader.serif") },
              { value: "sans-serif" as const, label: t("reader.sans") },
              { value: "dyslexic" as const, label: t("reader.dyslexic") },
            ]}
            value={settings.fontFamily}
            onChange={(v) => onUpdate({ fontFamily: v })}
          />

          <ToggleGroup
            label={t("reader.lineSpacing")}
            options={[
              { value: "compact" as const, label: t("reader.compact") },
              { value: "normal" as const, label: t("reader.normal") },
              { value: "relaxed" as const, label: t("reader.relaxed") },
            ]}
            value={settings.lineSpacing}
            onChange={(v) => onUpdate({ lineSpacing: v })}
          />

          <ToggleGroup
            label={t("reader.margins")}
            options={[
              { value: "narrow" as const, label: t("reader.narrow") },
              { value: "normal" as const, label: t("reader.normal") },
              { value: "wide" as const, label: t("reader.wide") },
            ]}
            value={settings.margins}
            onChange={(v) => onUpdate({ margins: v })}
          />

          {/* Theme */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              {t("reader.theme")}
            </p>
            <div className="flex gap-1.5">
              {([
                { value: "light" as const, label: t("reader.light"), bg: "#f6f1ea", fg: "#2a2520" },
                { value: "dark" as const, label: t("reader.dark"), bg: "#12110f", fg: "#e8e2d8" },
                { value: "sepia" as const, label: t("reader.sepia"), bg: "#f4ecd8", fg: "#5b4636" },
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
            label={t("reader.viewMode")}
            options={[
              { value: "paginated" as const, label: t("reader.paginated") },
              { value: "scrolled" as const, label: t("reader.scrolling") },
            ]}
            value={settings.flow}
            onChange={(v) => onUpdate({ flow: v })}
          />
        </div>
      </div>
    </>
  );
}
