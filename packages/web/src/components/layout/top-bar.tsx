import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/use-theme";
import { MenuIcon, XIcon, SunIcon, MoonIcon } from "@/components/icons";

export function TopBar({ sidebarOpen, onMenuClick }: { sidebarOpen: boolean; onMenuClick: () => void }) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed) {
      navigate({ to: "/search", search: { q: trimmed } });
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 px-6 h-14 border-b"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
      <button onClick={onMenuClick} className="p-2 -ml-2 rounded-lg" style={{ color: "var(--text-dim)" }}>
        {sidebarOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      <Link to="/home" className="font-display text-xl font-bold shrink-0" style={{ color: "var(--warm)" }}>
        Verso
      </Link>

      <form onSubmit={handleSubmit} className="flex-1 lg:max-w-2xl">
        <input
          type="text"
          placeholder={t("search.placeholder")}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full rounded-[10px] border px-3 py-1.5 text-sm outline-none transition-colors"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </form>

      <div className="hidden lg:block flex-1" />

      <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
        style={{ color: "var(--text-dim)" }} title={t("theme.toggle")}>
        {resolvedTheme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
      </button>
    </header>
  );
}
