import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTheme } from "@/hooks/use-theme";

export function TopBar({ sidebarOpen, onMenuClick }: { sidebarOpen: boolean; onMenuClick: () => void }) {
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
        {sidebarOpen ? "✕" : "☰"}
      </button>

      <Link to="/" className="font-display text-xl font-bold shrink-0" style={{ color: "var(--warm)" }}>
        Verso
      </Link>

      <form onSubmit={handleSubmit} className="flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search books..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full rounded-[10px] border px-4 py-2.5 pl-10 text-sm outline-none transition-colors"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </form>

      <div className="flex-1" />

      <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
        style={{ color: "var(--text-dim)" }} title="Toggle theme">
        {resolvedTheme === "dark" ? "☀️" : "🌙"}
      </button>
    </header>
  );
}
